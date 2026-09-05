/**
 * Maqsad: muhit o'zgaruvchilarini qat'iy validatsiya qilish va tipli konfiguratsiyaga
 * aylantirish (§11: sirlar faqat muhit o'zgaruvchilarida).
 *
 * Ilova noto'g'ri konfiguratsiya bilan ISHGA TUSHMAYDI — bu prod'da "jimgina
 * noto'g'ri ishlash" dan ko'ra xavfsizroq.
 */

import { z } from 'zod';

const booleanFromString = z
  .union([z.boolean(), z.string()])
  .transform((value) =>
    typeof value === 'boolean' ? value : ['true', '1', 'yes', 'on'].includes(value.toLowerCase()),
  );

const csv = z
  .string()
  .default('')
  .transform((value) =>
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  /** `api` — HTTP server, `worker` — faqat navbat ishlovchilari (ADR-004). */
  APP_ROLE: z.enum(['api', 'worker', 'all']).default('all'),

  TENANT_NAME: z.string().min(1).default("Qo'qon Davlat Universiteti"),
  TENANT_SHORT_NAME: z.string().min(1).default('QDU'),
  TENANT_DOMAIN: z.string().min(1).default('lms.qdu.uz'),
  TENANT_DEFAULT_LOCALE: z.enum(['uz-Latn', 'uz-Cyrl', 'ru', 'en']).default('uz-Latn'),
  TENANT_TIMEZONE: z.string().default('Asia/Tashkent'),

  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  WEB_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
  MEDIA_PUBLIC_URL: z.string().url().default('http://localhost:9000'),

  DATABASE_URL: z.string().min(1),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString.default(true),
  S3_PRESIGN_TTL: z.coerce.number().int().min(60).max(86_400).default(900),

  // Sirlar uchun minimal uzunlik — zaif kalit bilan ishga tushishga yo'l qo'yilmaydi
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET kamida 32 belgi bo'lishi kerak"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET kamida 32 belgi bo'lishi kerak"),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  CRYPTO_SECRET_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/i, "CRYPTO_SECRET_KEY 64 ta hex belgidan iborat bo'lishi kerak"),

  PASSWORD_MIN_LENGTH: z.coerce.number().int().min(8).max(64).default(10),
  PASSWORD_REQUIRE_MIXED_CASE: booleanFromString.default(true),
  PASSWORD_REQUIRE_DIGIT: booleanFromString.default(true),
  PASSWORD_REQUIRE_SYMBOL: booleanFromString.default(false),
  PASSWORD_HISTORY_SIZE: z.coerce.number().int().min(0).max(24).default(5),
  LOGIN_MAX_ATTEMPTS: z.coerce.number().int().min(3).max(20).default(5),
  LOGIN_LOCKOUT_MINUTES: z.coerce.number().int().min(1).max(1440).default(15),

  CORS_ORIGINS: csv,
  COOKIE_DOMAIN: z.string().default('localhost'),
  COOKIE_SECURE: booleanFromString.default(false),
  RATE_LIMIT_ENABLED: booleanFromString.default(true),

  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_SECURE: booleanFromString.default(false),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().default('QDU LMS <no-reply@lms.qdu.uz>'),

  SMS_PROVIDER: z.enum(['mock', 'eskiz', 'playmobile']).default('mock'),
  ESKIZ_BASE_URL: z.string().default('https://notify.eskiz.uz/api'),
  ESKIZ_EMAIL: z.string().optional(),
  ESKIZ_PASSWORD: z.string().optional(),
  ESKIZ_SENDER: z.string().default('4546'),

  TELEGRAM_ENABLED: booleanFromString.default(false),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),

  HEMIS_MODE: z.enum(['mock', 'live']).default('mock'),
  HEMIS_BASE_URL: z.string().default(''),
  HEMIS_API_TOKEN: z.string().optional(),
  HEMIS_SYNC_CRON: z.string().default('0 3 * * *'),

  ONEID_ENABLED: booleanFromString.default(false),
  ONEID_ISSUER: z.string().default(''),
  ONEID_CLIENT_ID: z.string().optional(),
  ONEID_CLIENT_SECRET: z.string().optional(),
  ONEID_REDIRECT_URI: z.string().default(''),

  SIGNATURE_PROVIDER: z.enum(['mock', 'eimzo']).default('mock'),
  EIMZO_VERIFY_URL: z.string().optional(),

  PAYMENT_PROVIDER: z.enum(['mock', 'payme', 'click', 'uzum']).default('mock'),
  PAYME_MERCHANT_ID: z.string().optional(),
  PAYME_SECRET_KEY: z.string().optional(),
  CLICK_MERCHANT_ID: z.string().optional(),
  CLICK_SERVICE_ID: z.string().optional(),
  CLICK_SECRET_KEY: z.string().optional(),

  CLASSROOM_PROVIDER: z.enum(['jitsi', 'bbb']).default('jitsi'),
  JITSI_DOMAIN: z.string().default('meet.jit.si'),
  JITSI_APP_ID: z.string().optional(),
  JITSI_APP_SECRET: z.string().optional(),
  BBB_BASE_URL: z.string().optional(),
  BBB_SECRET: z.string().optional(),

  FFMPEG_PATH: z.string().default('ffmpeg'),
  FFPROBE_PATH: z.string().default('ffprobe'),
  HLS_RENDITIONS: csv,
  MAX_UPLOAD_SIZE_MB: z.coerce.number().int().min(1).max(5120).default(512),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  LOG_PRETTY: booleanFromString.default(false),
  METRICS_ENABLED: booleanFromString.default(true),
  METRICS_PATH: z.string().default('/metrics'),
});

export type Env = z.infer<typeof envSchema>;

/**
 * NestJS `ConfigModule.validate` uchun. Xatolik bo'lsa aniq, o'qiladigan
 * xabar bilan ishga tushishni to'xtatadi.
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.errors
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Muhit o'zgaruvchilari noto'g'ri sozlangan:\n${details}`);
  }

  // Prod uchun qo'shimcha xavfsizlik tekshiruvlari
  if (result.data.NODE_ENV === 'production') {
    const weak: string[] = [];
    if (result.data.JWT_ACCESS_SECRET.includes('replace_with')) weak.push('JWT_ACCESS_SECRET');
    if (result.data.JWT_REFRESH_SECRET.includes('replace_with')) weak.push('JWT_REFRESH_SECRET');
    if (/^0+$/.test(result.data.CRYPTO_SECRET_KEY)) weak.push('CRYPTO_SECRET_KEY');
    if (!result.data.COOKIE_SECURE) weak.push("COOKIE_SECURE (prod'da true bo'lishi shart)");
    if (weak.length > 0) {
      throw new Error(
        `Ishlab chiqarish muhitida standart/zaif qiymatlar aniqlandi: ${weak.join(', ')}`,
      );
    }
  }

  return result.data;
}

/** `ConfigService<AppConfig>` uchun tipli konfiguratsiya. */
export type AppConfig = Env;
