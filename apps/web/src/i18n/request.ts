/**
 * Maqsad: server tomonida so'ralgan til uchun xabarlar katalogini yuklash.
 */

import { getRequestConfig } from 'next-intl/server';
import { isAppLocale, routing, type AppLocale } from './routing';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: AppLocale = isAppLocale(requested) ? requested : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    // Barcha sana/vaqt Toshkent zonasida ko'rsatiladi (NF-09)
    timeZone: 'Asia/Tashkent',
    now: new Date(),
  };
});
