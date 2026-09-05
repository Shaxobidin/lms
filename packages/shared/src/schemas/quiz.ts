/**
 * Maqsad: F-07 (test va imtihon) kontraktlari — 10 tur savol, randomizatsiya,
 * urinishlar, proctoring hooklari.
 *
 * Savol turlari discriminated union sifatida modellashtirilgan: har bir tur uchun
 * `payload` tuzilishi va javob (`response`) formati qat'iy belgilangan. Bu
 * avtomatik baholovchini (`autograde.ts`) tur bo'yicha xavfsiz yozish imkonini beradi.
 */

import { z } from 'zod';
import { uuidSchema } from './common';
import { localizedRichTextSchema, localizedTextSchema } from '../types/localized';
import { bloomLevelSchema } from './curriculum';
import { CONTROL_TYPES } from '../domain/grading';

export const QUESTION_TYPES = [
  'SINGLE',
  'MULTI',
  'MATCHING',
  'ORDERING',
  'CLOZE',
  'ESSAY',
  'NUMERIC',
  'HOTSPOT',
  'DRAG_DROP',
  'CODE',
] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export const difficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);

/** Qo'lda baholanadigan turlar — avtomatik baholovchi ularga tegmaydi. */
export const MANUAL_GRADING_TYPES: readonly QuestionType[] = ['ESSAY', 'CODE'];

// --- Har bir tur uchun payload ----------------------------------------------

const optionSchema = z.object({
  id: z.string().min(1).max(64),
  text: localizedTextSchema,
  isCorrect: z.boolean().default(false),
  /** Qisman ball uchun og'irlik (MULTI turida). */
  weight: z.coerce.number().min(-1).max(1).default(0),
  feedback: localizedTextSchema.optional(),
});

const singlePayload = z.object({
  type: z.literal('SINGLE'),
  options: z.array(optionSchema).min(2).max(10),
});

const multiPayload = z.object({
  type: z.literal('MULTI'),
  options: z.array(optionSchema).min(2).max(15),
  /** Noto'g'ri tanlov uchun ball ayirilsinmi. */
  penalizeWrong: z.boolean().default(true),
});

const matchingPayload = z.object({
  type: z.literal('MATCHING'),
  left: z
    .array(z.object({ id: z.string().max(64), text: localizedTextSchema }))
    .min(2)
    .max(15),
  right: z
    .array(z.object({ id: z.string().max(64), text: localizedTextSchema }))
    .min(2)
    .max(20),
  /** To'g'ri juftliklar: chap element id -> o'ng element id. */
  pairs: z
    .array(z.object({ leftId: z.string(), rightId: z.string() }))
    .min(2)
    .max(15),
});

const orderingPayload = z.object({
  type: z.literal('ORDERING'),
  items: z
    .array(z.object({ id: z.string().max(64), text: localizedTextSchema }))
    .min(2)
    .max(15),
  /** To'g'ri tartib — element id lari ketma-ketligi. */
  correctOrder: z.array(z.string()).min(2).max(15),
});

const clozePayload = z.object({
  type: z.literal('CLOZE'),
  /** Matn ichida `[[1]]`, `[[2]]` ko'rinishidagi bo'shliqlar. */
  template: localizedRichTextSchema,
  blanks: z
    .array(
      z.object({
        key: z.string().max(16),
        /** Qabul qilinadigan javoblar (bir nechta variant bo'lishi mumkin). */
        accepted: z.array(z.string().max(200)).min(1).max(10),
        caseSensitive: z.boolean().default(false),
        points: z.coerce.number().min(0).max(100).default(1),
      }),
    )
    .min(1)
    .max(20),
});

const essayPayload = z.object({
  type: z.literal('ESSAY'),
  minWords: z.coerce.number().int().min(0).max(10_000).default(0),
  maxWords: z.coerce.number().int().min(0).max(20_000).default(0),
  /** Baholash uchun ko'rsatma — o'qituvchiga ko'rinadi. */
  gradingHint: localizedTextSchema.optional(),
  allowAttachments: z.boolean().default(false),
});

const numericPayload = z.object({
  type: z.literal('NUMERIC'),
  correctValue: z.coerce.number(),
  /** Ruxsat etilgan xatolik (absolyut qiymat). */
  tolerance: z.coerce.number().min(0).default(0),
  unit: z.string().max(32).optional(),
});

