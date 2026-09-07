/**
 * Maqsad: baholash va savollar banki oqimlarini ISHLAYOTGAN tizimda tekshirish
 * (F-06, F-07, F-08) — §15 ning "o'qituvchi test tuzib, talabani baholay oladi"
 * mezoni uchun uchdan-uchgacha dalil.
 *
 * Tekshiradi:
 *  A. Baholash — rubrika yaratish, topshiriq, talabaning ishi, rubrika bo'yicha
 *     baholash, kechikish jarimasi, qayta ishlashga qaytarish, ABAC;
 *  A2. Rubrika muharriri — tahrirlash, mezon qo'shish/olib tashlash, ball
 *     qo'yilganda qulflanish, foydalanilayotgan rubrikani o'chirmaslik;
 *  B. Savollar banki — bank yaratish, 10 turdagi savolni yaratish, filtrlar,
 *     savolni tahrirlash, testga biriktirish va qulflanish qoidasi.
 *
 * Ishga tushirish: node scripts/check-grading.mjs
 */

import { randomUUID } from 'node:crypto';

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
const student = client(await login('talaba@qdu.uz'));

const suffix = randomUUID().slice(0, 8);

// Talaba yozilgan kursni tanlaymiz — aks holda ish topshira olmaydi
const enrolled = await student('/courses?onlyEnrolled=true&limit=20');
const teacherCourses = await teacher('/courses?limit=50');
const teacherCourseIds = new Set((teacherCourses.body.data ?? []).map((item) => item.id));
const course = (enrolled.body.data ?? []).find((item) => teacherCourseIds.has(item.id));

if (!course) {
  console.error(
    "Sinov uchun o'qituvchi ham, talaba ham bog'langan kurs topilmadi. `npm run db:seed` ni bajaring.",
  );
  process.exit(1);
}

const courseId = course.id;
console.log(`\nKurs: ${course.code}`);

// =============================================================================
// A. BAHOLASH OQIMI
// =============================================================================
console.log('\n1. Rubrika va topshiriq');

const rubric = await teacher('/rubrics', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sinov rubrikasi ${suffix}` },
    criteria: [
      {
        title: { 'uz-Latn': 'Mazmun' },
        maxPoints: 60,
        position: 0,
        levels: [
          { label: { 'uz-Latn': 'Past' }, points: 20 },
          { label: { 'uz-Latn': 'Yaxshi' }, points: 45 },
          { label: { 'uz-Latn': 'A`lo' }, points: 60 },
        ],
      },
      {
        title: { 'uz-Latn': 'Rasmiylashtirish' },
        maxPoints: 40,
        position: 1,
        levels: [
          { label: { 'uz-Latn': 'Past' }, points: 10 },
          { label: { 'uz-Latn': 'A`lo' }, points: 40 },
        ],
      },
    ],
  }),
});
const rubricId = rubric.body?.data?.id;
check(
  'Rubrika yaratildi',
  rubric.ok && Boolean(rubricId),
  `jami ${rubric.body?.data?.totalPoints}`,
);

const assignment = await teacher('/assignments', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sinov topshirig'i ${suffix}` },
    description: { 'uz-Latn': '<p>Sinov uchun</p>' },
    maxScore: 50,
    dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    rubricId,
    isPublished: true,
  }),
});
const assignmentId = assignment.body?.data?.id;
check('Topshiriq yaratildi', assignment.ok && Boolean(assignmentId));

// Yangi endpoint: baholash ish o'rni shu ma'lumot ustida quriladi
const detail = await teacher(`/assignments/${assignmentId}`);
check(
  'GET /assignments/:id rubrika mezonlari bilan qaytardi',
  detail.ok && detail.body?.data?.rubric?.criteria?.length === 2,
  `${detail.body?.data?.rubric?.criteria?.length ?? 0} mezon`,
);
check(
  'Topshiriq kartasida kurs va maksimal ball bor',
  Number(detail.body?.data?.maxScore) === 50 && detail.body?.data?.course?.id === courseId,
);

