/**
 * Maqsad: navbat orqali boradigan oqimlarni uchdan-uchgacha tekshirish.
 *
 * Tekshiradi:
 *  - parolni tiklash xati HAQIQATAN yuborilishini (MailHog orqali);
 *  - sertifikat PDF navbatda yaratilib, QR kod bilan tekshirilishini.
 *
 * Ishga tushirish: MAILHOG_URL=http://localhost:8025/api/v2 node scripts/check-queues.mjs
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const API = 'http://localhost:4000/api/v1';
const MAILHOG = process.env.MAILHOG_URL ?? 'http://localhost:8025/api/v2';
const OUT = process.env.SP ?? null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(loginValue) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password: 'Demo!2026' }),
  });
  const body = await response.json();
  if (!body.success) throw new Error(JSON.stringify(body.error));
  return body.data.tokens.accessToken;
}

function authed(token) {
  return (path, init = {}) =>
    fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
}

// ------------------------------------------------------------ email navbati
console.log('\n1. Parolni tiklash xati (email navbati)');

const before = await (await fetch(`${MAILHOG}/messages?limit=1`)).json();
const beforeTotal = before.total ?? 0;

const forgot = await fetch(`${API}/auth/forgot-password`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'talaba@qdu.uz' }),
});
check("So'rov qabul qilindi", forgot.ok, `status ${forgot.status}`);

let mail = null;
for (let attempt = 0; attempt < 20; attempt += 1) {
  await sleep(1000);
  const inbox = await (await fetch(`${MAILHOG}/messages?limit=5`)).json();
  if ((inbox.total ?? 0) > beforeTotal) {
    mail = inbox.items?.[0];
    break;
  }
}

check(
  'Xat haqiqatan yuborildi',
  Boolean(mail),
  mail ? `mavzu: ${mail.Content.Headers.Subject?.[0]}` : 'MailHog bo`sh',
);

if (mail) {
  const body = mail.Content.Body ?? '';
  const hasLink = body.includes('/reset-password?token=');
  check(
    'Xatda tiklash havolasi bor',
    hasLink,
    hasLink ? 'reset-password?token=...' : body.slice(0, 80),
  );
}

// ------------------------------------------------------- sertifikat navbati
console.log('\n2. Sertifikat PDF va QR verifikatsiya (report navbati)');

const teacherApi = authed(await login('oqituvchi@qdu.uz'));
const rectorApi = authed(await login('rector@qdu.uz'));

const courses = await (await teacherApi('/courses?limit=1')).json();
const course = courses.data[0];
const gradebook = await (await teacherApi(`/grading/courses/${course.id}/gradebook`)).json();
const templates = await (await rectorApi('/certificates/templates')).json();

const issue = await teacherApi('/certificates/issue', {
  method: 'POST',
  body: JSON.stringify({
    templateId: templates.data[0].id,
    courseId: course.id,
    userIds: [gradebook.data[1].userId],
  }),
});
const issued = await issue.json();
check(
  'Sertifikat berildi',
  issue.ok && issued.success,
  JSON.stringify(issued.data ?? issued.error).slice(0, 120),
);

let certificate = null;
for (let attempt = 0; attempt < 30; attempt += 1) {
  await sleep(1000);
  const registry = await (await rectorApi('/certificates/registry?limit=10')).json();
  certificate = (registry.data ?? []).find((item) => item.pdfFileId);
  if (certificate) break;
}

check(
  'PDF navbatda yaratildi',
  Boolean(certificate),
  certificate?.serialNumber ?? 'fileObjectId topilmadi',
);

if (certificate) {
  const code = certificate.verification?.code;
  check('Verifikatsiya kodi mavjud', Boolean(code), code ?? '');

  if (code) {
    const verified = await (await fetch(`${API}/certificates/verify/${code}`)).json();
    check(
      'QR kod bo`yicha ochiq verifikatsiya',
      verified.success && verified.data?.valid === true,
      verified.data?.valid ? 'valid' : (verified.data?.reasonKey ?? ''),
    );
  }

  const link = await (await rectorApi(`/content/files/${certificate.pdfFileId}/download`)).json();
  const pdfResponse = await fetch(link.data?.url ?? link.data?.downloadUrl);
  const buffer = Buffer.from(await pdfResponse.arrayBuffer());
  const header = buffer.subarray(0, 5).toString('latin1');
  if (OUT) await writeFile(join(OUT, 'sertifikat.pdf'), buffer);
  check(
    'PDF yuklab olindi',
    header === '%PDF-',
    `${(buffer.length / 1024).toFixed(1)} KB, "${header}"`,
  );
}

const passed = results.filter((r) => r.ok).length;
console.log(`\nNatija: ${passed}/${results.length} tekshiruv muvaffaqiyatli`);
process.exit(passed === results.length ? 0 : 1);
