/**
 * Maqsad: Next.js konfiguratsiyasi (ADR-013, F-16, NF-04).
 */

import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,

  // Docker uchun minimal image (standalone chiqish)
  output: 'standalone',

  // Monorepo: umumiy paket manbadan transpile qilinadi
  transpilePackages: ['@lms/shared'],

  /**
   * Faqat dev server: kompilyatsiya qilingan sahifalar xotirada uzoq saqlansin.
   * Standart 60 s dan keyin ishlatilmagan sahifa bo'shatiladi — ketma-ket e2e
   * testlarda har sahifa qayta "sovuq" kompilyatsiya bo'lib (8 GB mashinada
   * 10–60 s), testlar vaqt bo'yicha yiqilardi. Production build'ga ta'siri yo'q.
   */
  onDemandEntries: {
    maxInactiveAge: 60 * 60 * 1000,
    pagesBufferLength: 100,
  },

  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: '**.qdu.uz' },
    ],
    formats: ['image/webp'],
  },

  /**
   * Xavfsizlik sarlavhalari. Nginx ham o'z sarlavhalarini qo'yadi (§11) —
   * bu yerdagilar dev muhitida va Nginx'siz ishga tushirilganda amal qiladi.
   */
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(self), microphone=(self), geolocation=(self)',
          },
        ],
      },
      {
        // Service worker keshlanmasligi kerak (F-16)
        source: '/sw.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
