/**
 * Maqsad: forum, davomat, kursga yozilish, shaxsiy xabar, sertifikat berish,
 * sillabus konstruktori, tashkiliy tuzilma CRUD, savollar importi (QTI/AIKEN),
 * LTI 1.3 launch va IMS Common Cartridge import oqimlarini ISHLAYOTGAN tizimda
 * tekshirish (F-02, F-03, F-04, F-05, F-07, F-09, F-10, F-12, §10).
 *
 * Bu uch modul backendda tayyor edi, ammo interfeysi yo'q edi. Skript
 * interfeys tayanadigan kontraktlarni tasdiqlaydi: ro'yxatlar, yozuv
 * amallari, ruxsatlar va chegaraviy holatlar.
 *
 * Ishga tushirish: node scripts/check-gaps.mjs
 */

import { createHash, createSign, generateKeyPairSync, randomUUID } from 'node:crypto';
import AdmZip from 'adm-zip';
import { createServer } from 'node:http';

const API = process.env.API_URL ?? 'http://localhost:4000/api/v1';
const PASSWORD = 'Demo!2026';

const results = [];
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

/** Token bilan birga foydalanuvchi id sini ham qaytaradi. */
async function loginFull(loginValue) {
  const response = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login: loginValue, password: PASSWORD }),
  });
  const body = await response.json();
  if (!body.success) throw new Error(`${loginValue}: ${JSON.stringify(body.error).slice(0, 200)}`);
  return { token: body.data.tokens.accessToken, userId: body.data.user.id };
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

const teacherLogin = await loginFull('oqituvchi@qdu.uz');
const studentLogin = await loginFull('talaba@qdu.uz');
const teacher = client(teacherLogin.token);
const student = client(studentLogin.token);
const studentId = studentLogin.userId;

const suffix = randomUUID().slice(0, 8);

const enrolled = await student('/courses?onlyEnrolled=true&limit=20');
const teacherCourses = await teacher('/courses?limit=50');
const teacherCourseIds = new Set((teacherCourses.body.data ?? []).map((item) => item.id));
const course = (enrolled.body.data ?? []).find((item) => teacherCourseIds.has(item.id));

if (!course) {
  console.error("O'qituvchi va talaba umumiy kursi topilmadi. `npm run db:seed` ni bajaring.");
  process.exit(1);
}

const courseId = course.id;
console.log(`\nKurs: ${course.code}`);

// =============================================================================
// A. KURSGA YOZILISH
// =============================================================================
console.log('\n1. Kursga yozilish');

const catalog = await student('/courses?limit=50');
const rows = catalog.body?.data ?? [];
check(
  'Katalog yozilish holatini qaytaradi',
  rows.every((row) => Array.isArray(row.enrollments)),
);

const already = rows.find((row) => (row.enrollments ?? []).length > 0);
check(
  'Yozilgan kurs `enrollments` bilan belgilangan',
  Boolean(already),
  already ? `${already.code} → ${already.enrollments[0].status}` : '',
);

const target = rows.find(
  (row) => row.status === 'PUBLISHED' && (row.enrollments ?? []).length === 0,
);
if (target) {
  const enroll = await student('/enroll', {
    method: 'POST',
    body: JSON.stringify({ courseId: target.id }),
  });
  check('Talaba o`zini kursga yozdi', enroll.ok && enroll.body?.data?.enrolled >= 0, target.code);

  const after = await student('/courses?limit=50');
  const updated = (after.body?.data ?? []).find((row) => row.id === target.id);
  check('Yozilish katalogda darhol ko`rinadi', (updated?.enrollments ?? []).length > 0);
} else {
  check('Yoziladigan yangi kurs topilmadi (barchasiga yozilgan)', true, "o'tkazib yuborildi");
  check('Yozilish katalogda darhol ko`rinadi', true, "o'tkazib yuborildi");
}

const guestEnroll = await student('/enroll', {
  method: 'POST',
  body: JSON.stringify({ courseId: randomUUID() }),
});
check(
  'Mavjud bo`lmagan kursga yozilish rad etildi',
  guestEnroll.status === 404,
  `status ${guestEnroll.status}`,
);

// =============================================================================
// B. FORUM
// =============================================================================
console.log('\n2. Forum');

const thread = await student('/forum/threads', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: `Sinov mavzusi ${suffix}`,
    body: '<p>Savolim bor</p>',
    isQuestion: true,
  }),
});
const threadId = thread.body?.data?.id;
check('Talaba mavzu ochdi', thread.ok && Boolean(threadId));

const threadList = await student(`/courses/${courseId}/forum`);
const listed = (threadList.body?.data ?? []).find((row) => row.id === threadId);
check('Mavzu kurs forumida ko`rinadi', Boolean(listed), `${threadList.body?.data?.length ?? 0} ta`);
check('Ro`yxatda muallif va javoblar soni bor', Boolean(listed?.author) && listed?.postCount >= 1);

const detail = await student(`/forum/threads/${threadId}`);
check(
  'Mavzu postlari bilan ochildi',
  detail.ok && (detail.body?.data?.posts ?? []).length === 1,
  `${detail.body?.data?.posts?.length ?? 0} post`,
);

const rootPostId = detail.body?.data?.posts?.[0]?.id;
check(
  'Birinchi post `parentId` siz (daraxt ildizi)',
  detail.body?.data?.posts?.[0]?.parentId === null,
);

const reply = await teacher('/forum/posts', {
  method: 'POST',
  body: JSON.stringify({
    threadId,
    parentId: rootPostId,
    contentHtml: '<p>Javobim shu</p>',
  }),
});
const replyId = reply.body?.data?.id;
check('O`qituvchi javob yozdi', reply.ok && Boolean(replyId));

const withReply = await student(`/forum/threads/${threadId}`);
const replyRow = (withReply.body?.data?.posts ?? []).find((row) => row.id === replyId);
check(
  'Javob daraxtda ildizga bog`landi',
  replyRow?.parentId === rootPostId,
  `depth=${replyRow?.depth}`,
);

const markAnswer = await student(`/forum/posts/${replyId}/mark-answer`, { method: 'POST' });
check('Savol muallifi eng yaxshi javobni belgiladi', markAnswer.ok);

const afterMark = await student(`/forum/threads/${threadId}`);
check(
  'Belgilangan javob `isAnswer` bilan qaytdi',
  (afterMark.body?.data?.posts ?? []).find((row) => row.id === replyId)?.isAnswer === true,
);

const studentModerate = await student(`/forum/threads/${threadId}/moderate`, {
  method: 'PATCH',
  body: JSON.stringify({ isPinned: true }),
});
check(
  'Talaba mavzuni moderatsiya qila olmadi',
  studentModerate.status === 403,
  `status ${studentModerate.status}`,
);

const lock = await teacher(`/forum/threads/${threadId}/moderate`, {
  method: 'PATCH',
  body: JSON.stringify({ isLocked: true }),
});
check('O`qituvchi mavzuni yopdi', lock.ok);

const lockedReply = await student('/forum/posts', {
  method: 'POST',
  body: JSON.stringify({ threadId, contentHtml: '<p>Yana javob</p>' }),
});
check(
  'Yopilgan mavzuga javob yozib bo`lmaydi',
  lockedReply.status === 422 && lockedReply.body?.error?.messageKey === 'errors.thread_locked',
  `status ${lockedReply.status}, ${lockedReply.body?.error?.messageKey}`,
);

// =============================================================================
// C. DAVOMAT JURNALI
// =============================================================================
console.log('\n3. Davomat jurnali');

const sessions = await teacher('/class-sessions');
const sessionRow = (sessions.body?.data ?? [])[0];
check(
  'Dars sessiyalari ro`yxati keldi',
  sessions.ok && Boolean(sessionRow),
  `${sessions.body?.data?.length ?? 0} ta`,
);

if (!sessionRow) {
  console.error('Sessiya topilmadi — davomat tekshiruvlari o`tkazib yuborildi');
} else {
  const roster = await teacher(`/class-sessions/${sessionRow.id}/roster`);
  check(
    'Sessiya ro`yxati (roster) keldi',
    roster.ok && Array.isArray(roster.body?.data?.students),
    `${roster.body?.data?.students?.length ?? 0} talaba`,
  );
  check(
    'Roster sessiya va guruh ma`lumotini beradi',
    Boolean(roster.body?.data?.session?.group?.name) &&
      Boolean(roster.body?.data?.session?.course?.code),
  );

  const students = roster.body?.data?.students ?? [];
  if (students.length > 0) {
    check(
      'Talabalar familiya bo`yicha tartiblangan',
      students.every(
        (row, index) =>
          index === 0 || students[index - 1].lastName.localeCompare(row.lastName, 'uz') <= 0,
      ),
    );

    const mark = await teacher('/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({
        classSessionId: sessionRow.id,
        records: students.slice(0, 3).map((row, index) => ({
          userId: row.userId,
          status: index === 0 ? 'ABSENT' : 'PRESENT',
          ...(index === 0 ? { comment: 'Sinov izohi' } : {}),
        })),
      }),
    });
    check(
      'Davomat belgilandi',
      mark.ok && mark.body?.data?.marked === Math.min(3, students.length),
      `${mark.body?.data?.marked} yozuv`,
    );

    const afterMarkRoster = await teacher(`/class-sessions/${sessionRow.id}/roster`);
    const first = (afterMarkRoster.body?.data?.students ?? []).find(
      (row) => row.userId === students[0].userId,
    );
    check(
      'Qo`yilgan holat rosterda qaytadi',
      first?.status === 'ABSENT',
      `status=${first?.status}`,
    );
    check('Izoh ham saqlandi', first?.comment === 'Sinov izohi');

    const studentRoster = await student(`/class-sessions/${sessionRow.id}/roster`);
    check(
      'Talaba rosterni ocha olmadi',
      studentRoster.status === 403,
      `status ${studentRoster.status}`,
    );

    const studentMark = await student('/attendance/mark', {
      method: 'POST',
      body: JSON.stringify({
        classSessionId: sessionRow.id,
        records: [{ userId: students[0].userId, status: 'PRESENT' }],
      }),
    });
    check(
      'Talaba davomat belgilay olmadi',
      studentMark.status === 403,
      `status ${studentMark.status}`,
    );
  }
}

// =============================================================================
// D. SHAXSIY XABAR
// =============================================================================
console.log('\n4. Shaxsiy xabar');

const studentContacts = await student('/messages/contacts');
const contacts = studentContacts.body?.data ?? [];
check(
  'Talabaga kontaktlar ro`yxati keldi',
  studentContacts.ok && contacts.length > 0,
  `${contacts.length} ta`,
);

/**
 * §11: global foydalanuvchilar ro'yxati ochilmasligi kerak. Ikki tomondan
 * tekshiramiz — kontaktlar soni bazadagidan sezilarli kam bo'lishi va
 * talaba bilan umumiy kursi YO'Q kishi (administrator) ro'yxatda
 * bo'lmasligi.
 */
const adminLogin = await loginFull('admin@qdu.uz');
const admin = client(adminLogin.token);
const adminPage = await admin('/users?limit=100');
const visibleToAdmin = (adminPage.body?.data ?? []).length;

check(
  'Kontaktlar global ro`yxatdan ancha kam',
  visibleToAdmin > 0 && contacts.length < visibleToAdmin,
  `${contacts.length} / ${visibleToAdmin}+`,
);
check(
  'Umumiy kursi yo`q administrator kontaktlarda yo`q',
  !contacts.some((row) => row.id === adminLogin.userId),
);

check('Kontaktlar ichida o`zi yo`q', !contacts.some((row) => row.id === studentId));

const teacherContact = contacts[0];
const sent = await student('/messages', {
  method: 'POST',
  body: JSON.stringify({
    recipientId: teacherContact.id,
    subject: `Sinov xabari ${suffix}`,
    body: '<p>Salom, savolim bor</p>',
  }),
});
const messageId = sent.body?.data?.id;
check('Xabar yuborildi', sent.ok && Boolean(messageId));

const outbox = await student('/messages?box=sent');
check(
  'Xabar "yuborilgan" qutisida',
  (outbox.body?.data ?? []).some((row) => row.id === messageId),
);

const inbox = await teacher('/messages?box=inbox');
const received = (inbox.body?.data ?? []).find((row) => row.id === messageId);
check('Xabar qabul qiluvchining qutisiga tushdi', Boolean(received));
check('Xabar o`qilmagan holatda keldi', received?.readAt === null);

const read = await teacher(`/messages/${messageId}/read`, { method: 'PATCH' });
check('Xabar o`qilgan deb belgilandi', read.ok && read.body?.data?.updated === 1);

const foreignRead = await student(`/messages/${messageId}/read`, { method: 'PATCH' });
check(
  'Begona xabarni o`qilgan deb belgilab bo`lmaydi',
  foreignRead.ok && foreignRead.body?.data?.updated === 0,
  `updated=${foreignRead.body?.data?.updated}`,
);

const selfMessage = await student('/messages', {
  method: 'POST',
  body: JSON.stringify({ recipientId: studentId, body: '<p>O`zimga</p>' }),
});
check(
  'O`ziga xabar yozib bo`lmaydi',
  selfMessage.status === 422 &&
    selfMessage.body?.error?.messageKey === 'errors.cannot_message_self',
  `status ${selfMessage.status}, ${selfMessage.body?.error?.messageKey}`,
);

const messageReply = await teacher('/messages', {
  method: 'POST',
  body: JSON.stringify({
    recipientId: studentId,
    body: '<p>Javobim</p>',
    replyToId: messageId,
  }),
});
check('Javob yuborildi', messageReply.ok && Boolean(messageReply.body?.data?.id));

// =============================================================================
// E. SERTIFIKAT BERISH
// =============================================================================
console.log('\n5. Sertifikat berish');

const templateList = await teacher('/certificates/templates');
const templateId = templateList.body?.data?.[0]?.id;
check('O`qituvchi shablonlar ro`yxatini oldi', templateList.ok && Boolean(templateId));

/**
 * Ilgari o'qituvchi reestrga 403 olardi — bergan sertifikatini ko'ra olmasdi.
 * Endi o'z kurslari doirasida ko'radi; begona kurs so'ralsa bo'sh ro'yxat.
 */
