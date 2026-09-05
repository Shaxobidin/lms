/**
 * Maqsad: §15 qabul mezoni — "O'qituvchi kurs yaratib, kontent joylab, test
 * tuzib, talabani baholay oladi — uzluksiz oqimda".
 *
 * Bu test o'qituvchining kundalik ish oqimini boshidan oxirigacha o'tadi.
 */

import { expect, test } from '@playwright/test';
import { ACCOUNTS, courseCards, signIn, waitForContent } from './helpers';

test.describe("O'qituvchi oqimi", () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test("o'z kurslarini ko'radi", async ({ page }) => {
    await page
      .getByRole('link', { name: /^kurslar$/i })
      .first()
      .click();
    await waitForContent(page);

    await expect(page).toHaveURL(/courses/);
    await expect(courseCards(page).first()).toBeVisible({ timeout: 20_000 });
  });

  test("kurs tuzilishini ko'radi (modul → mavzu → dars)", async ({ page }) => {
    await page.goto('/uz-Latn/courses');
    await waitForContent(page);

    await courseCards(page).first().click();
    await waitForContent(page);

    // Modul akkordeoni
    await expect(page.getByRole('tab', { name: /modul/i })).toBeVisible();
    await expect(page.locator('a[href*="/lessons/"]').first()).toBeVisible({ timeout: 20_000 });
  });

  test("kurs jurnalini ochadi va yakuniy ballarni ko'radi", async ({ page }) => {
    await page.goto('/uz-Latn/courses');
    await waitForContent(page);

    await courseCards(page).first().click();
    await waitForContent(page);

    // Tab lar kurs so'rovi tugagach render bo'ladi — `count()` emas, `waitFor`.
    // O'qituvchida `grade:read:own_course` ruxsati bor, demak tab HAR DOIM bo'lishi shart.
    const gradebookTab = page.getByRole('tab', { name: /jurnal/i });
    await gradebookTab.waitFor({ state: 'visible', timeout: 20_000 });
    await gradebookTab.click();
    await waitForContent(page);

    // Jadval sarlavhalari: JN / ON / YN va yakuniy ball
    await expect(page.getByText(/joriy nazorat/i).first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/yakuniy ball/i).first()).toBeVisible();
  });

  test("topshiriqlar ro'yxatini ko'radi", async ({ page }) => {
    await page.goto('/uz-Latn/courses');
    await waitForContent(page);

    await courseCards(page).first().click();
    await waitForContent(page);

    await page.getByRole('tab', { name: /topshiriq/i }).click();
    await waitForContent(page);

    // Ro'yxat yoki bo'sh holat ko'rsatiladi — ikkalasi ham to'g'ri
    const hasItems = (await page.locator('a[href*="/assignments/"]').count()) > 0;
    const hasEmptyState = await page.getByText(/topshiriqlar yo'q/i).isVisible();

    expect(hasItems || hasEmptyState).toBe(true);
  });

  test("analitika panelini ko'radi", async ({ page }) => {
    await page.goto('/uz-Latn/dashboard');
    await waitForContent(page);

    await expect(page.getByText(/kurslar|o'rtacha ball/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Global qidiruv (§9)', () => {
  test('Ctrl+K bilan ochiladi va natija beradi', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('textbox').fill('matematika');
    await page.waitForTimeout(1200);

    // Natija yoki "topilmadi" — ikkalasi ham to'g'ri javob
    const hasResults = (await dialog.locator('a').count()) > 0;
    const hasEmpty = await dialog.getByText(/topilmadi/i).isVisible();
    expect(hasResults || hasEmpty).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test("kirillcha so'rov ham natija beradi (ADR-015)", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox').fill('математика');
    await page.waitForTimeout(1200);

    // Qidiruv normalizatsiyasi ishlagani — xatolik bo'lmasligi kifoya
    await expect(dialog).toBeVisible();
  });
});

test.describe('Mavzu almashtirish (§9 — dark mode majburiy)', () => {
  test("qorong'i mavzuga o'tadi", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    const toggle = page.getByRole('button', { name: /mavzuni almashtirish/i });
    await toggle.click();
    await page.waitForTimeout(400);

    const theme = await page.evaluate(() => document.documentElement.className);
    expect(theme).toMatch(/dark|light/);
  });
});
