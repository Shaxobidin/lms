/**
 * Maqsad: F-02 (tashkiliy tuzilma) kontraktlari — fakultet, kafedra, yo'nalish,
 * guruh, o'quv yili va semestr.
 */

import { z } from 'zod';
import { codeSchema, isoDateSchema, uuidSchema } from './common';
import { localizedTextSchema } from '../types/localized';

export const EDUCATION_FORMS = ['DAYTIME', 'EXTRAMURAL', 'EVENING', 'DISTANCE'] as const;
export const EDUCATION_LEVELS = ['BACHELOR', 'MASTER', 'COURSE'] as const;

export const educationFormSchema = z.enum(EDUCATION_FORMS);
export const educationLevelSchema = z.enum(EDUCATION_LEVELS);

export const createFacultySchema = z.object({
  code: codeSchema,
  name: localizedTextSchema,
  deanId: uuidSchema.nullable().optional(),
  position: z.coerce.number().int().min(0).default(0),
});

export const updateFacultySchema = createFacultySchema.partial();

export const createDepartmentSchema = z.object({
  facultyId: uuidSchema,
  code: codeSchema,
  name: localizedTextSchema,
  headId: uuidSchema.nullable().optional(),
});

export const updateDepartmentSchema = createDepartmentSchema.partial().omit({ facultyId: true });

export const createSpecialitySchema = z.object({
  departmentId: uuidSchema,
  /** Davlat klassifikatori kodi, masalan 60110100. */
  code: codeSchema,
  name: localizedTextSchema,
  level: educationLevelSchema,
  /** Ta'lim muddati (yil). */
  durationYears: z.coerce.number().int().min(1).max(7),
});

export const updateSpecialitySchema = createSpecialitySchema.partial().omit({ departmentId: true });

export const createGroupSchema = z.object({
  specialityId: uuidSchema,
  /** Guruh nomi, masalan "MI-24-01". */
  name: z.string().trim().min(2).max(32),
  admissionYear: z.coerce.number().int().min(2000).max(2100),
  educationForm: educationFormSchema,
  curatorId: uuidSchema.nullable().optional(),
  /** Ta'lim tili — guruh darajasida belgilanadi. */
  languageOfInstruction: z.enum(['uz-Latn', 'uz-Cyrl', 'ru', 'en']).default('uz-Latn'),
});

export const updateGroupSchema = createGroupSchema.partial().omit({ specialityId: true });

export const createAcademicYearSchema = z
  .object({
    /** "2026-2027" ko'rinishida. */
    name: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{4}$/, { message: 'validation.academic_year_format' }),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    isCurrent: z.boolean().default(false),
  })
  .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
    message: 'validation.start_before_end',
    path: ['endsAt'],
  });

export const createSemesterSchema = z
  .object({
    academicYearId: uuidSchema,
    /** 1..12 — magistratura va malaka oshirish sikllari uchun ham yetarli. */
    number: z.coerce.number().int().min(1).max(12),
    startsAt: isoDateSchema,
    endsAt: isoDateSchema,
    isCurrent: z.boolean().default(false),
    /** Nazorat sanalari — jurnal yopilishini nazorat qiladi. */
    gradingClosesAt: isoDateSchema.optional(),
  })
  .refine((value) => new Date(value.startsAt) < new Date(value.endsAt), {
    message: 'validation.start_before_end',
    path: ['endsAt'],
  });

/**
 * O'quv yili va semestrni yangilash.
 *
 * `create*` sxemalari `.refine()` bilan o'ralgan (`ZodEffects`), unda `.partial()`
 * yo'q — shuning uchun maydonlar aniq sanab o'tiladi. Sana juftligi berilsa,
 * tartib yana tekshiriladi.
 */
export const updateAcademicYearSchema = z
  .object({
    name: z
      .string()
      .trim()
      .regex(/^\d{4}-\d{4}$/, { message: 'validation.academic_year_format' })
      .optional(),
    startsAt: isoDateSchema.optional(),
    endsAt: isoDateSchema.optional(),
    isCurrent: z.boolean().optional(),
  })
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || new Date(value.startsAt) < new Date(value.endsAt),
    { message: 'validation.start_before_end', path: ['endsAt'] },
  );

export const updateSemesterSchema = z
  .object({
    startsAt: isoDateSchema.optional(),
    endsAt: isoDateSchema.optional(),
    isCurrent: z.boolean().optional(),
    gradingClosesAt: isoDateSchema.nullable().optional(),
  })
  .refine(
    (value) =>
      !value.startsAt || !value.endsAt || new Date(value.startsAt) < new Date(value.endsAt),
    { message: 'validation.start_before_end', path: ['endsAt'] },
  );

/** Talabani guruhga biriktirish / ko'chirish. */
export const assignStudentToGroupSchema = z.object({
  userId: uuidSchema,
  groupId: uuidSchema,
  /** Ko'chirish sababi — buyruq raqami yoki izoh (audit uchun). */
  reason: z.string().trim().max(500).optional(),
});

export type CreateFacultyInput = z.infer<typeof createFacultySchema>;
export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>;
export type CreateSpecialityInput = z.infer<typeof createSpecialitySchema>;
export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type CreateAcademicYearInput = z.infer<typeof createAcademicYearSchema>;
export type CreateSemesterInput = z.infer<typeof createSemesterSchema>;
export type UpdateAcademicYearInput = z.infer<typeof updateAcademicYearSchema>;
export type UpdateSemesterInput = z.infer<typeof updateSemesterSchema>;
export type EducationForm = (typeof EDUCATION_FORMS)[number];
export type EducationLevel = (typeof EDUCATION_LEVELS)[number];
