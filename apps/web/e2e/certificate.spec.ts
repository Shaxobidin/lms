/**
 * Maqsad: §15 qabul mezoni — "Sertifikat PDF generatsiya qilinadi va QR orqali
 * tekshiriladi".
 *
 * Ushbu test ochiq verifikatsiya sahifasini tekshiradi: u autentifikatsiyasiz
 * ishlashi va noto'g'ri kodda ham to'g'ri javob berishi kerak.
 */

import { expect, test } from '@playwright/test';

test.describe('Sertifikat verifikatsiyasi (ochiq sahifa)', () => {
  test("mavjud bo'lmagan kod uchun aniq javob beradi", async ({ page }) => {
    await page.goto('/uz-Latn/verify/mavjud-emas-kod-12345');

    await expect(page.getByText(/topilmadi|bekor qilingan/i)).toBeVisible({ timeout: 20_000 });
    // Autentifikatsiya talab qilinmasligi kerak
    await expect(page).not.toHaveURL(/\/login/);
  });

  test('sahifa 4 tilda ochiladi', async ({ page }) => {
    for (const locale of ['uz-Latn', 'uz-Cyrl', 'ru', 'en']) {
      const response = await page.goto(`/${locale}/verify/test-kod`);
      expect(response?.status()).toBe(200);
    }
  });

  test("verifikatsiya kodi sahifada ko'rsatiladi", async ({ page }) => {
    await page.goto('/uz-Latn/verify/ABC123XYZ');
    await expect(page.getByText('ABC123XYZ')).toBeVisible({ timeout: 20_000 });
  });
});
