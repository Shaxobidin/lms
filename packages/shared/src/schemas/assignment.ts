/**
 * Maqsad: F-06 (topshiriqlar) — rubrika, peer-review, kechikish siyosati.
 */

import { z } from 'zod';
import { mimeTypeSchema, richTextSchema, uuidSchema } from './common';
import { localizedRichTextSchema, localizedTextSchema } from '../types/localized';
import { CONTROL_TYPES } from '../domain/grading';

export const SUBMISSION_STATUSES = ['DRAFT', 'SUBMITTED', 'LATE', 'GRADED', 'RETURNED'] as const;

export const submissionStatusSchema = z.enum(SUBMISSION_STATUSES);

/** Rubrika mezoni: har bir daraja uchun ball va tavsif (F-06). */
export const rubricCriterionSchema = z.object({
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  maxPoints: z.coerce.number().min(0.5).max(100),
  position: z.coerce.number().int().min(0).default(0),
  levels: z
    .array(
      z.object({
        label: localizedTextSchema,
        points: z.coerce.number().min(0).max(100),
        description: localizedTextSchema.optional(),
      }),
    )
    .min(2, { message: 'validation.rubric_needs_levels' })
    .max(10),
});

export const createRubricSchema = z.object({
  courseId: uuidSchema,
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  criteria: z.array(rubricCriterionSchema).min(1).max(30),
});

/**
 * Rubrikani yangilash.
 *
 * Mezonlar TO'LIQ ro'yxat sifatida yuboriladi. Mavjud mezonda `id` bo'lsa u
 * saqlanadi — bu muhim, chunki qo'yilgan ballar (`RubricScore`) aynan mezon
 * `id` siga bog'langan. `id` siz mezon yangi sifatida yaratiladi, ro'yxatga
 * kirmagani esa mantiqiy o'chiriladi.
 */
export const updateRubricSchema = z.object({
  title: localizedTextSchema,
  description: localizedTextSchema.optional(),
  criteria: z
    .array(rubricCriterionSchema.extend({ id: uuidSchema.optional() }))
    .min(1)
    .max(30),
});

export const createAssignmentSchema = z
  .object({
    courseId: uuidSchema,
    topicId: uuidSchema.nullable().optional(),
    title: localizedTextSchema,
    description: localizedRichTextSchema,
    kind: z.enum(['INDIVIDUAL', 'GROUP']).default('INDIVIDUAL'),
    controlType: z.enum(CONTROL_TYPES).default('JN'),
    maxScore: z.coerce.number().min(1).max(1000),
    dueAt: z.coerce.date(),
    /** Kechikish bilan qabul qilinadigan oxirgi muddat; null — kechikish yo'q. */
    lateUntil: z.coerce.date().nullable().optional(),
    latePenaltyPercent: z.coerce.number().min(0).max(100).default(10),
    maxAttempts: z.coerce.number().int().min(1).max(10).default(1),
    rubricId: uuidSchema.nullable().optional(),
    peerReviewEnabled: z.boolean().default(false),
    peerReviewCount: z.coerce.number().int().min(0).max(10).default(0),
    peerReviewDueAt: z.coerce.date().nullable().optional(),
    plagiarismCheck: z.boolean().default(false),
    allowedMimeTypes: z.array(mimeTypeSchema).max(20).default([]),
    maxFileSizeMb: z.coerce.number().int().min(1).max(512).default(50),
    maxFiles: z.coerce.number().int().min(0).max(20).default(5),
    isPublished: z.boolean().default(false),
  })
  .refine((value) => !value.lateUntil || value.lateUntil > value.dueAt, {
    message: 'validation.late_after_due',
    path: ['lateUntil'],
  })
  .refine((value) => !value.peerReviewEnabled || value.peerReviewCount > 0, {
    message: 'validation.peer_review_count_required',
    path: ['peerReviewCount'],
  });

export const updateAssignmentSchema = z.object({
  title: localizedTextSchema.optional(),
  description: localizedRichTextSchema.optional(),
  maxScore: z.coerce.number().min(1).max(1000).optional(),
  dueAt: z.coerce.date().optional(),
  lateUntil: z.coerce.date().nullable().optional(),
  latePenaltyPercent: z.coerce.number().min(0).max(100).optional(),
  maxAttempts: z.coerce.number().int().min(1).max(10).optional(),
  rubricId: uuidSchema.nullable().optional(),
  peerReviewEnabled: z.boolean().optional(),
  peerReviewCount: z.coerce.number().int().min(0).max(10).optional(),
  peerReviewDueAt: z.coerce.date().nullable().optional(),
  plagiarismCheck: z.boolean().optional(),
  allowedMimeTypes: z.array(mimeTypeSchema).max(20).optional(),
  maxFileSizeMb: z.coerce.number().int().min(1).max(512).optional(),
  maxFiles: z.coerce.number().int().min(0).max(20).optional(),
  isPublished: z.boolean().optional(),
});
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

export const createSubmissionSchema = z.object({
  assignmentId: uuidSchema,
  contentHtml: richTextSchema.optional(),
  fileIds: z.array(uuidSchema).max(20).default([]),
  /** Guruhli topshiriqda — hamkorlar. */
  collaboratorIds: z.array(uuidSchema).max(10).default([]),
  /** true bo'lsa yakuniy yuborish, aks holda qoralama saqlash. */
  submit: z.boolean().default(false),
});

/** Rubrika bo'yicha baholash — har bir mezon uchun ball. */
export const gradeSubmissionSchema = z
  .object({
    /** Rubrika bo'lmasa — umumiy ball. */
    score: z.coerce.number().min(0).max(1000).optional(),
    rubricScores: z
      .array(
        z.object({
          criterionId: uuidSchema,
          points: z.coerce.number().min(0).max(100),
          comment: z.string().trim().max(2000).optional(),
        }),
      )
      .max(30)
      .optional(),
    feedback: richTextSchema.optional(),
    /** Talabaga qaytarish (qayta ishlash uchun). */
    returnForRevision: z.boolean().default(false),
  })
  .refine((value) => value.score !== undefined || (value.rubricScores?.length ?? 0) > 0, {
    message: 'validation.score_or_rubric_required',
    path: ['score'],
  });

export const peerReviewSchema = z.object({
  submissionId: uuidSchema,
  rubricScores: z
    .array(
      z.object({
        criterionId: uuidSchema,
        points: z.coerce.number().min(0).max(100),
        comment: z.string().trim().max(2000).optional(),
      }),
    )
    .min(1)
    .max(30),
  overallComment: z.string().trim().max(4000).optional(),
});

export const listSubmissionsSchema = z.object({
  assignmentId: uuidSchema.optional(),
  courseId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  status: submissionStatusSchema.optional(),
  /** Faqat baholanmagan ishlar — o'qituvchi ish oqimi uchun. */
  ungradedOnly: z.coerce.boolean().optional(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type CreateRubricInput = z.infer<typeof createRubricSchema>;
export type UpdateRubricInput = z.infer<typeof updateRubricSchema>;
export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
export type GradeSubmissionInput = z.infer<typeof gradeSubmissionSchema>;
export type PeerReviewInput = z.infer<typeof peerReviewSchema>;
export type SubmissionStatus = (typeof SUBMISSION_STATUSES)[number];
