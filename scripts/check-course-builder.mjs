/**
 * Maqsad: kurs konstruktori oqimini ISHLAYOTGAN tizimda tekshirish (F-04, F-05).
 *
 * Tekshiradi:
 *  - modul → mavzu → dars yaratish;
 *  - nomini o'zgartirish va nashr holatini almashtirish;
 *  - tartibni o'zgartirish (reorder);
 *  - faylni yuklab, darsga material sifatida biriktirish;
 *  - tashqi havola qo'shish;
 *  - o'chirish kaskadi (modul → mavzu → dars → material);
 *  - BOSHQA o'qituvchi begona modulni tahrirlay olmasligini (ABAC).
 *
 * Ishga tushirish: node scripts/check-course-builder.mjs
 */

import { createHash, randomUUID } from 'node:crypto';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'Demo!2026';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function login(loginValue) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password: PASSWORD }),
  });
  const body = await response.json();
  if (!body.success) throw new Error(`${loginValue}: ${JSON.stringify(body.error).slice(0, 200)}`);
  return body.data.tokens.accessToken;
}

function client(token) {
  return async (path, init = {}) => {
    const response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      },
    });
    const text = await response.text();
    const body = text ? JSON.parse(text) : null;
    return { status: response.status, ok: response.ok, body };
  };
}

const teacher = client(await login('oqituvchi@qdu.uz'));

// --- Kurs tanlash -----------------------------------------------------------
console.log('\n1. Tuzilma yaratish');

const courses = await teacher('/courses?limit=1');
const courseId = courses.body.data?.[0]?.id;
check('O`qituvchi kursi topildi', Boolean(courseId), courses.body.data?.[0]?.code ?? '');

const suffix = randomUUID().slice(0, 8);

const moduleResponse = await teacher('/courses/modules', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sinov moduli ${suffix}` },
    isPublished: false,
  }),
});
const moduleId = moduleResponse.body?.data?.id;
check('Modul yaratildi', moduleResponse.ok && Boolean(moduleId), moduleId ?? '');

const topicResponse = await teacher('/courses/topics', {
  method: 'POST',
  body: JSON.stringify({ moduleId, title: { 'uz-Latn': 'Sinov mavzusi' } }),
});
const topicId = topicResponse.body?.data?.id;
check('Mavzu yaratildi', topicResponse.ok && Boolean(topicId), topicId ?? '');

const lessonResponse = await teacher('/courses/lessons', {
  method: 'POST',
  body: JSON.stringify({
    topicId,
    title: { 'uz-Latn': 'Birinchi dars' },
    durationMinutes: 45,
    isPublished: false,
  }),
});
const lessonId = lessonResponse.body?.data?.id;
check('Dars yaratildi', lessonResponse.ok && Boolean(lessonId), lessonId ?? '');

const secondLesson = await teacher('/courses/lessons', {
  method: 'POST',
  body: JSON.stringify({ topicId, title: { 'uz-Latn': 'Ikkinchi dars' }, durationMinutes: 30 }),
});
const secondLessonId = secondLesson.body?.data?.id;
check('Ikkinchi dars yaratildi', secondLesson.ok && Boolean(secondLessonId));

// --- Tahrirlash -------------------------------------------------------------
console.log('\n2. Tahrirlash va nashr holati');

const renamed = await teacher(`/courses/modules/${moduleId}`, {
  method: 'PATCH',
  body: JSON.stringify({ title: { 'uz-Latn': `Yangi nom ${suffix}`, en: 'Renamed module' } }),
});
check(
  'Modul nomi o`zgardi',
  renamed.ok && renamed.body?.data?.title?.en === 'Renamed module',
  renamed.body?.data?.title?.en ?? JSON.stringify(renamed.body?.error).slice(0, 120),
);

const published = await teacher(`/courses/modules/${moduleId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isPublished: true }),
});
check('Modul nashr etildi', published.ok && published.body?.data?.isPublished === true);

const lessonPublished = await teacher(`/courses/lessons/${lessonId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isPublished: true }),
});
check('Dars nashr etildi', lessonPublished.ok && lessonPublished.body?.data?.isPublished === true);

