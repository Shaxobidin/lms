/**
 * Maqsad: frontend unit testlari konfiguratsiyasi.
 *
 * MUHIM: `e2e/` katalogi CHETLASHTIRILADI — u Playwright ga tegishli va
 * vitest uni yuklashga urinsa `test.describe` topilmay yiqiladi.
 */

import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    include: ['src/**/*.spec.ts', 'src/**/*.spec.tsx'],
    exclude: ['e2e/**', 'node_modules/**', '.next/**'],
    environment: 'node',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
