/**
 * Maqsad: ko'p tilli matn tipi va uni yechish (resolve) yordamchilari (ADR-007, A-15).
 * Domen kontenti bazada `jsonb` sifatida shu shaklda saqlanadi.
 */

import { z } from 'zod';
import { DEFAULT_LOCALE, LOCALE_FALLBACK, LOCALES, type Locale } from '../constants/locales';

/** Kamida bitta tilda matn bo'lishi shart. */
export type LocalizedText = Partial<Record<Locale, string>>;

export const localizedTextSchema = z
  .object({
    'uz-Latn': z.string().trim().min(1).max(4000).optional(),
    'uz-Cyrl': z.string().trim().min(1).max(4000).optional(),
    ru: z.string().trim().min(1).max(4000).optional(),
    en: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((value) => LOCALES.some((locale) => Boolean(value[locale])), {
    message: 'localized.at_least_one_locale_required',
  });

/**
 * Uzun matnlar (tavsif, dars mazmuni, sillabus bo'limlari) uchun kengaytirilgan limit.
 * Bo'sh bo'lishi MUMKIN: Moodle kabi tavsifsiz element yoki hali yozilmagan dars
 * yaroqli holat — majburiylik `localizedTextSchema` (sarlavha) da.
 */
export const localizedRichTextSchema = z.object({
  'uz-Latn': z.string().trim().max(200_000).optional(),
  'uz-Cyrl': z.string().trim().max(200_000).optional(),
  ru: z.string().trim().max(200_000).optional(),
  en: z.string().trim().max(200_000).optional(),
});

/**
 * Matnni so'ralgan tilda qaytaradi; bo'lmasa fallback zanjiri bo'yicha izlaydi.
 * Hech qanday til topilmasa — bo'sh satr (UI'da "—" ko'rsatiladi).
 */
export function resolveLocalized(
  text: LocalizedText | null | undefined,
  locale: Locale = DEFAULT_LOCALE,
): string {
  if (!text) return '';
  for (const candidate of LOCALE_FALLBACK[locale]) {
    const value = text[candidate];
    if (value && value.trim().length > 0) return value;
  }
  return '';
}

/** Barcha tillardagi qiymatlarni bitta qatorga birlashtiradi (qidiruv indeksi uchun). */
export function flattenLocalized(text: LocalizedText | null | undefined): string {
  if (!text) return '';
  return LOCALES.map((locale) => text[locale] ?? '')
    .filter(Boolean)
    .join(' ');
}

/** Qaysi tillar to'ldirilmagan — sifat monitoringi (F-05, RSK-07) uchun. */
export function missingLocales(text: LocalizedText | null | undefined): Locale[] {
  return LOCALES.filter((locale) => !text?.[locale]?.trim());
}