// --- Tartiblash -------------------------------------------------------------
console.log('\n3. Tartiblash');

const reordered = await teacher('/courses/reorder', {
  method: 'POST',
  body: JSON.stringify({
    entity: 'lesson',
    parentId: topicId,
    orderedIds: [secondLessonId, lessonId],
  }),
});
check('Darslar tartibi o`zgartirildi', reordered.ok, `status ${reordered.status}`);

const structure = await teacher(`/courses/${courseId}`);
const rebuiltTopic = structure.body.data.modules
  .find((item) => item.id === moduleId)
  ?.topics.find((item) => item.id === topicId);
check(
  'Yangi tartib saqlandi',
  rebuiltTopic?.lessons?.[0]?.id === secondLessonId,
  rebuiltTopic?.lessons?.map((lesson) => lesson.position).join(', ') ?? '',
);

// --- Materiallar ------------------------------------------------------------
console.log('\n4. O`quv materiallari');

const content = Buffer.from(`Sinov hujjati ${suffix}\n`, 'utf8');
const presign = await teacher('/content/files/presign', {
  method: 'POST',
  body: JSON.stringify({
    fileName: `konspekt-${suffix}.txt`,
    mimeType: 'text/plain',
    sizeBytes: content.byteLength,
    purpose: 'COURSE_CONTENT',
    courseId,
  }),
});
check('Yuklash havolasi olindi', presign.ok && Boolean(presign.body?.data?.uploadUrl));

const uploadResponse = await fetch(presign.body.data.uploadUrl, {
  method: 'PUT',
  headers: { 'Content-Type': 'text/plain' },
  body: content,
});
check('Fayl saqlashga yuklandi', uploadResponse.ok, `status ${uploadResponse.status}`);

const completed = await teacher('/content/files/complete', {
  method: 'POST',
  body: JSON.stringify({
    fileObjectId: presign.body.data.fileObjectId,
    checksumSha256: createHash('sha256').update(content).digest('hex'),
  }),
});
check('Fayl tekshiruvdan o`tdi', completed.ok, completed.body?.data?.status ?? '');

const fileResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'FILE',
    title: { 'uz-Latn': 'Ma`ruza konspekti' },
    fileObjectId: presign.body.data.fileObjectId,
    isRequired: true,
  }),
});
const resourceId = fileResource.body?.data?.id;
check('Fayl darsga biriktirildi', fileResource.ok && Boolean(resourceId));

const linkResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'LINK',
    title: { 'uz-Latn': 'Qo`shimcha manba' },
    externalUrl: 'https://lib.uz/',
    isRequired: false,
  }),
});
check('Tashqi havola qo`shildi', linkResource.ok && Boolean(linkResource.body?.data?.id));

const lessonDetail = await teacher(`/courses/lessons/${lessonId}`);
const resources = lessonDetail.body?.data?.resources ?? [];
check('Dars materiallari ro`yxatda ko`rinadi', resources.length === 2, `${resources.length} ta`);
check(
  'Fayl nomi va hajmi qaytdi',
  Boolean(resources.find((item) => item.file?.originalName && item.file?.sizeBytes)),
  resources.find((item) => item.file)?.file?.originalName ?? '',
);

const patchedResource = await teacher(`/courses/resources/${resourceId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isRequired: false }),
});
check(
  'Material ixtiyoriy qilindi',
  patchedResource.ok && patchedResource.body?.data?.isRequired === false,
);

// --- Barcha element turlari --------------------------------------------------
console.log('\n5. Element tanlash oynasidagi barcha turlar');

/** Matn bloki (Moodle: Label) — fayl ham, havola ham talab qilmaydi. */
const labelResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'TEXT',
    title: { 'uz-Latn': 'Bo`lim izohi' },
    meta: { text: { 'uz-Latn': '<p>Ushbu bo`limda asosiy tushunchalar beriladi.</p>' } },
    isRequired: false,
  }),
});
check('Matn bloki (Label)', labelResource.ok, labelResource.body?.data?.id ?? '');

