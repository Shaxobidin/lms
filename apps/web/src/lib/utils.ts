/**
 * Maqsad: UI uchun umumiy yordamchilar.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { resolveLocalized, type LocalizedText } from '@lms/shared';
import type { AppLocale } from '@/i18n/routing';
import { LOCALE_INTL_TAGS } from '@/i18n/routing';

/** Tailwind sinflarini xavfsiz birlashtirish (ziddiyatlar yechiladi). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Ko'p tilli matnni joriy tilda ko'rsatish. */
export function localize(value: unknown, locale: AppLocale, fallback = '—'): string {
  if (typeof value === 'string') return value || fallback;
  if (!value || typeof value !== 'object') return fallback;
  return resolveLocalized(value as LocalizedText, locale) || fallback;
}

export function formatDate(value: string | Date | null | undefined, locale: AppLocale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE_INTL_TAGS[locale], {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date | null | undefined, locale: AppLocale): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat(LOCALE_INTL_TAGS[locale], {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tashkent',
  }).format(new Date(value));
}

/** Sekundlarni `MM:SS` yoki `HH:MM:SS` ko'rinishida (test taymeri uchun). */
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;

  const pad = (value: number) => String(value).padStart(2, '0');
  return hours > 0
    ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
}

/** F.I.Sh. dan initsiallar (avatar uchun). */
export function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}

/** Ball bo'yicha semantik rang sinfi (§9 — holat ranglari). */
export function scoreColorClass(score: number): string {
  if (score >= 86) return 'text-success';
  if (score >= 60) return 'text-foreground';
  return 'text-destructive';
}

/** Muddat holatiga qarab rang. */
export function deadlineColorClass(dueAt: string | Date | null | undefined): string {
  if (!dueAt) return 'text-muted-foreground';
  const remaining = new Date(dueAt).getTime() - Date.now();
  if (remaining < 0) return 'text-destructive';
  if (remaining < 86_400_000) return 'text-warning';
  return 'text-muted-foreground';
}
