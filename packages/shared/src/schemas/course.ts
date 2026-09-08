/**
 * Maqsad: F-04 (kurs konstruktori) va F-05 (kontent boshqaruvi) kontraktlari.
 */

import { z } from 'zod';
import { codeSchema, httpUrlSchema, mimeTypeSchema, uuidSchema, localeSchema } from './common';
import { localizedRichTextSchema, localizedTextSchema } from '../types/localized';
import { bloomLevelSchema, gradingPolicySchema } from './curriculum';

export const COURSE_TYPES = ['ACADEMIC', 'PROFESSIONAL_DEV', 'OPEN'] as const;
export const COURSE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'] as const;
export const DELIVERY_MODES = ['ONLINE', 'BLENDED', 'CLASSIC'] as const;
export const RESOURCE_KINDS = [
  'VIDEO',
  'PDF',
  'AUDIO',
  'LINK',
  'H5P',
  'SCORM',
  'XAPI',
  'TEXT',
  'FILE',
  'FOLDER',
  'EMBED',
] as const;

/**
 * Fayl talab qiladigan turlar. Qolganlari `meta` yoki `externalUrl` bilan
 * ishlaydi — shuning uchun validatsiya turga qarab farqlanadi.
 */
export const FILE_RESOURCE_KINDS = ['VIDEO', 'PDF', 'AUDIO', 'FILE', 'SCORM'] as const;

/** Tashqi manzil talab qiladigan turlar. */
export const URL_RESOURCE_KINDS = ['LINK', 'EMBED', 'H5P', 'XAPI'] as const;

export const courseTypeSchema = z.enum(COURSE_TYPES);
export const courseStatusSchema = z.enum(COURSE_STATUSES);
export const deliveryModeSchema = z.enum(DELIVERY_MODES);
export const resourceKindSchema = z.enum(RESOURCE_KINDS);

/**
 * Darsning ochilish shartlari — ketma-ket o'qitish (sequential learning) uchun.
 * Bo'sh bo'lsa dars doim ochiq.
 */
export const availabilitySchema = z.object({
  opensAt: z.coerce.date().nullable().optional(),
  closesAt: z.coerce.date().nullable().optional(),
  /** Ushbu darslar tugatilmaguncha ochilmaydi. */
  requiresLessonIds: z.array(uuidSchema).max(20).default([]),
  /** Oldingi test bo'yicha minimal ball talabi. */
  requiresQuizScore: z
    .object({ quizId: uuidSchema, minScore: z.coerce.number().min(0).max(100) })
    .nullable()
    .optional(),
});

export const createCourseSchema = z.object({
  subjectId: uuidSchema.nullable().optional(),
  semesterId: uuidSchema.nullable().optional(),
  departmentId: uuidSchema,
  code: codeSchema,
  title: localizedTextSchema,
  description: localizedRichTextSchema.optional(),
  type: courseTypeSchema.default('ACADEMIC'),
  deliveryMode: deliveryModeSchema.default('BLENDED'),
  coverFileId: uuidSchema.nullable().optional(),
  /** Malaka oshirish kurslari uchun (A-20). */
  isPaid: z.boolean().default(false),
  priceUzs: z.coerce.number().int().min(0).max(100_000_000).default(0),
  enrollmentLimit: z.coerce.number().int().min(0).max(10_000).default(0),
  /** Bo'sh bo'lsa sillabusdan meros qilib olinadi. */
  gradingPolicy: gradingPolicySchema.optional(),
  /** Kurs davomiyligi (malaka oshirish sertifikati uchun akademik soat). */
  academicHours: z.coerce.number().int().min(0).max(2000).default(0),
});

export const updateCourseSchema = createCourseSchema.partial().omit({ departmentId: true });

export const publishCourseSchema = z.object({
  status: courseStatusSchema,
  /** Arxivlashda sabab talab qilinadi. */
  reason: z.string().trim().max(500).optional(),
});

export const createModuleSchema = z.object({
  courseId: uuidSchema,
  title: localizedTextSchema,
  description: localizedRichTextSchema.optional(),
  position: z.coerce.number().int().min(0).default(0),
  isPublished: z.boolean().default(false),
});

export const createTopicSchema = z.object({
  moduleId: uuidSchema,
  title: localizedTextSchema,
  position: z.coerce.number().int().min(0).default(0),
  bloomLevel: bloomLevelSchema.optional(),
});

