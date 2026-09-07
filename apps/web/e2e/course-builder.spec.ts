/**
 * Maqsad: kurs konstruktori interfeysi (F-04) — o'qituvchi tuzilmani
 * BRAUZERDAN yarata olishini tekshirish.
 *
 * API darajasidagi tekshiruv `scripts/check-course-builder.mjs` da; bu yerda
 * aynan interfeys tekshiriladi: tahrirlash rejimi, oyna, ro'yxatda paydo
 * bo'lishi va o'chirish.
 */

import { expect, test, type Page } from '@playwright/test';
import { ACCOUNTS, courseCards, signIn, waitForContent } from './helpers';

/** Tahrirlash rejimini yoqib, birinchi kursni ochadi. */
async function openBuilder(page: Page) {
  await page.goto('/uz-Latn/courses');
  await waitForContent(page);

  await courseCards(page).first().click();
  await waitForContent(page);

  const toggle = page.getByRole('switch', { name: /tahrirlash rejimi/i });
  await toggle.waitFor({ state: 'visible', timeout: 20_000 });
  await toggle.click();
}

test.describe('Kurs konstruktori', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test('tahrirlash rejimi yoqiladi va amallar paydo bo`ladi', async ({ page }) => {
    await openBuilder(page);

    // Modul qo'shish tugmasi faqat tahrirlash rejimida bo'ladi
    await expect(page.getByRole('button', { name: /modul qo.shish/i }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^tahrirlash$/i }).first()).toBeVisible();
  });

  test('modul yaratiladi va ro`yxatda ko`rinadi', async ({ page }) => {
    await openBuilder(page);

    const name = `E2E modul ${Date.now()}`;

    await page
      .getByRole('button', { name: /modul qo.shish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog
      .getByLabel(/^sarlavha/i)
      .first()
      .fill(name);
    await dialog.getByRole('button', { name: /^saqlash$/i }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });
  });

  test('modul o`chiriladi va tasdiqlash so`raladi', async ({ page }) => {
    await openBuilder(page);

    const name = `O'chiriladigan ${Date.now()}`;

    await page
      .getByRole('button', { name: /modul qo.shish/i })
      .first()
      .click();
    const createDialog = page.getByRole('dialog');
    await createDialog
      .getByLabel(/^sarlavha/i)
      .first()
      .fill(name);
    await createDialog.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(page.getByText(name)).toBeVisible({ timeout: 15_000 });

    // Yaratilgan modul qatoridagi o'chirish tugmasi
    const row = page.getByTestId('module-row').filter({ hasText: name });
    await row.getByRole('button', { name: /^o.chirish$/i }).click();

    const confirm = page.getByRole('dialog');
    await expect(confirm).toBeVisible();
    await expect(confirm).toContainText(/mavzulari va darslari/i);

    await confirm.getByRole('button', { name: /^o.chirish$/i }).click();
    await expect(page.getByText(name)).toBeHidden({ timeout: 15_000 });
  });

  test('ko`p tilli maydon boshqa tillarni ochadi', async ({ page }) => {
    await openBuilder(page);

    await page
      .getByRole('button', { name: /modul qo.shish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /boshqa tillar/i }).click();

    await expect(dialog.getByLabel('ru', { exact: true })).toBeVisible();
    await expect(dialog.getByLabel('en', { exact: true })).toBeVisible();
  });

  test('talabada tahrirlash rejimi yo`q', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);
    await page.goto('/uz-Latn/my-courses');
    await waitForContent(page);

    await courseCards(page).first().click();
    await waitForContent(page);

    await expect(page.getByRole('switch', { name: /tahrirlash rejimi/i })).toHaveCount(0);
  });
});

test.describe('Element tanlash oynasi', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  /** Konstruktorda mavzu topib, element tanlash oynasini ochadi. */
  async function openChooser(page: Page) {
    await openBuilder(page);

    const addButton = page.getByRole('button', { name: /faoliyat yoki resurs qo.shish/i }).first();
    await addButton.waitFor({ state: 'visible', timeout: 20_000 });
    await addButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    return dialog;
  }

  test('barcha turlar toifalar bo`yicha ko`rsatiladi', async ({ page }) => {
    const dialog = await openChooser(page);

    // Faoliyatlar
    await expect(dialog.getByText('Topshiriq', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Test', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Forum', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Onlayn dars', { exact: true })).toBeVisible();
    await expect(dialog.getByText('SCORM paketi', { exact: true })).toBeVisible();

    // Resurslar
    await expect(dialog.getByText('Fayl', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Papka', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Havola', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Matn bloki', { exact: true })).toBeVisible();
  });

  test('toifa bo`yicha filtrlash ishlaydi', async ({ page }) => {
    const dialog = await openChooser(page);

    await dialog.getByRole('tab', { name: /^resurslar$/i }).click();
    await expect(dialog.getByText('Topshiriq', { exact: true })).toHaveCount(0);
    await expect(dialog.getByText('Papka', { exact: true })).toBeVisible();

    await dialog.getByRole('tab', { name: /^faoliyatlar$/i }).click();
    await expect(dialog.getByText('Topshiriq', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Papka', { exact: true })).toHaveCount(0);
  });

  test('qidiruv Moodle nomi bo`yicha ham ishlaydi', async ({ page }) => {
    const dialog = await openChooser(page);

    await dialog.getByRole('textbox', { name: /qidirish/i }).fill('label');
    await expect(dialog.getByText('Matn bloki', { exact: true })).toBeVisible();
    await expect(dialog.getByText('Topshiriq', { exact: true })).toHaveCount(0);
  });

  test('topilmagan so`rovda tushunarli xabar chiqadi', async ({ page }) => {
    const dialog = await openChooser(page);

    await dialog.getByRole('textbox', { name: /qidirish/i }).fill('zzzzz');
    await expect(dialog.getByText(/hech narsa topilmadi/i)).toBeVisible();
  });
});