const teacherRegistry = await teacher('/certificates/registry');
check(
  'O`qituvchi reestrni ko`radi (o`z kurslari doirasida)',
  teacherRegistry.ok && Array.isArray(teacherRegistry.body?.data),
  `status ${teacherRegistry.status}`,
);
check(
  'Reestrdagi hamma yozuv o`qituvchi kurslariga tegishli',
  (teacherRegistry.body?.data ?? []).every((row) => teacherCourseIds.has(row.course.id)),
);

const foreignCourse = randomUUID();
const foreignRegistry = await teacher(`/certificates/registry?courseId=${foreignCourse}`);
check(
  'Begona kurs so`ralganda bo`sh ro`yxat',
  foreignRegistry.ok && (foreignRegistry.body?.data ?? []).length === 0,
);

// Yozilmagan odamga berish rad etiladi — identifikatorni bilish yetarli emas
const outsider = await teacher('/certificates/issue', {
  method: 'POST',
  body: JSON.stringify({ templateId, courseId, userIds: [adminLogin.userId] }),
});
check(
  'Kursga yozilmagan odamga sertifikat berilmaydi',
  outsider.status === 422 && outsider.body?.error?.messageKey === 'errors.certificate_not_enrolled',
  `status ${outsider.status}, ${outsider.body?.error?.messageKey}`,
);

const issued = await teacher('/certificates/issue', {
  method: 'POST',
  body: JSON.stringify({ templateId, courseId, userIds: [studentId] }),
});
check(
  'Yozilgan talabaga sertifikat berildi (yoki allaqachon bor)',
  issued.ok,
  `issued=${issued.body?.data?.issued}`,
);

const again = await teacher('/certificates/issue', {
  method: 'POST',
  body: JSON.stringify({ templateId, courseId, userIds: [studentId] }),
});
check(
  'Ikkinchi marta berish yangi yozuv yaratmaydi',
  again.ok && again.body?.data?.issued === 0,
  `issued=${again.body?.data?.issued}`,
);

const afterIssue = await teacher(`/certificates/registry?courseId=${courseId}`);
const mine = (afterIssue.body?.data ?? []).find((row) => row.user.id === studentId);
check(
  'Berilgan sertifikat o`qituvchi reestrida ko`rinadi',
  Boolean(mine),
  mine?.serialNumber ?? '',
);
check(
  'Reestr yozuvida egasi va verifikatsiya kodi bor',
  Boolean(mine?.user?.profile) && Boolean(mine?.verification?.code),
);

const studentRegistry = await student('/certificates/registry');
check(
  'Talaba faqat o`z sertifikatini ko`radi',
  studentRegistry.ok &&
    (studentRegistry.body?.data ?? []).every((row) => row.user.id === studentId),
);

const studentIssue = await student('/certificates/issue', {
  method: 'POST',
  body: JSON.stringify({ templateId, courseId, userIds: [studentId] }),
});
check(
  'Talaba sertifikat bera olmaydi',
  studentIssue.status === 403,
  `status ${studentIssue.status}`,
);

if (mine?.verification?.code) {
  const publicVerify = await fetch(`${API}/certificates/verify/${mine.verification.code}`);
  const verified = await publicVerify.json();
  check(
    'Ochiq verifikatsiya autentifikatsiyasiz ishlaydi',
    publicVerify.ok && verified.data?.valid === true,
    `valid=${verified.data?.valid}`,
  );
}

const teacherRevoke = await teacher(`/certificates/${mine?.id}/revoke`, {
  method: 'POST',
  body: JSON.stringify({ reason: 'Sinov: o`qituvchi bekor qilmoqchi' }),
});
check(
  'O`qituvchi bekor qila olmaydi',
  teacherRevoke.status === 403,
  `status ${teacherRevoke.status}`,
);

// =============================================================================
// F. SILLABUS KONSTRUKTORI VA TASDIQLASH OQIMI
// =============================================================================
console.log('\n6. Sillabus konstruktori');

const methodistLogin = await loginFull('metodist@qdu.uz');
const headLogin = await loginFull('mudir@qdu.uz');
const methodist = client(methodistLogin.token);
const head = client(headLogin.token);

// Ikkalasi ham ko'radigan fan — tasdiqlash oqimi kafedra doirasida ishlaydi
const [mSubjects, hSubjects] = await Promise.all([methodist('/subjects'), head('/subjects')]);
const headIds = new Set((hSubjects.body?.data ?? []).map((row) => row.id));
const shared = (mSubjects.body?.data ?? []).find((row) => headIds.has(row.id));
check('Metodist va mudir umumiy fani topildi', Boolean(shared), shared?.code ?? '');

// Dekanat (R3) sillabusni tasdiqlaydi — buning uchun fanlar ro'yxatini ko'rishi kerak (own_faculty)
const deanLogin = await loginFull('dekan@qdu.uz');
const dean = client(deanLogin.token);
const deanSubjects = await dean('/subjects');
check(
  'Dekanat o`z fakulteti fanlarini ko`radi (subject:read:own_faculty)',
  deanSubjects.ok && (deanSubjects.body?.data ?? []).some((row) => row.id === shared?.id),
  `status ${deanSubjects.status}, ${deanSubjects.body?.data?.length ?? 0} ta`,
);

/** Sillabus mazmuni — interfeys yig'adigan shakl. */
const content = {
  goal: { 'uz-Latn': 'Sinov maqsadi' },
  objectives: [{ 'uz-Latn': 'Birinchi vazifa' }],
  learningOutcomes: [{ text: { 'uz-Latn': 'Natija' }, bloomLevel: 'APPLY' }],
  topics: [
    {
      title: { 'uz-Latn': 'Kirish' },
      lectureHours: 2,
      practiceHours: 2,
      labHours: 0,
      independentHours: 4,
    },
  ],
  literature: [{ type: 'MAIN', citation: 'Sinov adabiyoti, 2026' }],
};
const gradingPolicy = {
  weights: { JN: 30, ON: 30, YN: 40 },
  passingScore: 60,
  finalExamThreshold: 36,
};

// --- Yaratish: yangi fan + yangi sillabus (bitta fan — bitta faol sillabus) ---
const subjectCode = `SYL-${suffix.toUpperCase()}`;
const newSubject = await methodist('/subjects', {
  method: 'POST',
  body: JSON.stringify({
    departmentId: shared.departmentId,
    code: subjectCode,
    name: { 'uz-Latn': `Sinov fani ${suffix}` },
    credits: 4,
    controlForm: 'EXAM',
  }),
});
const newSubjectId = newSubject.body?.data?.id;
check('Metodist yangi fan yaratdi', newSubject.ok && Boolean(newSubjectId), subjectCode);
const deanSyllabus = newSubjectId
  ? await dean(`/syllabi/by-subject/${newSubjectId}`)
  : { status: 0 };
check(
  'Dekanat yangi fanning sillabus sahifasiga yetib boradi (fan + sillabus o`qish)',
  deanSyllabus.status === 200 || deanSyllabus.status === 404,
  `status ${deanSyllabus.status}`,
);

const created = await methodist('/syllabi', {
  method: 'POST',
  body: JSON.stringify({
    subjectId: newSubjectId,
    departmentId: shared.departmentId,
    content,
    gradingPolicy,
  }),
});
const newSyllabusId = created.body?.data?.id;
check('Sillabus yaratildi (DRAFT)', created.ok && Boolean(newSyllabusId));

const badWeights = await methodist('/syllabi', {
  method: 'POST',
  body: JSON.stringify({
    subjectId: newSubjectId,
    departmentId: shared.departmentId,
    content,
    gradingPolicy: { ...gradingPolicy, weights: { JN: 50, ON: 30, YN: 40 } },
  }),
});
check(
  'Og`irliklar yig`indisi 100 bo`lmasa rad etiladi',
  badWeights.status === 400,
  `status ${badWeights.status}`,
);

const syllabusDetail = await methodist(`/syllabi/by-subject/${newSubjectId}`);
check(
  'Sillabus versiyalari bilan ochildi',
  syllabusDetail.ok &&
    syllabusDetail.body?.data?.status === 'DRAFT' &&
    syllabusDetail.body?.data?.versions?.length === 1,
  `status=${syllabusDetail.body?.data?.status}, v${syllabusDetail.body?.data?.currentVersion}`,
);

// --- Versiyalash: tasdiqlangan sillabusga yangi versiya ---
const existing = await methodist(`/syllabi/by-subject/${shared.id}`);
const existingId = existing.body?.data?.id;
const beforeVersion = existing.body?.data?.currentVersion ?? 0;

const version = await methodist(`/syllabi/${existingId}/versions`, {
  method: 'POST',
  body: JSON.stringify({ content, gradingPolicy, changeNote: `Sinov versiyasi ${suffix}` }),
});
check(
  'Yangi versiya yaratildi va holat DRAFT ga qaytdi',
  version.ok && version.body?.data?.version === beforeVersion + 1,
  `v${version.body?.data?.version}`,
);

// --- Tasdiqlash oqimi va vazifalar ajratilishi (§3) ---
const submitted = await methodist(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'SUBMIT' }),
});
check(
  'Metodist tasdiqlashga yubordi (REVIEW)',
  submitted.ok && submitted.body?.data?.status === 'REVIEW',
);

const selfApprove = await methodist(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'APPROVE' }),
});
check(
  'Metodist o`z sillabusini o`zi tasdiqlay olmaydi',
  selfApprove.status === 422 &&
    selfApprove.body?.error?.messageKey === 'errors.syllabus_approval_forbidden',
  `status ${selfApprove.status}, ${selfApprove.body?.error?.messageKey}`,
);

const rejectNoReason = await head(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'REJECT' }),
});
check(
  'Sababsiz qaytarish rad etiladi',
  rejectNoReason.status === 400,
  `status ${rejectNoReason.status}`,
);

const rejected = await head(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'REJECT', comment: 'Sinov: mavzular rejasini to`ldiring' }),
});
check(
  'Mudir sabab bilan qaytardi (REJECTED)',
  rejected.ok && rejected.body?.data?.status === 'REJECTED',
);

const afterReject = await methodist(`/syllabi/by-subject/${shared.id}`);
const rejectedVersion = (afterReject.body?.data?.versions ?? []).find(
  (row) => row.version === beforeVersion + 1,
);
check('Qaytarish sababi versiyada saqlandi', Boolean(rejectedVersion?.rejectReason));

const resubmitted = await methodist(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'SUBMIT' }),
});
check(
  'Qaytarilgan sillabus qayta yuborildi',
  resubmitted.ok && resubmitted.body?.data?.status === 'REVIEW',
);

const approved = await head(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'APPROVE' }),
});
check('Mudir tasdiqladi (APPROVED)', approved.ok && approved.body?.data?.status === 'APPROVED');

const wrongOrder = await head(`/syllabi/${existingId}/transition`, {
  method: 'POST',
  body: JSON.stringify({ action: 'SUBMIT' }),
});
check(
  'Tasdiqlangan sillabusni yana yuborib bo`lmaydi',
  wrongOrder.status === 422 &&
    wrongOrder.body?.error?.messageKey === 'errors.invalid_workflow_transition',
  `status ${wrongOrder.status}, ${wrongOrder.body?.error?.messageKey}`,
);

const studentSyllabus = await student(`/syllabi/${existingId}/versions`, {
  method: 'POST',
  body: JSON.stringify({ content, gradingPolicy }),
});
check(
  'Talaba sillabus versiyasini yarata olmaydi',
  studentSyllabus.status === 403,
  `status ${studentSyllabus.status}`,
);

// =============================================================================
// G. TASHKILIY TUZILMA CRUD (F-02)
// =============================================================================
console.log('\n7. Tashkiliy tuzilma');

// Boshqaruv ruxsatlari INSTITUTION_ADMIN da (`rector@qdu.uz`); `admin@qdu.uz`
// SUPER_ADMIN bo'lib, tuzilmani faqat o'qiydi.
const rectorLogin = await loginFull('rector@qdu.uz');
const rector = client(rectorLogin.token);

const orgCode = `E2E-${suffix.toUpperCase()}`;

const faculty = await rector('/org/faculties', {
  method: 'POST',
  body: JSON.stringify({
    code: `FAK-${orgCode}`,
    name: { 'uz-Latn': `Sinov fakulteti ${suffix}` },
  }),
});
const facultyId = faculty.body?.data?.id;
check('Fakultet yaratildi', faculty.ok && Boolean(facultyId), `FAK-${orgCode}`);

const facultyRenamed = await rector(`/org/faculties/${facultyId}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: { 'uz-Latn': `Qayta nomlangan ${suffix}` }, position: 99 }),
});
check('Fakultet tahrirlandi', facultyRenamed.ok && facultyRenamed.body?.data?.position === 99);

const department = await rector('/org/departments', {
  method: 'POST',
  body: JSON.stringify({
    facultyId,
    code: `KAF-${orgCode}`,
    name: { 'uz-Latn': 'Sinov kafedrasi' },
  }),
});
const departmentId = department.body?.data?.id;
check('Kafedra yaratildi', department.ok && Boolean(departmentId));

const deleteFull = await rector(`/org/faculties/${facultyId}`, { method: 'DELETE' });
check(
  'Kafedrasi bor fakultetni o`chirib bo`lmaydi',
  deleteFull.status === 422 &&
    deleteFull.body?.error?.messageKey === 'errors.faculty_has_departments',
  `status ${deleteFull.status}, ${deleteFull.body?.error?.messageKey}`,
);

const speciality = await rector('/org/specialities', {
  method: 'POST',
  body: JSON.stringify({
    departmentId,
    code: `6011${suffix.slice(0, 4).replace(/[^0-9a-f]/g, '0')}`,
    name: { 'uz-Latn': "Sinov yo'nalishi" },
    level: 'BACHELOR',
    durationYears: 4,
  }),
});
const specialityId = speciality.body?.data?.id;
check("Yo'nalish yaratildi", speciality.ok && Boolean(specialityId));

// Yangi endpoint: PATCH /org/specialities/:id
const specialityEdited = await rector(`/org/specialities/${specialityId}`, {
  method: 'PATCH',
  body: JSON.stringify({ level: 'MASTER', durationYears: 2 }),
});
check(
  "Yo'nalish tahrirlandi (yangi PATCH)",
  specialityEdited.ok &&
    specialityEdited.body?.data?.level === 'MASTER' &&
    specialityEdited.body?.data?.durationYears === 2,
);

const group = await rector('/org/groups', {
  method: 'POST',
  body: JSON.stringify({
    specialityId,
    name: `SG-${suffix.toUpperCase()}`,
    admissionYear: 2026,
    educationForm: 'DAYTIME',
    languageOfInstruction: 'uz-Latn',
  }),
});
const groupId = group.body?.data?.id;
check('Guruh yaratildi', group.ok && Boolean(groupId));

// Kurator tayinlash — yangi PATCH /org/groups/:id
const tutors = await rector('/users?roleCode=TUTOR&limit=1');
const tutorId = tutors.body?.data?.[0]?.id;
const groupEdited = await rector(`/org/groups/${groupId}`, {
  method: 'PATCH',
  body: JSON.stringify({ educationForm: 'EVENING', curatorId: tutorId ?? null }),
});
check(
  'Guruh tahrirlandi: shakl va kurator (yangi PATCH)',
  groupEdited.ok &&
    groupEdited.body?.data?.educationForm === 'EVENING' &&
    (tutorId ? groupEdited.body?.data?.curatorId === tutorId : true),
);

const groupsList = await rector(`/org/groups?specialityId=${specialityId}`);
const listedGroup = (groupsList.body?.data ?? []).find((row) => row.id === groupId);
check(
  'Guruh ro`yxatda kurator va a`zolar soni bilan',
  Boolean(listedGroup) && listedGroup._count?.members === 0,
);

const assigned = await rector('/org/groups/assign-student', {
  method: 'POST',
  body: JSON.stringify({ userId: studentId, groupId, reason: `Sinov buyrug'i ${suffix}` }),
});
check('Talaba guruhga biriktirildi', assigned.ok && assigned.body?.data?.groupId === groupId);