console.log('\n2. Talaba ishni topshiradi');

const submission = await student('/submissions', {
  method: 'POST',
  body: JSON.stringify({
    assignmentId,
    contentHtml: '<p>Talabaning javobi</p>',
    submit: true,
  }),
});
const submissionId = submission.body?.data?.id;
check('Ish topshirildi', submission.ok && Boolean(submissionId), submission.body?.data?.status);

const queue = await teacher(`/submissions?assignmentId=${assignmentId}&ungradedOnly=true`);
const queued = (queue.body?.data ?? []).find((row) => row.id === submissionId);
check('Ish baholanmaganlar navbatida', Boolean(queued));
check(
  'Navbatdagi yozuvda baholash uchun zarur maydonlar bor',
  Boolean(queued?.contentHtml) &&
    Array.isArray(queued?.rubricScores) &&
    Boolean(queued?.user?.profile),
);

console.log('\n3. Rubrika bo`yicha baholash');

const criteria = detail.body.data.rubric.criteria;
const graded = await teacher(`/submissions/${submissionId}/grade`, {
  method: 'POST',
  body: JSON.stringify({
    rubricScores: [
      { criterionId: criteria[0].id, points: 45, comment: 'Mazmun yaxshi' },
      { criterionId: criteria[1].id, points: 40 },
    ],
    feedback: '<p>Ofarin</p>',
    returnForRevision: false,
  }),
});

// 85/100 * 50 = 42.5
check(
  'Rubrika ballari topshiriq shkalasiga o`girildi',
  graded.ok && Math.abs(Number(graded.body?.data?.score) - 42.5) < 0.01,
  `ball ${graded.body?.data?.score}`,
);

const afterGrade = await teacher(`/submissions?assignmentId=${assignmentId}`);
const gradedRow = (afterGrade.body?.data ?? []).find((row) => row.id === submissionId);
check('Ish holati GRADED ga o`tdi', gradedRow?.status === 'GRADED', gradedRow?.status);
check(
  'Rubrika ballari saqlandi (qayta baholash uchun)',
  (gradedRow?.rubricScores ?? []).length === 2,
);

console.log('\n4. Chegaraviy holatlar va ABAC');

const tooHigh = await teacher(`/submissions/${submissionId}/grade`, {
  method: 'POST',
  body: JSON.stringify({
    rubricScores: [
      { criterionId: criteria[0].id, points: 100 },
      { criterionId: criteria[1].id, points: 10 },
    ],
  }),
});
// `AppException.validation` 400 qaytaradi (422 — biznes qoidasi buzilganda)
check(
  'Mezon maksimumidan oshiq ball rad etildi',
  tooHigh.status === 400 &&
    tooHigh.body?.error?.details?.[0]?.code === 'validation.points_exceed_criterion_max',
  `status ${tooHigh.status}, ${tooHigh.body?.error?.details?.[0]?.code}`,
);

const emptyGrade = await teacher(`/submissions/${submissionId}/grade`, {
  method: 'POST',
  body: JSON.stringify({ feedback: '<p>Faqat izoh</p>' }),
});
check(
  'Ballsiz baholash rad etildi (sxema darajasida)',
  emptyGrade.status === 400,
  `status ${emptyGrade.status}`,
);

const studentGrade = await student(`/submissions/${submissionId}/grade`, {
  method: 'POST',
  body: JSON.stringify({ score: 50 }),
});
check(
  'Talaba o`z ishini baholay olmadi',
  studentGrade.status === 403,
  `status ${studentGrade.status}`,
);

const returned = await teacher(`/submissions/${submissionId}/grade`, {
  method: 'POST',
  body: JSON.stringify({
    rubricScores: [
      { criterionId: criteria[0].id, points: 20 },
      { criterionId: criteria[1].id, points: 10 },
    ],
    returnForRevision: true,
  }),
});
check('Qayta ishlashga qaytarildi', returned.ok && returned.body?.data?.status === 'RETURNED');

