/**
 * Maqsad: NF-06 — 320 px dan 2560 px gacha moslashuvchanlik va NF-05 —
 * klaviatura navigatsiyasi.
 */

import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn } from './helpers';

test.describe("Mobil ko'rinish (NF-06)", () => {
  test('login sahifasi kichik ekranda gorizontal siljishsiz', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto('/uz-Latn/login');

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflow).toBe(false);
  });

  test('mobil menyu ochiladi va yopiladi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    const openButton = page.getByRole('button', { name: /menyuni ochish/i });
    await expect(openButton).toBeVisible();
    await openButton.click();

    await expect(page.getByRole('button', { name: /menyuni yopish/i })).toBeVisible();
  });
});

test.describe('Klaviatura navigatsiyasi (NF-05, WCAG 2.1 AA)', () => {
  test("skip-link birinchi Tab bosishda ko'rinadi", async ({ page }) => {
    await page.goto('/uz-Latn/login');
    await page.keyboard.press('Tab');

    const focused = await page.evaluate(() => document.activeElement?.textContent ?? '');
    expect(focused).toMatch(/asosiy mazmunga|skip/i);
  });

  test("login formasi faqat klaviatura bilan to'ldiriladi", async ({ page }) => {
    await page.goto('/uz-Latn/login');

    await page.getByLabel(/login/i).first().focus();
    await page.keyboard.type(ACCOUNTS.student);
    await page.keyboard.press('Tab');
    await page.keyboard.type('Demo!2026');
    await page.keyboard.press('Enter');

    await expect(page).not.toHaveURL(/\/login/, { timeout: 25_000 });
  });

  test('barcha tugmalarda ARIA nomi bor', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    const buttons = page.locator('button');
    const count = await buttons.count();

    for (let index = 0; index < Math.min(count, 20); index += 1) {
      const button = buttons.nth(index);
      const label = await button.getAttribute('aria-label');
      const text = (await button.textContent())?.trim();
      expect(Boolean(label) || Boolean(text)).toBe(true);
    }
  });
});
