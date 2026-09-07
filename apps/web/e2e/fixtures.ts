/**
 * Maqsad: e2e testlar uchun ma'lumot fiksturasini API orqali tayyorlash.
 *
 * Sabab: interfeys testlari seed'da tasodifan mavjud bo'lgan yozuvlarga
 * tayanmasligi kerak — aks holda ular jimgina `skip` bo'ladi va hech nima
 * tekshirmaydi (bu loyihada bunga yo'l qo'yilmaydi). Har bir bo'lim o'ziga
 * kerak bo'lgan holatni oldindan yaratadi va aynan shu holatni sinaydi.
 *
 * Mijozlar ham, fiksturalar ham MODUL DARAJASIDA keshlanadi: `/auth/login`
 * brute-force himoyasi bilan cheklangan (§11), shuning uchun har bir
 * `describe` uchun qayta kirishdan qochamiz. Playwright bitta spec faylni
 * bitta ishchi jarayonda bajaradi, demak kesh butun fayl uchun yetarli.
 */

import { request, type APIRequestContext } from '@playwright/test';
import { ACCOUNTS, PASSWORD } from './helpers';

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';

interface ApiClient {
  /** Kirgan foydalanuvchi id si — ba'zi kontraktlar uni talab qiladi. */
  userId: string;
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  put<T>(path: string, body: unknown): Promise<T>;
  patch<T>(path: string, body: unknown): Promise<T>;
}

async function createClient(email: string): Promise<ApiClient> {
  // Prefiks (`/api/v1`) saqlanishi uchun URL to'liq yig'iladi: `baseURL` bilan
  // boshida `/` turgan yo'l uni almashtirib yuboradi.
  const ctx: APIRequestContext = await request.newContext();

  const login = await ctx.post(`${API_URL}/auth/login`, {
    data: { login: email, password: PASSWORD },
  });
  const body = (await login.json()) as {
    success: boolean;
    data?: { tokens: { accessToken: string }; user: { id: string } };
    error?: unknown;
  };
  if (!body.success || !body.data) {
    throw new Error(
      `Kirish muvaffaqiyatsiz (${email}, ${login.status()}): ${JSON.stringify(body.error).slice(0, 200)}`,
    );
  }

  const headers = { Authorization: `Bearer ${body.data.tokens.accessToken}` };

  async function unwrap<T>(response: { json(): Promise<unknown>; status(): number }): Promise<T> {
    const payload = (await response.json()) as { success: boolean; data: T; error?: unknown };
    if (!payload.success) {
      throw new Error(`API ${response.status()}: ${JSON.stringify(payload.error).slice(0, 300)}`);
    }
    return payload.data;
  }

  return {
    userId: body.data.user.id,
    get: async <T>(path: string) => unwrap<T>(await ctx.get(`${API_URL}${path}`, { headers })),
    post: async <T>(path: string, data: unknown) =>
      unwrap<T>(await ctx.post(`${API_URL}${path}`, { headers, data })),
    put: async <T>(path: string, data: unknown) =>
      unwrap<T>(await ctx.put(`${API_URL}${path}`, { headers, data })),
    patch: async <T>(path: string, data: unknown) =>
      unwrap<T>(await ctx.patch(`${API_URL}${path}`, { headers, data })),
  };
}

/** Mijozlar bir marta yaratiladi va butun spec davomida qayta ishlatiladi. */
const clientCache = new Map<string, Promise<ApiClient>>();

export function apiAs(email: string): Promise<ApiClient> {
  const cached = clientCache.get(email);
  if (cached) return cached;

  const created = createClient(email);
  clientCache.set(email, created);
  return created;
}

/** O'qituvchi ham, talaba ham bog'langan kurs — ish topshirish uchun shart. */
async function sharedCourse(teacher: ApiClient, student: ApiClient): Promise<string> {
  const mine = await teacher.get<Array<{ id: string }>>('/courses?limit=50');
  const enrolled = await student.get<Array<{ id: string }>>('/courses?onlyEnrolled=true&limit=50');

  const teacherIds = new Set(mine.map((item) => item.id));
  const match = enrolled.find((item) => teacherIds.has(item.id));
  if (!match) throw new Error("O'qituvchi va talaba umumiy kursi yo'q — `npm run db:seed`");
  return match.id;
}