const members = await rector(`/org/groups/${groupId}/members`);
check(
  'A`zolar ro`yxatida talaba bor',
  members.ok && (members.body?.data ?? []).some((row) => row.user.id === studentId),
  `${members.body?.data?.length ?? 0} ta`,
);

// Tuzilma faqat o'qiladi: SUPER_ADMIN ham, talaba ham yarata olmaydi
const adminCreate = await admin('/org/faculties', {
  method: 'POST',
  body: JSON.stringify({ code: `X-${orgCode}`, name: { 'uz-Latn': 'X' } }),
});
check(
  'SUPER_ADMIN fakultet yarata olmaydi (faqat o`qiydi)',
  adminCreate.status === 403,
  `status ${adminCreate.status}`,
);

const studentEdit = await student(`/org/groups/${groupId}`, {
  method: 'PATCH',
  body: JSON.stringify({ name: 'RUXSATSIZ' }),
});
check(
  'Talaba guruhni tahrirlay olmaydi',
  studentEdit.status === 403,
  `status ${studentEdit.status}`,
);

// --- Akademik kalendar ---
const yearName = `20${suffix.slice(0, 2).replace(/[^0-9]/g, '9')}-20${suffix.slice(2, 4).replace(/[^0-9]/g, '9')}`;
const year = await rector('/org/academic-years', {
  method: 'POST',
  body: JSON.stringify({
    name: yearName,
    startsAt: '2031-09-01',
    endsAt: '2032-06-30',
    isCurrent: false,
  }),
});
const yearId = year.body?.data?.id;
check("O'quv yili yaratildi", year.ok && Boolean(yearId), yearName);

const badYear = await rector('/org/academic-years', {
  method: 'POST',
  body: JSON.stringify({ name: '2040-2041', startsAt: '2041-06-30', endsAt: '2040-09-01' }),
});
check(
  'Boshlanish tugashdan keyin bo`lsa rad etiladi',
  badYear.status === 400,
  `status ${badYear.status}`,
);

const semester = await rector('/org/semesters', {
  method: 'POST',
  body: JSON.stringify({
    academicYearId: yearId,
    number: 1,
    startsAt: '2031-09-01',
    endsAt: '2032-01-25',
  }),
});
const semesterId = semester.body?.data?.id;
check('Semestr yaratildi', semester.ok && Boolean(semesterId));

// Yangi PATCH: jurnal yopilish sanasi
const semesterEdited = await rector(`/org/semesters/${semesterId}`, {
  method: 'PATCH',
  body: JSON.stringify({ gradingClosesAt: '2032-02-10' }),
});
check(
  'Semestr tahrirlandi: jurnal yopilish sanasi (yangi PATCH)',
  semesterEdited.ok &&
    String(semesterEdited.body?.data?.gradingClosesAt ?? '').startsWith('2032-02-10'),
);

/**
 * Joriy yilni almashtirish va QAYTARISH: sinov yilini joriy qilib, darhol
 * seed'dagi asl joriy yilni tiklaymiz — aks holda tizimning joriy semestri
 * 2031 yilga ko'chib, boshqa tekshiruvlar buziladi.
 */
const before = await rector('/org/academic-years');
const originalCurrent = (before.body?.data ?? []).find((row) => row.isCurrent);

const madeCurrent = await rector(`/org/academic-years/${yearId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isCurrent: true }),
});
const afterSwitch = await rector('/org/academic-years');
const currentCount = (afterSwitch.body?.data ?? []).filter((row) => row.isCurrent).length;
check(
  'Joriy yil almashtirildi — bir vaqtda faqat bittasi joriy',
  madeCurrent.ok &&
    currentCount === 1 &&
    (afterSwitch.body?.data ?? []).find((r) => r.isCurrent)?.id === yearId,
  `joriy: ${currentCount} ta`,
);

if (originalCurrent) {
  const restored = await rector(`/org/academic-years/${originalCurrent.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ isCurrent: true }),
  });
  check(
    'Asl joriy yil tiklandi',
    restored.ok && restored.body?.data?.isCurrent === true,
    originalCurrent.name,
  );
}

// =============================================================================
// H. SAVOLLAR IMPORTI (F-07, §10 QTI) va LTI 1.3 LAUNCH (§10)
// =============================================================================
console.log('\n8. Savollar importi');

/** Faylni uch bosqichda yuklaydi (presign → PUT → complete) va fileObjectId qaytaradi. */
async function uploadAs(user, fileName, mimeType, content) {
  const presign = await user('/content/files/presign', {
    method: 'POST',
    body: JSON.stringify({
      fileName,
      mimeType,
      sizeBytes: content.byteLength,
      purpose: 'QUESTION_IMPORT',
    }),
  });
  if (!presign.ok)
    return {
      ok: false,
      detail: `presign ${presign.status} ${presign.body?.error?.messageKey ?? ''}`,
    };
  const put = await fetch(presign.body.data.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': mimeType },
    body: content,
  });
  if (!put.ok) return { ok: false, detail: `put ${put.status}` };
  const completed = await user('/content/files/complete', {
    method: 'POST',
    body: JSON.stringify({
      fileObjectId: presign.body.data.fileObjectId,
      checksumSha256: createHash('sha256').update(content).digest('hex'),
    }),
  });
  if (!completed.ok)
    return {
      ok: false,
      detail: `complete ${completed.status} ${completed.body?.error?.messageKey ?? ''}`,
    };
  return { ok: true, fileObjectId: presign.body.data.fileObjectId };
}

const importBank = await teacher('/question-banks', {
  method: 'POST',
  body: JSON.stringify({ courseId, title: { 'uz-Latn': `Import banki ${suffix}` } }),
});
const importBankId = importBank.body?.data?.id;
check('Import uchun savollar banki yaratildi', importBank.ok && Boolean(importBankId));

const aiken = Buffer.from(
  [
    `Import ${suffix}: O'zbekiston poytaxti?`,
    'A. Samarqand',
    'B. Toshkent',
    'C. Buxoro',
    'ANSWER: B',
    '',
    'Tub sonlar qaysilar?',
    'A. 2',
    'B. 4',
    'C. 5',
    'ANSWER: A,C',
    '',
    'Javobsiz savol',
    'A. x',
    'B. y',
  ].join('\n'),
  'utf8',
);
const aikenFile = await uploadAs(teacher, `import-${suffix}.txt`, 'text/plain', aiken);
check('AIKEN fayli yuklandi (QUESTION_IMPORT)', aikenFile.ok, aikenFile.detail ?? '');

const dryRun = await teacher('/questions/import', {
  method: 'POST',
  body: JSON.stringify({
    bankId: importBankId,
    format: 'AIKEN',
    fileObjectId: aikenFile.fileObjectId,
    locale: 'uz-Latn',
    dryRun: true,
  }),
});
check(
  'Oldindan ko`rish: 2 ta savol + 1 ta muammoli qator, bazaga yozilmadi',
  dryRun.ok &&
    dryRun.body?.data?.total === 2 &&
    dryRun.body?.data?.issues?.length === 1 &&
    dryRun.body?.data?.imported === 0,
  `total ${dryRun.body?.data?.total}, issues ${dryRun.body?.data?.issues?.length}, ${dryRun.body?.data?.issues?.[0]?.reason ?? ''}`,
);

const committed = await teacher('/questions/import', {
  method: 'POST',
  body: JSON.stringify({
    bankId: importBankId,
    format: 'AIKEN',
    fileObjectId: aikenFile.fileObjectId,
    locale: 'uz-Latn',
    dryRun: false,
  }),
});
check(
  'AIKEN import qilindi: 2 ta savol',
  committed.ok && committed.body?.data?.imported === 2,
  `imported ${committed.body?.data?.imported}`,
);

const qtiXml = Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>
<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="q-${suffix}" title="QTI ${suffix}">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="identifier">
    <qti-correct-response><qti-value>B</qti-value></qti-correct-response>
  </qti-response-declaration>
  <qti-item-body>
    <p>QTI ${suffix}: 2 + 2 = ?</p>
    <qti-choice-interaction response-identifier="RESPONSE" max-choices="1">
      <qti-simple-choice identifier="A">3</qti-simple-choice>
      <qti-simple-choice identifier="B">4</qti-simple-choice>
    </qti-choice-interaction>
  </qti-item-body>
</qti-assessment-item>`,
  'utf8',
);
const qtiFile = await uploadAs(teacher, `qti-${suffix}.xml`, 'text/xml', qtiXml);
check('QTI 3.0 XML fayli yuklandi', qtiFile.ok, qtiFile.detail ?? '');
const qtiImport = await teacher('/questions/import', {
  method: 'POST',
  body: JSON.stringify({
    bankId: importBankId,
    format: 'QTI_3',
    fileObjectId: qtiFile.fileObjectId,
    locale: 'uz-Latn',
  }),
});
check(
  'QTI 3.0 import qilindi',
  qtiImport.ok && qtiImport.body?.data?.imported === 1,
  `imported ${qtiImport.body?.data?.imported}`,
);

const importedList = await teacher(`/question-banks/${importBankId}/questions`);
const importedRows = importedList.body?.data ?? [];
check(
  'Bankda 3 ta savol: SINGLE, MULTI, SINGLE',
  importedRows.length === 3 && importedRows.filter((row) => row.type === 'MULTI').length === 1,
  `${importedRows.length} ta`,
);

// QTI ZIP paket: hotspot (rasm bilan) + gapMatch — rasm S3 ga yuklanadi, koordinatalar foizga o'giriladi
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);
const qtiZip = new AdmZip();
qtiZip.addFile('img/map.png', PNG_1x1);
qtiZip.addFile(
  'items/hotspot.xml',
  Buffer.from(
    `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="hs-${suffix}" title="Xarita">
  <qti-response-declaration identifier="R" cardinality="single" base-type="identifier"><qti-correct-response><qti-value>A</qti-value></qti-correct-response></qti-response-declaration>
  <qti-item-body><p>Hotspot ${suffix}: Toshkentni belgilang</p>
    <qti-hotspot-interaction response-identifier="R" max-choices="1">
      <object type="image/png" data="../img/map.png" width="400" height="200"/>
      <qti-hotspot-choice shape="rect" coords="40,20,120,60" identifier="A"/>
      <qti-hotspot-choice shape="circle" coords="300,100,20" identifier="B"/>
      <qti-hotspot-choice shape="poly" coords="200,20,240,60,160,60" identifier="C"/>
    </qti-hotspot-interaction>
  </qti-item-body>
</qti-assessment-item>`,
    'utf8',
  ),
);
qtiZip.addFile(
  'items/gap.xml',
  Buffer.from(
    `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="gm-${suffix}" title="Gap">
  <qti-response-declaration identifier="R" cardinality="multiple" base-type="directedPair"><qti-correct-response><qti-value>W1 G1</qti-value></qti-correct-response></qti-response-declaration>
  <qti-item-body><qti-gap-match-interaction response-identifier="R">
    <qti-gap-text identifier="W1">Toshkent</qti-gap-text><qti-gap-text identifier="W2">Buxoro</qti-gap-text>
    <p>GapMatch ${suffix}: poytaxt <qti-gap identifier="G1"/>.</p>
  </qti-gap-match-interaction></qti-item-body>
</qti-assessment-item>`,
    'utf8',
  ),
);
qtiZip.addFile(
  'items/inline.xml',
  Buffer.from(
    `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="ic-${suffix}" title="Inline">
  <qti-response-declaration identifier="R1" cardinality="single" base-type="identifier"><qti-correct-response><qti-value>B</qti-value></qti-correct-response></qti-response-declaration>
  <qti-item-body><p>InlineChoice ${suffix}: poytaxt <qti-inline-choice-interaction response-identifier="R1"><qti-inline-choice identifier="A">Samarqand</qti-inline-choice><qti-inline-choice identifier="B">Toshkent</qti-inline-choice></qti-inline-choice-interaction>.</p></qti-item-body>
</qti-assessment-item>`,
    'utf8',
  ),
);
qtiZip.addFile(
  'items/slider.xml',
  Buffer.from(
    `<qti-assessment-item xmlns="http://www.imsglobal.org/xsd/imsqtiasi_v3p0" identifier="sl-${suffix}" title="Slider">
  <qti-response-declaration identifier="RESPONSE" cardinality="single" base-type="integer"><qti-correct-response><qti-value>7</qti-value></qti-correct-response></qti-response-declaration>
  <qti-item-body><p>Slider ${suffix}: haftada necha kun?</p><qti-slider-interaction response-identifier="RESPONSE" lower-bound="1" upper-bound="10" step="1"/></qti-item-body>
