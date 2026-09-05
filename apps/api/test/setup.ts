/**
 * Maqsad: testlar uchun umumiy muhit sozlamalari.
 *
 * Testlar HECH QACHON haqiqiy bazaga yozmaydi: barcha tashqi bog'liqliklar
 * (Prisma, Redis, S3) mock qilinadi. Bu testlarni tez va barqaror qiladi.
 */

process.env.NODE_ENV = 'test';
process.env.TZ = 'Asia/Tashkent';

// Konfiguratsiya validatsiyasidan o'tish uchun minimal qiymatlar
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/test';
process.env.S3_ENDPOINT ??= 'http://localhost:9000';
process.env.S3_ACCESS_KEY ??= 'test';
process.env.S3_SECRET_KEY ??= 'test';
process.env.S3_BUCKET ??= 'test';
process.env.JWT_ACCESS_SECRET ??= 'test_access_secret_at_least_thirty_two_chars_long';
process.env.JWT_REFRESH_SECRET ??= 'test_refresh_secret_at_least_thirty_two_chars_lon';
process.env.CRYPTO_SECRET_KEY ??=
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

jest.setTimeout(20_000);
