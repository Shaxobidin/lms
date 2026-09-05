/**
 * Maqsad: F-12 (sertifikat), F-13 (analitika) va F-14 (hujjat aylanishi) kontraktlari.
 */

import { z } from 'zod';
import { uuidSchema } from './common';
import { localizedTextSchema } from '../types/localized';

// --- F-12 Sertifikat --------------------------------------------------------

export const createCertificateTemplateSchema = z.object({
  name: localizedTextSchema,
  /** Handlebars-ga o'xshash `{{field}}` o'rinbosarlari bilan HTML. */
  htmlTemplate: z.string().min(20).max(200_000),
  cssTemplate: z.string().max(100_000).default(''),
  orientation: z.enum(['PORTRAIT', 'LANDSCAPE']).default('LANDSCAPE'),
  /** Shablonda ishlatiladigan maydonlar ro'yxati — validatsiya uchun. */
  fields: z.array(z.string().trim().max(64)).max(50).default([]),
  isActive: z.boolean().default(true),
});

export const issueCertificateSchema = z.object({
  templateId: uuidSchema,
  courseId: uuidSchema,
  /** Bo'sh bo'lsa — kursni tugatgan barcha talabalarga (ommaviy berish). */
  userIds: z.array(uuidSchema).max(1000).default([]),
  /** Amal qilish muddati; null — muddatsiz. */
  expiresAt: z.coerce.date().nullable().optional(),
  /** Qo'shimcha maydonlar (masalan, bitiruv ishi mavzusi). */
  extraFields: z.record(z.string().max(500)).optional(),
});

export const revokeCertificateSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
});

/** Ochiq verifikatsiya — autentifikatsiyasiz endpoint. */
export const verifyCertificateSchema = z.object({
  code: z.string().trim().min(6).max(64),
});

// --- F-14 Hujjat aylanishi --------------------------------------------------

export const DOCUMENT_TEMPLATES = [
  'RATING_SHEET', // reyting varaqasi
  'ORDER_DRAFT', // buyruq loyihasi
  'REFERENCE', // ma'lumotnoma
  'PROTOCOL', // protokol
  'TRANSCRIPT', // transkript
  'ATTENDANCE_SHEET', // davomat jadvali
  'SYLLABUS', // sillabus (O'UM)
] as const;

export const documentTemplateSchema = z.enum(DOCUMENT_TEMPLATES);
export const documentFormatSchema = z.enum(['DOCX', 'PDF', 'XLSX', 'CSV']);

const generateDocumentBaseSchema = z.object({
  template: documentTemplateSchema,
  format: documentFormatSchema.default('DOCX'),
  params: z.record(z.unknown()),
  /** Hujjat elektron imzolanishi kerakmi (A-05). */
  requireSignature: z.boolean().default(false),
});

/** Reyting varaqasi parametrlari (GOST 7.32 talablariga muvofiq shakllantiriladi). */
export const ratingSheetParamsSchema = z.object({
  courseId: uuidSchema,
  groupId: uuidSchema,
  semesterId: uuidSchema,
  /** Qaysi nazorat turlari kiritilsin; bo'sh — barchasi. */
  controlTypes: z
    .array(z.enum(['JN', 'ON', 'YN']))
    .max(3)
    .default([]),
  /** Imzolovchilar. */
  signatories: z
    .array(z.object({ role: z.string().max(120), fullName: z.string().max(200) }))
    .max(6)
    .default([]),
});

export const orderDraftParamsSchema = z.object({
  orderType: z.enum([
    'ENROLLMENT',
    'EXPULSION',
    'TRANSFER',
    'ACADEMIC_LEAVE',
    'REINSTATEMENT',
    'SCHOLARSHIP',
  ]),
  subjectUserIds: z.array(uuidSchema).min(1).max(500),
  reason: z.string().trim().min(5).max(2000),
  effectiveDate: z.coerce.date(),
  documentNumber: z.string().trim().max(64).optional(),
});

export const referenceParamsSchema = z.object({
  userId: uuidSchema,
  purpose: z.string().trim().min(3).max(500),
  includeGrades: z.boolean().default(false),
  academicYearId: uuidSchema.optional(),
});

export const transcriptParamsSchema = z.object({
  userId: uuidSchema,
  /** Bo'sh bo'lsa — barcha semestrlar. */
  semesterIds: z.array(uuidSchema).max(20).default([]),
  includeGpa: z.boolean().default(true),
});