export const createLessonSchema = z.object({
  topicId: uuidSchema,
  title: localizedTextSchema,
  contentHtml: localizedRichTextSchema.optional(),
  position: z.coerce.number().int().min(0).default(0),
  durationMinutes: z.coerce.number().int().min(0).max(600).default(0),
  isPublished: z.boolean().default(false),
  availability: availabilitySchema.optional(),
});

export const updateLessonSchema = createLessonSchema.partial().omit({ topicId: true });

/** Modulni tahrirlash — nomi, tavsifi va nashr holati (F-04). */
export const updateModuleSchema = createModuleSchema.partial().omit({ courseId: true });

/** Mavzuni tahrirlash. */
export const updateTopicSchema = createTopicSchema.partial().omit({ moduleId: true });

/**
 * Resurs qo'shimcha ma'lumotlari — turga qarab har xil.
 *
 * `TEXT` uchun matnning o'zi, `FOLDER` uchun fayllar ro'yxati, `EMBED` uchun
 * iframe balandligi. Alohida jadval yaratilmagani ataylab: bu maydonlar faqat
 * ko'rsatish uchun kerak, ular bo'yicha qidiruv ham, filtr ham yo'q.
 */
export const resourceMetaSchema = z.object({
  /** `TEXT` (Moodle: Label) — darsda joyida ko'rinadigan matn bloki. */
  text: localizedRichTextSchema.optional(),
  /** `FOLDER` (Moodle: Folder) — bitta yig'iladigan elementdagi fayllar. */
  files: z
    .array(
      z.object({
        fileObjectId: uuidSchema,
        name: z.string().trim().min(1).max(255),
        sizeBytes: z.coerce.number().int().min(0),
      }),
    )
    .max(100)
    .optional(),
  /** `EMBED` — iframe balandligi (piksel). */
  embedHeight: z.coerce.number().int().min(200).max(2000).optional(),
  /**
   * `SCORM` — import qilingan paket. Zip faylning o'zi resursga biriktiriladi,
   * ammo ishga tushirish va natijani jurnalga yozish shu paket orqali bo'ladi.
   */
  scormPackageId: uuidSchema.optional(),
});

/**
 * Resursni tahrirlash — nomi, majburiyligi, tarkibi (`meta`) va havola manzili.
 * Fayl almashtirilmaydi: yangi fayl uchun yangi resurs yaratiladi (Moodle
 * uslubi — fayl resursi o'z faylini "egallaydi").
 */
export const updateResourceSchema = z.object({
  title: localizedTextSchema.optional(),
  isRequired: z.boolean().optional(),
  meta: resourceMetaSchema.optional(),
  externalUrl: httpUrlSchema.nullable().optional(),
});

/**
 * Drag-and-drop tartiblash (F-04). Bitta so'rovda butun ro'yxat tartibi yuboriladi —
 * bu N ta PATCH so'rovi o'rniga bitta tranzaksiya beradi va N+1 muammosini oldini oladi.
 */
export const reorderSchema = z.object({
  /** Elementlar `id` lari yangi tartibda. */
  orderedIds: z.array(uuidSchema).min(1).max(500),
  /** Ota element — modul ichida mavzular, mavzu ichida darslar. */
  parentId: uuidSchema.optional(),
});

export const createResourceSchema = z
  .object({
    lessonId: uuidSchema,
    kind: resourceKindSchema,
    title: localizedTextSchema,
    fileObjectId: uuidSchema.nullable().optional(),
    externalUrl: httpUrlSchema.nullable().optional(),
    meta: resourceMetaSchema.default({}),
    position: z.coerce.number().int().min(0).default(0),
    /** Talaba uni ko'rishi majburiymi (progress hisobiga kiradi). */
    isRequired: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    // Har bir tur o'z manbasini talab qiladi — bo'sh resurs yaratilmasin
    if (FILE_RESOURCE_KINDS.includes(value.kind as (typeof FILE_RESOURCE_KINDS)[number])) {
      if (!value.fileObjectId) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.resource_needs_file',
          path: ['fileObjectId'],
        });
      }
      return;
    }

    if (URL_RESOURCE_KINDS.includes(value.kind as (typeof URL_RESOURCE_KINDS)[number])) {
      if (!value.externalUrl) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'validation.resource_needs_url',
          path: ['externalUrl'],
        });
      }
      return;
    }

    if (value.kind === 'TEXT' && !value.meta.text) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.resource_needs_text',
        path: ['meta', 'text'],
      });
    }

    if (value.kind === 'FOLDER' && (value.meta.files ?? []).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.resource_needs_files',
        path: ['meta', 'files'],
      });
    }
  });