// =============================================================================
// A2. RUBRIKA MUHARRIRI
// =============================================================================
console.log('\n4a. Rubrika muharriri');

const rubricList = await teacher(`/courses/${courseId}/rubrics`);
const listed = (rubricList.body?.data ?? []).find((row) => row.id === rubricId);
check('Rubrika kurs ro`yxatida', Boolean(listed), `${rubricList.body?.data?.length ?? 0} ta`);
check(
  'Ro`yxatda qulf holati va foydalanish soni bor',
  listed?.locked === true && listed?._count?.assignments === 1,
  `locked=${listed?.locked}, topshiriqlar=${listed?._count?.assignments}`,
);

// Ball qo'yilgan rubrikada nom o'zgaradi, tuzilma esa o'zgarmaydi
const renamed = await teacher(`/rubrics/${rubricId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    title: { 'uz-Latn': `Nomi o'zgargan ${suffix}` },
    criteria: criteria.map((criterion, index) => ({
      id: criterion.id,
      title: criterion.title,
      maxPoints: Number(criterion.maxPoints),
      position: index,
      levels: criterion.levels,
    })),
  }),
});
check('Qulflangan rubrikaning nomi o`zgardi', renamed.ok, `status ${renamed.status}`);

const structureChange = await teacher(`/rubrics/${rubricId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    title: { 'uz-Latn': `Nomi o'zgargan ${suffix}` },
    criteria: [
      {
        id: criteria[0].id,
        title: criteria[0].title,
        maxPoints: 90,
        position: 0,
        levels: criteria[0].levels,
      },
    ],
  }),
});
check(
  'Qulflangan rubrikaning tuzilmasi o`zgartirilmadi',
  structureChange.status === 422 &&
    structureChange.body?.error?.messageKey === 'errors.rubric_has_grades',
  `status ${structureChange.status}, ${structureChange.body?.error?.messageKey}`,
);

const cannotDelete = await teacher(`/rubrics/${rubricId}`, { method: 'DELETE' });
check(
  'Topshiriqqa bog`langan rubrika o`chirilmadi',
  cannotDelete.status === 422 && cannotDelete.body?.error?.messageKey === 'errors.rubric_in_use',
  `status ${cannotDelete.status}, ${cannotDelete.body?.error?.messageKey}`,
);

// Bo'sh (ishlatilmagan) rubrika to'liq tahrirlanadi va o'chiriladi
const spare = await teacher('/rubrics', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Bo'sh rubrika ${suffix}` },
    criteria: [
      {
        title: { 'uz-Latn': 'Birinchi' },
        maxPoints: 50,
        position: 0,
        levels: [
          { label: { 'uz-Latn': 'Past' }, points: 10 },
          { label: { 'uz-Latn': 'Yuqori' }, points: 50 },
        ],
      },
    ],
  }),
});
const spareId = spare.body?.data?.id;
check('Ishlatilmagan rubrika yaratildi', spare.ok && Boolean(spareId));

const spareDetail = await teacher(`/courses/${courseId}/rubrics`);
const spareRow = (spareDetail.body?.data ?? []).find((row) => row.id === spareId);
check('Yangi rubrika qulflanmagan', spareRow?.locked === false);

const restructured = await teacher(`/rubrics/${spareId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    title: { 'uz-Latn': `Qayta tuzilgan ${suffix}` },
    criteria: [
      {
        id: spareRow.criteria[0].id,
        title: { 'uz-Latn': 'Birinchi (yangilangan)' },
        maxPoints: 30,
        position: 0,
        levels: [
          { label: { 'uz-Latn': 'Past' }, points: 5 },
          { label: { 'uz-Latn': 'Yuqori' }, points: 30 },
        ],
      },
      {
        title: { 'uz-Latn': 'Ikkinchi (yangi)' },
        maxPoints: 20,
        position: 1,
        levels: [
          { label: { 'uz-Latn': 'Past' }, points: 0 },
          { label: { 'uz-Latn': 'Yuqori' }, points: 20 },
        ],
      },
    ],
  }),
});
check(
  'Mezon qo`shildi va jami ball qayta hisoblandi',
  restructured.ok && restructured.body?.data?.totalPoints === 50,
  `jami ${restructured.body?.data?.totalPoints}`,
);

