/**
 * Maqsad: §15 qabul mezoni — "O'qituvchi ... test tuzib, talabani baholay
 * oladi" — INTERFEYS orqali tekshiriladi (F-06, F-07, F-08).
 *
 * Testlar API emas, aynan foydalanuvchi ko'radigan ekranlarni sinaydi:
 * baholash ish o'rni, rubrika bo'yicha ball qo'yish, savollar banki,
 * savol muharriri va test konstruktori.
 *
 * Har bir bo'lim o'z ma'lumotini `fixtures.ts` orqali oldindan yaratadi —
 * shu tufayli hech bir test "ma'lumot topilmadi" deb jimgina o'tkazib
 * yuborilmaydi.
 */

import { expect, test } from '@playwright/test';
import { ACCOUNTS, signIn, waitForContent } from './helpers';
import {
  seedGradingFixture,
  seedQuizFixture,
  seedRubricFixture,
  type GradingFixture,
  type QuizFixture,
  type RubricFixture,
} from './fixtures';

test.describe("Baholash ish o'rni", () => {
  let fixture: GradingFixture;

  test.beforeAll(async () => {
    fixture = await seedGradingFixture();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test("topshiriqlar ro'yxatidan baholash sahifasiga o'tadi", async ({ page }) => {
    await page.goto('/uz-Latn/assignments');
    await waitForContent(page);

    await page.locator(`a[href$="/assignments/${fixture.assignmentId}"]`).first().click();
    await waitForContent(page);

    await expect(page).toHaveURL(new RegExp(`/assignments/${fixture.assignmentId}$`));
    await expect(page.getByRole('heading', { level: 1 })).toContainText(/E2E topshiriq/);
    // O'qituvchiga baholash holati ko'rsatiladi
    await expect(page.getByText(/ish baholandi/i)).toBeVisible();
    // Rubrika mezonlari baholashdan oldin ko'rinadi
    await expect(page.getByText('Mazmun').first()).toBeVisible();
    await expect(page.getByText('Rasmiylashtirish').first()).toBeVisible();
  });

  test("topshirilgan ishlar jadvali to'liq ustunlar bilan chiziladi", async ({ page }) => {
    await page.goto(`/uz-Latn/assignments/${fixture.assignmentId}`);
    await waitForContent(page);

    await expect(page.getByRole('columnheader', { name: /urinish/i })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /holat/i })).toBeVisible();
    await expect(page.getByRole('row')).toHaveCount(2); // sarlavha + bitta ish
  });

  test('rubrika bo`yicha ball qo`yadi va baho saqlanadi', async ({ page }) => {
    await page.goto(`/uz-Latn/assignments/${fixture.assignmentId}`);
    await waitForContent(page);

    await page.getByRole('button', { name: 'Baholash', exact: true }).first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/ishni baholash/i)).toBeVisible();
    // Klaviatura yorliqlari e'lon qilingan (§9)
    await expect(dialog.getByText(/Ctrl\+Enter/)).toBeVisible();

    // Darajalar tugmasi bir bosishda ball qo'yadi
    await dialog.getByRole('button', { name: /· 60$/ }).click();
    await dialog.getByRole('button', { name: /· 40$/ }).click();

    // 100/100 × 50 = 50 ball
    await expect(dialog.getByText('50.0 / 50')).toBeVisible();

    await dialog.getByRole('textbox').last().fill('E2E izohi');
    await dialog.getByRole('button', { name: /^saqlash$/i }).click();

    // Oyna yopiladi (navbatda boshqa ish yo'q) va jadvalda baho paydo bo'ladi
    await expect(dialog).toBeHidden();
    await expect(page.getByText('50.0')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1 \/ 1 ish baholandi/)).toBeVisible();
  });

  test('mezon maksimumidan oshiq ball saqlashga yo`l qo`ymaydi', async ({ page }) => {
    await page.goto(`/uz-Latn/assignments/${fixture.assignmentId}`);
    await waitForContent(page);

    // Ish oldingi testda baholangan bo'lishi mumkin — ikkala yorliqni ham qabul qilamiz
    await page
      .getByRole('button', { name: /^(baholash|tahrirlash)$/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const firstCriterion = dialog.locator('input[type="number"]').first();
    await firstCriterion.fill('999');

    await expect(dialog.getByRole('button', { name: /^saqlash$/i })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('talabada baholash boshqaruvlari ko`rinmaydi', async ({ browser }) => {
    const context = await browser.newContext();
    const studentPage = await context.newPage();

    await signIn(studentPage, ACCOUNTS.student);
    await studentPage.goto(`/uz-Latn/assignments/${fixture.assignmentId}`);
    await waitForContent(studentPage);

    await expect(studentPage.getByRole('heading', { level: 1 })).toContainText(/E2E topshiriq/);
    await expect(studentPage.getByRole('button', { name: /hammasini baholash/i })).toHaveCount(0);
    await expect(studentPage.getByRole('button', { name: /^baholash$/i })).toHaveCount(0);

    await context.close();
  });
});

test.describe('Savollar banki', () => {
  let fixture: QuizFixture;

  test.beforeAll(async () => {
    fixture = await seedQuizFixture();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test("yon paneldan savollar bankiga o'tadi", async ({ page }) => {
    await page
      .getByRole('link', { name: /savollar banki/i })
      .first()
      .click();
    await waitForContent(page);

    await expect(page).toHaveURL(/question-banks/);
    // `level: 1` shart: bank kartalarining sarlavhalari ham shu matnni tutadi
    await expect(page.getByRole('heading', { level: 1, name: /savollar banki/i })).toBeVisible();
    await expect(page.locator(`a[href$="/question-banks/${fixture.bankId}"]`)).toBeVisible();
  });

  test('bank yaratish oynasi ochiladi', async ({ page }) => {
    await page.goto('/uz-Latn/question-banks');
    await waitForContent(page);

    await page
      .getByRole('button', { name: /bank yaratish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/sarlavha/i).first()).toBeVisible();
    // Kurs tanlanmaguncha yaratib bo'lmaydi
    await expect(dialog.getByRole('button', { name: /^yaratish$/i })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('bankdagi savollar ro`yxati va filtrlar ishlaydi', async ({ page }) => {
    await page.goto(`/uz-Latn/question-banks/${fixture.bankId}`);
    await waitForContent(page);

    await expect(page.getByText(/E2E savol 1/)).toBeVisible();
    await expect(page.getByText(/E2E savol 3/)).toBeVisible();

    // Tur bo'yicha filtr: ESSAY tanlanganda SINGLE savollar chiqmaydi
    await page.getByLabel(/savol turi/i).selectOption('ESSAY');
    await waitForContent(page);
    await expect(page.getByText(/bankda savol yo'q/i)).toBeVisible({ timeout: 15_000 });

    await page.getByLabel(/savol turi/i).selectOption('SINGLE');
    await waitForContent(page);
    await expect(page.getByText(/E2E savol 1/)).toBeVisible({ timeout: 15_000 });
  });

  test('savol muharriri 10 ta turni va tur bo`yicha maydonlarni beradi', async ({ page }) => {
    await page.goto(`/uz-Latn/question-banks/${fixture.bankId}`);
    await waitForContent(page);

    await page
      .getByRole('button', { name: /savol qo'shish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const typeSelect = dialog.getByLabel(/savol turi/i);
    expect(await typeSelect.locator('option').count()).toBe(10);

    // Turni almashtirganda payload muharriri ham almashadi
    await typeSelect.selectOption('NUMERIC');
    await expect(dialog.getByLabel(/to'g'ri qiymat/i)).toBeVisible();

    await typeSelect.selectOption('CLOZE');
    await expect(dialog.getByRole('button', { name: /bo'shliqlarni yangilash/i })).toBeVisible();

    await typeSelect.selectOption('CODE');
    await expect(dialog.getByLabel(/dasturlash tili/i)).toBeVisible();
    // §16: kod bajarilmasligi ochiq aytiladi
    await expect(dialog.getByText(/BAJARILMAYDI/)).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('yangi savol yaratiladi va ro`yxatda paydo bo`ladi', async ({ page }) => {
    await page.goto(`/uz-Latn/question-banks/${fixture.bankId}`);
    await waitForContent(page);

    await page
      .getByRole('button', { name: /savol qo'shish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const marker = `E2E raqamli ${Date.now()}`;
    await dialog.getByLabel(/savol turi/i).selectOption('NUMERIC');
    await dialog.locator('#question-text-uz-Latn').fill(marker);
    await dialog.getByLabel(/to'g'ri qiymat/i).fill('9.8');
    await dialog.getByLabel(/ruxsat etilgan xatolik/i).fill('0.1');

    await dialog.getByRole('button', { name: /^saqlash$/i }).click();

    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(marker)).toBeVisible({ timeout: 15_000 });
  });
});

test.describe('Test konstruktori', () => {
  let fixture: QuizFixture;

  test.beforeAll(async () => {
    fixture = await seedQuizFixture();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test('kurs sahifasidan konstruktorga o`tadi', async ({ page }) => {
    await page.goto(`/uz-Latn/courses/${fixture.courseId}`);
    await waitForContent(page);

    await page.getByRole('tab', { name: /^testlar$/i }).click();
    await waitForContent(page);

    await page.locator(`a[href$="/quizzes/${fixture.quizId}/questions"]`).first().click();
    await waitForContent(page);

    await expect(page).toHaveURL(new RegExp(`/quizzes/${fixture.quizId}/questions$`));
    await expect(page.getByText(/test tarkibi/i)).toBeVisible();
    await expect(page.getByText(/testda savol yo'q/i)).toBeVisible();
  });

  test('bankdan savol qo`shadi, tartiblaydi va saqlaydi', async ({ page }) => {
    await page.goto(`/uz-Latn/quizzes/${fixture.quizId}/questions`);
    await waitForContent(page);

    await page.getByLabel(/savollar banki/i).selectOption(fixture.bankId);
    await waitForContent(page);

    // Savollar NOMI bo'yicha qo'shiladi: bank ro'yxati yaratilish vaqti bo'yicha
    // saralanadi va boshqa testlar bankka savol qo'shgan bo'lishi mumkin
    const bankItem = (title: string) =>
      page
        .locator('li')
        .filter({ hasText: title })
        .first()
        .getByRole('button', { name: /^qo'shish$/i });

    await expect(bankItem('E2E savol 1')).toBeEnabled({ timeout: 15_000 });
    await bankItem('E2E savol 1').click();
    await bankItem('E2E savol 2').click();

    // Jami ball yangilanadi (2 savol x 2 ball)
    await expect(page.getByText(/jami ball: 4/i)).toBeVisible();

    const save = page.getByRole('button', { name: /^saqlash$/i });
    await expect(save).toBeEnabled();
    await save.click();

    // Saqlangach tugma yana o'chadi (o'zgarish yo'q)
    await expect(save).toBeDisabled({ timeout: 15_000 });

    // Qayta yuklaganda tarkib serverdan qaytadi
    await page.reload();
    await waitForContent(page);
    await expect(page.getByText(/jami ball: 4/i)).toBeVisible({ timeout: 20_000 });
  });

  test('talaba konstruktorni ocha olmaydi', async ({ browser }) => {
    const context = await browser.newContext();
    const studentPage = await context.newPage();

    await signIn(studentPage, ACCOUNTS.student);
    await studentPage.goto(`/uz-Latn/quizzes/${fixture.quizId}/questions`);
    await waitForContent(studentPage);

    // Server 403 qaytaradi — sahifa xato holatini ko'rsatadi, tarkib emas
    await expect(studentPage.getByRole('alert').first()).toBeVisible({ timeout: 20_000 });
    await expect(studentPage.getByText(/test tarkibi/i)).toHaveCount(0);

    await context.close();
  });
});

test.describe('Rubrika muharriri', () => {
  let fixture: RubricFixture;
  let graded: GradingFixture;

  test.beforeAll(async () => {
    fixture = await seedRubricFixture();
    graded = await seedGradingFixture();
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test("kurs sahifasidan rubrikalarga o'tadi", async ({ page }) => {
    await page.goto(`/uz-Latn/courses/${fixture.courseId}`);
    await waitForContent(page);

    await page.getByRole('tab', { name: /^topshiriqlar$/i }).click();
    await waitForContent(page);

    await page.getByRole('link', { name: /^rubrikalar$/i }).click();
    await waitForContent(page);

    await expect(page).toHaveURL(new RegExp(`/courses/${fixture.courseId}/rubrics$`));
    await expect(page.getByRole('heading', { level: 1, name: /rubrikalar/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: fixture.title, exact: true })).toBeVisible();
  });

  test('yangi rubrika yaratadi va jami ball hisoblanadi', async ({ page }) => {
    await page.goto(`/uz-Latn/courses/${fixture.courseId}/rubrics`);
    await waitForContent(page);

    await page
      .getByRole('button', { name: /rubrika yaratish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const marker = `E2E yangi rubrika ${Date.now()}`;
    await dialog.locator('#rubric-title-uz-Latn').fill(marker);
    await dialog.locator('#criterion-title-0').fill('Mazmun');
    await dialog.locator('#criterion-max-0').fill('60');

    // Ikkinchi mezon qo'shilganda jami ball yangilanadi
    await dialog.getByRole('button', { name: /mezon qo'shish/i }).click();
    await dialog.locator('#criterion-title-1').fill('Rasmiylashtirish');
    await dialog.locator('#criterion-max-1').fill('40');

    await expect(dialog.getByText(/jami ball: 100/i)).toBeVisible();

    await dialog.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(marker)).toBeVisible({ timeout: 15_000 });
  });

  test('mezon qo`shadi va olib tashlaydi', async ({ page }) => {
    await page.goto(`/uz-Latn/courses/${fixture.courseId}/rubrics`);
    await waitForContent(page);

    const card = page
      .locator('div.rounded-lg.border')
      .filter({ has: page.getByRole('heading', { name: fixture.title, exact: true }) })
      .first();
    await card.getByRole('button', { name: /^tahrirlash$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Bitta mezonda o'chirish tugmasi o'chirilgan (kamida bitta qolishi shart)
    await expect(dialog.locator('#criterion-title-1')).toHaveCount(0);

    await dialog.getByRole('button', { name: /mezon qo'shish/i }).click();
    await expect(dialog.locator('#criterion-title-1')).toBeVisible();

    // Nomi bo'sh mezon bilan saqlab bo'lmaydi — sxema buni rad etadi
    await expect(dialog.getByRole('button', { name: /^saqlash$/i })).toBeDisabled();

    // Nom noyob bo'lishi shart: sahifada oldingi ishga tushirishlarning
    // rubrikalari ham turadi
    const criterionName = `E2E mezon ${Date.now()}`;
    await dialog.locator('#criterion-title-1').fill(criterionName);
    await dialog.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });
    await expect(page.getByText(criterionName)).toBeVisible({ timeout: 15_000 });
  });

  test('qulflangan rubrikada tuzilma tahrirlanmaydi', async ({ page }) => {
    // `graded` fikstura ishi baholanmagan bo'lishi mumkin — avval baholaymiz
    await page.goto(`/uz-Latn/assignments/${graded.assignmentId}`);
    await waitForContent(page);

    await page
      .getByRole('button', { name: /^(baholash|tahrirlash)$/i })
      .first()
      .click();

    const grader = page.getByRole('dialog');
    await expect(grader).toBeVisible();
    await grader.getByRole('button', { name: /· 60$/ }).click();
    await grader.getByRole('button', { name: /· 40$/ }).click();
    await grader.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(grader).toBeHidden({ timeout: 15_000 });

    // Endi shu rubrika qulflangan bo'lishi kerak
    await page.goto(`/uz-Latn/courses/${graded.courseId}/rubrics`);
    await waitForContent(page);

    const locked = page
      .locator('div.rounded-lg.border')
      .filter({ has: page.getByRole('heading', { name: graded.rubricTitle, exact: true }) })
      .first();
    await expect(locked.getByText(/rubrika qulflangan/i)).toBeVisible({ timeout: 15_000 });

    await locked.getByRole('button', { name: /^tahrirlash$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/rubrika qulflangan/i).first()).toBeVisible();

    // Tuzilma maydonlari o'chirilgan, nom esa tahrirlanadi
    await expect(dialog.locator('#criterion-max-0')).toBeDisabled();
    await expect(dialog.getByRole('button', { name: /mezon qo'shish/i })).toBeDisabled();
    await expect(dialog.locator('#rubric-title-uz-Latn')).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('topshiriq yaratishda rubrika tanlanadi', async ({ page }) => {
    await page.goto(`/uz-Latn/courses/${fixture.courseId}`);
    await waitForContent(page);

    // Faoliyat qo'shish tugmasi faqat tahrirlash rejimida ko'rinadi
    const editToggle = page.getByRole('switch', { name: /tahrirlash rejimi/i });
    await editToggle.waitFor({ state: 'visible', timeout: 20_000 });
    await editToggle.click();
    await waitForContent(page);

    await page
      .getByRole('button', { name: /faoliyat yoki resurs qo'shish/i })
      .first()
      .click();

    const chooser = page.getByRole('dialog');
    await expect(chooser).toBeVisible();
    await chooser
      .getByRole('button', { name: /^topshiriq/i })
      .first()
      .click();

    const form = page.getByRole('dialog');
    const rubricSelect = form.getByLabel(/^rubrika$/i);
    await expect(rubricSelect).toBeVisible({ timeout: 10_000 });

    // Bo'sh variant + kursdagi rubrikalar
    expect(await rubricSelect.locator('option').count()).toBeGreaterThan(1);
    await expect(rubricSelect.locator('option').first()).toHaveText(/rubrikasiz/i);

    await page.keyboard.press('Escape');
  });
});
