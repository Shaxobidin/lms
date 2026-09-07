/**
 * Maqsad: HEMIS uslubidagi "Talaba" bo'limi sxemalari — fan tanlov, talaba
 * xizmatlari (arizalar) va so'rovnomalar (F-03, F-08, F-14, F-18).
 */

import { z } from 'zod';
import { LOCALES } from '../constants/locales';
import { localizedRichTextSchema, localizedTextSchema } from '../types/localized';
import { uuidSchema } from './common';

// --- Talaba xizmatlari (arizalar) ------------------------------------------

/** Ariza turlari — HEMIS "Talaba xizmatlari" ro'yxatiga mos. */
export const STUDENT_REQUEST_TYPES = [
  'REFERENCE', // o'qish joyidan ma'lumotnoma
  'ACADEMIC_LEAVE', // akademik ta'til
  'RETAKE', // fanni qayta o'qish
  'TRANSFER', // guruh/yo'nalishga o'tkazish
  'TRANSCRIPT', // transkript (baholar ko'chirmasi)
  'OTHER',
] as const;
export type StudentRequestType = (typeof STUDENT_REQUEST_TYPES)[number];

export const STUDENT_REQUEST_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'APPROVED',
  'REJECTED',
  'DONE',
] as const;
export type StudentRequestStatus = (typeof STUDENT_REQUEST_STATUSES)[number];

export const createStudentRequestSchema = z
  .object({
    type: z.enum(STUDENT_REQUEST_TYPES),
    /** Qayta o'qish / boshqa kursga tegishli arizalar uchun. */
    courseId: uuidSchema.optional(),
    subject: z.string().trim().min(3).max(200),
    details: z.string().trim().max(2000).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.type === 'RETAKE' && !value.courseId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.retake_needs_course',
        path: ['courseId'],
      });
    }
  });

export const updateStudentRequestSchema = z.object({
  status: z.enum(['IN_PROGRESS', 'APPROVED', 'REJECTED', 'DONE']),
  resolution: z.string().trim().max(2000).optional(),
});

export const listStudentRequestsSchema = z.object({
  status: z.enum(STUDENT_REQUEST_STATUSES).optional(),
  type: z.enum(STUDENT_REQUEST_TYPES).optional(),
});

// --- Fan tanlov ------------------------------------------------------------------

export const chooseElectiveSchema = z.object({
  courseId: uuidSchema,
});

// --- So'rovnomalar ----------------------------------------------------------------

export const SURVEY_QUESTION_TYPES = ['SCALE', 'CHOICE', 'TEXT'] as const;
export type SurveyQuestionType = (typeof SURVEY_QUESTION_TYPES)[number];

export const surveyQuestionSchema = z.object({
  id: z.string().trim().min(1).max(32),
  text: localizedTextSchema,
  type: z.enum(SURVEY_QUESTION_TYPES),
  /** `CHOICE` uchun variantlar. */
  options: z.array(localizedTextSchema).max(10).optional(),
  required: z.boolean().default(true),
});

export const createSurveySchema = z
  .object({
    title: localizedTextSchema,
    description: localizedRichTextSchema.optional(),
    questions: z.array(surveyQuestionSchema).min(1).max(30),
    /** Bo'sh — barcha rollar. */
    audienceRoles: z.array(z.string().trim().min(2).max(32)).max(10).default(['STUDENT']),
    /** Kursga bog'langan so'rovnoma — faqat yozilgan talabalarga. */
    courseId: uuidSchema.optional(),
    isAnonymous: z.boolean().default(true),
    opensAt: z.coerce.date().optional(),
    closesAt: z.coerce.date().optional(),
    isPublished: z.boolean().default(false),
  })
  .superRefine((value, ctx) => {
    const ids = value.questions.map((question) => question.id);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.survey_question_ids_unique',
        path: ['questions'],
      });
    }
    for (const [index, question] of value.questions.entries()) {
      if (question.type === 'CHOICE' && (question.options?.length ?? 0) < 2) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.survey_choice_needs_options',
          path: ['questions', index, 'options'],
        });
      }
    }
    if (value.opensAt && value.closesAt && value.closesAt <= value.opensAt) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.closes_before_opens',
        path: ['closesAt'],
      });
    }
  });

export const updateSurveySchema = z.object({
  isPublished: z.boolean().optional(),
  closesAt: z.coerce.date().nullable().optional(),
});

/** Javob: savol id → qiymat (SCALE: 1..5, CHOICE: variant indeksi, TEXT: matn). */
export const surveyResponseSchema = z.object({
  answers: z.record(z.union([z.coerce.number().min(0).max(100), z.string().trim().max(2000)])),
});

export const SURVEY_SCALE_MAX = 5;

/** Tilda javob bo'lmasa zaxira tilga tushish uchun. */
export const SURVEY_LOCALES = LOCALES;

export type CreateStudentRequestInput = z.infer<typeof createStudentRequestSchema>;
export type UpdateStudentRequestInput = z.infer<typeof updateStudentRequestSchema>;
export type ListStudentRequestsInput = z.infer<typeof listStudentRequestsSchema>;
export type ChooseElectiveInput = z.infer<typeof chooseElectiveSchema>;
export type CreateSurveyInput = z.infer<typeof createSurveySchema>;
export type UpdateSurveyInput = z.infer<typeof updateSurveySchema>;
export type SurveyResponseInput = z.infer<typeof surveyResponseSchema>;
export type SurveyQuestion = z.infer<typeof surveyQuestionSchema>;
