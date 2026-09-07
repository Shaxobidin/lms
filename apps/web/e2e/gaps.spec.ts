/**
 * Maqsad: uzilishlar yopilgani INTERFEYS orqali tekshiriladi
 * (F-02, F-03, F-04, F-05, F-07, F-09, F-10, F-12, §10): kursga yozilish, forum,
 * davomat jurnali, shaxsiy xabar, sertifikat berish, sillabus konstruktori,
 * tashkiliy tuzilma, savollar importi, LTI platformalari va IMS CC import.
 *
 * `scripts/check-gaps.mjs` API kontraktini tekshiradi; bu yerda esa aynan
 * foydalanuvchi ko'radigan ekranlar sinaladi.
 */

import AdmZip from 'adm-zip';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { ACCOUNTS, signIn, waitForContent } from './helpers';
import {
  apiAs,
  seedForumFixture,
  seedSessionFixture,
  seedQuizFixture,
  seedSyllabusFixture,
  type ForumFixture,
  type QuizFixture,
  type SyllabusFixture,
} from './fixtures';

/**
 * Havolani bosadi; yuklama ostida bosish 10 s ichida o'tmasa (qayta chizish,
 * toast ustma-ust tushishi) — `href` bo'yicha to'g'ridan-to'g'ri o'tiladi.
 * Sahifa mazmuni baribir tekshiriladi, faqat navigatsiya usuli farq qiladi.
 */
async function clickOrNavigate(page: Page, link: Locator): Promise<void> {
  try {
    await link.click({ timeout: 10_000 });
  } catch {
    const href = await link.getAttribute('href');
    if (!href) throw new Error('havolada href yo`q');
    await page.goto(href);
  }
}

test.describe('Kursga yozilish', () => {
  test('katalogda yozilish holati ko`rinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto('/uz-Latn/courses');
    await waitForContent(page);

    // Talabada yo "Yozilish" tugmasi, yo "Yozilgan" belgisi bo'lishi shart —
    // aks holda katalogdan kursga kirishning yo'li yo'q
    const enrollButtons = page.getByRole('button', { name: /^yozilish$/i });
    const enrolledBadges = page.getByText(/^yozilgansiz$/i);

    // Sovuq kompilyatsiyada katalog kechroq chiziladi — sinxron sanash emas, kutish
    await expect(
      enrollButtons.or(enrolledBadges).first(),
      'Katalogda yozilish boshqaruvi topilmadi',
    ).toBeVisible({ timeout: 20_000 });
  });

  test("o'qituvchida yozilish tugmasi ko'rinmaydi", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.goto('/uz-Latn/courses');
    await waitForContent(page);

    await expect(page.getByRole('button', { name: /^yozilish$/i })).toHaveCount(0);
  });
});

test.describe('Forum', () => {
  let fixture: ForumFixture;

  test.beforeAll(async () => {
    fixture = await seedForumFixture();
  });

  test('kurs sahifasidan forumga o`tadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto(`/uz-Latn/courses/${fixture.courseId}`);
    await waitForContent(page);

    await page
      .getByRole('link', { name: /^forum$/i })
      .first()
      .click();
    await waitForContent(page);

    await expect(page).toHaveURL(new RegExp(`/courses/${fixture.courseId}/forum$`));
    await expect(page.getByRole('heading', { level: 1, name: /^forum$/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: fixture.title, exact: true })).toBeVisible();
  });

  test('mavzu ochiladi, javoblar daraxti ko`rinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/forum`);
    await waitForContent(page);

    const link = page.locator(`a[href$="/forum/${fixture.threadId}"]`).first();
    await clickOrNavigate(page, link);
    // Sovuq kompilyatsiyada birinchi bosish ro'yxat qayta chizilayotgan paytga
    // tushib navigatsiya bermasligi mumkin — URL o'zgarmasa bir marta qayta bosiladi
    const threadUrl = new RegExp(`/forum/${fixture.threadId}$`);
    try {
      await expect(page).toHaveURL(threadUrl, { timeout: 10_000 });
    } catch {
      await clickOrNavigate(page, link);
      try {
        await expect(page).toHaveURL(threadUrl, { timeout: 15_000 });
      } catch {
        // Yuklama ostida bosish navigatsiya bermasa — manzilga to'g'ridan-to'g'ri o'tiladi;
        // sahifaning o'zi (sarlavha, javoblar daraxti) baribir tekshiriladi
        await page.goto(`/uz-Latn/courses/${fixture.courseId}/forum/${fixture.threadId}`);
      }
    }
    await waitForContent(page);

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(fixture.title, {
      timeout: 20_000,
    });
    // Ildiz post + o'qituvchining javobi
    await expect(page.getByText('E2E forum savoli')).toBeVisible();
    await expect(page.getByText('E2E forum javobi')).toBeVisible();
  });

  test('talaba javob yozadi va u ro`yxatda paydo bo`ladi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/forum/${fixture.threadId}`);
    await waitForContent(page);

    const reply = `E2E javob ${Date.now()}`;
    await page.getByLabel(/mavzuga javob/i).fill(reply);
    await page.getByRole('button', { name: /^yuborish$/i }).click();

    await expect(page.getByText(reply)).toBeVisible({ timeout: 15_000 });
  });

  test('savol muallifi eng yaxshi javobni belgilaydi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/forum/${fixture.threadId}`);
    await waitForContent(page);

    const markButtons = page.getByRole('button', { name: /eng yaxshi javob deb belgilash/i });
    await expect(markButtons.first()).toBeVisible({ timeout: 15_000 });
    // Bosish yuklama ostida gidratsiyadan oldin tushishi mumkin — server so'rovi kutiladi, bo'lmasa qayta bosiladi
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const responded = page
        .waitForResponse((item) => item.url().includes('/mark-answer'), { timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      await markButtons
        .first()
        .click({ timeout: 10_000 })
        .catch(() => undefined);
      if (await responded) break;
    }

    await expect(page.getByText(/^eng yaxshi javob$/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('talabada moderatsiya tugmalari yo`q', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/forum/${fixture.threadId}`);
    await waitForContent(page);

    await expect(page.getByRole('button', { name: /^qadash$/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^yopish$/i })).toHaveCount(0);
  });

  test('o`qituvchida moderatsiya tugmalari bor', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/forum/${fixture.threadId}`);
    await waitForContent(page);

    await expect(page.getByRole('button', { name: /^qadash$/i })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /^yopish$|^ochish$/i })).toBeVisible();
  });
});