</qti-assessment-item>`,
    'utf8',
  ),
);
const qtiZipFile = await uploadAs(
  teacher,
  `qti-${suffix}.zip`,
  'application/zip',
  qtiZip.toBuffer(),
);
check('QTI ZIP paketi yuklandi', qtiZipFile.ok, qtiZipFile.detail ?? '');
const qtiZipImport = await teacher('/questions/import', {
  method: 'POST',
  body: JSON.stringify({
    bankId: importBankId,
    format: 'QTI_3',
    fileObjectId: qtiZipFile.fileObjectId,
    locale: 'uz-Latn',
  }),
});
check(
  'Hotspot + gapMatch + inlineChoice + slider import qilindi (4 ta savol)',
  qtiZipImport.ok &&
    qtiZipImport.body?.data?.imported === 4 &&
    (qtiZipImport.body?.data?.issues ?? []).length === 0,
  qtiZipImport.ok
    ? `issues ${JSON.stringify(qtiZipImport.body?.data?.issues ?? [])}`
    : `${qtiZipImport.status} ${qtiZipImport.body?.error?.messageKey ?? ''}`,
);
const afterZip = await teacher(`/question-banks/${importBankId}/questions?type=HOTSPOT`);
const hotspotRow = (afterZip.body?.data ?? [])[0];
const hotspotArea = hotspotRow?.payload?.areas?.[0];
check(
  'Hotspot: rasm FileObject sifatida saqlandi, koordinatalar foizda (40/400 → 10%)',
  Boolean(hotspotRow) &&
    /^[0-9a-f-]{36}$/.test(hotspotRow.payload?.imageFileId ?? '') &&
    hotspotRow.payload.imageFileId !== '00000000-0000-0000-0000-000000000000' &&
    hotspotArea?.shape === 'RECT' &&
    hotspotArea?.x === 10 &&
    hotspotArea?.width === 20 &&
    hotspotArea?.height === 20,
  hotspotArea ? JSON.stringify(hotspotArea) : 'hotspot topilmadi',
);
const polyArea = (hotspotRow?.payload?.areas ?? []).find((area) => area.shape === 'POLY');
check(
  'Hotspot poly: uchlar foizga o`girildi (200/400 → 50%, 20/200 → 10%)',
  Boolean(polyArea) &&
    JSON.stringify(polyArea.points) ===
      JSON.stringify([
        { x: 50, y: 10 },
        { x: 60, y: 30 },
        { x: 40, y: 30 },
      ]),
  polyArea ? JSON.stringify(polyArea) : 'poly topilmadi',
);
const inlineRows = await teacher(`/question-banks/${importBankId}/questions?type=CLOZE`);
const inlineRow = (inlineRows.body?.data ?? []).find((row) =>
  JSON.stringify(row.text ?? '').includes(`InlineChoice ${suffix}`),
);
check(
  'inlineChoice: CLOZE bo`shlig`i ro`yxat (options) va to`g`ri javob bilan',
  Boolean(inlineRow) &&
    JSON.stringify(inlineRow.payload?.blanks?.[0]?.options) ===
      JSON.stringify(['Samarqand', 'Toshkent']) &&
    inlineRow.payload?.blanks?.[0]?.accepted?.[0] === 'Toshkent',
  inlineRow ? JSON.stringify(inlineRow.payload?.blanks) : 'topilmadi',
);
const sliderRows = await teacher(`/question-banks/${importBankId}/questions?type=NUMERIC`);
const sliderRow = (sliderRows.body?.data ?? []).find((row) =>
  JSON.stringify(row.text ?? '').includes(`Slider ${suffix}`),
);
check(
  'slider: NUMERIC range bilan (1..10, qadam 1, javob 7)',
  Boolean(sliderRow) &&
    sliderRow.payload?.correctValue === 7 &&
    sliderRow.payload?.range?.min === 1 &&
    sliderRow.payload?.range?.max === 10 &&
    sliderRow.payload?.range?.step === 1,
  sliderRow ? JSON.stringify(sliderRow.payload) : 'topilmadi',
);
const hotspotImage = hotspotRow
  ? await teacher(`/content/files/${hotspotRow.payload.imageFileId}/download`)
  : null;
check(
  'Hotspot rasmi yuklab olinadi',
  Boolean(hotspotImage?.ok && hotspotImage.body?.data?.url),
  hotspotImage ? `${hotspotImage.status}` : '',
);
const dragRows = await teacher(`/question-banks/${importBankId}/questions?type=DRAG_DROP`);
check(
  'gapMatch DRAG_DROP bo`ldi (zona + element)',
  (dragRows.body?.data ?? []).some(
    (row) => row.payload?.zones?.length === 1 && row.payload?.items?.length === 2,
  ),
);

// --- QTI 3.0 eksport → yuklab olish → qayta import (round-trip) ---
const qtiExport = await teacher(`/question-banks/${importBankId}/export`, {
  method: 'POST',
  body: JSON.stringify({ format: 'QTI_3', locale: 'uz-Latn' }),
});
check(
  'Bank QTI 3.0 paketiga eksport qilindi (7 ta savol, hotspot rasmi bilan)',
  qtiExport.ok && qtiExport.body?.data?.exported === 7 && Boolean(qtiExport.body?.data?.url),
  qtiExport.ok
    ? `exported ${qtiExport.body?.data?.exported}, skipped ${JSON.stringify(qtiExport.body?.data?.skipped ?? [])}`
    : `${qtiExport.status} ${qtiExport.body?.error?.messageKey ?? ''}`,
);
const exportedZip = qtiExport.ok
  ? Buffer.from(await (await fetch(qtiExport.body.data.url)).arrayBuffer())
  : null;
const exportedEntries = exportedZip
  ? new AdmZip(exportedZip).getEntries().map((e) => e.entryName)
  : [];
check(
  'Paketda manifest, 7 ta item va media/ rasm bor',
  exportedEntries.includes('imsmanifest.xml') &&
    exportedEntries.filter((n) => n.startsWith('items/')).length === 7 &&
    exportedEntries.some((n) => n.startsWith('media/')),
  exportedEntries.join(', '),
);
const roundTripBank = await teacher('/question-banks', {
  method: 'POST',
  body: JSON.stringify({ courseId, title: { 'uz-Latn': `Round-trip banki ${suffix}` } }),
});
const roundTripFile = exportedZip
  ? await uploadAs(teacher, `qti-export-${suffix}.zip`, 'application/zip', exportedZip)
  : { ok: false, detail: 'eksport yo`q' };
const roundTrip = roundTripFile.ok
  ? await teacher('/questions/import', {
      method: 'POST',
      body: JSON.stringify({
        bankId: roundTripBank.body?.data?.id,
        format: 'QTI_3',
        fileObjectId: roundTripFile.fileObjectId,
        locale: 'uz-Latn',
      }),
    })
  : null;
const roundTripRows = roundTrip?.ok
  ? ((await teacher(`/question-banks/${roundTripBank.body.data.id}/questions`)).body?.data ?? [])
  : [];
check(
  'Eksport qilingan paket qayta import bo`ldi: 7 ta savol, turlar saqlangan (ro`yxatli bo`shliq, slayder, poly ham)',
  Boolean(roundTrip?.ok) &&
    roundTrip.body?.data?.imported === 7 &&
    roundTripRows.some(
      (r) => r.type === 'CLOZE' && r.payload?.blanks?.some((b) => (b.options ?? []).length === 2),
    ) &&
    roundTripRows.some((r) => r.type === 'NUMERIC' && r.payload?.range?.max === 10) &&
    roundTripRows.some(
      (r) =>
        r.type === 'HOTSPOT' &&
        r.payload?.areas?.some((a) => a.shape === 'POLY' && a.points?.length === 3),
    ) &&
    roundTripRows
      .map((r) => r.type)
      .sort()
      .join(',') ===
      importedRows
        .concat(...[])
        .map((r) => r.type)
        .concat(['HOTSPOT', 'DRAG_DROP', 'CLOZE', 'NUMERIC'])
        .sort()
        .join(','),
  roundTrip
    ? `imported ${roundTrip.body?.data?.imported}, turlar: ${roundTripRows
        .map((r) => r.type)
        .sort()
        .join(',')}`
    : (roundTripFile.detail ?? ''),
);

const studentImport = await student('/questions/import', {
  method: 'POST',
  body: JSON.stringify({
    bankId: importBankId,
    format: 'AIKEN',
    fileObjectId: aikenFile.fileObjectId,
  }),
});
check('Talaba import qila olmaydi', studentImport.status === 403, `status ${studentImport.status}`);

// --- LTI 1.3 ---
console.log('\n9. LTI 1.3 launch');

/**
 * Soxta platforma (AGS/NRPS/Deep Linking uchun): API konteyneri host'dagi shu
 * serverga `host.docker.internal` orqali chiqadi. Kelgan so'rovlar `mockLog` da.
 */
const MOCK_PORT = 47123;
const MOCK_BASE = `http://host.docker.internal:${MOCK_PORT}`;
const mockLog = { tokens: [], scores: [], lineitems: [], memberships: 0, deepLinks: [] };
const mockServer = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const url = new URL(request.url ?? '/', MOCK_BASE);
  const json = (status, body) => {
    response.writeHead(status, { 'content-type': 'application/json' });
    response.end(JSON.stringify(body));
  };
  if (url.pathname === '/token' && request.method === 'POST') {
    const form = new URLSearchParams(raw);
    mockLog.tokens.push({ scope: form.get('scope'), assertion: form.get('client_assertion') });
    return json(200, {
      access_token: `mock-${mockLog.tokens.length}`,
      token_type: 'Bearer',
      expires_in: 3600,
    });
  }
  const scoresMatch = url.pathname.match(/^\/lineitems\/(\d+)\/scores$/);
  if (scoresMatch && request.method === 'POST') {
    mockLog.scores.push({
      lineItem: Number(scoresMatch[1]),
      auth: request.headers.authorization,
      body: JSON.parse(raw),
    });
    return json(200, {});
  }
  if (url.pathname === '/lineitems' && request.method === 'POST') {
    const item = JSON.parse(raw);
    // 1 — launch'da kelgan kurs line item'i; yangilari 2, 3, ...
    const id = `${MOCK_BASE}/lineitems/${mockLog.lineitems.length + 2}`;
    mockLog.lineitems.push({ ...item, id });
    return json(201, { id, scoreMaximum: item.scoreMaximum ?? 100 });
  }
  if (url.pathname === '/members') {
    mockLog.memberships += 1;
    return json(200, {
      id: `${MOCK_BASE}/members`,
      members: [
        {
          user_id: `learner-${suffix}`,
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          name: 'LTI Talaba',
          email: `lti-learner-${suffix}@lti.invalid`,
        },
        {
          user_id: `learner2-${suffix}`,
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
          given_name: 'Ikkinchi',
          family_name: 'Talaba',
          email: `lti-learner2-${suffix}@lti.invalid`,
        },
        {
          user_id: `instructor-${suffix}`,
          roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
          name: 'LTI O`qituvchi',
        },
      ],
    });
  }
  if (url.pathname === '/dl-return' && request.method === 'POST') {
    mockLog.deepLinks.push(new URLSearchParams(raw).get('JWT'));
    return json(200, {});
  }
  return json(404, { error: 'not_found' });
});
await new Promise((resolve) => mockServer.listen(MOCK_PORT, '0.0.0.0', resolve));

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const platformJwk = {
  ...publicKey.export({ format: 'jwk' }),
  kid: `k-${suffix}`,
  alg: 'RS256',
  use: 'sig',
};
const issuer = `https://platform-${suffix}.e2e.local`;
const clientId = `client-${suffix}`;

const platform = await admin('/lti/platforms', {
  method: 'POST',
  body: JSON.stringify({
    name: `E2E platforma ${suffix}`,
    issuer,
    clientId,
    deploymentId: 'dep-1',
    authLoginUrl: `${issuer}/auth`,
    authTokenUrl: `${MOCK_BASE}/token`,
    publicJwks: { keys: [platformJwk] },
  }),
});
const platformId = platform.body?.data?.id;
check(
  'LTI platformasi ro`yxatga olindi (JWKS qo`lda)',
  platform.ok && Boolean(platformId),
  platform.body?.error?.messageKey ?? '',
);

const noKeys = await admin('/lti/platforms', {
  method: 'POST',
  body: JSON.stringify({
    name: 'X',
    issuer: `${issuer}/x`,
    clientId: 'x',
    deploymentId: '1',
    authLoginUrl: `${issuer}/auth`,
    authTokenUrl: `${issuer}/token`,
  }),
});
check(
  'Kalit manbasiz platforma rad etiladi (400)',
  noKeys.status === 400,
  `status ${noKeys.status}`,
);

const toolJwks = await fetch(`${API}/lti/jwks`).then((r) => r.json());
check(
  'Tool JWKS ochiq va RSA kalit beradi',
  toolJwks?.data?.keys?.[0]?.kty === 'RSA' && Boolean(toolJwks.data.keys[0].kid),
);