const hotspotPayload = z.object({
  type: z.literal('HOTSPOT'),
  imageFileId: uuidSchema,
  /** To'g'ri sohalar — foizda (rasm o'lchamiga nisbatan). */
  areas: z
    .array(
      z.object({
        id: z.string().max(64),
        shape: z.enum(['RECT', 'CIRCLE']),
        x: z.coerce.number().min(0).max(100),
        y: z.coerce.number().min(0).max(100),
        width: z.coerce.number().min(0).max(100).optional(),
        height: z.coerce.number().min(0).max(100).optional(),
        radius: z.coerce.number().min(0).max(100).optional(),
      }),
    )
    .min(1)
    .max(20),
  requiredAreaIds: z.array(z.string()).min(1),
});

const dragDropPayload = z.object({
  type: z.literal('DRAG_DROP'),
  items: z
    .array(z.object({ id: z.string().max(64), text: localizedTextSchema }))
    .min(1)
    .max(20),
  zones: z
    .array(z.object({ id: z.string().max(64), label: localizedTextSchema }))
    .min(1)
    .max(10),
  /** To'g'ri joylashuv: element id -> zona id. */
  placements: z
    .array(z.object({ itemId: z.string(), zoneId: z.string() }))
    .min(1)
    .max(20),
});

const codePayload = z.object({
  type: z.literal('CODE'),
  language: z.enum(['python', 'javascript', 'typescript', 'java', 'cpp', 'csharp', 'sql']),
  starterCode: z.string().max(20_000).default(''),
  /**
   * Test holatlari. Kod BAJARILMAYDI — sandbox tashqarida (§16: mavjud bo'lmagan
   * imkoniyat o'ylab topilmaydi). Ular o'qituvchiga qo'lda baholashda ko'rsatiladi.
   */
  testCases: z
    .array(z.object({ input: z.string().max(4000), expected: z.string().max(4000) }))
    .max(20)
    .default([]),
  gradingHint: localizedTextSchema.optional(),
});

export const questionPayloadSchema = z.discriminatedUnion('type', [
  singlePayload,
  multiPayload,
  matchingPayload,
  orderingPayload,
  clozePayload,
  essayPayload,
  numericPayload,
  hotspotPayload,
  dragDropPayload,
  codePayload,
]);

export type QuestionPayload = z.infer<typeof questionPayloadSchema>;

// --- Javob (response) formatlari --------------------------------------------

export const questionResponseSchema = z.union([
  z.object({ type: z.literal('SINGLE'), optionId: z.string().max(64).nullable() }),
  z.object({ type: z.literal('MULTI'), optionIds: z.array(z.string().max(64)).max(15) }),
  z.object({
    type: z.literal('MATCHING'),
    pairs: z.array(z.object({ leftId: z.string(), rightId: z.string().nullable() })).max(15),
  }),
  z.object({ type: z.literal('ORDERING'), order: z.array(z.string()).max(15) }),
  z.object({
    type: z.literal('CLOZE'),
    blanks: z.array(z.object({ key: z.string(), value: z.string().max(500) })).max(20),
  }),
  z.object({
    type: z.literal('ESSAY'),
    text: z.string().max(100_000),
    fileIds: z.array(uuidSchema).max(5).default([]),
  }),
  z.object({ type: z.literal('NUMERIC'), value: z.coerce.number().nullable() }),
  z.object({ type: z.literal('HOTSPOT'), areaIds: z.array(z.string()).max(20) }),
  z.object({
    type: z.literal('DRAG_DROP'),
    placements: z.array(z.object({ itemId: z.string(), zoneId: z.string().nullable() })).max(20),
  }),
  z.object({ type: z.literal('CODE'), code: z.string().max(100_000) }),
]);

export type QuestionResponse = z.infer<typeof questionResponseSchema>;

// --- Savollar banki ---------------------------------------------------------

export const createQuestionBankSchema = z.object({
  courseId: uuidSchema.nullable().optional(),
  subjectId: uuidSchema.nullable().optional(),
  title: localizedTextSchema,
  /** Kafedra ichida boshqa o'qituvchilar ham ishlata oladimi. */
  isShared: z.boolean().default(false),
});

export const createQuestionSchema = z.object({
  bankId: uuidSchema,
  text: localizedRichTextSchema,
  payload: questionPayloadSchema,
  defaultScore: z.coerce.number().min(0.1).max(100).default(1),
  bloomLevel: bloomLevelSchema.optional(),
  difficulty: difficultySchema.default('MEDIUM'),
  tags: z.array(z.string().trim().max(48)).max(20).default([]),
  explanation: localizedRichTextSchema.optional(),
  imageFileId: uuidSchema.nullable().optional(),
});

export const updateQuestionSchema = createQuestionSchema.partial().omit({ bankId: true });

/** QTI 3.0 / CSV import (F-07, §12). */
export const importQuestionsSchema = z.object({
  bankId: uuidSchema,
  format: z.enum(['QTI_3', 'AIKEN', 'GIFT', 'CSV']),
  fileObjectId: uuidSchema,
});