/** Davomat jadvali parametrlari. */
export const attendanceSheetParamsSchema = z.object({
  courseId: uuidSchema,
  groupId: uuidSchema,
});

/** Protokol parametrlari (kengash yoki komissiya bayonnomasi). */
export const protocolParamsSchema = z.object({
  title: z.string().trim().min(3).max(500),
  meetingDate: z.coerce.date(),
  participants: z.array(z.string().trim().max(200)).min(1).max(100),
  agenda: z.array(z.string().trim().min(3).max(1000)).min(1).max(50),
  decisions: z.array(z.string().trim().min(3).max(2000)).max(50).default([]),
});

/** Sillabus (O'UM) hujjati parametrlari. */
export const syllabusDocumentParamsSchema = z.object({
  syllabusId: uuidSchema,
  includeAssessment: z.boolean().default(true),
});

export const signDocumentSchema = z.object({
  documentId: uuidSchema,
  /** E-IMZO plaginidan olingan PKCS#7 imzo (base64). */
  signature: z.string().min(20).max(200_000),
  certificateSerial: z.string().trim().max(128),
  signerFullName: z.string().trim().max(200),
});

// --- F-13 Analitika ---------------------------------------------------------

export const analyticsQuerySchema = z.object({
  facultyId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  courseId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  semesterId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const exportRequestSchema = analyticsQuerySchema.extend({
  report: z.enum([
    'PERFORMANCE',
    'ATTENDANCE',
    'ACTIVITY',
    'AT_RISK',
    'COURSE_COMPLETION',
    'TEACHER_WORKLOAD',
  ]),
  format: z.enum(['XLSX', 'CSV', 'PDF']).default('XLSX'),
});

/** Early-warning: xavf ostidagi talabalarni aniqlash mezonlari (F-13). */
export interface RiskFactors {
  /** Davomat foizi chegaradan past. */
  lowAttendance: boolean;
  /** Topshiriqlar kechiktirilgan yoki topshirilmagan. */
  missedAssignments: number;
  /** Joriy ball saralash chegarasidan past. */
  lowScore: boolean;
  /** Oxirgi faollikdan beri o'tgan kunlar. */
  inactiveDays: number;
}

export interface RiskAssessment {
  userId: string;
  /** 0..100 — qanchalik yuqori bo'lsa, shunchalik xavfli. */
  riskScore: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: RiskFactors;
  /** Tavsiya etilgan chora (i18n kaliti). */
  recommendationKeys: string[];
}

/**
 * Shablon -> parametrlar sxemasi. Bu jadval `generateDocumentSchema` da
 * ishlatiladi: har bir shablon FAQAT o'ziga tegishli parametrlarni qabul qiladi.
 */
export const DOCUMENT_PARAMS_SCHEMAS = {
  RATING_SHEET: ratingSheetParamsSchema,
  ORDER_DRAFT: orderDraftParamsSchema,
  REFERENCE: referenceParamsSchema,
  TRANSCRIPT: transcriptParamsSchema,
  ATTENDANCE_SHEET: attendanceSheetParamsSchema,
  PROTOCOL: protocolParamsSchema,
  SYLLABUS: syllabusDocumentParamsSchema,
} as const satisfies Record<DocumentTemplate, z.ZodTypeAny>;

/**
 * Hujjat generatsiyasi so'rovi.
 *
 * `params` shablonga qarab tekshiriladi: xatolik `params.groupId` kabi
 * to'liq yo'l bilan qaytadi, shuning uchun mijoz aynan qaysi maydon
 * noto'g'riligini ko'rsata oladi (§8 — maydon darajasidagi xatoliklar).
 */
export const generateDocumentSchema = generateDocumentBaseSchema.superRefine((value, ctx) => {
  const schema = DOCUMENT_PARAMS_SCHEMAS[value.template];
  const parsed = schema.safeParse(value.params);
  if (parsed.success) return;

  for (const issue of parsed.error.issues) {
    ctx.addIssue({ ...issue, path: ['params', ...issue.path] });
  }
});

export type GenerateDocumentInput = z.infer<typeof generateDocumentSchema>;
export type RatingSheetParams = z.infer<typeof ratingSheetParamsSchema>;
export type OrderDraftParams = z.infer<typeof orderDraftParamsSchema>;
export type ReferenceParams = z.infer<typeof referenceParamsSchema>;
export type TranscriptParams = z.infer<typeof transcriptParamsSchema>;
export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>;
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];