export interface GradingFixture {
  courseId: string;
  assignmentId: string;
  submissionId: string;
  /** Noyob rubrika sarlavhasi — qulflangan rubrikani aniq topish uchun. */
  rubricTitle: string;
}

async function buildGradingFixture(): Promise<GradingFixture> {
  const teacher = await apiAs(ACCOUNTS.teacher);
  const student = await apiAs(ACCOUNTS.student);

  const courseId = await sharedCourse(teacher, student);
  const stamp = Date.now();

  const rubricTitle = `E2E rubrika ${stamp}`;
  const rubric = await teacher.post<{ id: string }>('/rubrics', {
    courseId,
    title: { 'uz-Latn': rubricTitle },
    criteria: [
      {
        title: { 'uz-Latn': 'Mazmun' },
        maxPoints: 60,
        position: 0,
        levels: [
          { label: { 'uz-Latn': 'Past daraja' }, points: 20 },
          { label: { 'uz-Latn': 'Yuqori daraja' }, points: 60 },
        ],
      },
      {
        title: { 'uz-Latn': 'Rasmiylashtirish' },
        maxPoints: 40,
        position: 1,
        levels: [
          { label: { 'uz-Latn': 'Past daraja' }, points: 10 },
          { label: { 'uz-Latn': 'Yuqori daraja' }, points: 40 },
        ],
      },
    ],
  });

  const assignment = await teacher.post<{ id: string }>('/assignments', {
    courseId,
    title: { 'uz-Latn': `E2E topshiriq ${stamp}` },
    description: { 'uz-Latn': '<p>E2E sinovi</p>' },
    maxScore: 50,
    dueAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    rubricId: rubric.id,
    isPublished: true,
  });

  // Ish ataylab BAHOLANMAGAN qoldiriladi — uni interfeys baholaydi
  const submission = await student.post<{ id: string }>('/submissions', {
    assignmentId: assignment.id,
    contentHtml: '<p>E2E talaba javobi</p>',
    submit: true,
  });

  return { courseId, assignmentId: assignment.id, submissionId: submission.id, rubricTitle };
}

export interface RubricFixture {
  courseId: string;
  rubricId: string;
  /** Noyob sarlavha — takroriy ishga tushirishlarda aniq moslashtirish uchun. */
  title: string;
}

/**
 * Rubrika muharriri uchun: HECH QAYERDA ishlatilmagan rubrika.
 * Shu sababli u qulflanmaydi va to'liq tahrirlanadi.
 */
async function buildRubricFixture(): Promise<RubricFixture> {
  const teacher = await apiAs(ACCOUNTS.teacher);
  const student = await apiAs(ACCOUNTS.student);

  const courseId = await sharedCourse(teacher, student);
  const stamp = Date.now();

  const title = `E2E bo'sh rubrika ${stamp}`;
  const rubric = await teacher.post<{ id: string }>('/rubrics', {
    courseId,
    title: { 'uz-Latn': title },
    criteria: [
      {
        title: { 'uz-Latn': 'E2E mezon' },
        maxPoints: 40,
        position: 0,
        levels: [
          { label: { 'uz-Latn': 'Past daraja' }, points: 10 },
          { label: { 'uz-Latn': 'Yuqori daraja' }, points: 40 },
        ],
      },
    ],
  });

  return { courseId, rubricId: rubric.id, title };
}

export interface QuizFixture {
  courseId: string;
  bankId: string;
  quizId: string;
  questionIds: string[];
}