// --- Test (quiz) ------------------------------------------------------------

/**
 * Bazaviy obyekt alohida ajratilgan: `.refine()` qaytargan `ZodEffects` da
 * `.partial()` mavjud emas, shuning uchun yangilash sxemasi shu obyektdan hosil qilinadi.
 */
const quizBaseSchema = z.object({
  courseId: uuidSchema,
  topicId: uuidSchema.nullable().optional(),
  title: localizedTextSchema,
  description: localizedRichTextSchema.optional(),
  controlType: z.enum([...CONTROL_TYPES, 'PRACTICE'] as const).default('JN'),
  durationMinutes: z.coerce.number().int().min(1).max(600),
  maxAttempts: z.coerce.number().int().min(1).max(20).default(1),
  gradingMethod: z.enum(['HIGHEST', 'LAST', 'AVERAGE', 'FIRST']).default('HIGHEST'),
  shuffleQuestions: z.boolean().default(true),
  shuffleOptions: z.boolean().default(true),
  /** 0 — bankdagi barcha savollar; >0 — tasodifiy tanlab olinadi (variant generatsiyasi). */
  questionsPerAttempt: z.coerce.number().int().min(0).max(300).default(0),
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  passScore: z.coerce.number().min(0).max(100).default(60),
  proctoringEnabled: z.boolean().default(false),
  /** Javoblarni qachon ko'rsatish. */
  showAnswers: z.enum(['NEVER', 'AFTER_ATTEMPT', 'AFTER_CLOSE']).default('AFTER_CLOSE'),
  /** Bir sahifada nechta savol. */
  questionsPerPage: z.coerce.number().int().min(1).max(50).default(1),
  /** Orqaga qaytish mumkinmi (imtihonda odatda yo'q). */
  allowBacktrack: z.boolean().default(true),
  isPublished: z.boolean().default(false),
});

export const createQuizSchema = quizBaseSchema.refine(
  (value) => !value.opensAt || !value.closesAt || value.closesAt > value.opensAt,
  { message: 'validation.close_after_open', path: ['closesAt'] },
);

export const updateQuizSchema = quizBaseSchema.partial().omit({ courseId: true });

/** Testga savollar biriktirish. `poolTag` — randomizatsiya guruhi. */
export const setQuizQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        questionId: uuidSchema,
        score: z.coerce.number().min(0.1).max(100),
        position: z.coerce.number().int().min(0),
        poolTag: z.string().trim().max(48).optional(),
      }),
    )
    .min(1)
    .max(300),
  /** Har bir pool'dan nechta savol olinsin. */
  poolSelection: z
    .array(z.object({ poolTag: z.string().max(48), take: z.coerce.number().int().min(1).max(100) }))
    .max(20)
    .default([]),
});

export const startAttemptSchema = z.object({
  quizId: uuidSchema,
});

/**
 * Javobni saqlash. Har bir javob alohida yuboriladi (avtosaqlash) —
 * shu tufayli internet uzilsa ham ma'lumot yo'qolmaydi (RSK-08).
 */
export const saveAnswerSchema = z.object({
  attemptId: uuidSchema,
  questionId: uuidSchema,
  response: questionResponseSchema,
  /** Talaba savolni "belgilab qo'ygan" (keyin qaytish uchun). */
  flagged: z.boolean().default(false),
});

export const submitAttemptSchema = z.object({
  attemptId: uuidSchema,
});

/** Proctoring hodisasi (A-09) — hook orqali qayd etiladi. */
export const proctoringEventSchema = z.object({
  attemptId: uuidSchema,
  type: z.enum([
    'TAB_BLUR',
    'TAB_FOCUS',
    'FULLSCREEN_EXIT',
    'COPY',
    'PASTE',
    'MULTIPLE_FACES',
    'NO_FACE',
    'NETWORK_LOST',
  ]),
  occurredAt: z.coerce.date(),
  meta: z.record(z.unknown()).optional(),
});

/** Esse va kod savollarini qo'lda baholash. */
export const gradeAnswerSchema = z.object({
  answerId: uuidSchema,
  score: z.coerce.number().min(0).max(100),
  feedback: localizedTextSchema.optional(),
});

export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type SetQuizQuestionsInput = z.infer<typeof setQuizQuestionsSchema>;
export type SaveAnswerInput = z.infer<typeof saveAnswerSchema>;
export type ProctoringEventInput = z.infer<typeof proctoringEventSchema>;
export type GradeAnswerInput = z.infer<typeof gradeAnswerSchema>;
