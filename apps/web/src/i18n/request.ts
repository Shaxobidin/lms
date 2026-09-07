/**
 * Maqsad: server tomonida so'ralgan til uchun xabarlar katalogini yuklash.
 *
 * Sayt boshqaruvi → Til → "Tilni moslashtirish" (F-17, Moodle "Language
 * customisation"): administrator ochiq sozlama `i18n.overrides` ga
 * `{ "<til>": { "nav.courses": "Fanlar" } }` ko'rinishida matnlarni qayta
 * yozadi. Ular katalog ustiga qo'yiladi; API mavjud bo'lmasa katalog o'zicha
 * ishlaydi (graceful degradation).
 */

import type { AbstractIntlMessages } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { isAppLocale, routing, type AppLocale } from './routing';

const API_URL =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

type Messages = AbstractIntlMessages;

/** `a.b.c` kalitini ichma-ich obyektga yozadi (mavjud shoxni buzmasdan). */
function setByPath(target: Messages, path: string, value: string): void {
  const parts = path.split('.').filter(Boolean);
  if (parts.length === 0) return;
  let cursor: Messages = target;
  for (const part of parts.slice(0, -1)) {
    const next = cursor[part];
    if (!next || typeof next !== 'object') cursor[part] = {};
    cursor = cursor[part] as Messages;
  }
  cursor[parts[parts.length - 1]!] = value;
}

async function loadOverrides(locale: AppLocale): Promise<Record<string, string>> {
  try {
    const response = await fetch(`${API_URL}/admin/settings/public`, {
      // Ochiq sozlamalar 60 s keshlanadi — har so'rovda API ga bormaymiz
      next: { revalidate: 60 },
    });
    if (!response.ok) return {};
    const body = (await response.json()) as { data?: Record<string, unknown> };
    const overrides = body.data?.['i18n.overrides'];
    if (!overrides || typeof overrides !== 'object') return {};
    const forLocale = (overrides as Record<string, unknown>)[locale];
    if (!forLocale || typeof forLocale !== 'object') return {};
    return Object.fromEntries(
      Object.entries(forLocale as Record<string, unknown>).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1].length > 0,
      ),
    );
  } catch {
    return {};
  }
}

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale = isAppLocale(requested) ? requested : routing.defaultLocale;

  const messages = structuredClone(
    (await import(`../../messages/${locale}.json`)).default as Messages,
  );
  for (const [key, value] of Object.entries(await loadOverrides(locale))) {
    setByPath(messages, key, value);
  }

  return {
    locale,
    messages,
    // Barcha sana/vaqt Toshkent zonasida ko'rsatiladi (NF-09)
    timeZone: 'Asia/Tashkent',
    now: new Date(),
  };
});