/** Kursni nusxalash / shablonlash (F-04). */
export const cloneCourseSchema = z.object({
  targetCode: codeSchema,
  targetSemesterId: uuidSchema.nullable().optional(),
  title: localizedTextSchema.optional(),
  includeContent: z.boolean().default(true),
  includeAssignments: z.boolean().default(true),
  includeQuizzes: z.boolean().default(true),
  /** Talabalar va baholar HECH QACHON nusxalanmaydi — xavfsizlik qoidasi. */
});

export const enrollSchema = z.object({
  courseId: uuidSchema,
  /** Ommaviy yozish uchun — guruh bo'yicha. */
  groupId: uuidSchema.optional(),
  userIds: z.array(uuidSchema).max(500).optional(),
});

export const listCoursesSchema = z.object({
  search: z.string().trim().max(200).optional(),
  departmentId: uuidSchema.optional(),
  facultyId: uuidSchema.optional(),
  semesterId: uuidSchema.optional(),
  type: courseTypeSchema.optional(),
  status: courseStatusSchema.optional(),
  teacherId: uuidSchema.optional(),
  onlyEnrolled: z.coerce.boolean().optional(),
});

// --- Fayl yuklash (F-05, ADR-009) -------------------------------------------

export const presignUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: mimeTypeSchema,
  sizeBytes: z.coerce
    .number()
    .int()
    .min(1)
    .max(5 * 1024 * 1024 * 1024),
  /** Fayl qaysi maqsadda — kvota va bucket prefiksini aniqlaydi. */
  purpose: z.enum([
    'COURSE_CONTENT',
    'SUBMISSION',
    'AVATAR',
    'SCORM',
    'DOCUMENT',
    'EXCUSE',
    'QUESTION_IMPORT',
  ]),
  courseId: uuidSchema.optional(),
});

/** IMS Common Cartridge paketini kursga import qilish (F-05, §10). */
export const importCartridgeSchema = z.object({
  courseId: uuidSchema,
  fileObjectId: uuidSchema,
  /** Paketdagi matnlar qaysi tilga yoziladi. */
  locale: localeSchema.default('uz-Latn'),
  /** `true` — faqat reja (nima yaratiladi, nima o'tkazib yuboriladi). */
  dryRun: z.boolean().default(false),
});
export type ImportCartridgeInput = z.infer<typeof importCartridgeSchema>;

/** IMS Common Cartridge eksport (F-05, §10). */
export const exportCartridgeSchema = z.object({
  courseId: uuidSchema,
  locale: localeSchema.default('uz-Latn'),
});
export type ExportCartridgeInput = z.infer<typeof exportCartridgeSchema>;

export const completeUploadSchema = z.object({
  fileObjectId: uuidSchema,
  /** Mijoz hisoblagan SHA-256 — server tomonda qayta tekshiriladi. */
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, { message: 'validation.checksum_format' })
    .optional(),
});

export const lessonProgressSchema = z.object({
  lessonId: uuidSchema,
  secondsSpent: z.coerce.number().int().min(0).max(86_400),
  /** Video uchun — ko'rilgan pozitsiya (soniya). */
  lastPosition: z.coerce.number().min(0).optional(),
  completed: z.boolean().default(false),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type CreateTopicInput = z.infer<typeof createTopicSchema>;
export type CreateLessonInput = z.infer<typeof createLessonSchema>;
export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type ResourceMeta = z.infer<typeof resourceMetaSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type UpdateTopicInput = z.infer<typeof updateTopicSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
export type CloneCourseInput = z.infer<typeof cloneCourseSchema>;
export type EnrollInput = z.infer<typeof enrollSchema>;
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;
export type ListCoursesInput = z.infer<typeof listCoursesSchema>;
export type CourseType = (typeof COURSE_TYPES)[number];
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export type ResourceKind = (typeof RESOURCE_KINDS)[number];
