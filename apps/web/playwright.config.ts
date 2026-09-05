/**
 * Maqsad: e2e testlar konfiguratsiyasi (promt.md §14, ILOVA B).
 *
 * Testlar HAQIQIY tizimga qarshi ishlaydi: API, baza va frontend ko'tarilgan
 * bo'lishi kerak (`docker compose up -d` + `npm run db:seed`).
 * Bu mock bilan sinashdan ko'ra ishonchliroq — qabul mezonlari aynan shunday
 * tekshiriladi (§15).
 */

import { defineConfig, devices } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  // Testlar bir xil demo ma'lumot bilan ishlaydi, shuning uchun ketma-ket
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: process.env.CI ? [['html', { open: 'never' }], ['list']] : [['list']],

  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'uz-UZ',
    timezoneId: 'Asia/Tashkent',
    actionTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Mobil ko'rinish testlari faqat `mobile` loyihasida ishlaydi:
      // desktop viewport da mobil menyu tugmasi ataylab yashiriladi
      testIgnore: /responsive\.spec\.ts/,
    },
    {
      // Mobil ko'rinish ham tekshiriladi (NF-06: 320 px dan)
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      testMatch: /responsive\.spec\.ts/,
    },
  ],
});