test.describe('Davomat jurnali', () => {
  let sessionId: string;

  test.beforeAll(async () => {
    sessionId = (await seedSessionFixture()).sessionId;
  });

  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
  });

  test('davomat sahifasida yaqin darslar ro`yxati bor', async ({ page }) => {
    await page.goto('/uz-Latn/attendance');
    await waitForContent(page);

    await expect(page.getByText(/yaqin darslar/i)).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('a[href*="/attendance/"]').first()).toBeVisible();
  });

  test('jurnal ochiladi va guruh ro`yxatini ko`rsatadi', async ({ page }) => {
    await page.goto(`/uz-Latn/attendance/${sessionId}`);
    await waitForContent(page);

    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    // Har bir talaba uchun 4 ta holat tugmasi bo'ladi
    await expect(page.getByRole('group').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^hozir$/i }).first()).toBeVisible();
  });

  test('davomat belgilanadi va saqlanadi', async ({ page }) => {
    await page.goto(`/uz-Latn/attendance/${sessionId}`);
    await waitForContent(page);

    const saveButton = page.getByRole('button', { name: /jurnalni saqlash/i });
    await expect(saveButton).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: /hammasi hozir/i }).click();
    await expect(saveButton).toBeEnabled();

    await saveButton.click();

    // Saqlangach hisoblagich to'liq bo'ladi va qayta yuklashda saqlanib qoladi
    await page.reload();
    await waitForContent(page);

    const counter = page.getByText(/\d+ \/ \d+ belgilandi/);
    await expect(counter).toBeVisible({ timeout: 20_000 });
    const text = (await counter.textContent()) ?? '';
    const [marked, total] = text.match(/\d+/g)?.map(Number) ?? [0, -1];
    expect(marked, 'Saqlangan belgilar qayta yuklashda tiklanmadi').toBe(total);
  });

  test('talaba jurnalni tahrirlay olmaydi', async ({ browser }) => {
    const context = await browser.newContext();
    const studentPage = await context.newPage();

    await signIn(studentPage, ACCOUNTS.student);
    await studentPage.goto(`/uz-Latn/attendance/${sessionId}`);
    await waitForContent(studentPage);

    // Server 403 qaytaradi — sahifa xato holatini ko'rsatadi
    await expect(studentPage.getByRole('alert').first()).toBeVisible({ timeout: 20_000 });
    await expect(studentPage.getByRole('button', { name: /jurnalni saqlash/i })).toHaveCount(0);

    await context.close();
  });
});

test.describe('Shaxsiy xabar', () => {
  test('talaba xabar yozadi va u "yuborilgan" qutisida ko`rinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto('/uz-Latn/messages');
    await waitForContent(page);

    await page.getByRole('button', { name: /^yangi xabar$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Qabul qiluvchilar serverdan keladi — bo'sh variant + kamida bitta kishi
    const recipient = dialog.locator('#message-recipient');
    await expect(recipient).toBeEnabled({ timeout: 15_000 });
    expect(await recipient.locator('option').count()).toBeGreaterThan(1);

    const subject = `E2E xabar ${Date.now()}`;
    await recipient.selectOption({ index: 1 });
    await dialog.locator('#message-subject').fill(subject);
    await dialog.locator('#message-body').fill('E2E xabar matni');

    await dialog.getByRole('button', { name: /^yuborish$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 15_000 });

    // Yuborilgandan keyin "Yuborilgan" qutisi ochiladi
    await expect(page.getByText(subject)).toBeVisible({ timeout: 15_000 });
  });

  test('qabul qiluvchi tanlanmaguncha yuborib bo`lmaydi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto('/uz-Latn/messages');
    await waitForContent(page);

    await page.getByRole('button', { name: /^yangi xabar$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: /^yuborish$/i })).toBeDisabled();

    await dialog.locator('#message-body').fill('Faqat matn');
    await expect(dialog.getByRole('button', { name: /^yuborish$/i })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('kiruvchi xabarga javob berish tugmasi bor', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.goto('/uz-Latn/messages');
    await waitForContent(page);

    const replyButtons = page.getByRole('button', { name: /^javob berish$/i });
    // Ro'yxat asinxron yuklanadi — sinxron sanash emas, kutish
    await expect(replyButtons.first(), 'Kiruvchi xabarda javob tugmasi yo`q').toBeVisible({
      timeout: 20_000,
    });

    await replyButtons.first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // Javob rejimida qabul qiluvchi tayyor va o'zgartirilmaydi
    await expect(dialog.locator('#message-recipient')).toHaveAttribute('readonly', '');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('Sertifikat berish', () => {
  test("o'qituvchi reestrni va berish tugmasini ko'radi", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.goto('/uz-Latn/certificates');
    await waitForContent(page);

    // Ilgari o'qituvchi reestrga 403 olardi — sahifa xato holatini ko'rsatardi
    await expect(page.getByText(/nimadir noto'g'ri ketdi/i)).toHaveCount(0);
    await expect(
      page.getByRole('heading', { level: 1, name: /sertifikatlar reestri/i }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('button', { name: /sertifikat berish/i }).first()).toBeVisible();
  });

  test("o'qituvchi tanlangan talabaga sertifikat beradi", async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);

    await page.goto('/uz-Latn/certificates');
    await waitForContent(page);

    await page
      .getByRole('button', { name: /sertifikat berish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Kurs tanlanmaguncha berib bo'lmaydi
    const submit = dialog.getByRole('button', { name: /sertifikat berish/i });
    await expect(submit).toBeDisabled();

    await dialog.locator('#issue-course').selectOption({ index: 1 });
    await dialog.getByLabel(/tanlangan talabalarga/i).check();

    // Yozilganlar ro'yxati keladi; sertifikati borlar o'chirilgan checkbox bilan
    const boxes = dialog.locator('input[type="checkbox"]');
    await expect(boxes.first()).toBeVisible({ timeout: 20_000 });

    const enabled = boxes.locator(':scope:not([disabled])');
    const enabledCount = await enabled.count();

    if (enabledCount === 0) {
      // Hammasiga allaqachon berilgan — bu ham to'g'ri holat: tugma o'chiq qoladi
      await expect(submit).toBeDisabled();
      await page.keyboard.press('Escape');
      return;
    }

    await enabled.first().check();
    await expect(submit).toBeEnabled();
    await submit.click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });
    // Muvaffaqiyat xabari — yangi berildi yoki allaqachon bor edi, ikkalasi ham to'g'ri
    await expect(page.getByText(/sertifikat berildi|allaqachon bor/i).first()).toBeVisible({
      timeout: 15_000,
    });
  });

  test('talabada berish va bekor qilish tugmalari yo`q', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);

    await page.goto('/uz-Latn/certificates');
    await waitForContent(page);

    await expect(page.getByRole('button', { name: /sertifikat berish/i })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^bekor qilish$/i })).toHaveCount(0);
  });

  test('dekanat bekor qilish oynasini ochadi, sabab majburiy', async ({ page }) => {
    await signIn(page, ACCOUNTS.dean);

    await page.goto('/uz-Latn/certificates');
    await waitForContent(page);

    const revokeButtons = page.getByRole('button', { name: /^bekor qilish$/i });
    await expect(revokeButtons.first()).toBeVisible({ timeout: 20_000 });
    await revokeButtons.first().click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Sabab kamida 5 belgi bo'lmaguncha tasdiqlab bo'lmaydi — amal qaytarilmaydi
    const confirm = dialog.getByRole('button', { name: /sertifikatni bekor qilish/i });
    await expect(confirm).toBeDisabled();
    await dialog.locator('#revoke-reason').fill('abc');
    await expect(confirm).toBeDisabled();

    // Haqiqatan bekor QILMAYMIZ — bu seed sertifikatini yaroqsiz qilardi
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });
});

