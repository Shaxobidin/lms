/**
 * Maqsad: barcha sxemalarda takrorlanadigan primitivlar (ADR-011).
 */

import { z } from 'zod';
import { LOCALES } from '../constants/locales';

export const uuidSchema = z.string().uuid({ message: 'validation.uuid' });

/**
 * Tashqi manzil — faqat `http(s)`. Zod `url()` har qanday sxemani (`javascript:`,
 * `data:`) qabul qiladi; talabaga havola sifatida ko'rsatiladigan manzil uchun
 * bu XSS yo'li bo'lardi.
 */
export const httpUrlSchema = z
  .string()
  .trim()
  .max(2048)
  .url({ message: 'validation.url' })
  .refine((value) => /^https?:\/\//i.test(value), { message: 'validation.url_http_only' });

export const localeSchema = z.enum(LOCALES);

/** O'zbekiston telefon raqami: `+998` va 9 ta raqam (probel/tirelar tozalanadi). */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .pipe(z.string().regex(/^\+998\d{9}$/, { message: 'validation.phone_uz' }));

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email({ message: 'validation.email' })
  .max(254);

/** Kod maydonlari: fakultet, kafedra, fan — faqat lotin harflari, raqam, tire. */
export const codeSchema = z
  .string()
  .trim()
  .min(2)
  .max(32)
  .regex(/^[A-Za-z0-9._-]+$/, { message: 'validation.code_format' });

export const positiveIntSchema = z.coerce.number().int().positive();
export const nonNegativeIntSchema = z.coerce.number().int().min(0);

/** 0..100 oralig'idagi ball. */
export const scoreSchema = z.coerce.number().min(0).max(100);

/** ISO 8601 sana-vaqt; API'da doim UTC (NF-09, A-25). */
export const isoDateTimeSchema = z.coerce.date();

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.date_format' });

/** HH:mm — dars jadvali uchun. */
export const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, { message: 'validation.time_format' });

export const idParamSchema = z.object({ id: uuidSchema });

/**
 * Foydalanuvchi kiritgan HTML uchun uzunlik chegarasi.
 * Sanitizatsiya backend'da DOMPurify (jsdom) orqali qilinadi — bu yerda faqat hajm.
 */
export const richTextSchema = z.string().max(500_000);

/** Qidiruv so'rovi: bo'sh bo'lishi mumkin, ammo 200 belgidan uzun emas. */
export const searchQuerySchema = z.string().trim().max(200).optional();

/**
 * Fayl MIME turlari oq ro'yxati (§11 — MIME va magic bytes tekshiruvi).
 * Ro'yxat backend'dagi `MAGIC_SIGNATURES` bilan mos bo'lishi shart.
 */
export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'video/mp4',
  'video/webm',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
  'text/plain',
  'text/csv',
  /** QTI import — matnli tur, magic bytes tekshiruvi talab qilinmaydi. */
  'text/xml',
] as const;

export const mimeTypeSchema = z.enum(ALLOWED_MIME_TYPES);
