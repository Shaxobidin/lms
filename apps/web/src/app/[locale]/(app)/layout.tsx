/**
 * Maqsad: autentifikatsiya talab qiladigan sahifalar uchun umumiy qobiq.
 *
 * `(app)` — marshrut guruhi: URL ga ta'sir qilmaydi, ammo shu guruhdagi
 * barcha sahifalar `AppShell` ichida ko'rsatiladi va sessiya tekshiriladi.
 */

import type { ReactNode } from 'react';
import { AppShell } from '@/components/layout/app-shell';

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
