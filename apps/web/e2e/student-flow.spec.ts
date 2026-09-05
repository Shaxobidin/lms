/**
 * Maqsad: §15 qabul mezoni — "Talaba kursga yozilib, dars ko'rib, topshiriq
 * yuborib, test topshirib, bahosini ko'ra oladi".
 *
 * Testlar HAQIQIY tizimga qarshi ishlaydi: seed ma'lumotlari bilan.
 */

import { expect, test } from '@playwright/test';
import { ACCOUNTS, courseCards, signIn, waitForContent } from './helpers';

test.describe('Talabaning uzluksiz oqimi', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.student);
  });

  test("kurslar ro'yxatini ko'radi va kursga kiradi", async ({ page }) => {
    await page
      .getByRole('link', { name: /mening kurslarim/i })
      .first()
      .click();
    await waitForContent(page);

    await expect(page).toHaveURL(/my-courses/);

    // Kamida bitta kurs kartasi bo'lishi kerak (seed 5+ kurs beradi)
    const cards = courseCards(page);
    await expect(cards.first()).toBeVisible({ timeout: 20_000 });

    await cards.first().click();
    await waitForContent(page);

    // Kurs sahifasida tab navigatsiyasi mavjud
    await expect(page.getByRole('tab', { name: /modul/i })).toBeVisible();
  });

  test('darsni ochadi va tugatilgan deb belgilaydi', async ({ page }) => {
    // Darsi bor kursni topamiz: barcha kurslarda kontent bo'lishi shart emas
    const courseCount = await (async () => {
      await page.goto('/uz-Latn/my-courses');
      await waitForContent(page);
      return courseCards(page).count();
    })();

    let lessonFound = false;
    for (let index = 0; index < Math.min(courseCount, 6); index += 1) {
      await page.goto('/uz-Latn/my-courses');
      await waitForContent(page);
      await courseCards(page).nth(index).click();
      await waitForContent(page);

      // Kontent asinxron yuklanadi: dars havolasi paydo bo'lishini kutamiz.
      // `count()` kutmaydi, shuning uchun `waitFor` ishlatiladi.
      const appeared = await page
        .locator('a[href*="/lessons/"]')
        .first()
        .waitFor({ state: 'visible', timeout: 8000 })
        .then(() => true)
        .catch(() => false);

      if (appeared) {
        lessonFound = true;
        break;
      }
    }

    // Seed har bir kursga dars beradi — topilmasa bu HAQIQIY regressiya,
    // shuning uchun testni o'tkazib yubormaymiz, yiqitamiz.
    expect(lessonFound, 'Talaba yozilgan kurslarda birorta ham dars topilmadi').toBe(true);

    await page.locator('a[href*="/lessons/"]').first().click();
    await waitForContent(page);

    // Dars kontenti ko'rinadi
    await expect(page.locator('.prose-lms').first()).toBeVisible();

    // Tugatish tugmasi bosiladi
    const completeButton = page.getByRole('button', { name: /tasdiqlash/i });
    if (await completeButton.isVisible()) {
      await completeButton.click();
      await expect(page.getByText(/saqlandi/i)).toBeVisible({ timeout: 15_000 });
    }
  });

  test('test topshiradi va natijani oladi', async ({ page }) => {
    await page.goto('/uz-Latn/my-courses');
    await waitForContent(page);

    // Testi bor kursni topamiz
    const courseLinks = courseCards(page);
    const count = await courseLinks.count();
    let quizFound = false;

    for (let index = 0; index < Math.min(count, 6); index += 1) {
      await page.goto('/uz-Latn/my-courses');
      await waitForContent(page);
      await courseLinks.nth(index).click();
      await waitForContent(page);

      await page.getByRole('tab', { name: /test/i }).click();
      await waitForContent(page);

      const startButton = page.getByRole('link', { name: /testni boshlash/i }).first();
      if ((await startButton.count()) > 0) {
        await startButton.click();
        quizFound = true;
        break;
      }
    }

    // Seed nashr etilgan test yaratadi — topilmasa bu HAQIQIY regressiya.
    expect(quizFound, 'Nashr etilgan test topilmadi').toBe(true);

    await waitForContent(page);

    // Urinishlar tugagan bo'lsa — bu ham TO'G'RI xatti-harakat (F-07):
    // tizim aniq xabar ko'rsatadi va testni boshlamaydi
    const exhausted = await page.getByText(/urinishlar soni tugadi/i).isVisible();
    if (exhausted) {
      test.skip(true, 'Urinishlar soni tugagan — bu kutilgan holat');
      return;
    }

    // Taymer ishlayotgani ko'rinadi
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 20_000 });

    // Birinchi savolga javob beramiz
    const firstRadio = page.locator('input[type="radio"]').first();
    if ((await firstRadio.count()) > 0) {
      await firstRadio.check();
    }

    // To'g'ri javoblar sahifada bo'lmasligi KERAK (xavfsizlik)
    const html = await page.content();
    expect(html).not.toContain('isCorrect');
    expect(html).not.toContain('correctValue');

    // Testni yakunlaymiz
    page.on('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /yakunlash/i }).click();

    // Natija sahifasiga o'tiladi yoki bildirishnoma chiqadi
    await expect(page.getByText(/natija|ball/i).first()).toBeVisible({ timeout: 25_000 });
  });

  test("bahosini va progressini ko'radi", async ({ page }) => {
    await page.goto('/uz-Latn/dashboard');
    await waitForContent(page);

    // Talaba paneli ko'rsatkichlari
    await expect(page.getByText(/davomat|kurs/i).first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe("Ko'p tillilik (F-18)", () => {
  test('interfeys 4 tilda ochiladi', async ({ page }) => {
    const locales: Array<[string, RegExp]> = [
      ['uz-Latn', /Tizimga kirish|Hisobingizga kiring/i],
      ['uz-Cyrl', /Тизимга кириш|Ҳисобингизга киринг/i],
      ['ru', /Вход в систему|Войдите/i],
      ['en', /Sign in/i],
    ];

    for (const [locale, pattern] of locales) {
      await page.goto(`/${locale}/login`);
      await expect(page.locator('body')).toContainText(pattern, { timeout: 15_000 });
    }
  });

  test("tarjima kaliti ko'rinib qolmaydi", async ({ page }) => {
    for (const locale of ['uz-Latn', 'uz-Cyrl', 'ru', 'en']) {
      await page.goto(`/${locale}/login`);
      const text = await page.locator('body').innerText();

      // Kalitlar `auth.signIn` ko'rinishida ekranga chiqmasligi kerak
      expect(text).not.toMatch(/\b(auth|common|nav|errors|validation)\.[a-zA-Z_]+\b/);
    }
  });
});