async function buildQuizFixture(): Promise<QuizFixture> {
  const teacher = await apiAs(ACCOUNTS.teacher);
  const student = await apiAs(ACCOUNTS.student);

  const courseId = await sharedCourse(teacher, student);
  const stamp = Date.now();

  const bank = await teacher.post<{ id: string }>('/question-banks', {
    courseId,
    title: { 'uz-Latn': `E2E bank ${stamp}` },
    isShared: false,
  });

  const questionIds: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    const question = await teacher.post<{ id: string }>('/questions', {
      bankId: bank.id,
      text: { 'uz-Latn': `E2E savol ${index + 1}` },
      payload: {
        type: 'SINGLE',
        options: [
          { id: 'a', text: { 'uz-Latn': "To'g'ri" }, isCorrect: true, weight: 0 },
          { id: 'b', text: { 'uz-Latn': "Noto'g'ri" }, isCorrect: false, weight: 0 },
        ],
      },
      defaultScore: 2,
      difficulty: 'MEDIUM',
      tags: ['e2e'],
    });
    questionIds.push(question.id);
  }

  // Savollari biriktirilmagan va urinishi yo'q test — konstruktor qulflanmaydi
  const quiz = await teacher.post<{ id: string }>('/quizzes', {
    courseId,
    title: { 'uz-Latn': `E2E test ${stamp}` },
    durationMinutes: 30,
    controlType: 'JN',
    passScore: 60,
  });

  return { courseId, bankId: bank.id, quizId: quiz.id, questionIds };
}

export interface ForumFixture {
  courseId: string;
  threadId: string;
  title: string;
}

/**
 * Forum uchun: savol rejimidagi mavzu + o'qituvchining javobi.
 * Mavzu QULFLANMAGAN qoldiriladi — interfeys unga javob yozadi.
 */
async function buildForumFixture(): Promise<ForumFixture> {
  const teacher = await apiAs(ACCOUNTS.teacher);
  const student = await apiAs(ACCOUNTS.student);

  const courseId = await sharedCourse(teacher, student);
  const title = `E2E forum mavzusi ${Date.now()}`;

  const thread = await student.post<{ id: string }>('/forum/threads', {
    courseId,
    title,
    body: '<p>E2E forum savoli</p>',
    isQuestion: true,
  });

  await teacher.post('/forum/posts', {
    threadId: thread.id,
    contentHtml: '<p>E2E forum javobi</p>',
  });

  return { courseId, threadId: thread.id, title };
}

export interface SessionFixture {
  courseId: string;
  sessionId: string;
}

/**
 * Davomat uchun: bugungi dars sessiyasi. Mavjud sessiya ishlatilmaydi —
 * u boshqa testlar tomonidan to'ldirilgan bo'lishi mumkin.
 */
async function buildSessionFixture(): Promise<SessionFixture> {
  const teacher = await apiAs(ACCOUNTS.teacher);
  const student = await apiAs(ACCOUNTS.student);

  const courseId = await sharedCourse(teacher, student);

  // Kurs va guruh juftligi mavjud sessiyadan olinadi: `listSessions` ularni
  // ichma-ich obyekt sifatida qaytaradi (`courseId` maydoni yo'q)
  const existing =
    await teacher.get<Array<{ id: string; course: { id: string }; group: { id: string } }>>(
      '/class-sessions',
    );
  const sample = existing.find((row) => row.course.id === courseId) ?? existing[0];
  if (!sample) throw new Error('Dars sessiyasi topilmadi — `npm run db:seed`');

  const created = await teacher.post<{ id: string }>('/class-sessions', {
    courseId: sample.course.id,
    groupId: sample.group.id,
    teacherId: teacher.userId,
    date: new Date().toISOString().slice(0, 10),
    startsAt: '09:00',
    endsAt: '10:20',
    lessonType: 'LECTURE',
    topic: `E2E sessiya ${Date.now()}`,
  });

  return { courseId: sample.course.id, sessionId: created.id };
}

export interface SyllabusFixture {
  subjectId: string;
  syllabusId: string;
  subjectCode: string;
}

/**
 * Sillabus konstruktori uchun: metodist VA kafedra mudiri ikkalasi ham
 * ko'radigan kafedrada yangi fan + DRAFT holatdagi sillabus.
 *
 * Mavjud fan ishlatilmaydi: seed fanlari boshqa testlar tomonidan REVIEW ga
 * o'tkazilgan bo'lishi mumkin, ba'zilari esa mudirning kafedrasida emas —
 * u holda tasdiqlash oqimini yopib bo'lmaydi.
 */