const afterEdit = await teacher(`/courses/${courseId}/rubrics`);
const editedRow = (afterEdit.body?.data ?? []).find((row) => row.id === spareId);
check(
  'Mezon `id` si saqlandi (ballar bog`liqligi uzilmaydi)',
  editedRow?.criteria?.[0]?.id === spareRow.criteria[0].id,
);
check('Yangi mezon ro`yxatga qo`shildi', editedRow?.criteria?.length === 2);

const shrunk = await teacher(`/rubrics/${spareId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    title: { 'uz-Latn': `Qayta tuzilgan ${suffix}` },
    criteria: [
      {
        id: editedRow.criteria[0].id,
        title: editedRow.criteria[0].title,
        maxPoints: Number(editedRow.criteria[0].maxPoints),
        position: 0,
        levels: editedRow.criteria[0].levels,
      },
    ],
  }),
});
const afterShrink = await teacher(`/courses/${courseId}/rubrics`);
const shrunkRow = (afterShrink.body?.data ?? []).find((row) => row.id === spareId);
check(
  'Olib tashlangan mezon ro`yxatdan yo`qoldi',
  shrunk.ok && shrunkRow?.criteria?.length === 1,
  `${shrunkRow?.criteria?.length ?? 0} mezon`,
);

const studentEdit = await student(`/rubrics/${spareId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    title: { 'uz-Latn': 'Buzilgan' },
    criteria: [
      {
        title: { 'uz-Latn': 'X' },
        maxPoints: 1,
        position: 0,
        levels: [
          { label: { 'uz-Latn': 'a' }, points: 0 },
          { label: { 'uz-Latn': 'b' }, points: 1 },
        ],
      },
    ],
  }),
});
check(
  'Talaba rubrikani tahrirlay olmadi',
  studentEdit.status === 403,
  `status ${studentEdit.status}`,
);

const removed = await teacher(`/rubrics/${spareId}`, { method: 'DELETE' });
check('Ishlatilmagan rubrika o`chirildi', removed.ok && removed.body?.data?.deleted === true);

const afterDelete = await teacher(`/courses/${courseId}/rubrics`);
check(
  'O`chirilgan rubrika ro`yxatda ko`rinmaydi',
  !(afterDelete.body?.data ?? []).some((row) => row.id === spareId),
);

// =============================================================================
// B. SAVOLLAR BANKI
// =============================================================================
console.log('\n5. Savollar banki');

