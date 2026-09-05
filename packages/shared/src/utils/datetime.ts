/**
 * Maqsad: sana va vaqt bilan ishlash — barcha ko'rsatishlar Toshkent zonasida (NF-09, A-25).
 *
 * Qoida: bazada va API'da doim UTC; faqat foydalanuvchiga ko'rsatishda
 * `Asia/Tashkent` ga o'giriladi. Tashqi kutubxona ishlatilmaydi — `Intl` yetarli.
 */

import { LOCALE_INTL_TAG, TENANT_TIMEZONE, type Locale } from '../constants/locales';

export type DateInput = Date | string | number;

export function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

/** Sana: 2026-09-04 -> "4-sentabr, 2026" (tilga qarab). */
export function formatDate(value: DateInput, locale: Locale = 'uz-Latn'): string {
  return new Intl.DateTimeFormat(LOCALE_INTL_TAG[locale], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: TENANT_TIMEZONE,
  }).format(toDate(value));
}

/** Sana va vaqt. */
export function formatDateTime(value: DateInput, locale: Locale = 'uz-Latn'): string {
  return new Intl.DateTimeFormat(LOCALE_INTL_TAG[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TENANT_TIMEZONE,
  }).format(toDate(value));
}

/** Faqat vaqt — dars jadvali uchun. */
export function formatTime(value: DateInput, locale: Locale = 'uz-Latn'): string {
  return new Intl.DateTimeFormat(LOCALE_INTL_TAG[locale], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TENANT_TIMEZONE,
  }).format(toDate(value));
}

/** Hujjatlar uchun rasmiy format: 04.09.2026 (GOST 7.32). */
export function formatOfficialDate(value: DateInput): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: TENANT_TIMEZONE,
  }).formatToParts(toDate(value));

  const day = parts.find((p) => p.type === 'day')?.value ?? '01';
  const month = parts.find((p) => p.type === 'month')?.value ?? '01';
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970';
  return `${day}.${month}.${year}`;
}

/** ISO sana (YYYY-MM-DD) — Toshkent zonasidagi kalendar kuni. */
export function toTashkentDateKey(value: DateInput): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TENANT_TIMEZONE,
  }).format(toDate(value));
  return parts;
}

/** Ikki sana orasidagi to'liq kunlar soni. */
export function daysBetween(from: DateInput, to: DateInput): number {
  const ms = toDate(to).getTime() - toDate(from).getTime();
  return Math.floor(ms / 86_400_000);
}

/** Nisbiy vaqt: "3 kun oldin", "2 soatdan keyin". */
export function formatRelative(
  value: DateInput,
  locale: Locale = 'uz-Latn',
  now = new Date(),
): string {
  const formatter = new Intl.RelativeTimeFormat(LOCALE_INTL_TAG[locale], { numeric: 'auto' });
  const diffSeconds = Math.round((toDate(value).getTime() - now.getTime()) / 1000);
  const absSeconds = Math.abs(diffSeconds);

  if (absSeconds < 60) return formatter.format(diffSeconds, 'second');
  if (absSeconds < 3600) return formatter.format(Math.round(diffSeconds / 60), 'minute');
  if (absSeconds < 86_400) return formatter.format(Math.round(diffSeconds / 3600), 'hour');
  if (absSeconds < 2_592_000) return formatter.format(Math.round(diffSeconds / 86_400), 'day');
  if (absSeconds < 31_536_000)
    return formatter.format(Math.round(diffSeconds / 2_592_000), 'month');
  return formatter.format(Math.round(diffSeconds / 31_536_000), 'year');
}

/** Muddat o'tganmi. */
export function isOverdue(dueAt: DateInput, now: DateInput = new Date()): boolean {
  return toDate(now).getTime() > toDate(dueAt).getTime();
}

/**
 * O'quv haftasining tartib raqami (semestr boshidan).
 * Dars jadvalidagi juft/toq hafta hisobi uchun ishlatiladi.
 */
export function academicWeekNumber(semesterStart: DateInput, date: DateInput = new Date()): number {
  const days = daysBetween(semesterStart, date);
  return days < 0 ? 0 : Math.floor(days / 7) + 1;
}

/** Dars vaqti ("HH:mm") ni sana bilan birlashtirib UTC Date hosil qiladi. */
export function combineDateAndTime(dateKey: string, time: string): Date {
  // Toshkent UTC+5, yozgi vaqt yo'q — shuning uchun ofset doimiy
  return new Date(`${dateKey}T${time}:00+05:00`);
}