/** Papka (Moodle: Folder) — bir nechta fayl bitta elementda. */
const folderFiles = [];
for (const name of ['1-ilova.txt', '2-ilova.txt']) {
  const body = Buffer.from(`${name} mazmuni\n`, 'utf8');
  const link = await teacher('/content/files/presign', {
    method: 'POST',
    body: JSON.stringify({
      fileName: name,
      mimeType: 'text/plain',
      sizeBytes: body.byteLength,
      purpose: 'COURSE_CONTENT',
      courseId,
    }),
  });
  await fetch(link.body.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body,
  });
  await teacher('/content/files/complete', {
    method: 'POST',
    body: JSON.stringify({ fileObjectId: link.body.data.fileObjectId }),
  });
  folderFiles.push({
    fileObjectId: link.body.data.fileObjectId,
    name,
    sizeBytes: body.byteLength,
  });
}

const folderResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'FOLDER',
    title: { 'uz-Latn': 'Qo`shimcha materiallar' },
    meta: { files: folderFiles },
    isRequired: false,
  }),
});
check('Papka (Folder)', folderResource.ok, `${folderFiles.length} fayl`);

/** Ko'milgan kontent (Moodle: Embedded content / H5P). */
const embedResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'EMBED',
    title: { 'uz-Latn': 'Interaktiv model' },
    externalUrl: 'https://www.geogebra.org/classic',
    meta: { embedHeight: 520 },
    isRequired: false,
  }),
});
check('Ko`milgan kontent (Embed)', embedResource.ok);

const h5pResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'H5P',
    title: { 'uz-Latn': 'H5P mashq' },
    externalUrl: 'https://h5p.org/h5p/embed/617',
    isRequired: false,
  }),
});
check('H5P kontenti', h5pResource.ok);

/** Bo'sh resurs yaratib bo'lmasligi — validatsiya turga qarab ishlaydi. */
const emptyLabel = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({ lessonId, kind: 'TEXT', title: { 'uz-Latn': 'Bo`sh' } }),
});
check(
  'Matnsiz blok rad etildi',
  emptyLabel.status === 400,
  `status ${emptyLabel.status}, maydon ${(emptyLabel.body?.error?.details ?? [])
    .map((item) => item.field)
    .join(', ')}`,
);

const emptyFolder = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({ lessonId, kind: 'FOLDER', title: { 'uz-Latn': 'Bo`sh papka' } }),
});
check('Bo`sh papka rad etildi', emptyFolder.status === 400);

/** Topshiriq (Moodle: Assignment) — mavzuga biriktiriladi. */
const assignment = await teacher('/assignments', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    topicId,
    title: { 'uz-Latn': 'Sinov topshirig`i' },
    description: { 'uz-Latn': 'Tavsif' },
    controlType: 'JN',
    maxScore: 100,
    dueAt: new Date(Date.now() + 7 * 86400000).toISOString(),
  }),
});
check('Topshiriq (Assignment)', assignment.ok, assignment.body?.data?.id ?? '');

/** Test (Moodle: Quiz). */
const quiz = await teacher('/quizzes', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    topicId,
    title: { 'uz-Latn': 'Sinov testi' },
    controlType: 'JN',
    durationMinutes: 30,
    maxAttempts: 2,
  }),
});
check('Test (Quiz)', quiz.ok, quiz.body?.data?.id ?? '');

/** Forum mavzusi (Moodle: Forum). */
const thread = await teacher('/forum/threads', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: 'Sinov muhokamasi',
    body: 'Ushbu mavzu bo`yicha savollaringizni yozing.',
    isQuestion: true,
  }),
});
check('Forum mavzusi', thread.ok, thread.body?.data?.id ?? '');

/** Onlayn dars (Moodle: BigBlueButton). */
const meeting = await teacher('/classroom/meetings', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: 'Sinov onlayn darsi',
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    durationMinutes: 80,
  }),
});
check('Onlayn dars (Virtual sinf)', meeting.ok, meeting.body?.data?.id ?? '');