/** OIDC login → state/nonce; keyin imzolangan id_token bilan launch. */
async function ltiLaunch({
  deploymentId = 'dep-1',
  roles,
  custom = {},
  sub,
  email,
  messageType = 'LtiResourceLinkRequest',
  services = false,
  deepLinking = false,
}) {
  const loginUrl = new URL(`${API}/lti/login`);
  loginUrl.searchParams.set('iss', issuer);
  loginUrl.searchParams.set('client_id', clientId);
  loginUrl.searchParams.set('login_hint', sub);
  loginUrl.searchParams.set('target_link_uri', `${API}/lti/launch`);
  const login = await fetch(loginUrl, { redirect: 'manual' });
  const location = login.headers.get('location') ?? '';
  const redirect = location ? new URL(location) : null;
  const state = redirect?.searchParams.get('state') ?? '';
  const nonce = redirect?.searchParams.get('nonce') ?? '';
  const stateCookie =
    (login.headers.getSetCookie?.() ?? [])
      .find((c) => c.startsWith('lms_lti_state='))
      ?.split(';')[0] ?? '';

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: issuer,
    aud: clientId,
    sub,
    exp: now + 300,
    iat: now,
    nonce,
    email,
    given_name: 'LTI',
    family_name: `Talaba ${suffix}`,
    'https://purl.imsglobal.org/spec/lti/claim/message_type': messageType,
    'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
    'https://purl.imsglobal.org/spec/lti/claim/deployment_id': deploymentId,
    'https://purl.imsglobal.org/spec/lti/claim/target_link_uri': `${API}/lti/launch`,
    'https://purl.imsglobal.org/spec/lti/claim/resource_link': { id: `rl-${suffix}` },
    'https://purl.imsglobal.org/spec/lti/claim/roles': roles,
    'https://purl.imsglobal.org/spec/lti/claim/custom': custom,
    'https://purl.imsglobal.org/spec/lti/claim/context': {
      id: `ctx-${suffix}`,
      title: `Moodle kursi ${suffix}`,
    },
    ...(services
      ? {
          'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint': {
            scope: [
              'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem',
              'https://purl.imsglobal.org/spec/lti-ags/scope/score',
            ],
            lineitems: `${MOCK_BASE}/lineitems`,
            lineitem: `${MOCK_BASE}/lineitems/1`,
          },
          'https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice': {
            context_memberships_url: `${MOCK_BASE}/members`,
            service_versions: ['2.0'],
          },
        }
      : {}),
    ...(deepLinking
      ? {
          'https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings': {
            deep_link_return_url: `${MOCK_BASE}/dl-return`,
            accept_types: ['ltiResourceLink'],
            accept_presentation_document_targets: ['iframe', 'window'],
            data: `dl-data-${suffix}`,
          },
        }
      : {}),
  };
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const signingInput = `${b64({ alg: 'RS256', typ: 'JWT', kid: platformJwk.kid })}.${b64(claims)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(signingInput);
  const idToken = `${signingInput}.${signer.sign(privateKey).toString('base64url')}`;

  const launch = await fetch(`${API}/lti/launch`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie: stateCookie },
    body: new URLSearchParams({ id_token: idToken, state }),
  });
  const cookies = launch.headers.getSetCookie?.() ?? [];
  const body = launch.status >= 400 ? await launch.json().catch(() => null) : null;
  return { login, state, nonce, idToken, launch, cookies, body };
}

const learnerSub = `learner-${suffix}`;
const first = await ltiLaunch({
  sub: learnerSub,
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
  custom: { course_id: courseId },
  services: true,
});
check(
  'OIDC login: platformaga state va nonce bilan yo`naltiradi',
  first.login.status === 302 &&
    Boolean(first.state) &&
    Boolean(first.nonce) &&
    (first.login.headers.get('location') ?? '').startsWith(`${issuer}/auth?`),
  `status ${first.login.status}`,
);
check(
  'Launch: foydalanuvchi yaratildi, sessiya cookie bilan kursga yo`naltirildi',
  first.launch.status === 302 &&
    (first.launch.headers.get('location') ?? '').endsWith(`/courses/${courseId}`) &&
    first.cookies.some((c) => c.startsWith('lms_refresh=')),
  `status ${first.launch.status} → ${first.launch.headers.get('location') ?? first.body?.error?.messageKey ?? ''}`,
);

// Yangi foydalanuvchi refresh cookie orqali sessiyani tiklaydi va kursga yozilgan
const refreshCookie = first.cookies.find((c) => c.startsWith('lms_refresh='))?.split(';')[0] ?? '';
const refreshed = await fetch(`${API}/auth/refresh`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: refreshCookie },
  body: '{}',
});
const refreshedBody = await refreshed.json().catch(() => null);
const ltiToken = refreshedBody?.data?.tokens?.accessToken;
check(
  'LTI foydalanuvchisi refresh orqali access token oladi',
  refreshed.ok && Boolean(ltiToken),
  `status ${refreshed.status}`,
);
if (ltiToken) {
  const ltiUser = client(ltiToken);
  const me = await ltiUser('/auth/me');
  const myCourses = await ltiUser('/courses?onlyEnrolled=true&limit=50');
  check(
    'LTI foydalanuvchisi STUDENT roli bilan kursga yozilgan',
    (me.body?.data?.roles ?? []).includes('STUDENT') &&
      (myCourses.body?.data ?? []).some((row) => row.id === courseId),
    `rollar: ${(me.body?.data?.roles ?? []).join(',')}`,
  );
}

const replay = await fetch(`${API}/lti/launch`, {
  method: 'POST',
  redirect: 'manual',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ id_token: first.idToken, state: first.state }),
});
const replayBody = await replay.json().catch(() => null);
check(
  'Takroriy launch (o`sha state) rad etiladi',
  replay.status === 422 && replayBody?.error?.messageKey === 'errors.lti_state_invalid',
  `status ${replay.status}`,
);

const wrongDeployment = await ltiLaunch({
  sub: learnerSub,
  deploymentId: 'dep-2',
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
});
check(
  'Deployment ID mos kelmasa launch rad etiladi',
  wrongDeployment.launch.status === 422 &&
    wrongDeployment.body?.error?.messageKey === 'errors.lti_deployment_mismatch',
  `status ${wrongDeployment.launch.status} ${wrongDeployment.body?.error?.messageKey ?? ''}`,
);

const second = await ltiLaunch({
  sub: learnerSub,
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Learner'],
});
check(
  'Ikkinchi launch o`sha foydalanuvchiga bog`lanadi (yangi hisob yaratilmaydi)',
  second.launch.status === 302,
);
const platformsAfter = await admin('/lti/platforms');
const platformRow = (platformsAfter.body?.data?.platforms ?? []).find(
  (row) => row.id === platformId,
);
check(
  'Platformada 1 ta bog`langan foydalanuvchi',
  platformRow?._count?.userLinks === 1,
  `${platformRow?._count?.userLinks ?? '?'} ta`,
);

// `integration:read:all` INSTITUTION_ADMIN da bor (ro'yxatni ko'radi), `manage` esa faqat SUPER_ADMIN da
const rectorCreate = await rector('/lti/platforms', {
  method: 'POST',
  body: JSON.stringify({
    name: 'Rektor',
    issuer: `${issuer}/r`,
    clientId: 'r',
    deploymentId: '1',
    authLoginUrl: `${issuer}/auth`,
    authTokenUrl: `${issuer}/token`,
    publicJwks: { keys: [platformJwk] },
  }),
});
check(
  'INSTITUTION_ADMIN LTI platformasini yarata olmaydi (faqat SUPER_ADMIN)',
  rectorCreate.status === 403,
  `status ${rectorCreate.status}`,
);

// --- LTI Advantage: AGS, NRPS, Deep Linking (soxta platforma bilan) ---
console.log('\n9a. LTI Advantage (AGS / NRPS / Deep Linking)');

const courseLinks = await teacher(`/lti/courses/${courseId}/links`);
const courseLink = (courseLinks.body?.data ?? []).find((row) => row.platform?.id === platformId);
check(
  'Launch konteksti saqlandi: resurs havolasi → kurs, AGS/NRPS manzillari',
  Boolean(courseLink) &&
    courseLink.lineItemUrl === `${MOCK_BASE}/lineitems/1` &&
    courseLink.membershipsUrl === `${MOCK_BASE}/members` &&
    courseLink.contextTitle === `Moodle kursi ${suffix}`,
  courseLink
    ? JSON.stringify({ lineItem: courseLink.lineItemUrl, members: courseLink.membershipsUrl })
    : `${courseLinks.status}`,
);

// Talabaga baho qo'yamiz (o'qituvchi test bahosi kabi) — `grading` orqali emas, mavjud baho bo'lsa yetarli;
// LTI talabasining bahosi yo'q bo'lsa push "no_grades" deb o'tkazib yuboradi — shuni ham tekshiramiz
const pushEmpty = await teacher(`/lti/courses/${courseId}/grades/push`, {
  method: 'POST',
  body: '{}',
});
check(
  'AGS push: bahosi yo`q talaba o`tkazib yuboriladi (yolg`on baho yuborilmaydi)',
  pushEmpty.ok &&
    pushEmpty.body?.data?.users >= 1 &&
    pushEmpty.body?.data?.pushed === 0 &&
    (pushEmpty.body?.data?.skipped ?? []).includes('no_grades'),
  pushEmpty.ok
    ? JSON.stringify(pushEmpty.body?.data)
    : `${pushEmpty.status} ${pushEmpty.body?.error?.messageKey ?? ''}`,
);

// LTI talabasiga baho: o'qituvchi qo'lda baho qo'yadi (jurnal)
const ltiUserId = refreshedBody?.data?.user?.id;
const manualGrade = ltiUserId
  ? await teacher('/grading/manual', {
      method: 'POST',
      body: JSON.stringify({
        courseId,
        userId: ltiUserId,
        controlTypeCode: 'JN',
        score: 40,
        maxScore: 50,
        reason: `LTI sinov ${suffix}`,
      }),
    })
  : { status: 0, body: null };
const pushAfter = await teacher(`/lti/courses/${courseId}/grades/push`, {
  method: 'POST',
  body: '{}',
});
const lastScore = mockLog.scores[mockLog.scores.length - 1];
check(
  'AGS push: baho platformaga yuborildi (client_credentials token + scores POST, 80%)',
  manualGrade.status !== 0 &&
    pushAfter.ok &&
    pushAfter.body?.data?.pushed >= 1 &&
    lastScore?.body?.userId === learnerSub &&
    lastScore?.body?.scoreGiven === 80 &&
    lastScore?.body?.scoreMaximum === 100 &&
    String(lastScore?.auth ?? '').startsWith('Bearer mock-'),
  `grade ${manualGrade.status} ${manualGrade.body?.error?.messageKey ?? ''}; push ${JSON.stringify(pushAfter.body?.data ?? pushAfter.body?.error)}; scores ${mockLog.scores.length}`,
);
check(
  'Token so`rovi tool kaliti bilan imzolangan JWT assertion (scope=score)',
  mockLog.tokens.some(
    (entry) =>
      (entry.scope ?? '').includes('lti-ags/scope/score') &&
      String(entry.assertion ?? '').split('.').length === 3,
  ),
  `${mockLog.tokens.length} ta token so'rovi`,
);

// --- Faoliyat darajasidagi line item: topshiriq bahosi alohida ustunga ---
const ltiLearner = client(ltiToken);
const agsAssignment = await teacher('/assignments', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `AGS topshirig'i ${suffix}` },
    description: { 'uz-Latn': '<p>LTI</p>' },
    controlType: 'JN',
    maxScore: 20,
    dueAt: '2031-10-01T12:00:00.000Z',
  }),
});
const agsAssignmentId = agsAssignment.body?.data?.id;
if (agsAssignmentId) {
  await teacher(`/assignments/${agsAssignmentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isPublished: true }),
  });
}
const agsSubmission = agsAssignmentId
  ? await ltiLearner('/submissions', {
      method: 'POST',
      body: JSON.stringify({
        assignmentId: agsAssignmentId,
        contentHtml: '<p>Javob</p>',
        submit: true,
      }),
    })
  : { status: 0, body: null };
const agsSubmissionId = agsSubmission.body?.data?.id;
const scoresBefore = mockLog.scores.length;
const agsGrade = agsSubmissionId
  ? await teacher(`/submissions/${agsSubmissionId}/grade`, {
      method: 'POST',
      body: JSON.stringify({ score: 15 }),
    })
  : { status: 0, body: null };
// Baho navbat orqali ishchida yuboriladi — kutamiz (maks. 20 s)
for (
  let i = 0;
  i < 40 && !mockLog.lineitems.some((li) => li.resourceId === `assignment:${agsAssignmentId}`);
  i += 1
) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
for (let i = 0; i < 20 && mockLog.scores.length < scoresBefore + 2; i += 1) {
  await new Promise((resolve) => setTimeout(resolve, 500));
}
const activityItem = mockLog.lineitems.find(
  (li) => li.resourceId === `assignment:${agsAssignmentId}`,
);
const activityScore = activityItem
  ? mockLog.scores.find((entry) => `${MOCK_BASE}/lineitems/${entry.lineItem}` === activityItem.id)
  : null;
check(
  'AGS: topshiriq baholanganda ishchi alohida line item yaratdi (label = nom, scoreMaximum = 20, resourceId)',
  agsGrade.status === 201 || agsGrade.status === 200
    ? Boolean(activityItem) &&
        activityItem.scoreMaximum === 20 &&
        activityItem.label === `AGS topshirig'i ${suffix}` &&
        activityItem.tag === 'assignment'
    : false,
  `submit ${agsSubmission.status} ${agsSubmission.body?.error?.messageKey ?? ''}; grade ${agsGrade.status} ${agsGrade.body?.error?.messageKey ?? ''}; lineitems ${JSON.stringify(mockLog.lineitems.map((li) => li.resourceId ?? li.label))}`,
);
check(
  'AGS: faoliyat bahosi o`z line item`iga xom ball bilan yuborildi (15/20), jamlanma ham yangilandi',
  Boolean(activityScore) &&
    activityScore.body.scoreGiven === 15 &&
    activityScore.body.scoreMaximum === 20 &&
    activityScore.body.userId === learnerSub &&
    mockLog.scores.slice(scoresBefore).some((entry) => entry.lineItem === 1),
  `scores ${JSON.stringify(mockLog.scores.slice(scoresBefore).map((entry) => [entry.lineItem, entry.body.scoreGiven, entry.body.scoreMaximum]))}`,
);
const linksWithItems = await teacher(`/lti/courses/${courseId}/links`);
const linkWithItems = (linksWithItems.body?.data ?? []).find(
  (row) => row.platform?.id === platformId,
);
check(
  'Resurs havolasi line item`larni qaytaradi (saqlangan, qayta yaratilmaydi)',
  (linkWithItems?.lineItems ?? []).some(
    (li) => li.assignmentId === agsAssignmentId && li.label === `AGS topshirig'i ${suffix}`,
  ),
  JSON.stringify(linkWithItems?.lineItems ?? linksWithItems.status),
);
const lineitemsBeforeRepush = mockLog.lineitems.length;
const repush = await teacher(`/lti/courses/${courseId}/grades/push`, {
  method: 'POST',
  body: '{}',
});
check(
  'Qo`lda push: jamlanma + faoliyat baholari, mavjud line item qayta yaratilmaydi',
  repush.ok && repush.body?.data?.pushed >= 2 && mockLog.lineitems.length === lineitemsBeforeRepush,
  `push ${JSON.stringify(repush.body?.data ?? repush.body?.error)}; lineitems ${lineitemsBeforeRepush}→${mockLog.lineitems.length}`,
);

const nrps = await teacher(`/lti/courses/${courseId}/members`);
const nrpsMembers = nrps.body?.data?.members ?? [];
check(
  'NRPS: platformadan 3 a`zo olindi, mavjud talaba bog`langan deb belgilandi',
  nrps.ok &&
    nrpsMembers.length === 3 &&
    nrpsMembers.find((m) => m.subject === learnerSub)?.userId === ltiUserId &&
    nrpsMembers.find((m) => m.subject === `learner2-${suffix}`)?.userId === null,
  nrps.ok
    ? nrpsMembers.map((m) => `${m.subject}:${m.userId ? 'bog`langan' : 'yo`q'}`).join(', ')
    : `${nrps.status} ${nrps.body?.error?.messageKey ?? ''}`,
);
const nrpsSync = await teacher(`/lti/courses/${courseId}/members/sync`, {
  method: 'POST',
  body: '{}',
});
const nrpsAfter = await teacher(`/lti/courses/${courseId}/members`);
const learner2After = (nrpsAfter.body?.data?.members ?? []).find(
  (m) => m.subject === `learner2-${suffix}`,
);
const instructorAfter = (nrpsAfter.body?.data?.members ?? []).find(
  (m) => m.subject === `instructor-${suffix}`,
);
check(
  'NRPS sync: yangi talaba yaratildi va kursga yozildi, o`qituvchi yozilmadi',
  nrpsSync.ok &&
    nrpsSync.body?.data?.created === 1 &&
    nrpsSync.body?.data?.enrolled >= 1 &&
    Boolean(learner2After?.userId) &&
    learner2After?.enrolled === true &&
    instructorAfter?.userId === null,
  nrpsSync.ok
    ? JSON.stringify(nrpsSync.body?.data)
    : `${nrpsSync.status} ${nrpsSync.body?.error?.messageKey ?? ''}`,
);

// Deep Linking: o'qituvchi (mavjud email bilan bog'lanadi) → kurs tanlaydi → imzolangan javob
const dl = await ltiLaunch({
  sub: `instructor-${suffix}`,
  email: 'oqituvchi@qdu.uz',
  roles: ['http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor'],
  messageType: 'LtiDeepLinkingRequest',
  deepLinking: true,
});
const dlLocation = dl.launch.headers.get('location') ?? '';
const dlToken = new URL(dlLocation || 'http://x').searchParams.get('token');
check(
  'Deep Linking launch: o`qituvchi kurs tanlash sahifasiga yo`naltirildi',
  dl.launch.status === 302 && dlLocation.includes('/lti/deep-link?token=') && Boolean(dlToken),
  `${dl.launch.status} → ${dlLocation || dl.body?.error?.messageKey || ''}`,
);
const dlCookie = dl.cookies.find((c) => c.startsWith('lms_refresh='))?.split(';')[0] ?? '';
const dlRefreshed = await fetch(`${API}/auth/refresh`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: dlCookie },
  body: '{}',
})
  .then((r) => r.json())
  .catch(() => null);
