/**
 * Maqsad: API javob konverti va xatolik kontrakti (promt.md §8, ADR: docs/01-architecture.md §5).
 * Backend ham, frontend ham aynan shu tiplardan foydalanadi.
 */

import { z } from 'zod';
import type { LocalizedText } from './localized';

/** Ro'yxat javoblari uchun meta ma'lumot. */
export interface ApiMeta {
  page?: number;
  perPage?: number;
  total?: number;
  nextCursor?: string | null;
  hasMore?: boolean;
  [key: string]: unknown;
}

export interface ApiFieldError {
  field: string;
  code: string;
  params?: Record<string, unknown>;
}

export interface ApiError {
  /** Mashina o'qiydigan kod, masalan `VALIDATION_ERROR`. */
  code: ErrorCode;
  /** i18n kaliti — frontend shu kalit bo'yicha matn ko'rsatadi (P7). */
  messageKey: string;
  /** Kalit topilmasa ishlatiladigan zaxira matn (barcha tillarda). */
  message: LocalizedText;
  details?: ApiFieldError[];
  /** Loglar bilan bog'lash uchun (NF-07). */
  traceId?: string;
  /** 429 uchun — necha soniyadan keyin qayta urinish mumkin. */
  retryAfterSeconds?: number;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T | null;
  meta: ApiMeta | null;
  error: ApiError | null;
}

export const ERROR_CODES = [
  'VALIDATION_ERROR',
  'UNAUTHENTICATED',
  'INVALID_CREDENTIALS',
  'TWO_FACTOR_REQUIRED',
  'ACCOUNT_LOCKED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'IDEMPOTENCY_CONFLICT',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'BUSINESS_RULE_VIOLATION',
  'RATE_LIMITED',
  'DEPENDENCY_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

export const ERROR_HTTP_STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  TWO_FACTOR_REQUIRED: 401,
  ACCOUNT_LOCKED: 423,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  IDEMPOTENCY_CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  BUSINESS_RULE_VIOLATION: 422,
  RATE_LIMITED: 429,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL_ERROR: 500,
};

export function ok<T>(data: T, meta?: ApiMeta): ApiEnvelope<T> {
  return { success: true, data, meta: meta ?? null, error: null };
}

export function fail(error: ApiError): ApiEnvelope<never> {
  return { success: false, data: null, meta: null, error };
}

// --- Pagination kontrakti ---------------------------------------------------

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;

/** Cursor-based pagination (katta ro'yxatlar uchun — promt.md §8). */
export const cursorPaginationSchema = z.object({
  cursor: z.string().max(512).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

/** Offset pagination — faqat kichik lug'atlar uchun (fakultetlar, rollar). */
export const offsetPaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});

export const sortSchema = z.object({
  sortBy: z.string().max(64).optional(),
  sortDir: z.enum(['asc', 'desc']).default('desc'),
});

export type CursorPagination = z.infer<typeof cursorPaginationSchema>;
export type OffsetPagination = z.infer<typeof offsetPaginationSchema>;
export type SortParams = z.infer<typeof sortSchema>;

/**
 * Cursor — bazadagi tartib kalitini shifrlamasdan, ammo ochiq ko'rinishda ham
 * bermaslik uchun base64url da uzatiladi. Ichida `{ id, createdAt }` bo'ladi.
 */
export function encodeCursor(payload: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

export function decodeCursor<T = Record<string, unknown>>(cursor: string): T | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}
