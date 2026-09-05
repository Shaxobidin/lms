/**
 * Maqsad: kod sifati qoidalari (NF-10).
 *
 * Asosiy urg'u: modullar orasidagi chegaralarni saqlash (P1) va
 * xatoliklarni jimgina yutib yuborishning oldini olish (§16).
 */

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      'apps/api/src/generated/**',
      'apps/web/public/sw.js',
      'apps/web/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        fetch: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        // Yuk sinovida kechikishni o'lchash uchun (`performance.now()`)
        performance: 'readonly',
        __dirname: 'readonly',
      },
    },

    rules: {
      // Ishlatilmagan o'zgaruvchilar — `_` prefiksi bilan ataylab qoldirilganlari bundan mustasno
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      // `any` — faqat ogohlantirish: tashqi kutubxonalar bilan ishlashda ba'zan zarur
      '@typescript-eslint/no-explicit-any': 'warn',

      // Bo'sh catch bloki — xatolikni jimgina yutish (§16 taqiqlaydi)
      'no-empty': ['error', { allowEmptyCatch: false }],

      // Konsolga yozish faqat skriptlarda; ilovada Logger ishlatiladi
      'no-console': ['warn', { allow: ['warn', 'error'] }],

      // Xavfsizlik
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',

      // Aniqlik
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'prefer-const': 'error',
      'no-var': 'error',
    },
  },

  // Backend: modullar orasidagi chegara (P1)
  {
    files: ['apps/api/src/modules/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              // Bir modul boshqa modulning KONTROLLERIGA murojaat qilmasligi
              // kerak — faqat eksport qilingan servis yoki kontrakt orqali (P1)
              group: ['../*/*.controller'],
              message:
                'Modullar orasida faqat servislar va kontraktlar orqali murojaat qiling (P1).',
            },
          ],
        },
      ],
    },
  },

  // CommonJS konfiguratsiya fayllari
  {
    files: ['**/jest.config.js', '**/postcss.config.mjs', '**/*.config.js'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'writable', require: 'readonly', __dirname: 'readonly' },
    },
  },

  // Skriptlar va seed: konsolga yozish normal
  {
    files: ['scripts/**/*.mjs', 'apps/api/prisma/**/*.ts', 'apps/api/src/openapi.generate.ts'],
    rules: { 'no-console': 'off' },
  },

  // Testlar
  {
    files: ['**/*.spec.ts', '**/*.spec.tsx', 'apps/web/e2e/**/*.ts'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        jest: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      'no-console': 'off',
    },
  },

  // Frontend
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: {
        window: 'readonly',
        document: 'readonly',
        navigator: 'readonly',
        localStorage: 'readonly',
        EventSource: 'readonly',
        HTMLElement: 'readonly',
        HTMLAnchorElement: 'readonly',
        KeyboardEvent: 'readonly',
        BeforeUnloadEvent: 'readonly',
        React: 'readonly',
      },
    },
  },
);