async function buildSyllabusFixture(): Promise<SyllabusFixture> {
  const methodist = await apiAs(ACCOUNTS.methodist);
  const head = await apiAs(ACCOUNTS.head);

  const [mine, theirs] = await Promise.all([
    methodist.get<Array<{ id: string; departmentId: string }>>('/subjects'),
    head.get<Array<{ id: string }>>('/subjects'),
  ]);
  const headIds = new Set(theirs.map((row) => row.id));
  const shared = mine.find((row) => headIds.has(row.id));
  if (!shared) throw new Error('Metodist va mudir umumiy kafedrasi topilmadi — `npm run db:seed`');

  const stamp = Date.now().toString(36).toUpperCase();
  const subjectCode = `E2E-${stamp}`;

  const subject = await methodist.post<{ id: string }>('/subjects', {
    departmentId: shared.departmentId,
    code: subjectCode,
    name: { 'uz-Latn': `E2E fan ${stamp}` },
    credits: 4,
    controlForm: 'EXAM',
  });

  const syllabus = await methodist.post<{ id: string }>('/syllabi', {
    subjectId: subject.id,
    departmentId: shared.departmentId,
    content: {
      goal: { 'uz-Latn': 'E2E sillabus maqsadi' },
      objectives: [{ 'uz-Latn': 'E2E vazifa' }],
      learningOutcomes: [{ text: { 'uz-Latn': 'E2E natija' }, bloomLevel: 'APPLY' }],
      topics: [
        {
          title: { 'uz-Latn': 'E2E mavzu' },
          lectureHours: 2,
          practiceHours: 2,
          labHours: 0,
          independentHours: 4,
        },
      ],
      literature: [{ type: 'MAIN', citation: 'E2E adabiyoti, 2026' }],
    },
    gradingPolicy: {
      weights: { JN: 30, ON: 30, YN: 40 },
      passingScore: 60,
      finalExamThreshold: 36,
    },
  });

  return { subjectId: subject.id, syllabusId: syllabus.id, subjectCode };
}

let gradingFixture: Promise<GradingFixture> | null = null;
let syllabusFixture: Promise<SyllabusFixture> | null = null;
let quizFixture: Promise<QuizFixture> | null = null;
let rubricFixture: Promise<RubricFixture> | null = null;
let forumFixture: Promise<ForumFixture> | null = null;
let sessionFixture: Promise<SessionFixture> | null = null;

/** Baholash uchun: rubrika + topshiriq + talabaning topshirilgan ishi. */
export function seedGradingFixture(): Promise<GradingFixture> {
  gradingFixture ??= buildGradingFixture();
  return gradingFixture;
}

/** Savollar banki va test konstruktori uchun: bank + 3 savol + bo'sh test. */
export function seedQuizFixture(): Promise<QuizFixture> {
  quizFixture ??= buildQuizFixture();
  return quizFixture;
}

/** Rubrika muharriri uchun: ishlatilmagan (qulflanmagan) rubrika. */
export function seedRubricFixture(): Promise<RubricFixture> {
  rubricFixture ??= buildRubricFixture();
  return rubricFixture;
}

/** Forum uchun: savol mavzusi + bitta javob. */
export function seedForumFixture(): Promise<ForumFixture> {
  forumFixture ??= buildForumFixture();
  return forumFixture;
}

/** Sillabus konstruktori uchun: umumiy kafedrada yangi fan + DRAFT sillabus. */
export function seedSyllabusFixture(): Promise<SyllabusFixture> {
  syllabusFixture ??= buildSyllabusFixture();
  return syllabusFixture;
}

/** Davomat jurnali uchun: bugungi yangi dars sessiyasi. */
export function seedSessionFixture(): Promise<SessionFixture> {
  sessionFixture ??= buildSessionFixture();
  return sessionFixture;
}
