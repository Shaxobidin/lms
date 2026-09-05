/**
 * Maqsad: F-03 (o'quv reja va sillabus) kontraktlari — kredit-modul tizimi,
 * fan kartasi, ishchi dastur va tasdiqlash oqimi.
 */

import { z } from 'zod';
import { codeSchema, uuidSchema } from './common';
import { localizedRichTextSchema, localizedTextSchema } from '../types/localized';
import { CONTROL_TYPES } from '../domain/grading';

export const CONTROL_FORMS = ['EXAM', 'CREDIT', 'COURSE_WORK', 'QUALIFYING_WORK'] as const;
export const APPROVAL_STATUSES = ['DRAFT', 'REVIEW', 'APPROVED', 'REJECTED', 'ARCHIVED'] as const;
export const BLOOM_LEVELS = [
  'REMEMBER',
  'UNDERSTAND',
  'APPLY',
  'ANALYZE',
  'EVALUATE',
  'CREATE',
] as const;

export const controlFormSchema = z.enum(CONTROL_FORMS);
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export const bloomLevelSchema = z.enum(BLOOM_LEVELS);

/** Fan kartasi (F-03). */
export const createSubjectSchema = z.object({
  departmentId: uuidSchema,
  code: codeSchema,
  name: localizedTextSchema,
  description: localizedRichTextSchema.optional(),
  credits: z.coerce.number().int().min(1).max(30),
  controlForm: controlFormSchema,
  /** Fanni o'zlashtirish uchun oldin o'tilishi kerak bo'lgan fanlar. */
  prerequisiteIds: z.array(uuidSchema).max(10).default([]),
});

export const updateSubjectSchema = createSubjectSchema.partial().omit({ departmentId: true });

/** O'quv reja tarkibiga fan qo'shish — soatlar taqsimoti bilan. */
export const curriculumSubjectSchema = z
  .object({
    subjectId: uuidSchema,
    semesterNumber: z.coerce.number().int().min(1).max(12),
    lectureHours: z.coerce.number().int().min(0).max(400),
    practiceHours: z.coerce.number().int().min(0).max(400),
    labHours: z.coerce.number().int().min(0).max(400),
    seminarHours: z.coerce.number().int().min(0).max(400),
    independentHours: z.coerce.number().int().min(0).max(600),
    /** Fakultativ fanlar yakuniy GPA ga kirmaydi. */
    isElective: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.lectureHours +
        value.practiceHours +
        value.labHours +
        value.seminarHours +
        value.independentHours >
      0,
    { message: 'validation.hours_required', path: ['lectureHours'] },
  );

export const createCurriculumSchema = z.object({
  specialityId: uuidSchema,
  code: codeSchema,
  name: localizedTextSchema,
  /** O'quv reja qaysi qabul yili uchun amal qiladi. */
  admissionYear: z.coerce.number().int().min(2000).max(2100),
  totalCredits: z.coerce.number().int().min(30).max(400),
  subjects: z.array(curriculumSubjectSchema).min(1).max(200),
});

export const updateCurriculumSchema = createCurriculumSchema.partial().omit({ specialityId: true });

/**
 * Sillabus mazmuni — O'UM (o'quv-uslubiy majmua) yadrosi.
 * Har bir bo'lim ko'p tilli; barchasi bitta `jsonb` ustunida saqlanadi (A-15).
 */
export const syllabusContentSchema = z.object({
  /** Fanning maqsadi. */
  goal: localizedRichTextSchema,
  /** Fanning vazifalari. */
  objectives: z.array(localizedTextSchema).max(20).default([]),
  /** Kutilayotgan o'quv natijalari — Bloom darajasi bilan (pedagogik dizayn). */
  learningOutcomes: z
    .array(
      z.object({
        text: localizedTextSchema,
        bloomLevel: bloomLevelSchema,
        /** Yo'nalish kompetensiyasi kodi bilan bog'lash. */
        competencyCode: z.string().trim().max(32).optional(),
      }),
    )
    .max(30)
    .default([]),
  /** Mavzular rejasi — soatlar bilan. */
  topics: z
    .array(
      z.object({
        title: localizedTextSchema,
        lectureHours: z.coerce.number().min(0).max(100).default(0),
        practiceHours: z.coerce.number().min(0).max(100).default(0),
        labHours: z.coerce.number().min(0).max(100).default(0),
        independentHours: z.coerce.number().min(0).max(100).default(0),
        week: z.coerce.number().int().min(1).max(52).optional(),
      }),
    )
    .max(100)
    .default([]),
  /** Adabiyotlar ro'yxati. */
  literature: z
    .array(
      z.object({
        type: z.enum(['MAIN', 'ADDITIONAL', 'ELECTRONIC']),
        citation: z.string().trim().min(5).max(1000),
        url: z.string().url().optional(),
      }),
    )
    .max(100)
    .default([]),
  /** Talabaga qo'yiladigan talablar va akademik halollik siyosati. */
  policy: localizedRichTextSchema.optional(),
});

/** Baholash siyosati — sillabus versiyasida muzlatiladi (ADR-012). */
export const gradingPolicySchema = z
  .object({
    weights: z.object({
      JN: z.coerce.number().min(0).max(100),
      ON: z.coerce.number().min(0).max(100),
      YN: z.coerce.number().min(0).max(100),
    }),
    passingScore: z.coerce.number().min(0).max(100).default(60),
    finalExamThreshold: z.coerce.number().min(0).max(100).default(36),
    finalExamMinScore: z.coerce.number().min(0).max(100).default(0),
    latePenaltyPercent: z.coerce.number().min(0).max(100).default(10),
  })
  .refine(
    (value) => Math.abs(value.weights.JN + value.weights.ON + value.weights.YN - 100) < 0.001,
    { message: 'validation.weights_must_sum_100', path: ['weights'] },
  );

export const createSyllabusSchema = z.object({
  subjectId: uuidSchema,
  departmentId: uuidSchema,
  content: syllabusContentSchema,
  gradingPolicy: gradingPolicySchema,
});

export const updateSyllabusVersionSchema = z.object({
  content: syllabusContentSchema.partial(),
  gradingPolicy: gradingPolicySchema.optional(),
  /** O'zgarish izohi — versiyalar tarixida ko'rinadi. */
  changeNote: z.string().trim().max(1000).optional(),
});

/** Tasdiqlash oqimi: DRAFT -> REVIEW -> APPROVED | REJECTED. */
export const syllabusTransitionSchema = z.object({
  action: z.enum(['SUBMIT', 'APPROVE', 'REJECT', 'ARCHIVE']),
  comment: z.string().trim().max(2000).optional(),
});

export const CONTROL_TYPE_ENUM = z.enum(CONTROL_TYPES);

export type CreateSubjectInput = z.infer<typeof createSubjectSchema>;
export type CreateCurriculumInput = z.infer<typeof createCurriculumSchema>;
export type CreateSyllabusInput = z.infer<typeof createSyllabusSchema>;
export type SyllabusContent = z.infer<typeof syllabusContentSchema>;
export type SyllabusTransitionInput = z.infer<typeof syllabusTransitionSchema>;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export type BloomLevel = (typeof BLOOM_LEVELS)[number];
export type ControlForm = (typeof CONTROL_FORMS)[number];
