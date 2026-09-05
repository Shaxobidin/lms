/**
 * Maqsad: til prefiksisiz so'ralgan manzillar uchun 404 sahifasi.
 *
 * Ushbu sahifa `[locale]` segmentidan tashqarida render qilinadi, shuning
 * uchun u o'z `<html>` va `<body>` teglarini o'zi beradi.
 */

import Link from 'next/link';
import './globals.css';

export default function RootNotFound() {
  return (
    <html lang="uz-Latn">
      <body className="flex min-h-screen items-center justify-center bg-background font-sans text-foreground">
        <main className="space-y-3 px-4 text-center">
          <p className="text-5xl font-semibold text-muted-foreground">404</p>
          <h1 className="text-lg font-medium">Sahifa topilmadi</h1>
          <p className="text-sm text-muted-foreground">Страница не найдена · Page not found</p>
          <Link
            href="/uz-Latn/dashboard"
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
          >
            Bosh sahifaga qaytish
          </Link>
        </main>
      </body>
    </html>
  );
}