/** Barcha turlar darsda ko'rinadimi. */
const withAll = await teacher(`/courses/lessons/${lessonId}`);
const kinds = new Set((withAll.body?.data?.resources ?? []).map((item) => item.kind));
check(
  'Barcha resurs turlari darsda',
  ['FILE', 'LINK', 'TEXT', 'FOLDER', 'EMBED', 'H5P'].every((kind) => kinds.has(kind)),
  [...kinds].join(', '),
);

const folderInLesson = (withAll.body?.data?.resources ?? []).find((item) => item.kind === 'FOLDER');
check(
  'Papka tarkibi saqlandi',
  (folderInLesson?.meta?.files ?? []).length === 2,
  `${(folderInLesson?.meta?.files ?? []).length} fayl`,
);

const labelInLesson = (withAll.body?.data?.resources ?? []).find((item) => item.kind === 'TEXT');
check(
  'Matn bloki tozalangan holda saqlandi',
  typeof labelInLesson?.meta?.text?.['uz-Latn'] === 'string' &&
    labelInLesson.meta.text['uz-Latn'].includes('<p>'),
  (labelInLesson?.meta?.text?.['uz-Latn'] ?? '').slice(0, 60),
);

/** Matn bloki HTML sifatida ko'rsatiladi — skript o'tib ketmasligi shart. */
const xssLabel = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId,
    kind: 'TEXT',
    title: { 'uz-Latn': 'XSS sinovi' },
    meta: { text: { 'uz-Latn': '<p>ok</p><script>alert(1)</script><img src=x onerror=alert(2)>' } },
    isRequired: false,
  }),
});
const xssStored = await teacher(`/courses/lessons/${lessonId}`);
const xssResource = (xssStored.body?.data?.resources ?? []).find(
  (item) => item.title?.['uz-Latn'] === 'XSS sinovi',
);
const storedHtml = xssResource?.meta?.text?.['uz-Latn'] ?? '';
check(
  'Matn blokidagi skript tozalandi',
  xssLabel.ok && !storedHtml.includes('<script') && !storedHtml.includes('onerror'),
  storedHtml.slice(0, 60),
);

// --- ABAC -------------------------------------------------------------------
console.log('\n6. Ruxsatlar (ABAC)');

const student = client(await login('talaba@qdu.uz'));
const studentAttempt = await student(`/courses/modules/${moduleId}`, {
  method: 'PATCH',
  body: JSON.stringify({ title: { 'uz-Latn': 'Buzilgan' } }),
});
check(
  'Talaba modulni tahrirlay olmadi',
  studentAttempt.status === 403,
  `status ${studentAttempt.status}, kod ${studentAttempt.body?.error?.code}`,
);

const studentDelete = await student(`/courses/lessons/${lessonId}`, { method: 'DELETE' });
check(
  'Talaba darsni o`chira olmadi',
  studentDelete.status === 403,
  `status ${studentDelete.status}`,
);

// --- O'chirish kaskadi ------------------------------------------------------
console.log('\n7. O`chirish');

const removeModule = await teacher(`/courses/modules/${moduleId}`, { method: 'DELETE' });
check(
  'Modul kaskad bilan o`chirildi',
  removeModule.ok && removeModule.body?.data?.deleted === true,
  `${removeModule.body?.data?.topics ?? 0} mavzu`,
);

const afterDelete = await teacher(`/courses/${courseId}`);
const stillThere = afterDelete.body.data.modules.some((item) => item.id === moduleId);
check('Modul tuzilmadan yo`qoldi', !stillThere);

const orphanLesson = await teacher(`/courses/lessons/${lessonId}`);
check('O`chirilgan dars ochilmaydi', orphanLesson.status === 404, `status ${orphanLesson.status}`);

const passed = results.filter((item) => item.ok).length;
console.log(`\nNatija: ${passed}/${results.length} tekshiruv muvaffaqiyatli`);
process.exit(passed === results.length ? 0 : 1);
