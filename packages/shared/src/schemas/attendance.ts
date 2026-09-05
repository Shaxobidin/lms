/**
 * Maqsad: F-09 (davomat) va dars jadvali kontraktlari — QR/geo belgilash,
 * sabab hujjatlari, avtomatik ogohlantirish.
 */

import { z } from 'zod';
import { timeSchema, uuidSchema } from './common';

export const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'] as const;
export const ATTENDANCE_METHODS = ['MANUAL', 'QR', 'GEO', 'AUTO_VIRTUAL'] as const;
export const LESSON_TYPES = ['LECTURE', 'PRACTICE', 'LAB', 'SEMINAR', 'CONSULTATION'] as const;

export const attendanceStatusSchema = z.enum(ATTENDANCE_STATUSES);
export const attendanceMethodSchema = z.enum(ATTENDANCE_METHODS);
export const lessonTypeSchema = z.enum(LESSON_TYPES);

export const createScheduleSchema = z
  .object({
    courseId: uuidSchema,
    groupId: uuidSchema,
    teacherId: uuidSchema,
    /** 1 — dushanba ... 7 — yakshanba (ISO-8601). */
    weekday: z.coerce.number().int().min(1).max(7),
    startsAt: timeSchema,
    endsAt: timeSchema,
    room: z.string().trim().max(64).optional(),
    lessonType: lessonTypeSchema,
    /** 0 — har hafta, 1 — toq hafta, 2 — juft hafta. */
    weekParity: z.coerce.number().int().min(0).max(2).default(0),
    validFrom: z.coerce.date(),
    validUntil: z.coerce.date(),
  })
  .refine((value) => value.startsAt < value.endsAt, {
    message: 'validation.start_before_end',
    path: ['endsAt'],
  })
  .refine((value) => value.validFrom < value.validUntil, {
    message: 'validation.start_before_end',
    path: ['validUntil'],
  });

export const createClassSessionSchema = z.object({
  scheduleId: uuidSchema.nullable().optional(),
  courseId: uuidSchema,
  groupId: uuidSchema,
  teacherId: uuidSchema,
  date: z.coerce.date(),
  startsAt: timeSchema,
  endsAt: timeSchema,
  topic: z.string().trim().max(500).optional(),
  lessonType: lessonTypeSchema,
  room: z.string().trim().max(64).optional(),
});

/** QR kod generatsiyasi — token qisqa muddat amal qiladi (zabt qilishni oldini olish). */
export const generateQrSchema = z.object({
  classSessionId: uuidSchema,
  /** Amal qilish muddati (soniya), standart 300. */
  ttlSeconds: z.coerce.number().int().min(30).max(3600).default(300),
  /** Geo-cheklov yoqilsa, talabaning koordinatasi tekshiriladi. */
  geoFence: z
    .object({
      latitude: z.coerce.number().min(-90).max(90),
      longitude: z.coerce.number().min(-180).max(180),
      radiusMeters: z.coerce.number().int().min(10).max(5000),
    })
    .nullable()
    .optional(),
});

/** Talaba QR orqali o'zini belgilaydi. */
export const checkInSchema = z.object({
  token: z.string().min(10).max(512),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
});

/** O'qituvchi jurnalni to'ldiradi (ommaviy). */
export const markAttendanceSchema = z.object({
  classSessionId: uuidSchema,
  records: z
    .array(
      z.object({
        userId: uuidSchema,
        status: attendanceStatusSchema,
        comment: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(200),
});

/** Sabab hujjatini yuklash (kasallik varaqasi va h.k.). */
export const submitExcuseSchema = z.object({
  classSessionIds: z.array(uuidSchema).min(1).max(100),
  fileObjectId: uuidSchema,
  reason: z.string().trim().min(5).max(1000),
});

export const reviewExcuseSchema = z.object({
  excuseId: uuidSchema,
  approved: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
});

export const attendanceReportSchema = z.object({
  courseId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type CreateClassSessionInput = z.infer<typeof createClassSessionSchema>;
export type MarkAttendanceInput = z.infer<typeof markAttendanceSchema>;
export type CheckInInput = z.infer<typeof checkInSchema>;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];
export type LessonType = (typeof LESSON_TYPES)[number];