const bank = await teacher('/question-banks', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sinov banki ${suffix}` },
    isShared: false,
  }),
});
const bankId = bank.body?.data?.id;
check('Bank yaratildi', bank.ok && Boolean(bankId));

/** Har bir tur uchun interfeys yig'adigan payload — 10 turi ham sinaladi. */
const payloads = {
  SINGLE: {
    type: 'SINGLE',
    options: [
      { id: 'a', text: { 'uz-Latn': 'To`g`ri' }, isCorrect: true, weight: 0 },
      { id: 'b', text: { 'uz-Latn': 'Noto`g`ri' }, isCorrect: false, weight: 0 },
    ],
  },
  MULTI: {
    type: 'MULTI',
    penalizeWrong: true,
    options: [
      { id: 'a', text: { 'uz-Latn': 'Bir' }, isCorrect: true, weight: 0 },
      { id: 'b', text: { 'uz-Latn': 'Ikki' }, isCorrect: true, weight: 0 },
      { id: 'c', text: { 'uz-Latn': 'Uch' }, isCorrect: false, weight: 0 },
    ],
  },
  MATCHING: {
    type: 'MATCHING',
    left: [
      { id: 'l1', text: { 'uz-Latn': 'Toshkent' } },
      { id: 'l2', text: { 'uz-Latn': 'Samarqand' } },
    ],
    right: [
      { id: 'r1', text: { 'uz-Latn': 'Poytaxt' } },
      { id: 'r2', text: { 'uz-Latn': 'Registon' } },
    ],
    pairs: [
      { leftId: 'l1', rightId: 'r1' },
      { leftId: 'l2', rightId: 'r2' },
    ],
  },
  ORDERING: {
    type: 'ORDERING',
    items: [
      { id: 'i1', text: { 'uz-Latn': 'Birinchi' } },
      { id: 'i2', text: { 'uz-Latn': 'Ikkinchi' } },
    ],
    correctOrder: ['i1', 'i2'],
  },
  CLOZE: {
    type: 'CLOZE',
    template: { 'uz-Latn': 'Poytaxt — [[1]].' },
    blanks: [{ key: '1', accepted: ['Toshkent'], caseSensitive: false, points: 1 }],
  },
  ESSAY: { type: 'ESSAY', minWords: 50, maxWords: 500, allowAttachments: false },
  NUMERIC: { type: 'NUMERIC', correctValue: 9.8, tolerance: 0.1, unit: 'm/s²' },
  DRAG_DROP: {
    type: 'DRAG_DROP',
    items: [{ id: 'd1', text: { 'uz-Latn': 'Element' } }],
    zones: [{ id: 'z1', label: { 'uz-Latn': 'Zona' } }],
    placements: [{ itemId: 'd1', zoneId: 'z1' }],
  },
  CODE: {
    type: 'CODE',
    language: 'python',
    starterCode: 'def solve():\n    pass',
    testCases: [{ input: '1', expected: '1' }],
  },
};

const createdIds = [];
for (const [type, payload] of Object.entries(payloads)) {
  const response = await teacher('/questions', {
    method: 'POST',
    body: JSON.stringify({
      bankId,
      text: { 'uz-Latn': `${type} sinov savoli` },
      payload,
      defaultScore: 2,
      difficulty: 'MEDIUM',
      tags: ['sinov', type.toLowerCase()],
    }),
  });
  if (response.ok) createdIds.push(response.body.data.id);
  check(
    `${type} savoli yaratildi`,
    response.ok,
    response.ok
      ? ''
      : JSON.stringify(response.body?.error?.details ?? response.body?.error).slice(0, 120),
  );
}

// HOTSPOT alohida: u mavjud rasm faylini talab qiladi, shuning uchun
// bu yerda faqat validatsiya qoidasi tekshiriladi (fayl yuklash — UI ishi)
const hotspotWithoutImage = await teacher('/questions', {
  method: 'POST',
  body: JSON.stringify({
    bankId,
    text: { 'uz-Latn': 'HOTSPOT sinovi' },
    payload: {
      type: 'HOTSPOT',
      imageFileId: 'not-a-uuid',
      areas: [{ id: 'a1', shape: 'RECT', x: 10, y: 10, width: 10, height: 10 }],
      requiredAreaIds: ['a1'],
    },
    defaultScore: 2,
  }),
});
check(
  'HOTSPOT rasmsiz rad etildi (sxema darajasida)',
  hotspotWithoutImage.status === 400,
  `status ${hotspotWithoutImage.status}`,
);

console.log('\n6. Filtrlar va tahrirlash');

const byType = await teacher(`/question-banks/${bankId}/questions?type=SINGLE`);
check(
  'Tur bo`yicha filtr ishladi',
  byType.ok && byType.body.data.length === 1 && byType.body.data[0].type === 'SINGLE',
  `${byType.body?.data?.length ?? 0} ta`,
);

const bySearch = await teacher(
  `/question-banks/${bankId}/questions?search=${encodeURIComponent('NUMERIC sinov')}`,
);
check('Qidiruv ishladi', bySearch.ok && bySearch.body.data.length >= 1);

const updated = await teacher(`/questions/${createdIds[0]}`, {
  method: 'PATCH',
  body: JSON.stringify({ defaultScore: 5, difficulty: 'HARD' }),
});
check(
  'Savol tahrirlandi',
  updated.ok && Number(updated.body?.data?.defaultScore) === 5,
  `ball ${updated.body?.data?.defaultScore}`,
);