const dlUser = client(dlRefreshed?.data?.tokens?.accessToken ?? '');
const dlContext = dlToken
  ? await dlUser(`/lti/deep-link?token=${encodeURIComponent(dlToken)}`)
  : { ok: false };
const dlRespond = dlToken
  ? await dlUser('/lti/deep-link/respond', {
      method: 'POST',
      body: JSON.stringify({ token: dlToken, courseId }),
    })
  : { ok: false };
const dlJwt = dlRespond.body?.data?.jwt ?? '';
const dlPayload =
  dlJwt.split('.').length === 3
    ? JSON.parse(Buffer.from(dlJwt.split('.')[1], 'base64url').toString('utf8'))
    : null;
const toolKeys = (await fetch(`${API}/lti/jwks`).then((r) => r.json()))?.data?.keys ?? [];
const dlHeader = dlJwt
  ? JSON.parse(Buffer.from(dlJwt.split('.')[0], 'base64url').toString('utf8'))
  : null;
check(
  'Deep Linking javobi: tool kaliti bilan imzolangan JWT, content item kursga ishora qiladi',
  dlContext.ok &&
    dlRespond.ok &&
    dlRespond.body?.data?.returnUrl === `${MOCK_BASE}/dl-return` &&
    dlPayload?.iss === clientId &&
    dlPayload?.aud === issuer &&
    dlPayload?.['https://purl.imsglobal.org/spec/lti/claim/message_type'] ===
      'LtiDeepLinkingResponse' &&
    dlPayload?.['https://purl.imsglobal.org/spec/lti-dl/claim/content_items']?.[0]?.custom
      ?.course_id === courseId &&
    dlPayload?.['https://purl.imsglobal.org/spec/lti-dl/claim/data'] === `dl-data-${suffix}` &&
    toolKeys.some((key) => key.kid === dlHeader?.kid),
  dlRespond.ok
    ? `iss=${dlPayload?.iss}, kid=${dlHeader?.kid?.slice(0, 8)}`
    : `${dlRespond.status} ${dlRespond.body?.error?.messageKey ?? ''} (context ${dlContext.status})`,
);
const dlReplay = dlToken
  ? await dlUser('/lti/deep-link/respond', {
      method: 'POST',
      body: JSON.stringify({ token: dlToken, courseId }),
    })
  : { status: 0 };
check('Deep Linking tokeni bir martalik', dlReplay.status === 422, `status ${dlReplay.status}`);

const deletedPlatform = await admin(`/lti/platforms/${platformId}`, { method: 'DELETE' });
check('Platforma o`chirildi', deletedPlatform.status === 204, `status ${deletedPlatform.status}`);
const afterDelete = await ltiLaunch({ sub: learnerSub, roles: [] });
check(
  'O`chirilgan platformadan login rad etiladi',
  afterDelete.login.status === 422,
  `status ${afterDelete.login.status}`,
);

// =============================================================================
// I. IMS COMMON CARTRIDGE IMPORT (F-05, §10)
// =============================================================================
console.log('\n10. IMS Common Cartridge import');

/** Kichik, ammo to'liq CC 1.1 paketi: HTML, fayl, havola, muhokama, QTI 1.2 test, noma'lum tur. */
function buildCartridge(stamp) {
  const zip = new AdmZip();
  const add = (path, text) => zip.addFile(path, Buffer.from(text, 'utf8'));
  add(
    'imsmanifest.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="cc-${stamp}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata><schema>IMS Common Cartridge</schema><schemaversion>1.1.0</schemaversion>
    <lomimscc:lom><lomimscc:general><lomimscc:title><lomimscc:string>CC kurs ${stamp}</lomimscc:string></lomimscc:title></lomimscc:general></lomimscc:lom>
  </metadata>
  <organizations><organization identifier="org" structure="rooted-hierarchy"><item identifier="root">
    <item identifier="m1"><title>CC modul ${stamp}</title>
      <item identifier="t1"><title>Kirish</title>
        <item identifier="l1" identifierref="r_html"><title>O'qish materiali</title></item>
        <item identifier="l2" identifierref="r_link"><title>Tashqi havola</title></item>
        <item identifier="l3" identifierref="r_bad"><title>Noma'lum</title></item>
      </item>
      <item identifier="t2" identifierref="r_quiz"><title>Haftalik test</title></item>
      <item identifier="t3" identifierref="r_dt"><title>Muhokama</title></item>
    </item>
  </item></organization></organizations>
  <resources>
    <resource identifier="r_html" type="webcontent" href="m1/reading.html"><file href="m1/reading.html"/><file href="m1/notes.pdf"/></resource>
    <resource identifier="r_link" type="imswl_xmlv1p1"><file href="m1/link.xml"/></resource>
    <resource identifier="r_dt" type="imsdt_xmlv1p1"><file href="m1/dt.xml"/></resource>
    <resource identifier="r_quiz" type="imsqti_xmlv1p2/imscc_xmlv1p1/assessment"><file href="m1/quiz.xml"/></resource>
    <resource identifier="r_bad" type="imsvideo_xmlv1p0"><file href="m1/x.xml"/></resource>
  </resources>
</manifest>`,
  );
  add(
    'm1/reading.html',
    `<html><body><h2>Kirish ${stamp}</h2><p>Matn <script>alert(1)</script>bo'limi.</p><p><img src="img/pic.png" alt="Rasm"></p></body></html>`,
  );
  zip.addFile(
    'm1/img/pic.png',
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    ),
  );
  add('m1/notes.pdf', '%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
  add(
    'm1/link.xml',
    `<webLink xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imswl_v1p1"><title>Manba sayti</title><url href="https://example.uz/${stamp}"/></webLink>`,
  );
  add(
    'm1/dt.xml',
    `<topic xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imsdt_v1p1"><title>Muhokama ${stamp}</title><text texttype="text/html">&lt;p&gt;Fikringiz?&lt;/p&gt;</text></topic>`,
  );
  add('m1/x.xml', '<video/>');
  add(
    'm1/quiz.xml',
    `<questestinterop xmlns="http://www.imsglobal.org/xsd/ims_qtiasiv1p2"><assessment ident="a" title="Haftalik test ${stamp}">
  <qtimetadata><qtimetadatafield><fieldlabel>qmd_timelimit</fieldlabel><fieldentry>15</fieldentry></qtimetadatafield></qtimetadata>
  <section ident="s">
    <item ident="i1" title="Poytaxt"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.multiple_choice.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation><material><mattext>Poytaxt?</mattext></material><response_lid ident="r" rcardinality="Single"><render_choice>
        <response_label ident="A"><material><mattext>Samarqand</mattext></material></response_label>
        <response_label ident="B"><material><mattext>Toshkent</mattext></material></response_label></render_choice></response_lid></presentation>
      <resprocessing><respcondition><conditionvar><varequal respident="r">B</varequal></conditionvar><setvar varname="SCORE" action="Set">100</setvar></respcondition></resprocessing></item>
    <item ident="i2" title="Insho"><itemmetadata><qtimetadata><qtimetadatafield><fieldlabel>cc_profile</fieldlabel><fieldentry>cc.essay.v0p1</fieldentry></qtimetadatafield></qtimetadata></itemmetadata>
      <presentation><material><mattext>Fikringiz?</mattext></material><response_str ident="r"><render_fib/></response_str></presentation></item>
  </section></assessment></questestinterop>`,
  );
  return zip.toBuffer();
}

const cartridge = buildCartridge(suffix);
const ccPresign = await teacher('/content/files/presign', {
  method: 'POST',
  body: JSON.stringify({
    fileName: `kurs-${suffix}.imscc`,
    mimeType: 'application/zip',
    sizeBytes: cartridge.byteLength,
    purpose: 'COURSE_CONTENT',
    courseId,
  }),
});
const ccPut = ccPresign.ok
  ? await fetch(ccPresign.body.data.uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/zip' },
      body: cartridge,
    })
  : null;
const ccComplete = ccPut?.ok
  ? await teacher('/content/files/complete', {
      method: 'POST',
      body: JSON.stringify({
        fileObjectId: ccPresign.body.data.fileObjectId,
        checksumSha256: createHash('sha256').update(cartridge).digest('hex'),
      }),
    })
  : null;
check(
  'CC paketi yuklandi (ZIP magic bytes tekshiruvidan o`tdi)',
  Boolean(ccComplete?.ok),
  ccComplete?.body?.error?.messageKey ?? `presign ${ccPresign.status}`,
);
const ccFileId = ccPresign.body?.data?.fileObjectId;

const ccPlan = await teacher('/content/cc/import', {
  method: 'POST',
  body: JSON.stringify({ courseId, fileObjectId: ccFileId, locale: 'uz-Latn', dryRun: true }),
});
const planCounts = ccPlan.body?.data?.counts ?? {};
check(
  'Reja: 1 modul, 3 mavzu, 5 dars; fayl, havola, muhokama, test (2 savol); 1 ta o`tkazib yuboriladi',
  ccPlan.ok &&
    planCounts.modules === 1 &&
    planCounts.topics === 3 &&
    planCounts.lessons === 5 &&
    planCounts.files === 1 &&
    planCounts.links === 1 &&
    planCounts.discussions === 1 &&
    planCounts.quizzes === 1 &&
    planCounts.questions === 2 &&
    ccPlan.body?.data?.skipped?.length === 1 &&
    ccPlan.body?.data?.imported === false,
  ccPlan.ok
    ? JSON.stringify(planCounts)
    : `${ccPlan.status} ${ccPlan.body?.error?.messageKey ?? ''}`,
);
check(
  'O`tkazib yuborilgan element sababi bilan qaytadi',
  ccPlan.body?.data?.skipped?.[0]?.reason === 'cc.unsupported_type' &&
    ccPlan.body?.data?.skipped?.[0]?.title === "Noma'lum",
  JSON.stringify(ccPlan.body?.data?.skipped?.[0] ?? null),
);

const structureBefore = await teacher(`/courses/${courseId}`);
const modulesBefore = (structureBefore.body?.data?.modules ?? []).length;

const ccImport = await teacher('/content/cc/import', {
  method: 'POST',
  body: JSON.stringify({ courseId, fileObjectId: ccFileId, locale: 'uz-Latn' }),
});
check(
  'Import: modul, test va muhokama yaratildi',
  ccImport.ok &&
    ccImport.body?.data?.imported === true &&
    ccImport.body?.data?.modules?.length === 1 &&
    ccImport.body?.data?.quizzes?.length === 1 &&
    ccImport.body?.data?.threads?.length === 1,
  ccImport.ok ? '' : `${ccImport.status} ${ccImport.body?.error?.messageKey ?? ''}`,
);

const structureAfter = await teacher(`/courses/${courseId}`);
const importedModule = (structureAfter.body?.data?.modules ?? []).find((m) =>
  JSON.stringify(m.title).includes(`CC modul ${suffix}`),
);
const importedLessons = (importedModule?.topics ?? []).flatMap((topic) => topic.lessons ?? []);
check(
  'Kurs tuzilmasida yangi modul oxirida, 3 mavzu va 5 dars bilan',
  Boolean(importedModule) &&
    (structureAfter.body?.data?.modules ?? []).length === modulesBefore + 1 &&
    importedModule.topics.length === 3 &&
    importedLessons.length === 5,
  `${importedModule?.topics?.length ?? 0} mavzu, ${importedLessons.length} dars`,
);

