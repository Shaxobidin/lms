/**
 * Maqsad: parolni tiklash oqimi (F-01) — kirish sahifasidagi havola ishlashi va
 * ikkala sahifa 404 bermasligi tekshiriladi.
 *
 * Nima uchun kerak: bu havola avval mavjud bo'lmagan sahifaga olib borardi.
 * Test regressiyani qaytadan yuz berishidan saqlaydi.
 */

import { expect, test } from '@playwright/test';

test.describe('Parolni tiklash oqimi', () => {
  test("kirish sahifasidagi havola so'rov sahifasini ochadi", async ({ page }) => {
    await page.goto('/uz-Latn/login');
    await page.getByRole('link', { name: /parolni unutdingizmi/i }).click();

    await expect(page).toHaveURL(/forgot-password/);
    await expect(page.getByLabel(/elektron pochta/i)).toBeVisible();
  });

  test("email yuborilgach tasdiq xabari ko'rsatiladi", async ({ page }) => {
    await page.goto('/uz-Latn/forgot-password');
    await page.getByLabel(/elektron pochta/i).fill('talaba@qdu.uz');
    await page.getByRole('button', { name: /tiklash havolasini yuborish/i }).click();

    // Server email mavjudligini oshkor qilmaydi — javob har doim bir xil
    await expect(page.getByRole('status')).toContainText(/tiklash havolasi/i, {
      timeout: 15_000,
    });
  });

  test("noto'g'ri email uchun inline validatsiya ishlaydi", async ({ page }) => {
    await page.goto('/uz-Latn/forgot-password');
    await page.getByLabel(/elektron pochta/i).fill('email-emas');
    await page.getByRole('button', { name: /tiklash havolasini yuborish/i }).click();

    await expect(page.locator('#email-error')).toBeVisible();
  });

  test('tokensiz ochilgan tiklash sahifasi ogohlantiradi', async ({ page }) => {
    await page.goto('/uz-Latn/reset-password');

    await expect(page.getByRole('alert').filter({ hasText: /havola/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /parolni unutdingizmi/i })).toBeVisible();
  });

  test("token bilan ochilganda parol formasi ko'rsatiladi", async ({ page }) => {
    await page.goto(`/uz-Latn/reset-password?token=${'a'.repeat(40)}`);

    await expect(page.getByLabel(/yangi parol/i)).toBeVisible();
    await expect(page.getByLabel(/parolni tasdiqlang/i)).toBeVisible();
  });

  test('mos kelmagan parollar yuborilmaydi', async ({ page }) => {
    await page.goto(`/uz-Latn/reset-password?token=${'a'.repeat(40)}`);
    await page.getByLabel(/yangi parol/i).fill('Parol12345');
    await page.getByLabel(/parolni tasdiqlang/i).fill('Parol54321');
    await page.getByRole('button', { name: /^parolni tiklash$/i }).click();

    await expect(page.locator('#password-confirm-error')).toBeVisible();
  });
});
