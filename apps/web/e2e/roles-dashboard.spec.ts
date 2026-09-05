/**
 * Maqsad: §15 qabul mezoni — "Seed ma'lumotlar bilan har bir rol uchun kirish
 * mumkin va dashboard to'liq ishlaydi".
 */

import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';

test.describe("Rollar bo'yicha kirish", () => {
  for (const [role, email] of Object.entries(ACCOUNTS)) {
    test(`${role} tizimga kira oladi va o'z panelini ko'radi`, async ({ page }) => {
      await signIn(page, email);

      // Yon panel va foydalanuvchi ismi ko'rinadi
      await expect(page.getByRole('link', { name: /QDU LMS/i }).first()).toBeVisible();
      await expect(page.getByRole('button', { name: /chiqish|выход|sign out/i })).toBeVisible();

      // Konsolda xatolik bo'lmasligi kerak
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.waitForTimeout(500);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('Autentifikatsiya xavfsizligi', () => {
  test("noto'g'ri parol rad etiladi", async ({ page }) => {
    await page.goto('/uz-Latn/login');

    await page.getByLabel(/login/i).first().fill(ACCOUNTS.student);
    await page.locator('#password').fill('butunlay-notogri-parol');
    await page.getByRole('button', { name: /kirish/i }).click();

    await expect(page.getByRole('status').or(page.getByRole('alert'))).toBeVisible({
      timeout: 15_000,
    });
    await expect(page).toHaveURL(/\/login/);
  });

  test("autentifikatsiyasiz himoyalangan sahifa login ga yo'naltiradi", async ({ page }) => {
    await page.goto('/uz-Latn/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });

  test('chiqishdan keyin sessiya tugaydi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);
    await page.getByRole('button', { name: /chiqish/i }).click();

    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });

    // Orqaga qaytish ham himoyalangan sahifani ochmasligi kerak
    await page.goto('/uz-Latn/dashboard');
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});

test.describe('Ruxsatlar modeli (UI darajasida)', () => {
  test("talaba administrator bo'limlarini ko'rmaydi", async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await expect(page.getByRole('link', { name: /audit/i })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /foydalanuvchilar/i })).toHaveCount(0);
  });

  test("administrator boshqaruv bo'limlarini ko'radi", async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);

    await expect(page.getByRole('link', { name: /audit/i }).first()).toBeVisible();
  });

  test("o'qituvchi kurslar bo'limini ko'radi", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
    await expect(page.getByRole('link', { name: /^kurslar$/i }).first()).toBeVisible();
  });
});