const readingLesson = importedLessons.find((lesson) =>
  JSON.stringify(lesson.title).includes("O'qish materiali"),
);
const lessonDetail = readingLesson ? await teacher(`/courses/lessons/${readingLesson.id}`) : null;
const lessonHtml = JSON.stringify(lessonDetail?.body?.data?.contentHtml ?? '');
const inlineImageId = /\/lms-file\/([0-9a-f-]{36})/.exec(lessonHtml)?.[1] ?? null;
check(
  'HTML ichidagi rasm /lms-file/<id> ga bog`landi va resurslar ro`yxatiga KIRMADI',
  Boolean(inlineImageId) &&
    !(lessonDetail?.body?.data?.resources ?? []).some((r) => r.file?.id === inlineImageId),
  inlineImageId ?? 'lms-file havolasi yo`q',
);
const inlineImage = inlineImageId
  ? await teacher(`/content/files/${inlineImageId}/download`)
  : null;
check(
  'Rasm fayli yuklab olinadi (mijoz src ni shu havolaga almashtiradi)',
  Boolean(inlineImage?.ok && inlineImage.body?.data?.url),
  inlineImage ? `${inlineImage.status}` : '',
);
check(
  'HTML dars matni sanitizatsiya bilan saqlandi (script yo`q), PDF resurs biriktirildi',
  Boolean(lessonDetail?.ok) &&
    lessonHtml.includes(`Kirish ${suffix}`) &&
    !lessonHtml.includes('<script') &&
    (lessonDetail?.body?.data?.resources ?? []).some((r) => r.kind === 'PDF'),
  lessonDetail
    ? `${(lessonDetail.body?.data?.resources ?? []).map((r) => r.kind).join(',')}`
    : 'dars topilmadi',
);

const linkLesson = importedLessons.find((lesson) =>
  JSON.stringify(lesson.title).includes('Tashqi havola'),
);
const linkDetail = linkLesson ? await teacher(`/courses/lessons/${linkLesson.id}`) : null;
check(
  'Web link LINK resursiga aylandi',
  (linkDetail?.body?.data?.resources ?? []).some(
    (r) => r.kind === 'LINK' && r.externalUrl === `https://example.uz/${suffix}`,
  ),
);

const ccQuizId = ccImport.body?.data?.quizzes?.[0];
const ccQuiz = ccQuizId ? await teacher(`/quizzes/${ccQuizId}/questions`) : null;
check(
  'QTI 1.2 test: 2 ta savol (SINGLE + ESSAY), vaqt chegarasi 15 daqiqa, nashr etilmagan',
  Boolean(ccQuiz?.ok) &&
    (ccQuiz.body?.data?.questions ?? []).length === 2 &&
    ccQuiz.body?.data?.quiz?.durationMinutes === 15 &&
    ccQuiz.body?.data?.quiz?.isPublished === false,
  ccQuiz ? `${ccQuiz.status}` : 'test yo`q',
);

const ccThreads = await teacher(`/courses/${courseId}/forum`);
const threadRows = ccThreads.body?.data ?? [];
check(
  'Muhokama kurs forumida mavzu bo`ldi',
  ccThreads.ok && threadRows.some((row) => row.title === `Muhokama ${suffix}`),
  `${ccThreads.status}, ${threadRows.length} ta mavzu`,
);

const studentCc = await student('/content/cc/import', {
  method: 'POST',
  body: JSON.stringify({ courseId, fileObjectId: ccFileId, dryRun: true }),
});
check('Talaba CC import qila olmaydi', studentCc.status === 403, `status ${studentCc.status}`);

// --- IMS CC eksport → yuklab olish → qayta import rejasi (round-trip) ---
const ccExport = await teacher('/content/cc/export', {
  method: 'POST',
  body: JSON.stringify({ courseId, locale: 'uz-Latn' }),
});
check(
  'Kurs IMS CC paketiga eksport qilindi (modullar, darslar, testlar)',
  ccExport.ok && ccExport.body?.data?.counts?.modules >= 1 && Boolean(ccExport.body?.data?.url),
  ccExport.ok
    ? JSON.stringify(ccExport.body?.data?.counts)
    : `${ccExport.status} ${ccExport.body?.error?.messageKey ?? ''}`,
);
const ccExportZip = ccExport.ok
  ? Buffer.from(await (await fetch(ccExport.body.data.url)).arrayBuffer())
  : null;
const ccExportEntries = ccExportZip
  ? new AdmZip(ccExportZip).getEntries().map((e) => e.entryName)
  : [];
check(
  'Eksport paketida manifest, darslar HTML, import qilingan rasm va QTI 1.2 test bor',
  ccExportEntries.includes('imsmanifest.xml') &&
    ccExportEntries.some((n) => n.startsWith('lessons/')) &&
    ccExportEntries.some((n) => n.startsWith('files/inline/')) &&
    ccExportEntries.some((n) => n.startsWith('quizzes/')),
  `${ccExportEntries.length} ta fayl`,
);
const exportedDiscussion = ccExportZip
  ? new AdmZip(ccExportZip)
      .getEntries()
      .filter((e) => e.entryName === `discussions/${threadId}.xml`)
      .map((e) => e.getData().toString('utf8'))[0]
  : undefined;
check(
  'Forum mavzulari paketda discussion topic (imsdt) sifatida — "Forum" moduli ostida',
  ccExport.body?.data?.counts?.discussions >= 1 &&
    Boolean(exportedDiscussion) &&
    exportedDiscussion.includes('imsdt_v1p1') &&
    exportedDiscussion.includes(`Sinov mavzusi ${suffix}`) &&
    new AdmZip(ccExportZip).readAsText('imsmanifest.xml').includes('type="imsdt_xmlv1p1"'),
  `discussions ${ccExport.body?.data?.counts?.discussions}; ${exportedDiscussion ? exportedDiscussion.slice(0, 120) : 'fayl yo`q'}`,
);
const ccExportFile = ccExportZip
  ? await uploadAs(teacher, `kurs-export-${suffix}.imscc`, 'application/zip', ccExportZip)
  : { ok: false, detail: 'eksport yo`q' };
const ccRoundTrip = ccExportFile.ok
  ? await teacher('/content/cc/import', {
      method: 'POST',
      body: JSON.stringify({
        courseId,
        fileObjectId: ccExportFile.fileObjectId,
        locale: 'uz-Latn',
        dryRun: true,
      }),
    })
  : null;
check(
  'Eksport qilingan CC paketi qayta o`qiladi: modullar soni mos (+Forum), testdagi savollar, muhokamalar bor',
  Boolean(ccRoundTrip?.ok) &&
    ccRoundTrip.body?.data?.counts?.modules === ccExport.body?.data?.counts?.modules + 1 &&
    ccRoundTrip.body?.data?.counts?.questions >= 2 &&
    ccRoundTrip.body?.data?.counts?.discussions >= 1,
  ccRoundTrip
    ? JSON.stringify(ccRoundTrip.body?.data?.counts ?? ccRoundTrip.body?.error)
    : (ccExportFile.detail ?? ''),
);

// Tozalash: import qilingan modul (mavzu va darslar bilan) o'chiriladi
if (importedModule) {
  const removed = await teacher(`/courses/modules/${importedModule.id}`, { method: 'DELETE' });
  check(
    'Import qilingan modul o`chirildi (tozalash)',
    removed.ok || removed.status === 204,
    `status ${removed.status}`,
  );
}

// =============================================================================
// J. MOODLE USLUBIDAGI SOZLAMALAR: test va topshiriq (F-06, F-07)
// =============================================================================
console.log('\n11. Test va topshiriq sozlamalari');

const settingsQuiz = await teacher('/quizzes', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sozlamalar testi ${suffix}` },
    description: { 'uz-Latn': '<p>Tavsif <strong>qalin</strong> <script>alert(1)</script></p>' },
    controlType: 'JN',
    durationMinutes: 45,
    maxAttempts: 2,
    gradingMethod: 'AVERAGE',
    questionsPerPage: 3,
    allowBacktrack: false,
    showAnswers: 'AFTER_ATTEMPT',
    passScore: 55,
  }),
});
const settingsQuizId = settingsQuiz.body?.data?.id;
check(
  'Test to`liq sozlamalar bilan yaratildi',
  settingsQuiz.ok && Boolean(settingsQuizId),
  settingsQuiz.body?.error?.messageKey ?? '',
);

const quizSettings = await teacher(`/quizzes/${settingsQuizId}`);
check(
  'GET /quizzes/:id sozlamalarni qaytaradi (tavsif sanitizatsiya qilingan, urinishlar 0)',
  quizSettings.ok &&
    quizSettings.body?.data?.gradingMethod === 'AVERAGE' &&
    quizSettings.body?.data?.questionsPerPage === 3 &&
    quizSettings.body?.data?.allowBacktrack === false &&
    quizSettings.body?.data?.attempts === 0 &&
    String(quizSettings.body?.data?.description?.['uz-Latn'] ?? '').includes(
      '<strong>qalin</strong>',
    ) &&
    !String(quizSettings.body?.data?.description?.['uz-Latn'] ?? '').includes('<script'),
  quizSettings.ok
    ? JSON.stringify({
        g: quizSettings.body.data.gradingMethod,
        p: quizSettings.body.data.questionsPerPage,
      })
    : `${quizSettings.status}`,
);

const quizPatched = await teacher(`/quizzes/${settingsQuizId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    durationMinutes: 60,
    proctoringEnabled: true,
    opensAt: '2031-09-01T08:00:00.000Z',
    closesAt: '2031-09-01T10:00:00.000Z',
    isPublished: true,
  }),
});
const quizAfter = await teacher(`/quizzes/${settingsQuizId}`);
check(
  'PATCH /quizzes/:id: vaqt, proktoring, nashr yangilandi',
  quizPatched.ok &&
    quizAfter.body?.data?.durationMinutes === 60 &&
    quizAfter.body?.data?.proctoringEnabled === true &&
    quizAfter.body?.data?.isPublished === true &&
    String(quizAfter.body?.data?.closesAt ?? '').startsWith('2031-09-01T10'),
  quizPatched.ok ? '' : `${quizPatched.status} ${quizPatched.body?.error?.messageKey ?? ''}`,
);
const quizBadDates = await teacher(`/quizzes/${settingsQuizId}`, {
  method: 'PATCH',
  body: JSON.stringify({ closesAt: '2031-09-01T07:00:00.000Z' }),
});
check(
  'Yopilish ochilishdan oldin bo`lsa rad etiladi (400)',
  quizBadDates.status === 400,
  `status ${quizBadDates.status}`,
);
const quizStudentPatch = await student(`/quizzes/${settingsQuizId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isPublished: false }),
});
check(
  'Talaba test sozlamalarini o`zgartira olmaydi',
  quizStudentPatch.status === 403,
  `status ${quizStudentPatch.status}`,
);

const settingsAssignment = await teacher('/assignments', {
  method: 'POST',
  body: JSON.stringify({
    courseId,
    title: { 'uz-Latn': `Sozlamalar topshirig'i ${suffix}` },
    description: { 'uz-Latn': '<p>Shart</p>' },
    controlType: 'JN',
    maxScore: 50,
    dueAt: '2031-10-01T12:00:00.000Z',
    allowedMimeTypes: ['application/pdf'],
    maxFiles: 2,
  }),
});
const settingsAssignmentId = settingsAssignment.body?.data?.id;
check(
  'Topshiriq sozlamalar bilan yaratildi',
  settingsAssignment.ok && Boolean(settingsAssignmentId),
  settingsAssignment.body?.error?.messageKey ?? '',
);

const assignmentPatched = await teacher(`/assignments/${settingsAssignmentId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    description: { 'uz-Latn': '<p>Yangi shart <em>kursiv</em></p>' },
    lateUntil: '2031-10-03T12:00:00.000Z',
    latePenaltyPercent: 25,
    maxAttempts: 3,
    allowedMimeTypes: ['application/pdf', 'application/zip'],
    maxFileSizeMb: 20,
    plagiarismCheck: true,
    peerReviewEnabled: true,
    peerReviewCount: 2,
  }),
});
const assignmentAfter = await teacher(`/assignments/${settingsAssignmentId}`);
check(
  'PATCH /assignments/:id: shart, kechikish, fayl turlari, plagiat, o`zaro baholash yangilandi',
  assignmentPatched.ok &&
    String(assignmentAfter.body?.data?.description?.['uz-Latn'] ?? '').includes(
      '<em>kursiv</em>',
    ) &&
    Number(assignmentAfter.body?.data?.latePenaltyPercent) === 25 &&
    assignmentAfter.body?.data?.maxAttempts === 3 &&
    (assignmentAfter.body?.data?.allowedMimeTypes ?? []).includes('application/zip') &&
    assignmentAfter.body?.data?.maxFileSizeMb === 20 &&
    assignmentAfter.body?.data?.plagiarismCheck === true &&
    assignmentAfter.body?.data?.peerReviewCount === 2,
  assignmentPatched.ok
    ? ''
    : `${assignmentPatched.status} ${assignmentPatched.body?.error?.messageKey ?? ''}`,
);
const assignmentBadLate = await teacher(`/assignments/${settingsAssignmentId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    dueAt: '2031-10-05T12:00:00.000Z',
    lateUntil: '2031-10-04T12:00:00.000Z',
  }),
});
check(
  'Kechikish muddati muddatdan oldin bo`lsa rad etiladi (400)',
  assignmentBadLate.status === 400,
  `status ${assignmentBadLate.status}`,
);
const assignmentStudentPatch = await student(`/assignments/${settingsAssignmentId}`, {
  method: 'PATCH',
  body: JSON.stringify({ maxScore: 100 }),
});
check(
  'Talaba topshiriq sozlamalarini o`zgartira olmaydi',
  assignmentStudentPatch.status === 403,
  `status ${assignmentStudentPatch.status}`,
);

console.log('\n12. Resurs tahrirlash (Moodle uslubidagi oyna)');

const editLesson = await teacher('/courses/lessons', {
  method: 'POST',
  body: JSON.stringify({
    topicId: (await teacher(`/courses/${courseId}`)).body?.data?.modules?.[0]?.topics?.[0]?.id,
    title: { 'uz-Latn': `Tahrir darsi ${suffix}` },
    contentHtml: { 'uz-Latn': '' },
    durationMinutes: 5,
  }),
});
const editLessonId = editLesson.body?.data?.id;
check(
  'Tahrir uchun dars yaratildi',
  editLesson.ok && Boolean(editLessonId),
  editLesson.body?.error?.messageKey ?? '',
);

const textResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId: editLessonId,
    kind: 'TEXT',
    title: { 'uz-Latn': 'Matn bloki' },
    meta: { text: { 'uz-Latn': '<p>Eski</p>' } },
  }),
});
const textResourceId = textResource.body?.data?.id;
const textPatch = await teacher(`/courses/resources/${textResourceId}`, {
  method: 'PATCH',
  body: JSON.stringify({
    title: { 'uz-Latn': 'Matn bloki (yangi)', ru: 'Текстовый блок' },
    meta: {
      text: {
        'uz-Latn': '<p>Yangi <strong>qalin</strong><script>alert(1)</script></p>',
        ru: '<p>Новый</p>',
      },
    },
    isRequired: false,
  }),
});
const textPatched = textPatch.body?.data;
check(
  'TEXT resurs: nom, 2 tilda matn va majburiylik yangilandi (script tozalangan)',
  textPatch.ok &&
    textPatched?.title?.ru === 'Текстовый блок' &&
    String(textPatched?.meta?.text?.['uz-Latn'] ?? '').includes('<strong>qalin</strong>') &&
    !String(textPatched?.meta?.text?.['uz-Latn'] ?? '').includes('<script') &&
    textPatched?.meta?.text?.ru === '<p>Новый</p>' &&
    textPatched?.isRequired === false,
  JSON.stringify(textPatch.body?.error ?? textPatched?.meta ?? ''),
);

const linkResource = await teacher('/courses/resources', {
  method: 'POST',
  body: JSON.stringify({
    lessonId: editLessonId,
    kind: 'LINK',
    title: { 'uz-Latn': 'Havola' },
    externalUrl: 'https://example.org/old',
  }),
});
const linkResourceId = linkResource.body?.data?.id;
const linkPatch = await teacher(`/courses/resources/${linkResourceId}`, {
  method: 'PATCH',
  body: JSON.stringify({ externalUrl: 'https://example.org/new' }),
});
check(
  'LINK resurs: manzil PATCH bilan yangilandi',
  linkPatch.ok && linkPatch.body?.data?.externalUrl === 'https://example.org/new',
  JSON.stringify(linkPatch.body?.error ?? ''),
);
const badLinkPatch = await teacher(`/courses/resources/${linkResourceId}`, {
  method: 'PATCH',
  body: JSON.stringify({ externalUrl: 'javascript:alert(1)' }),
});
check(
  'Yaroqsiz manzil 400 bilan rad etiladi',
  badLinkPatch.status === 400,
  `status ${badLinkPatch.status}`,
);
const lessonAfterEdit = await teacher(`/courses/lessons/${editLessonId}`);
const editedInLesson = (lessonAfterEdit.body?.data?.resources ?? []).find(
  (r) => r.id === linkResourceId,
);
check(
  'Dars sahifasi yangilangan manzilni qaytaradi',
  editedInLesson?.externalUrl === 'https://example.org/new',
  editedInLesson?.externalUrl ?? 'topilmadi',
);
const studentResourcePatch = await student(`/courses/resources/${textResourceId}`, {
  method: 'PATCH',
  body: JSON.stringify({ isRequired: true }),
});
check(
  'Talaba resursni tahrirlay olmaydi',
  studentResourcePatch.status === 403,
  `status ${studentResourcePatch.status}`,
);

console.log('\n13. Sayt boshqaruvi (Moodle uslubidagi sozlamalar daraxti)');

const siteTree = await admin('/admin/site');
const siteCategories = siteTree.body?.data?.tree ?? [];
const siteSectionIds = siteCategories.flatMap((c) => c.sections.map((sec) => sec.id));
check(
  'Daraxt: 15 toifa, Moodle bandlari (IP bloklovchi, til, xabarlar, mobil, ...) va standart qiymatlar',
  siteTree.ok &&
    siteCategories.length === 15 &&
    [
      'ip-blocker',
      'language-customisation',
      'notification-settings',
      'mobile-appearance',
      'manage-badges',
      'registration',
    ].every((id) => siteSectionIds.includes(id)) &&
    siteTree.body.data.values['ui.defaultLocale'] === 'uz-Latn' &&
    siteTree.body.data.values['security.ipDenyList'].length === 0,
  `status ${siteTree.status}, toifalar ${siteCategories.length}, bo'limlar ${siteSectionIds.length}`,
);
const rectorSite = await rector('/admin/site');
check(
  'INSTITUTION_ADMIN daraxtni o`qiy oladi (system:read)',
  rectorSite.ok,
  `status ${rectorSite.status}`,
);
const teacherSite = await teacher('/admin/site');
check(
  'O`qituvchi sayt boshqaruvini ko`ra olmaydi',
  teacherSite.status === 403,
  `status ${teacherSite.status}`,
);

// --- Sayt ma'lumotlari: ochiq sozlamalarga tushadi ---
const siteInfoBefore = (await admin('/admin/site/site-info')).body?.data?.values ?? {};
const siteInfo = await admin('/admin/site/site-info', {
  method: 'PUT',
  body: JSON.stringify({
    'site.description': `Sinov tavsifi ${suffix}`,
    'site.supportEmail': 'help@qdu.uz',
  }),
});
const publicAfter = await fetch(`${API}/admin/settings/public`)
  .then((r) => r.json())
  .catch(() => null);
check(
  'Bo`limni yangilash: qiymat saqlandi va ochiq sozlamalarda (autentifikatsiyasiz) ko`rinadi',
  siteInfo.ok &&
    siteInfo.body?.data?.values?.['site.description'] === `Sinov tavsifi ${suffix}` &&
    publicAfter?.data?.['site.description'] === `Sinov tavsifi ${suffix}`,
  `status ${siteInfo.status} ${siteInfo.body?.error?.messageKey ?? ''}; public ${JSON.stringify(publicAfter?.data?.['site.description'])}`,
);
const badSite = await admin('/admin/site/site-policies', {
  method: 'PUT',
  body: JSON.stringify({ 'security.passwordMinLength': 4, 'security.unknownKey': true }),
});
check(
  'Reestr sxemasi: chegaradan tashqari va noma`lum kalit 400',
  badSite.status === 400,
  `status ${badSite.status}`,
);
const badSection = await admin('/admin/site/no-such-section', { method: 'PUT', body: '{}' });
check('Noma`lum bo`lim 404', badSection.status === 404, `status ${badSection.status}`);
const rectorPut = await rector('/admin/site/site-info', {
  method: 'PUT',
  body: JSON.stringify({ 'site.supportEmail': 'x@qdu.uz' }),
});
check(
  'INSTITUTION_ADMIN yozolmaydi (system:manage kerak)',
  rectorPut.status === 403,
  `status ${rectorPut.status}`,
);

// --- IP bloklovchi: taqiq ro'yxati ustun, /health istisno ---
const ipDeny = await admin('/admin/site/ip-blocker', {
  method: 'PUT',
  body: JSON.stringify({ 'security.ipDenyList': ['203.0.113.0/24', '198.51.100.7'] }),
});
const blocked = await fetch(`${API}/courses`, {
  headers: {
    Authorization: `Bearer ${teacherLogin.token}`,
    'x-forwarded-for': '203.0.113.42, 10.0.0.1',
  },
});
const blockedBody = await blocked.json().catch(() => null);
const notBlocked = await fetch(`${API}/courses`, {
  headers: { Authorization: `Bearer ${teacherLogin.token}`, 'x-forwarded-for': '203.0.114.1' },
});
const healthBlocked = await fetch(`${API}/health`, {
  headers: { 'x-forwarded-for': '198.51.100.7' },
});
check(
  'IP bloklovchi: taqiqlangan CIDR dan so`rov 403 (errors.ip_blocked), boshqa IP o`tadi, /health istisno',
  ipDeny.ok &&
    blocked.status === 403 &&
    blockedBody?.error?.messageKey === 'errors.ip_blocked' &&
    notBlocked.status === 200 &&
    healthBlocked.status === 200,
  `deny ${ipDeny.status}; blocked ${blocked.status} ${blockedBody?.error?.messageKey ?? ''}; other ${notBlocked.status}; health ${healthBlocked.status}`,
);
await admin('/admin/site/ip-blocker', {
  method: 'PUT',
  body: JSON.stringify({ 'security.ipDenyList': [], 'security.ipAllowList': [] }),
});
const afterClear = await fetch(`${API}/courses`, {
  headers: { Authorization: `Bearer ${teacherLogin.token}`, 'x-forwarded-for': '203.0.113.42' },
});
check(
  'IP ro`yxati tozalangach kirish tiklanadi (kesh ham yangilanadi)',
  afterClear.status === 200,
  `status ${afterClear.status}`,
);

// --- Ro'yxatdan o'tish siyosati ---
await admin('/admin/site/registration', {
  method: 'PUT',
  body: JSON.stringify({
    'registration.enabled': true,
    'registration.allowedEmailDomains': ['qdu.uz'],
  }),
});
const regBody = (email) => ({
  email,
  password: 'SinovParol!2026',
  passwordConfirm: 'SinovParol!2026',
  firstName: 'Sinov',
  lastName: 'Foydalanuvchi',
});
const regWrongDomain = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(regBody(`reg-${suffix}@example.org`)),
});
const regWrongBody = await regWrongDomain.json().catch(() => null);
check(
  'Ruxsat etilmagan e-mail domeni bilan ro`yxatdan o`tib bo`lmaydi (422)',
  regWrongDomain.status === 422 &&
    regWrongBody?.error?.messageKey === 'errors.email_domain_not_allowed',
  `status ${regWrongDomain.status} ${regWrongBody?.error?.messageKey ?? ''}`,
);
await admin('/admin/site/registration', {
  method: 'PUT',
  body: JSON.stringify({ 'registration.enabled': false }),
});
const regDisabled = await fetch(`${API}/auth/register`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(regBody(`reg-${suffix}@qdu.uz`)),
});
const regDisabledBody = await regDisabled.json().catch(() => null);
check(
  'Ro`yxatdan o`tish o`chirilganda 422 (errors.registration_disabled)',
  regDisabled.status === 422 &&
    regDisabledBody?.error?.messageKey === 'errors.registration_disabled',
  `status ${regDisabled.status} ${regDisabledBody?.error?.messageKey ?? ''}`,
);
await admin('/admin/site/registration', {
  method: 'PUT',
  body: JSON.stringify({ 'registration.enabled': true, 'registration.allowedEmailDomains': [] }),
});

// --- Xabarlar: talaba → talaba cheklovi ---
await admin('/admin/site/messaging-settings', {
  method: 'PUT',
  body: JSON.stringify({ 'messaging.studentToStudent': false }),
});
// Ikkinchi talaba — LTI orqali yaratilgan tinglovchi (9a bo'limi)
const otherStudentId = ltiUserId;
const dmBlocked = otherStudentId
  ? await student('/messages', {
      method: 'POST',
      body: JSON.stringify({ recipientId: otherStudentId, body: '<p>salom</p>' }),
    })
  : { status: 0, body: null };
const dmTeacher = await student('/messages', {
  method: 'POST',
  body: JSON.stringify({ recipientId: teacherLogin.userId, body: `<p>Savol ${suffix}</p>` }),
});
check(
  'Talaba→talaba xabari o`chirilganda 422, o`qituvchiga yozish ochiq',
  (otherStudentId
    ? dmBlocked.status === 422 &&
      dmBlocked.body?.error?.messageKey === 'errors.student_messaging_restricted'
    : true) && dmTeacher.ok,
  `student2 ${otherStudentId ? dmBlocked.status : 'yo`q'} ${dmBlocked.body?.error?.messageKey ?? ''}; teacher ${dmTeacher.status}`,
);
await admin('/admin/site/messaging-settings', {
  method: 'PUT',
  body: JSON.stringify({ 'messaging.studentToStudent': true }),
});

// --- Til: standart til yoqilganlar ichida bo'lishi shart ---
const badLocale = await admin('/admin/site/language-settings', {
  method: 'PUT',
  body: JSON.stringify({ 'i18n.enabledLocales': ['ru', 'en'] }),
});
check(
  'Standart til yoqilgan tillar ro`yxatidan chiqarib bo`lmaydi (422)',
  badLocale.status === 422 &&
    badLocale.body?.error?.messageKey === 'errors.default_locale_not_enabled',
  `status ${badLocale.status} ${badLocale.body?.error?.messageKey ?? ''}`,
);
// --- Yuklash chegarasi: presign sayt chegarasidan oshsa rad etiladi ---
await admin('/admin/site/site-policies', {
  method: 'PUT',
  body: JSON.stringify({ 'security.maxUploadMb': 10 }),
});
const bigPresign = await teacher('/content/files/presign', {
  method: 'POST',
  body: JSON.stringify({
    fileName: 'katta.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12 * 1024 * 1024,
    purpose: 'DOCUMENT',
    courseId,
  }),
});
await admin('/admin/site/site-policies', {
  method: 'PUT',
  body: JSON.stringify({ 'security.maxUploadMb': 500 }),
});
const okPresign = await teacher('/content/files/presign', {
  method: 'POST',
  body: JSON.stringify({
    fileName: 'katta.pdf',
    mimeType: 'application/pdf',
    sizeBytes: 12 * 1024 * 1024,
    purpose: 'DOCUMENT',
    courseId,
  }),
});
check(
  'Yuklash chegarasi (security.maxUploadMb=10): 12 MB presign rad etiladi, 500 da o`tadi',
  !bigPresign.ok && okPresign.ok,
  `10MB: ${bigPresign.status} ${bigPresign.body?.error?.messageKey ?? ''}; 500MB: ${okPresign.status}`,
);

// Tozalash: sayt tavsifini avvalgi holatiga
await admin('/admin/site/site-info', {
  method: 'PUT',
  body: JSON.stringify({
    'site.description': siteInfoBefore['site.description'] ?? '',
    'site.supportEmail': siteInfoBefore['site.supportEmail'] ?? 'support@qdu.uz',
  }),
});

mockServer.close();

const passed = results.filter((item) => item.ok).length;
console.log(`\nNatija: ${passed}/${results.length} tekshiruv muvaffaqiyatli`);
process.exit(passed === results.length ? 0 : 1);