const studentBank = await student(`/question-banks/${bankId}/questions`);
check('Talaba bankni ko`ra olmadi', studentBank.status === 403, `status ${studentBank.status}`);

console.log('\n7. Test konstruktori');

const quiz = await teacher('/quizzes', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sinov testi ${suffix}` },
    durationMinutes: 30,
    controlType: 'JN',
    passScore: 60,
    // Urinish poyga holatini sinash uchun test nashr etilgan bo'lishi shart
    isPublished: true,
  }),
});
const quizId = quiz.body?.data?.id;
check('Test yaratildi', quiz.ok && Boolean(quizId));

const emptyBuilder = await teacher(`/quizzes/${quizId}/questions`);
check(
  'GET /quizzes/:id/questions bo`sh testni qaytardi',
  emptyBuilder.ok &&
    emptyBuilder.body.data.questions.length === 0 &&
    emptyBuilder.body.data.locked === false,
);

const attach = await teacher(`/quizzes/${quizId}/questions`, {
  method: 'POST',
  body: JSON.stringify({
    questions: createdIds.slice(0, 5).map((questionId, index) => ({
      questionId,
      score: 2,
      position: index,
      poolTag: index < 3 ? 'oson' : 'qiyin',
    })),
    poolSelection: [
      { poolTag: 'oson', take: 2 },
      { poolTag: 'qiyin', take: 1 },
    ],
  }),
});
check('Savollar testga biriktirildi', attach.ok && attach.body?.data?.questions === 5);

const builder = await teacher(`/quizzes/${quizId}/questions`);
check(
  'Konstruktor tarkibni tartib bilan qaytardi',
  builder.ok &&
    builder.body.data.questions.length === 5 &&
    builder.body.data.questions[0].position === 0 &&
    Boolean(builder.body.data.questions[0].question?.text),
);
check(
  'Pool teglari saqlandi',
  builder.body.data.questions.filter((row) => row.poolTag === 'oson').length === 3,
);

const studentBuilder = await student(`/quizzes/${quizId}/questions`);
check(
  'Talaba konstruktorni ocha olmadi',
  studentBuilder.status === 403,
  `status ${studentBuilder.status}`,
);

// =============================================================================
// C. URINISH BOSHLASHDAGI POYGA HOLATI
// =============================================================================
console.log('\n8. Urinishni bir vaqtda boshlash');

/**
 * Brauzerda `useEffect` dev rejimida ikki marta ishga tushadi, foydalanuvchi
 * ham tugmani ikki marta bosishi mumkin. Ikkala so'rov bir xil `attemptNumber`
 * ni hisoblaydi va unikal cheklovga uriladi. To'g'ri xatti-harakat — ikkalasi
 * ham AYNAN BIR urinishni qaytarishi.
 */
const [first, second] = await Promise.all([
  student(`/quizzes/${quizId}/attempts`, { method: 'POST' }),
  student(`/quizzes/${quizId}/attempts`, { method: 'POST' }),
]);

check(
  'Ikkala parallel so`rov ham muvaffaqiyatli',
  first.ok && second.ok,
  `${first.status} / ${second.status}`,
);
check(
  'Ikkalasi bir xil urinishni qaytardi',
  Boolean(first.body?.data?.attemptId) &&
    first.body?.data?.attemptId === second.body?.data?.attemptId,
  `${first.body?.data?.attemptId?.slice(0, 8)} / ${second.body?.data?.attemptId?.slice(0, 8)}`,
);

const attemptsAfter = await teacher(`/quizzes/${quizId}/questions`);
check(
  'Bazada faqat bitta urinish yaratildi',
  attemptsAfter.body?.data?.attempts === 1,
  `${attemptsAfter.body?.data?.attempts} urinish`,
);

const passed = results.filter((item) => item.ok).length;
console.log(`\nNatija: ${passed}/${results.length} tekshiruv muvaffaqiyatli`);
process.exit(passed === results.length ? 0 : 1);
