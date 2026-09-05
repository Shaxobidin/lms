/**
 * Maqsad: e2e testlar uchun umumiy yordamchilar.
 */

import { expect, type Page } from '@playwright/test';

/** Seed'dagi demo hisoblar (prisma/seed.ts bilan mos). */
export const ACCOUNTS = {
  admin: 'admin@qdu.uz',
  rector: 'rector@qdu.uz',
  dean: 'dekan@qdu.uz',
  head: 'mudir@qdu.uz',
  methodist: 'metodist@qdu.uz',
  teacher: 'oqituvchi@qdu.uz',
  tutor: 'tyutor@qdu.uz',
  student: 'talaba@qdu.uz',
  expert: 'ekspert@qdu.uz',
} as const;

export const PASSWORD = 'Demo!2026';
export const DEFAULT_LOCALE = 'uz-Latn';

/**
 * Tizimga kirish. Login sahifasi orqali — bu haqiqiy foydalanuvchi
 * yo'lini takrorlaydi va autentifikatsiya oqimini ham tekshiradi.
 */
export async function signIn(
  page: Page,
  email: string,
  locale: string = DEFAULT_LOCALE,
): Promise<void> {
  await page.goto(`/${locale}/login`);

  await page.getByLabel(/login/i).first().fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: /kirish|войти|sign in/i }).click();

  // Kirishdan keyin login sahifasidan chiqamiz
  await expect(page).not.toHaveURL(/\/login/, { timeout: 20_000 });
}

/** Yon paneldagi band bo'yicha o'tish. */
export async function navigateTo(page: Page, linkName: RegExp): Promise<void> {
  const link = page.getByRole('link', { name: linkName }).first();
  await link.click();
}

/**
 * Sahifa mazmuni yuklanishini kutish.
 *
 * `networkidle` ISHLATILMAYDI: ilovada SSE ulanishi (`/api/v1/stream`) doimiy
 * ochiq turadi, shuning uchun tarmoq hech qachon "bo'sh" bo'lmaydi (ADR-010).
 * Buning o'rniga DOM tayyorligi va skeletonlarning yo'qolishi kutiladi.
 */
export async function waitForContent(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded');

  // Skeletonlar `aria-hidden` bilan belgilangan; ular yo'qolishini kutamiz
  await page
    .waitForFunction(() => document.querySelectorAll('[role="status"]').length === 0, undefined, {
      timeout: 15_000,
    })
    .catch(() => undefined);

  // React so'nggi renderni yakunlashi uchun qisqa pauza
  await page.waitForTimeout(300);
}

/**
 * Kurs kartalari havolasi.
 *
 * `a[href*="/courses/"]` yetarli emas: sarlavhadagi "Kurs yaratish" tugmasi
 * ham `/courses/new` ga ishora qiladi. Shuning uchun xizmat yo'llari
 * chiqarib tashlanadi.
 */
export function courseCards(page: Page) {
  return page.locator('a[href*="/courses/"]:not([href$="/new"]):not([href*="/lessons/"])');
}
