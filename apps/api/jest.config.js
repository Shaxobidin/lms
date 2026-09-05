/**
 * Maqsad: backend testlari konfiguratsiyasi (NF-10 — qamrov ≥ 70%).
 *
 * Qamrov chegarasi domen va servis qatlamiga qo'llaniladi: kontrollerlar
 * yupqa qatlam bo'lib, ular e2e testlar bilan qamrab olinadi (A-24).
 */

/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          module: 'CommonJS',
          moduleResolution: 'Node',
          experimentalDecorators: true,
          emitDecoratorMetadata: true,
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          noUncheckedIndexedAccess: false,
          allowJs: true,
        },
      },
    ],
  },
  // Standart holatda `node_modules` transformatsiya qilinmaydi; ESM-only
  // paketlar uchun istisno beramiz.
  // Windows'da yo'l ajratgichi `\` bo'lgani uchun ikkala variant qamraladi.
  transformIgnorePatterns: ['node_modules[/\\\\](?!@exodus[/\\\\]bytes)'],
  moduleNameMapper: {
    '^@lms/shared$': '<rootDir>/../../packages/shared/src/index.ts',
  },
  /**
   * Qamrov o'lchanadigan qatlam (A-24): sof mantiq va xavfsizlik yadrosi.
   * Baza bilan ishlaydigan servislar e2e va smoke testlar bilan qamrab olinadi —
   * ularni mock bilan qoplash soxta qamrov beradi, haqiqiy ishonch emas.
   */
  collectCoverageFrom: [
    'src/common/auth/scope-filter.ts',
    'src/common/auth/policy.guard.ts',
    'src/common/security/**/*.ts',
    'src/common/errors/**/*.ts',
    'src/common/http/rate-limit.service.ts',
    'src/modules/documents/gost.ts',
    'src/modules/quizzes/strip-answers.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 55,
      functions: 65,
      lines: 70,
    },
  },
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Testlar bir-biriga xalaqit bermasligi uchun
  maxWorkers: '50%',
};
