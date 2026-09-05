/**
 * Maqsad: tizimda qo'llab-quvvatlanadigan tillar va ular bilan ishlash qoidalari (F-18, ADR-007).
 */

export const LOCALES = ['uz-Latn', 'uz-Cyrl', 'ru', 'en'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'uz-Latn';

/**
 * Fallback zanjiri: agar matn so'ralgan tilda bo'lmasa, ketma-ket quyidagilar tekshiriladi.
 * uz-Cyrl uchun uz-Latn birinchi o'rinda — chunki translit orqali ham hosil qilish mumkin.
 */
export const LOCALE_FALLBACK: Record<Locale, readonly Locale[]> = {
  'uz-Latn': ['uz-Latn', 'uz-Cyrl', 'ru', 'en'],
  'uz-Cyrl': ['uz-Cyrl', 'uz-Latn', 'ru', 'en'],
  ru: ['ru', 'uz-Latn', 'uz-Cyrl', 'en'],
  en: ['en', 'ru', 'uz-Latn', 'uz-Cyrl'],
};

export const LOCALE_LABELS: Record<Locale, string> = {
  'uz-Latn': "O'zbekcha",
  'uz-Cyrl': 'Ўзбекча',
  ru: 'Русский',
  en: 'English',
};

/** Sana/vaqt formatlash uchun BCP-47 teglari (Intl API bilan mos). */
export const LOCALE_INTL_TAG: Record<Locale, string> = {
  'uz-Latn': 'uz-Latn-UZ',
  'uz-Cyrl': 'uz-Cyrl-UZ',
  ru: 'ru-RU',
  en: 'en-US',
};

export const TENANT_TIMEZONE = 'Asia/Tashkent';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * `Accept-Language` sarlavhasidan yoki foydalanuvchi tanlovidan xavfsiz til aniqlash.
 */
export function resolveLocale(candidate: string | null | undefined): Locale {
  if (!candidate) return DEFAULT_LOCALE;
  if (isLocale(candidate)) return candidate;

  const normalized = candidate.toLowerCase();
  if (normalized.startsWith('uz-cyrl') || normalized.startsWith('uz_cyrl')) return 'uz-Cyrl';
  if (normalized.startsWith('uz')) return 'uz-Latn';
  if (normalized.startsWith('ru')) return 'ru';
  if (normalized.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}
