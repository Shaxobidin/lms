/**
 * Maqsad: hujjat va sertifikat oqimlarini ISHLAYOTGAN tizimda tekshirish (§15).
 *
 * Tekshiradi:
 *  - so`rov parametrlari shablonga qarab, maydon darajasida tekshirilishini;
 *  - 5 ta hujjat shabloni haqiqiy DOCX/XLSX fayl berishini (GOST 7.32);
 *  - sertifikat PDF yaratilishi va QR kod orqali tekshirilishini.
 *
 * Ishga tushirish: node scripts/check-documents.mjs
 * Fayllar SP muhit o'zgaruvchisidagi katalogga saqlanadi (ixtiyoriy).
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const OUT = process.env.SP ?? null;

async function login(loginValue, password = 'Demo!2026') {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password }),
  });
  const body = await response.json();
  if (!body.success) throw new Error(`Kirish muvaffaqiyatsiz: ${JSON.stringify(body.error)}`);
  return body.data.tokens.accessToken;
}

function authed(token) {
  return (path, init = {}) =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...init.headers,
      },
    });
}

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const rectorApi = authed(await login('rector@qdu.uz'));
const methodistApi = authed(await login('metodist@qdu.uz'));
const teacherApi = authed(await login('oqituvchi@qdu.uz'));

// ------------------------------------------------------- parametr validatsiyasi
console.log('\n1. Chegaradagi validatsiya (§8)');

const badResponse = await teacherApi('/documents/generate', {
  method: 'POST',
  body: JSON.stringify({
    template: 'RATING_SHEET',
    format: 'DOCX',
    params: { courseId: 'buni-uuid-emas' },
    requireSignature: false,
  }),
});
const bad = await badResponse.json();
const fields = (bad.error?.details ?? []).map((item) => item.field);
check(
  "Noto'g'ri params validatsiyada rad etildi",
  badResponse.status === 400 && bad.error?.code === 'VALIDATION_ERROR',
  `status ${badResponse.status}, kod ${bad.error?.code}`,
);
check(
  'Xatolik maydon darajasida qaytdi',
  fields.some((field) => field.startsWith('params.')),
  fields.slice(0, 4).join(', '),
);

// --------------------------------------------------------------- hujjatlar
console.log('\n2. Hujjat shablonlari (F-14, GOST 7.32)');

const courses = await (await teacherApi('/courses?limit=1')).json();
const course = courses.data?.[0];
check('O`qituvchi kursi topildi', Boolean(course), course?.code ?? '');

const gradebook = await (await teacherApi(`/grading/courses/${course.id}/gradebook`)).json();
const roster = Array.isArray(gradebook.data) ? gradebook.data : [];
const groupId = roster[0]?.group?.id;
const semesterId = course.semester?.id;

async function generateAndDownload(label, api, payload, expectedMagic, fileName) {
  const response = await api('/documents/generate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  const created = await response.json();

  if (!response.ok || !created.success) {
    check(`${label}: navbatga qo'yildi`, false, JSON.stringify(created.error).slice(0, 180));
    return;
  }

  let record = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await sleep(1000);
    const list = await (await api('/documents')).json();
    record = list.data?.find((item) => item.id === created.data.documentId);
    if (record && record.status !== 'QUEUED' && record.status !== 'PROCESSING') break;
  }

  if (record?.status !== 'GENERATED' && record?.status !== 'SIGNED') {
    check(`${label}: tayyorlandi`, false, `status ${record?.status ?? 'nomalum'}`);
    return;
  }

  const link = await (await api(`/content/files/${record.fileObjectId}/download`)).json();
  const fileResponse = await fetch(link.data?.url ?? link.data?.downloadUrl);
  const buffer = Buffer.from(await fileResponse.arrayBuffer());
  const magic = buffer.subarray(0, expectedMagic.length).toString('latin1');
  if (OUT) await writeFile(join(OUT, fileName), buffer);

  check(
    `${label}: fayl yaratildi`,
    fileResponse.ok && magic === expectedMagic,
    `${(buffer.length / 1024).toFixed(1)} KB, № ${record.documentNumber ?? '—'}`,
  );
}

await generateAndDownload(
  'Reyting varaqasi (DOCX)',
  teacherApi,
  {
    template: 'RATING_SHEET',
    format: 'DOCX',
    params: { courseId: course.id, groupId, semesterId, controlTypes: [] },
    requireSignature: false,
  },
  'PK',
  'reyting.docx',
);

await generateAndDownload(
  'Reyting varaqasi (XLSX)',
  teacherApi,
  {
    template: 'RATING_SHEET',
    format: 'XLSX',
    params: { courseId: course.id, groupId, semesterId, controlTypes: [] },
    requireSignature: false,
  },
  'PK',
  'reyting.xlsx',
);

await generateAndDownload(
  'Davomat jadvali',
  teacherApi,
  {
    template: 'ATTENDANCE_SHEET',
    format: 'XLSX',
    params: { courseId: course.id, groupId },
    requireSignature: false,
  },
  'PK',
  'davomat.xlsx',
);

await generateAndDownload(
  'Bayonnoma (yangi)',
  rectorApi,
  {
    template: 'PROTOCOL',
    format: 'DOCX',
    params: {
      title: "Kafedra yig'ilishi bayonnomasi",
      meetingDate: new Date().toISOString(),
      participants: ['Aliyev A.A.', 'Karimova N.S.'],
      agenda: ['Sillabuslarni tasdiqlash', "O'quv yuklamasi taqsimoti"],
      decisions: ['Sillabuslar tasdiqlansin'],
    },
    requireSignature: false,
  },
  'PK',
  'bayonnoma.docx',
);

const syllabi = await (await methodistApi(`/syllabi/by-subject/${course.subject?.id}`)).json();
const syllabusId = syllabi.data?.id ?? syllabi.data?.[0]?.id;

if (syllabusId) {
  await generateAndDownload(
    'Sillabus (yangi)',
    methodistApi,
    {
      template: 'SYLLABUS',
      format: 'DOCX',
      params: { syllabusId, includeAssessment: true },
      requireSignature: false,
    },
    'PK',
    'sillabus.docx',
  );
} else {
  check('Sillabus topildi', false, JSON.stringify(syllabi.error ?? syllabi.data).slice(0, 150));
}

// ---------------------------------------------------------------- sertifikat
console.log('\n3. Sertifikat: PDF + QR verifikatsiya (F-12)');

const templates = await (await rectorApi('/certificates/templates')).json();
const templateId = templates.data?.[0]?.id;
check('Sertifikat shabloni mavjud', Boolean(templateId), templateId ?? '');

const studentId = roster[0]?.userId;

if (templateId && studentId) {
  const issueResponse = await teacherApi('/certificates/issue', {
    method: 'POST',
    body: JSON.stringify({ templateId, courseId: course.id, userIds: [studentId] }),
  });
  const issued = await issueResponse.json();
  check(
    'Sertifikat berildi',
    issueResponse.ok && issued.success,
    issued.success
      ? JSON.stringify(issued.data).slice(0, 120)
      : JSON.stringify(issued.error).slice(0, 180),
  );
}

// PDF navbatda yaratiladi — fayl biriktirilgan yozuvni kutamiz
let certificate = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await sleep(1000);
  const registry = await (await rectorApi('/certificates/registry?limit=10')).json();
  certificate = (registry.data ?? []).find((item) => item.pdfFileId);
  if (certificate) break;
}
check('Reestrda PDF li sertifikat bor', Boolean(certificate), certificate?.serialNumber ?? '');

if (certificate) {
  // QR kodda SERIYA emas, alohida verifikatsiya kodi bo'ladi
  const verified = await (
    await fetch(`${API}/certificates/verify/${certificate.verification?.code}`)
  ).json();
  check(
    'QR kod bo`yicha ochiq verifikatsiya',
    verified.success && verified.data?.valid === true,
    `seriya ${certificate.serialNumber}, holat: ${verified.data?.valid ? 'valid' : verified.data?.reasonKey}`,
  );

  if (certificate.pdfFileId) {
    const link = await (await rectorApi(`/content/files/${certificate.pdfFileId}/download`)).json();
    const pdfResponse = await fetch(link.data?.url ?? link.data?.downloadUrl);
    const buffer = Buffer.from(await pdfResponse.arrayBuffer());
    const header = buffer.subarray(0, 5).toString('latin1');
    if (OUT) await writeFile(join(OUT, 'sertifikat.pdf'), buffer);
    check(
      'PDF yuklab olindi',
      pdfResponse.ok && header === '%PDF-',
      `${(buffer.length / 1024).toFixed(1)} KB, sarlavha "${header}"`,
    );
  } else {
    check('Sertifikatga PDF bog`langan', false, 'pdfFileId yo`q');
  }
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nNatija: ${passed}/${results.length} tekshiruv muvaffaqiyatli`);
process.exit(passed === results.length ? 0 : 1);
