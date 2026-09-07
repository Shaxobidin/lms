/**
 * Maqsad: PWA manifesti (F-16) — sayt boshqaruvidagi "Mobil ko'rinish"
 * sozlamalaridan (ilova nomi, mavzu rangi, standart til) dinamik yasaladi.
 * API mavjud bo'lmasa reestr standartlari bilan chiziladi.
 */

import type { MetadataRoute } from 'next';
import { SITE_SETTING_DEFAULTS } from '@lms/shared';

const API_URL =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

async function publicSettings(): Promise<Record<string, unknown>> {
  try {
    const response = await fetch(`${API_URL}/admin/settings/public`, {
      next: { revalidate: 60 },
    });
    if (!response.ok) return {};
    const body = (await response.json()) as { data?: Record<string, unknown> };
    return body.data ?? {};
  } catch {
    return {};
  }
}

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const settings = await publicSettings();
  const pick = <T>(key: string): T => (settings[key] ?? SITE_SETTING_DEFAULTS[key]) as T;

  const locale = pick<string>('ui.defaultLocale');
  const appTitle = pick<string>('mobile.appTitle');
  const themeColor = pick<string>('mobile.themeColor');
  const institution = pick<string>('institution.name');
  const description = pick<string>('site.description') || `${institution} o'quv platformasi`;

  return {
    name: `${appTitle} — ${institution}`,
    short_name: appTitle,
    description,
    start_url: `/${locale}/dashboard`,
    scope: '/',
    display: 'standalone',
    orientation: 'portrait-primary',
    background_color: '#ffffff',
    theme_color: themeColor,
    lang: locale,
    dir: 'ltr',
    categories: ['education', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Mening kurslarim', url: `/${locale}/my-courses` },
      { name: 'Dars jadvali', url: `/${locale}/schedule` },
      { name: 'Xabarlar', url: `/${locale}/messages` },
    ],
  };
}
