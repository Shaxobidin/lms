/**
 * Maqsad: testlardan oldin Next dev serverini "isitish".
 *
 * Dev rejimida har bir marshrut birinchi so'rovda kompilyatsiya qilinadi
 * (10–40 s). Bu birinchi testlarda `page.goto` timeout va "bosish
 * navigatsiya bermadi" ko'rinishidagi soxta xatolarga sabab bo'lardi. Bu yerda
 * o'qituvchi sifatida kirib asosiy sahifalar bir marta ochiladi — testlar
 * allaqachon kompilyatsiya qilingan marshrutlarga boradi.
 *
 * Production build'ga qarshi ishlaganda ham zararsiz (bir necha soniya).
 */

import { chromium, type FullConfig } from '@playwright/test';
import { ACCOUNTS, PASSWORD } from './helpers';

const API = process.env.E2E_API_URL ?? 'http://127.0.0.1:4000/api/v1';

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL =
    (config.projects[0]?.use.baseURL as string | undefined) ?? 'http://localhost:3000';

  // O'qituvchining kursi — kurs ichidagi marshrutlar uchun
  let courseId: string | null = null;
  let bankId: string | null = null;
  try {
    const login = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ login: ACCOUNTS.teacher, password: PASSWORD }),
    }).then(
      (response) => response.json() as Promise<{ data?: { tokens?: { accessToken?: string } } }>,
    );
    const token = login.data?.tokens?.accessToken;
    if (token) {
      const headers = { authorization: `Bearer ${token}` };
      const courses = (await fetch(`${API}/courses?limit=1`, { headers }).then((r) =>
        r.json(),
      )) as {
        data?: Array<{ id: string }>;
      };
      courseId = courses.data?.[0]?.id ?? null;
      const banks = (await fetch(`${API}/question-banks`, { headers }).then((r) => r.json())) as {
        data?: Array<{ id: string }>;
      };
      bankId = banks.data?.[0]?.id ?? null;
    }
  } catch {
    // API bo'lmasa testlar o'zi aniq xato beradi — bu yerda jim davom etamiz
  }

  const routes = [
    '/uz-Latn/courses',
    '/uz-Latn/my-courses',
    '/uz-Latn/messages',
    '/uz-Latn/attendance',
    '/uz-Latn/certificates',
    '/uz-Latn/curriculum',
    '/uz-Latn/structure',
    '/uz-Latn/structure/calendar',
    '/uz-Latn/question-banks',
    '/uz-Latn/admin/lti',
    '/uz-Latn/lti/deep-link?token=warmup',
    ...(courseId ? [`/uz-Latn/courses/${courseId}`, `/uz-Latn/courses/${courseId}/forum`] : []),
    ...(bankId ? [`/uz-Latn/question-banks/${bankId}`] : []),
  ];

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  try {
    // Gidratsiya tugamasdan bosilsa forma oddiy GET bilan yuboriladi — bir necha
    // marta uriniladi (dev serverda birinchi yuklash sekin)
    let signedIn = false;
    for (let attempt = 0; attempt < 4 && !signedIn; attempt += 1) {
      await page.goto('/uz-Latn/login', { waitUntil: 'networkidle', timeout: 120_000 });
      await page.getByLabel(/login/i).first().fill(ACCOUNTS.teacher);
      await page.locator('#password').fill(PASSWORD);
      await page.getByRole('button', { name: /kirish|войти|sign in/i }).click();
      signedIn = await page
        .waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!signedIn) {
      // Isitish majburiy emas — testlar o'zi aniq xato beradi
      await browser.close();
      return;
    }

    for (const route of routes) {
      await page
        .goto(route, { waitUntil: 'domcontentloaded', timeout: 120_000 })
        .catch(() => undefined);
    }
  } finally {
    await browser.close();
  }
}
