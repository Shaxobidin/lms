/**
 * Maqsad: til bo'yicha ildiz layout — `<html lang>`, shrift, provayderlar (F-18).
 */

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import type { ReactNode } from 'react';
import { isAppLocale, routing, type AppLocale } from '@/i18n/routing';
import { Providers } from '@/components/providers';

// Inter kirill va lotin yozuvlarini qo'llab-quvvatlaydi (§9 talabi)
const inter = Inter({
  subsets: ['latin', 'latin-ext', 'cyrillic'],
  variable: '--font-inter',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // 320 px dan 2560 px gacha (NF-06); masshtablash bloklanmaydi (NF-05)
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#12161f' },
  ],
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'app' });

  return {
    title: { default: `${t('name')} — ${t('tagline')}`, template: `%s · ${t('name')}` },
    description: t('tagline'),
    applicationName: t('name'),
    manifest: '/manifest.webmanifest',
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
    icons: { icon: '/icons/icon-192.png', apple: '/icons/icon-192.png' },
    formatDetection: { telephone: false },
  };
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();

  setRequestLocale(locale);
  const messages = await getMessages();
  const t = await getTranslations({ locale, namespace: 'a11y' });

  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen bg-background font-sans">
        {/* Klaviatura foydalanuvchilari uchun (WCAG 2.4.1) */}
        <a href="#main-content" className="skip-link">
          {t('skipToContent')}
        </a>

        <NextIntlClientProvider messages={messages} locale={locale as AppLocale}>
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