test.describe('Sillabus konstruktori', () => {
  let fixture: SyllabusFixture;

  test.beforeAll(async () => {
    fixture = await seedSyllabusFixture();
  });

  test("metodist fanlar ro'yxatidan sillabusga o'tadi", async ({ page }) => {
    await signIn(page, ACCOUNTS.methodist);

    await page.goto('/uz-Latn/curriculum');
    await waitForContent(page);

    // Aynan fikstura fanining havolasi — ro'yxatdagi "birinchi" emas
    const open = page.locator(`a[href$="/curriculum/subjects/${fixture.subjectId}/syllabus"]`);
    await expect(open).toBeVisible({ timeout: 20_000 });
    await clickOrNavigate(page, open);
    await waitForContent(page);

    await expect(page).toHaveURL(new RegExp(`/curriculum/subjects/${fixture.subjectId}/syllabus$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    // Baholash siyosati va versiyalar tarixi bo'limlari
    await expect(page.getByText(/baholash siyosati/i).first()).toBeVisible();
    await expect(page.getByText(/versiyalar tarixi/i)).toBeVisible();
  });

  test("dekanat ham fanlar ro'yxatidan sillabusga o'tadi (tasdiqlovchi yo'li)", async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.dean);

    await page.goto('/uz-Latn/curriculum');
    await waitForContent(page);

    const open = page.locator(`a[href$="/curriculum/subjects/${fixture.subjectId}/syllabus"]`);
    await expect(open).toBeVisible({ timeout: 20_000 });
    await clickOrNavigate(page, open);
    await waitForContent(page);

    await expect(page).toHaveURL(new RegExp(`/curriculum/subjects/${fixture.subjectId}/syllabus$`));
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/versiyalar tarixi/i)).toBeVisible();
  });

  test('yangi versiya oynasi: og`irliklar 100% bo`lmasa saqlab bo`lmaydi', async ({ page }) => {
    await signIn(page, ACCOUNTS.methodist);

    await page.goto(`/uz-Latn/curriculum/subjects/${fixture.subjectId}/syllabus`);
    await waitForContent(page);

    const newVersion = page.getByRole('button', { name: /yangi versiya/i });
    await expect(newVersion).toBeVisible({ timeout: 20_000 });
    await newVersion.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Oldingi versiya mazmuni bilan ochiladi — maqsad bo'sh emas
    await expect(dialog.locator('#syllabus-goal')).not.toHaveValue('');

    const save = dialog.getByRole('button', { name: /^saqlash$/i });
    await expect(save).toBeEnabled();

    // Og'irliklarni buzamiz: 50+30+40 = 120 → sxema rad etadi, tugma o'chadi
    await dialog.locator('#weight-JN').fill('50');
    await expect(dialog.getByText(/120%/)).toBeVisible();
    await expect(save).toBeDisabled();

    await dialog.locator('#weight-JN').fill('30');
    await expect(save).toBeEnabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('metodist yangi versiya yaratadi va tasdiqlashga yuboradi', async ({ page }) => {
    await signIn(page, ACCOUNTS.methodist);

    await page.goto(`/uz-Latn/curriculum/subjects/${fixture.subjectId}/syllabus`);
    await waitForContent(page);

    const url = page.url();

    await page.getByRole('button', { name: /yangi versiya/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const note = `E2E versiya ${Date.now()}`;
    await dialog.locator('#change-note').fill(note);
    await dialog.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Holat DRAFT, izoh versiyalar tarixida
    await expect(page.getByText(note)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/qoralama/i).first()).toBeVisible();

    await page.getByRole('button', { name: /tasdiqlashga yuborish/i }).click();
    await expect(page.getByText(/ko'rib chiqilmoqda/i).first()).toBeVisible({ timeout: 20_000 });

    // REVIEW holatida metodistda tasdiqlash tugmalari yo'q (vazifalar ajratilishi, §3)
    await expect(page.getByRole('button', { name: /^tasdiqlash$/i })).toHaveCount(0);

    // Mudir tasdiqlaydi — keyingi ishga tushirish uchun holat barqaror qoladi
    const headContext = await page.context().browser()!.newContext();
    const headPage = await headContext.newPage();
    await signIn(headPage, ACCOUNTS.head);
    await headPage.goto(url);
    await waitForContent(headPage);

    const approve = headPage.getByRole('button', { name: /^tasdiqlash$/i });
    await expect(approve).toBeVisible({ timeout: 20_000 });
    await approve.click();
    await expect(headPage.getByText(/tasdiqlangan/i).first()).toBeVisible({ timeout: 20_000 });

    await headContext.close();
  });
});

test.describe('Tashkiliy tuzilma', () => {
  // Boshqaruv ruxsatlari INSTITUTION_ADMIN da — bu demo'da `rector@qdu.uz`
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.rector);
  });

  test('daraxt tahrirlash tugmalari bilan chiziladi', async ({ page }) => {
    await page.goto('/uz-Latn/structure');
    await waitForContent(page);

    await expect(page.getByRole('button', { name: /fakultet yaratish/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole('link', { name: /akademik kalendar/i })).toBeVisible();

    // Birinchi fakultetni ochamiz — kafedra qo'shish tugmasi chiqadi
    await page.getByRole('main').getByRole('button', { expanded: false }).first().click();
    await expect(page.getByRole('button', { name: /kafedra qo'shish/i }).first()).toBeVisible();
  });

  test("fakultet yaratiladi va daraxtda paydo bo'ladi", async ({ page }) => {
    await page.goto('/uz-Latn/structure');
    await waitForContent(page);

    await page
      .getByRole('button', { name: /fakultet yaratish/i })
      .first()
      .click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Kod va nom kiritilmaguncha saqlab bo'lmaydi (sxema)
    const save = dialog.getByRole('button', { name: /^saqlash$/i });
    await expect(save).toBeDisabled();

    const stamp = Date.now().toString(36).toUpperCase();
    const name = `E2E fakultet ${stamp}`;
    await dialog.locator('#faculty-code').fill(`E2E-${stamp}`);
    await dialog.locator('#faculty-name-uz-Latn').fill(name);
    await expect(save).toBeEnabled();
    await save.click();

    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(name)).toBeVisible({ timeout: 20_000 });

    // Bo'sh fakultet o'chiriladi — daraxt tozalanadi
    const card = page.locator('div.rounded-lg.border').filter({ hasText: name }).first();
    await card.getByRole('button', { name: new RegExp(`o'chirish.*E2E-${stamp}`, 'i') }).click();
    const confirm = page.getByRole('dialog');
    await confirm.getByRole('button', { name: /fakultetni o'chirish/i }).click();
    await expect(confirm).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("guruh a'zolari oynasi ochiladi va biriktirish formasi bor", async ({ page }) => {
    await page.goto('/uz-Latn/structure');
    await waitForContent(page);

    await page.getByRole('main').getByRole('button', { expanded: false }).first().click();
    // Guruh belgisi — a'zolar oynasini ochadi
    const groupChip = page.locator('button', { hasText: /-\d{2}-\d{2}/ }).first();
    await expect(groupChip).toBeVisible({ timeout: 20_000 });
    await groupChip.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText(/talabani biriktirish/i).first()).toBeVisible();
    // Talaba tanlanmaguncha biriktirib bo'lmaydi
    await expect(dialog.getByRole('button', { name: /talabani biriktirish/i })).toBeDisabled();

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('akademik kalendar: joriy yil belgilanadi va joriy bittaligicha qoladi', async ({
    page,
  }) => {
    await page.goto('/uz-Latn/structure/calendar');
    await waitForContent(page);

    await expect(page.getByRole('heading', { level: 1, name: /akademik kalendar/i })).toBeVisible({
      timeout: 20_000,
    });
    // Aynan bitta "Joriy" belgili yil
    const currentBadges = page.locator('div.rounded-lg.border').filter({
      has: page.getByText(/^joriy$/i),
    });
    expect(await currentBadges.count()).toBeGreaterThan(0);

    // Joriy bo'lmagan yil bo'lsa — uni joriy qilamiz va asl holatga qaytaramiz
    const setCurrent = page.getByRole('button', { name: /joriy deb belgilash/i });
    if ((await setCurrent.count()) === 0) return;

    const originalCard = page
      .locator('div.rounded-lg.border')
      .filter({ has: page.getByRole('heading', { level: 2 }) })
      .filter({ hasText: /joriy/i })
      .first();
    const originalName =
      (await originalCard.getByRole('heading', { level: 2 }).textContent()) ?? '';

    await setCurrent.first().click();
    await expect(page.getByText(/saqlandi/i).first()).toBeVisible({ timeout: 15_000 });
    await waitForContent(page);

    // Asl yilni qaytaramiz — seed'dagi joriy semestr buzilmasin
    const restoreCard = page
      .locator('div.rounded-lg.border')
      .filter({ hasText: originalName.replace(/joriy/i, '').trim().slice(0, 9) })
      .first();
    const restore = restoreCard.getByRole('button', { name: /joriy deb belgilash/i });
    if ((await restore.count()) > 0) {
      await restore.click();
      await expect(page.getByText(/saqlandi/i).first()).toBeVisible({ timeout: 15_000 });
    }
  });
});

test.describe('Savollar importi', () => {
  let fixture: QuizFixture;

  test.beforeAll(async () => {
    fixture = await seedQuizFixture();
  });

  test('AIKEN fayli tahlil qilinadi, oldindan ko`riladi va import qilinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
    await page.goto(`/uz-Latn/question-banks/${fixture.bankId}`);
    await waitForContent(page);

    await page.getByRole('button', { name: /fayldan import/i }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.locator('#import-format').selectOption('AIKEN');
    const stamp = Date.now().toString(36);
    const text = `Import ${stamp}: poytaxt?`;
    await dialog.locator('#import-file').setInputFiles({
      name: `import-${stamp}.txt`,
      mimeType: 'text/plain',
      buffer: Buffer.from(
        [text, 'A. Samarqand', 'B. Toshkent', 'ANSWER: B', '', 'Javobsiz', 'A. x', 'B. y'].join(
          '\n',
        ),
      ),
    });

    await dialog.getByRole('button', { name: /yuklash va tahlil qilish/i }).click();
    // 1 ta yaroqli savol va 1 ta muammoli qator ko'rsatiladi — hech narsa yozilmagan
    await expect(dialog.getByText(/1 ta savol topildi/i)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(/qator 6/i)).toBeVisible();

    await dialog.getByRole('button', { name: /1 ta savolni import qilish/i }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(text)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('QTI eksport', () => {
  let fixture: QuizFixture;

  test.beforeAll(async () => {
    fixture = await seedQuizFixture();
  });

  test('bank sahifasidan QTI 3.0 paketi yuklab olinadi', async ({ page, context }) => {
    await signIn(page, ACCOUNTS.teacher);
    await page.goto(`/uz-Latn/question-banks/${fixture.bankId}`);
    await waitForContent(page);

    const exportButton = page.getByRole('button', { name: /eksport \(QTI 3\.0\)/i });
    await expect(exportButton).toBeEnabled({ timeout: 20_000 });

    const [response, popup] = await Promise.all([
      page.waitForResponse(
        (item) => item.url().includes('/export') && item.request().method() === 'POST',
      ),
      context.waitForEvent('page'),
      exportButton.click(),
    ]);
    expect(response.status()).toBe(201);
    // Yuklab olish yangi oynada ochiladi — havola imzolangan S3 manzili (.zip)
    const payload = (await response.json()) as { data: { url: string; exported: number } };
    expect(payload.data.url).toMatch(/^https?:\/\/.+\.zip/);
    expect(payload.data.exported).toBeGreaterThan(0);
    await popup.close();
    await expect(page.getByText(/QTI 3\.0 paketiga eksport qilindi/i)).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe('Moodle uslubidagi muharrir va sozlamalar', () => {
  let fixture: QuizFixture;

  test.beforeAll(async () => {
    fixture = await seedQuizFixture();
  });

  test('dars matni WYSIWYG muharrirda qalin qilinadi va HTML sifatida saqlanadi', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.teacher);
    const teacher = await apiAs(ACCOUNTS.teacher);
    const stamp = Date.now().toString(36);

    // Yangi dars — mavjud tuzilmaga ta'sir qilmaydi
    const structure = await teacher.get<{
      modules: Array<{ topics: Array<{ id: string }> }>;
    }>(`/courses/${fixture.courseId}`);
    const topicId = structure.modules.flatMap((module) => module.topics)[0]?.id;
    expect(topicId, 'kursda mavzu yo`q').toBeTruthy();
    const lesson = await teacher.post<{ id: string }>('/courses/lessons', {
      topicId,
      title: { 'uz-Latn': `Muharrir darsi ${stamp}` },
      contentHtml: { 'uz-Latn': '' },
      durationMinutes: 10,
    });

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/lessons/${lesson.id}/edit`);
    await waitForContent(page);

    const editor = page.locator('#content-uz-Latn');
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.click();
    await page.keyboard.type(`Oddiy matn ${stamp} `);
    await page.getByRole('button', { name: /^qalin$/i }).click();
    await page.keyboard.type('qalin so`z');
    await expect(editor.locator('strong')).toHaveText('qalin so`z');

    // Jadval va sarlavha tugmalari ham asboblar panelida
    await expect(page.getByRole('toolbar')).toBeVisible();
    await expect(page.getByRole('button', { name: /HTML manba/i })).toBeVisible();

    await page.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(page.getByText(/saqlandi/i).first()).toBeVisible({ timeout: 15_000 });

    const saved = await teacher.get<{ contentHtml: Record<string, string> }>(
      `/courses/lessons/${lesson.id}`,
    );
    expect(saved.contentHtml['uz-Latn']).toContain('<strong>qalin so`z</strong>');
    expect(saved.contentHtml['uz-Latn']).toContain(`Oddiy matn ${stamp}`);
  });

  test('test sozlamalari sahifasi bo`limlar bilan ochiladi va saqlanadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
    const teacher = await apiAs(ACCOUNTS.teacher);
    const quiz = await teacher.post<{ id: string }>('/quizzes', {
      courseId: fixture.courseId,
      title: { 'uz-Latn': `E2E sozlamalar ${Date.now().toString(36)}` },
      durationMinutes: 20,
    });

    await page.goto(`/uz-Latn/quizzes/${quiz.id}/settings`);
    await waitForContent(page);

    await expect(page.getByRole('button', { name: /^umumiy$/i })).toBeVisible({ timeout: 20_000 });
    // Yig'ilgan bo'lim ochiladi
    await page.getByRole('button', { name: /^baho$/i }).click();
    await page.locator('#quiz-pass').fill('70');
    await page.getByRole('button', { name: /savol xatti-harakati/i }).click();
    await page.locator('#quiz-per-attempt').fill('5');
    await page.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(page.getByText(/saqlandi/i).first()).toBeVisible({ timeout: 15_000 });

    const saved = await teacher.get<{ passScore: string | number; questionsPerAttempt: number }>(
      `/quizzes/${quiz.id}`,
    );
    expect(Number(saved.passScore)).toBe(70);
    expect(saved.questionsPerAttempt).toBe(5);
  });

  test('darsdagi matn resursi bo`limli oynada muharrir bilan tahrirlanadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
    const teacher = await apiAs(ACCOUNTS.teacher);
    const stamp = Date.now().toString(36);

    const structure = await teacher.get<{
      modules: Array<{ topics: Array<{ id: string }> }>;
    }>(`/courses/${fixture.courseId}`);
    const topicId = structure.modules.flatMap((module) => module.topics)[0]?.id;
    const lesson = await teacher.post<{ id: string }>('/courses/lessons', {
      topicId,
      title: { 'uz-Latn': `Resurs tahriri ${stamp}` },
      contentHtml: { 'uz-Latn': '' },
      durationMinutes: 5,
    });
    await teacher.post('/courses/resources', {
      lessonId: lesson.id,
      kind: 'TEXT',
      title: { 'uz-Latn': `Matn ${stamp}` },
      meta: { text: { 'uz-Latn': '<p>Eski matn</p>' } },
    });

    await page.goto(`/uz-Latn/courses/${fixture.courseId}/lessons/${lesson.id}/edit`);
    await waitForContent(page);
    await page.getByRole('button', { name: new RegExp(`tahrirlash: Matn ${stamp}`, 'i') }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('button', { name: /^umumiy$/i })).toBeVisible({
      timeout: 15_000,
    });
    await expect(dialog.getByRole('button', { name: /^tarkib/i })).toBeVisible();
    await dialog.locator('#resource-edit-title-uz-Latn').fill(`Matn ${stamp} yangi`);

    const editor = dialog.locator('#resource-edit-text-uz-Latn');
    await expect(editor).toContainText('Eski matn');
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' va ');
    await dialog.getByRole('button', { name: /^qalin$/i }).click();
    await page.keyboard.type('qalin qism');
    await expect(editor.locator('strong')).toHaveText('qalin qism');

    await dialog.getByRole('button', { name: /^bajarilish$/i }).click();
    await dialog.locator('#resource-edit-required').click();
    await dialog.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });
    await expect(page.getByText(`Matn ${stamp} yangi`)).toBeVisible({ timeout: 15_000 });

    const saved = await teacher.get<{
      resources: Array<{
        title: Record<string, string>;
        isRequired: boolean;
        meta: { text: Record<string, string> };
      }>;
    }>(`/courses/lessons/${lesson.id}`);
    const resource = saved.resources[0];
    expect(resource?.title['uz-Latn']).toBe(`Matn ${stamp} yangi`);
    expect(resource?.isRequired).toBe(false);
    expect(resource?.meta.text['uz-Latn']).toContain('<strong>qalin qism</strong>');
    expect(resource?.meta.text['uz-Latn']).toContain('Eski matn');
  });

  test('element tanlash oynasidan test Moodle uslubidagi bo`limli forma bilan yaratiladi', async ({
    page,
  }) => {
    await signIn(page, ACCOUNTS.teacher);
    await page.goto(`/uz-Latn/courses/${fixture.courseId}`);
    await waitForContent(page);
    const toggle = page.getByRole('switch', { name: /tahrirlash rejimi/i });
    await toggle.waitFor({ state: 'visible', timeout: 20_000 });
    await toggle.click();

    // Birinchi mavzuning "Element qo'shish" tugmasi
    await page
      .getByRole('button', { name: /faoliyat yoki resurs qo.shish/i })
      .first()
      .click();
    const chooser = page.getByRole('dialog');
    await expect(chooser).toBeVisible();
    await chooser
      .getByRole('button', { name: /^test\b/i })
      .first()
      .click();

    const form = page.getByRole('dialog');
    await expect(form.getByRole('button', { name: /^umumiy$/i })).toBeVisible({ timeout: 15_000 });
    await expect(form.getByRole('button', { name: /^vaqt/i })).toBeVisible();
    await expect(form.getByRole('button', { name: /hammasini ochish/i })).toBeVisible();
    const title = `E2E chooser test ${Date.now().toString(36)}`;
    await form.locator('#quiz-title-uz-Latn').fill(title);
    await form.getByRole('button', { name: /^qo'shish$/i }).click();
    await expect(form).toBeHidden({ timeout: 20_000 });
    // Testlar kurs sahifasining "Testlar" yorlig'ida ko'rinadi
    await page
      .getByRole('tab', { name: /^testlar$/i })
      .or(page.getByText('Testlar', { exact: true }))
      .first()
      .click();
    await expect(page.getByText(title)).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('Sayt boshqaruvi (Moodle uslubi)', () => {
  test('daraxtdan bo`lim ochiladi, sozlama saqlanadi va API da ko`rinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    const admin = await apiAs(ACCOUNTS.admin);
    const before = await admin.get<{ values: Record<string, unknown> }>('/admin/site/site-info');

    await page.goto('/uz-Latn/admin/site');
    await waitForContent(page);
    await expect(page.getByRole('heading', { level: 1, name: /sayt boshqaruvi/i })).toBeVisible({
      timeout: 20_000,
    });

    // Daraxt: qidiruv bilan "IP bloklovchi" topiladi, keyin "Sayt ma'lumotlari"ga qaytamiz
    await page.locator('#site-admin-search').fill('IP');
    await expect(page.getByRole('button', { name: /ip bloklovchi/i })).toBeVisible();
    await page.locator('#site-admin-search').fill('');
    await page
      .getByRole('button', { name: /^sayt haqida$/i })
      .first()
      .click();

    const email = `help-${Date.now().toString(36)}@qdu.uz`;
    const input = page.locator('#site-site-supportEmail');
    await expect(input).toBeVisible({ timeout: 15_000 });
    await input.fill(email);
    await page.getByRole('button', { name: /^saqlash$/i }).click();
    await expect(page.getByText(/saqlandi/i).first()).toBeVisible({ timeout: 15_000 });

    const after = await admin.get<{ values: Record<string, unknown> }>('/admin/site/site-info');
    expect(after.values['site.supportEmail']).toBe(email);

    // Tozalash
    await admin.put('/admin/site/site-info', {
      'site.supportEmail': before.values['site.supportEmail'] ?? 'support@qdu.uz',
    });
  });

  test('xabarlar moduli o`chirilsa menyudan yo`qoladi, yoqilsa qaytadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    const admin = await apiAs(ACCOUNTS.admin);

    await admin.put('/admin/site/messaging-settings', { 'messaging.enabled': false });
    await page.goto('/uz-Latn/dashboard');
    await waitForContent(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole('link', { name: /^xabarlar$/i })).toHaveCount(0);

    await admin.put('/admin/site/messaging-settings', { 'messaging.enabled': true });
    await page.reload();
    await waitForContent(page);
    await expect(page.getByRole('link', { name: /^xabarlar$/i }).first()).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('Talaba bo`limi (HEMIS uslubi)', () => {
  test('menyuda "Talaba" guruhi, reja sahifasi semestrlar bilan ochiladi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);
    await page.goto('/uz-Latn/student/plan');
    await waitForContent(page);
    await expect(
      page.getByRole('heading', { level: 1, name: /individual shaxsiy reja/i }),
    ).toBeVisible({
      timeout: 20_000,
    });
    // Yon panel: HEMIS bandlari
    const nav = page.getByRole('navigation').first();
    await expect(nav.getByRole('link', { name: /^fan tanlov$/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /^talaba xizmatlari$/i })).toBeVisible();
    // Semestr kartalari
    await expect(page.getByText(/1-semestr/i).first()).toBeVisible({ timeout: 20_000 });
  });

  test('talaba xizmatlari: ariza yuboriladi va ro`yxatda ko`rinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.student);
    const student = await apiAs(ACCOUNTS.student);
    const admin = await apiAs(ACCOUNTS.admin);
    const subject = `Akademik ta'til ${Date.now().toString(36)}`;

    // Bir turdagi ochiq ariza faqat bitta bo'ladi — oldingi ishga tushirishlardan
    // qolganlarini administrator yopadi, aks holda "allaqachon ko'rib chiqilmoqda"
    const stale = await admin.get<Array<{ id: string; user: { id: string } }>>(
      '/student-requests?status=PENDING&type=ACADEMIC_LEAVE',
    );
    for (const row of stale.filter((item) => item.user.id === student.userId)) {
      await admin.patch(`/student-requests/${row.id}`, { status: 'REJECTED', resolution: 'e2e' });
    }

    await page.goto('/uz-Latn/student/services');
    await waitForContent(page);
    await page.getByRole('button', { name: /yangi ariza/i }).click();
    await page.locator('#request-type').selectOption('ACADEMIC_LEAVE');
    await page.locator('#request-subject').fill(subject);
    await page.locator('#request-details').fill('Oilaviy sabab');
    await page.getByRole('button', { name: /^yuborish$/i }).click();
    await expect(page.getByText(subject)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/kutilmoqda/i).first()).toBeVisible();

    const mine = await student.get<Array<{ subject: string; status: string }>>('/student/requests');
    expect(mine.some((row) => row.subject === subject && row.status === 'PENDING')).toBe(true);
  });
});

test.describe('LTI platformalari', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
  });

  test('tool manzillari ko`rinadi, platforma qo`shiladi va o`chiriladi', async ({ page }) => {
    await page.goto('/uz-Latn/admin/lti');
    await waitForContent(page);

    await expect(page.getByRole('heading', { level: 1, name: /LTI 1\.3/ })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(/\/api\/v1\/lti\/launch/)).toBeVisible();
    await expect(page.getByText(/\/api\/v1\/lti\/jwks/)).toBeVisible();

    await page
      .getByRole('button', { name: /platforma qo'shish/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const save = dialog.getByRole('button', { name: /^saqlash$/i });
    await expect(save).toBeDisabled();

    const stamp = Date.now().toString(36);
    const name = `E2E Moodle ${stamp}`;
    await dialog.locator('#lti-name').fill(name);
    await dialog.locator('#lti-issuer').fill(`https://moodle-${stamp}.e2e.local`);
    await dialog.locator('#lti-clientId').fill(`client-${stamp}`);
    await dialog.locator('#lti-deploymentId').fill('1');
    await dialog
      .locator('#lti-authLoginUrl')
      .fill(`https://moodle-${stamp}.e2e.local/mod/lti/auth.php`);
    await dialog
      .locator('#lti-authTokenUrl')
      .fill(`https://moodle-${stamp}.e2e.local/mod/lti/token.php`);
    // Kalit manbasi yo'q — saqlab bo'lmaydi
    await expect(save).toBeDisabled();
    await dialog.locator('#lti-publicJwks').fill('{"keys": []}');
    await expect(dialog.getByText(/JWKS JSON noto'g'ri/i)).toBeVisible();
    await dialog.locator('#lti-publicJwks').fill('');
    await dialog
      .locator('#lti-jwksUrl')
      .fill(`https://moodle-${stamp}.e2e.local/mod/lti/certs.php`);
    await expect(save).toBeEnabled();
    await save.click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    const row = page.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await expect(row.getByText('JWKS URL')).toBeVisible();

    await row.getByRole('button', { name: new RegExp(`o'chirish: ${name}`, 'i') }).click();
    const confirm = page.getByRole('dialog');
    await confirm.getByRole('button', { name: /platformani o'chirish/i }).click();
    await expect(confirm).toBeHidden({ timeout: 20_000 });
    await expect(page.getByRole('row').filter({ hasText: name })).toHaveCount(0);
  });
});

test.describe('LTI Deep Linking sahifasi', () => {
  test('tokensiz yoki eskirgan token bilan aniq xabar ko`rsatadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
    await page.goto('/uz-Latn/lti/deep-link?token=eskirgan-token-12345');
    await waitForContent(page);

    await expect(page.getByText(/kursni platformaga ulash/i).first()).toBeVisible({
      timeout: 20_000,
    });
    // Holat Redis'da yo'q — server 422 `lti_state_invalid`, sahifa uni tushunarli ko'rsatadi
    await expect(page.getByText(/LTI sessiyasi \(state\) topilmadi/i)).toBeVisible({
      timeout: 20_000,
    });
  });
});

test.describe('IMS Common Cartridge import', () => {
  let fixture: QuizFixture;

  test.beforeAll(async () => {
    fixture = await seedQuizFixture();
  });

  test('paket rejasi ko`rsatiladi va modul kursga qo`shiladi', async ({ page }) => {
    await signIn(page, ACCOUNTS.teacher);
    await page.goto(`/uz-Latn/courses/${fixture.courseId}`);
    await waitForContent(page);

    const toggle = page.getByRole('switch', { name: /tahrirlash rejimi/i });
    await toggle.waitFor({ state: 'visible', timeout: 20_000 });
    await toggle.click();

    await page
      .getByRole('button', { name: /IMS CC paketidan import/i })
      .first()
      .click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    const stamp = Date.now().toString(36);
    const moduleTitle = `CC e2e modul ${stamp}`;
    const zip = new AdmZip();
    zip.addFile(
      'imsmanifest.xml',
      Buffer.from(
        `<?xml version="1.0"?><manifest identifier="m" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1">
  <metadata><schemaversion>1.1.0</schemaversion></metadata>
  <organizations><organization identifier="o"><item identifier="root">
    <item identifier="m1"><title>${moduleTitle}</title><item identifier="t1"><title>Kirish</title>
      <item identifier="l1" identifierref="r1"><title>O'qish</title></item>
      <item identifier="l2" identifierref="r2"><title>Havola</title></item>
    </item></item>
  </item></organization></organizations>
  <resources>
    <resource identifier="r1" type="webcontent" href="a.html"><file href="a.html"/></resource>
    <resource identifier="r2" type="imswl_xmlv1p1"><file href="l.xml"/></resource>
  </resources></manifest>`,
      ),
    );
    zip.addFile(
      'a.html',
      Buffer.from('<html><body><p>Salom</p><p><img src="pic.png" alt="Rasm"></p></body></html>'),
    );
    zip.addFile(
      'pic.png',
      Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
        'base64',
      ),
    );
    zip.addFile(
      'l.xml',
      Buffer.from('<webLink><title>Sayt</title><url href="https://example.uz/e2e"/></webLink>'),
    );

    await dialog.locator('#cc-file').setInputFiles({
      name: `kurs-${stamp}.imscc`,
      mimeType: 'application/zip',
      buffer: zip.toBuffer(),
    });
    await dialog.getByRole('button', { name: /yuklash va rejani ko'rish/i }).click();

    // Reja: 1 modul, 1 mavzu, 2 dars — bazaga hali yozilmagan
    await expect(dialog.getByText(/1 modul, 1 mavzu, 2 dars/i)).toBeVisible({ timeout: 20_000 });
    await expect(dialog.getByText(moduleTitle)).toBeVisible();

    await dialog.getByRole('button', { name: /1 ta modulni import qilish/i }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(page.getByText(moduleTitle)).toBeVisible({ timeout: 20_000 });

    // Import qilingan darsni ochamiz — HTML ichidagi rasm xususiy fayldan yuklanadi
    const teacher = await apiAs(ACCOUNTS.teacher);
    const structure = await teacher.get<{
      modules: Array<{
        title: Record<string, string>;
        topics: Array<{ lessons: Array<{ id: string; title: Record<string, string> }> }>;
      }>;
    }>(`/courses/${fixture.courseId}`);
    const lessonId = structure.modules
      .filter((module) => Object.values(module.title).includes(moduleTitle))
      .flatMap((module) => module.topics)
      .flatMap((topic) => topic.lessons)
      .find((lesson) => Object.values(lesson.title).includes("O'qish"))?.id;
    expect(lessonId, 'import qilingan dars topilmadi').toBeTruthy();
    await page.goto(`/uz-Latn/courses/${fixture.courseId}/lessons/${lessonId}`);
    await waitForContent(page);
    const image = page.locator('img[alt="Rasm"]').first();
    await expect(image).toHaveAttribute('src', /^https?:\/\//, { timeout: 20_000 });
  });
});

test.describe('Rol berish — doira (scope)', () => {
  test('dekanat roli fakultet bilan beriladi, doira ro`yxatda ko`rinadi', async ({ page }) => {
    await signIn(page, ACCOUNTS.admin);
    const admin = await apiAs(ACCOUNTS.admin);
    const email = `scope-e2e-${Date.now().toString(36)}@qdu.uz`;
    const created = await admin.post<{ id: string }>('/users', {
      email,
      firstName: 'Doira',
      lastName: 'Sinov',
      roleCode: 'TEACHER',
      password: 'Doira!Sinov2026',
    });

    await page.goto('/uz-Latn/admin/users');
    await waitForContent(page);
    await page.getByLabel(/^qidirish$/i).fill(email);
    const row = page.getByRole('row', { name: new RegExp(email) });
    await expect(row).toBeVisible({ timeout: 20_000 });
    await row.getByRole('button', { name: /rol berish/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const save = dialog.getByRole('button', { name: /^saqlash$/i });
    await dialog.locator('#role-code').selectOption('DEANERY');
    // Fakultet tanlanmaguncha saqlab bo'lmaydi
    await expect(dialog.getByText(/fakultet tanlanishi kerak/i)).toBeVisible();
    await expect(save).toBeDisabled();
    await dialog.locator('#role-faculty').selectOption({ index: 1 });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(page.getByText(/rol berildi/i).first()).toBeVisible({ timeout: 15_000 });

    const detail = await admin.get<{
      roles: Array<{ code: string; faculty: { id: string } | null }>;
    }>(`/users/${created.id}`);
    const dean = detail.roles.find((role) => role.code === 'DEANERY');
    expect(dean?.faculty?.id).toBeTruthy();

    await admin.patch(`/users/${created.id}/status`, { status: 'BLOCKED', reason: 'e2e' });
  });
});
