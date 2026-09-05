/**
 * Maqsad: ko'p tilli marshrutlash konfiguratsiyasi (F-18).
 *
 * URL da til prefiksi bo'ladi: `/uz-Latn/courses`, `/ru/courses`.
 * Bu SEO va havolalarni ulashish uchun muhim — foydalanuvchi qaysi tilda
 * ko'rgan bo'lsa, havola ham o'sha tilda ochiladi.
 */

import { defineRouting } from 'next-intl/routing';
import { createNavigation } from 'next-intl/navigation';

export const LOCALES = ['uz-Latn', 'uz-Cyrl', 'ru', 'en'] as const;
export type AppLocale = (typeof LOCALES)[number];

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: 'uz-Latn',
  // Standart tilda ham prefiks ko'rsatiladi — bu barcha havolalarni
  // bir xil shaklda saqlaydi va tilni almashtirish mantig'ini soddalashtiradi
  localePrefix: 'always',
  localeDetection: true,
});

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

export const LOCALE_LABELS: Record<AppLocale, string> = {
  'uz-Latn': "O'zbekcha",
  'uz-Cyrl': 'Ўзбекча',
  ru: 'Русский',
  en: 'English',
};

/** `Intl` API uchun BCP-47 teglari. */
export const LOCALE_INTL_TAGS: Record<AppLocale, string> = {
  'uz-Latn': 'uz-Latn-UZ',
  'uz-Cyrl': 'uz-Cyrl-UZ',
  ru: 'ru-RU',
  en: 'en-US',
};

/**
 * Qiymat qo'llab-quvvatlanadigan tilmi.
 *
 * `next-intl@3` da `hasLocale` yordamchisi mavjud emas, shuning uchun
 * tekshiruv shu yerda amalga oshiriladi.
 */
export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}
