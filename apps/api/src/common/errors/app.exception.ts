/**
 * Maqsad: domen xatoliklarining yagona ifodasi (docs/01-architecture.md §5.2).
 *
 * Qoida (§16): xatoliklar yutib yuborilmaydi — har biri aniq kod, i18n kaliti va
 * (kerak bo'lsa) maydon darajasidagi tafsilotlar bilan qaytariladi.
 * Backend hech qachon tayyor matn qaytarmaydi (P7) — `message` faqat zaxira.
 */

import { HttpException } from '@nestjs/common';
import {
  ERROR_HTTP_STATUS,
  type ApiFieldError,
  type ErrorCode,
  type LocalizedText,
} from '@lms/shared';

export interface AppExceptionOptions {
  code: ErrorCode;
  messageKey: string;
  message?: LocalizedText;
  details?: ApiFieldError[];
  /** Log uchun qo'shimcha kontekst — mijozga YUBORILMAYDI. */
  context?: Record<string, unknown>;
  retryAfterSeconds?: number;
  cause?: unknown;
}

export class AppException extends HttpException {
  readonly code: ErrorCode;
  readonly messageKey: string;
  readonly localizedMessage: LocalizedText;
  readonly details?: ApiFieldError[];
  readonly context?: Record<string, unknown>;
  readonly retryAfterSeconds?: number;

  constructor(options: AppExceptionOptions) {
    const status = ERROR_HTTP_STATUS[options.code];
    super(options.messageKey, status, { cause: options.cause });

    this.code = options.code;
    this.messageKey = options.messageKey;
    this.localizedMessage = options.message ?? DEFAULT_MESSAGES[options.code];
    this.details = options.details;
    this.context = options.context;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }

  // --- Tez-tez ishlatiladigan xatoliklar uchun fabrikalar --------------------

  static notFound(resource: string, id?: string): AppException {
    return new AppException({
      code: 'NOT_FOUND',
      messageKey: `errors.not_found.${resource}`,
      context: { resource, id },
    });
  }

  static forbidden(permission?: string): AppException {
    return new AppException({
      code: 'FORBIDDEN',
      messageKey: 'errors.forbidden',
      context: { permission },
    });
  }

  static unauthenticated(reason = 'missing_token'): AppException {
    return new AppException({
      code: 'UNAUTHENTICATED',
      messageKey: 'errors.unauthenticated',
      context: { reason },
    });
  }

  static conflict(messageKey: string, context?: Record<string, unknown>): AppException {
    return new AppException({ code: 'CONFLICT', messageKey, context });
  }

  /** Domen qoidasi buzilgan (masalan, muddati o'tgan testga javob yuborish). */
  static businessRule(messageKey: string, context?: Record<string, unknown>): AppException {
    return new AppException({
      code: 'BUSINESS_RULE_VIOLATION',
      messageKey,
      context,
    });
  }

  static validation(details: ApiFieldError[]): AppException {
    return new AppException({
      code: 'VALIDATION_ERROR',
      messageKey: 'errors.validation',
      details,
    });
  }

  static dependencyUnavailable(service: string, cause?: unknown): AppException {
    return new AppException({
      code: 'DEPENDENCY_UNAVAILABLE',
      messageKey: 'errors.dependency_unavailable',
      context: { service },
      cause,
    });
  }
}

/**
 * Zaxira matnlar. Frontend `messageKey` bo'yicha o'z katalogidan matn oladi;
 * bu qiymatlar faqat kalit topilmaganda yoki API to'g'ridan-to'g'ri
 * (masalan, integratsiya orqali) chaqirilganda ishlatiladi.
 */
const DEFAULT_MESSAGES: Record<ErrorCode, LocalizedText> = {
  VALIDATION_ERROR: {
    'uz-Latn': "Kiritilgan ma'lumotlar noto'g'ri",
    'uz-Cyrl': 'Киритилган маълумотлар нотўғри',
    ru: 'Введённые данные некорректны',
    en: 'The submitted data is invalid',
  },
  UNAUTHENTICATED: {
    'uz-Latn': 'Tizimga kirish talab qilinadi',
    'uz-Cyrl': 'Тизимга кириш талаб қилинади',
    ru: 'Требуется вход в систему',
    en: 'Authentication required',
  },
  INVALID_CREDENTIALS: {
    'uz-Latn': "Login yoki parol noto'g'ri",
    'uz-Cyrl': 'Логин ёки парол нотўғри',
    ru: 'Неверный логин или пароль',
    en: 'Invalid login or password',
  },
  TWO_FACTOR_REQUIRED: {
    'uz-Latn': 'Ikki bosqichli tasdiqlash kodi talab qilinadi',
    'uz-Cyrl': 'Икки босқичли тасдиқлаш коди талаб қилинади',
    ru: 'Требуется код двухфакторной аутентификации',
    en: 'Two-factor authentication code required',
  },
  ACCOUNT_LOCKED: {
    'uz-Latn': 'Hisob vaqtincha bloklangan',
    'uz-Cyrl': 'Ҳисоб вақтинча блокланган',
    ru: 'Учётная запись временно заблокирована',
    en: 'Account is temporarily locked',
  },
  FORBIDDEN: {
    'uz-Latn': 'Ushbu amal uchun ruxsat yetarli emas',
    'uz-Cyrl': 'Ушбу амал учун рухсат етарли эмас',
    ru: 'Недостаточно прав для выполнения операции',
    en: 'You do not have permission to perform this action',
  },
  NOT_FOUND: {
    'uz-Latn': 'Resurs topilmadi',
    'uz-Cyrl': 'Ресурс топилмади',
    ru: 'Ресурс не найден',
    en: 'Resource not found',
  },
  CONFLICT: {
    'uz-Latn': 'Amal joriy holat bilan mos kelmaydi',
    'uz-Cyrl': 'Амал жорий ҳолат билан мос келмайди',
    ru: 'Операция конфликтует с текущим состоянием',
    en: 'The operation conflicts with the current state',
  },
  IDEMPOTENCY_CONFLICT: {
    'uz-Latn': "Bir xil Idempotency-Key boshqa so'rov bilan ishlatilgan",
    'uz-Cyrl': 'Бир хил Idempotency-Key бошқа сўров билан ишлатилган',
    ru: 'Тот же Idempotency-Key использован с другим запросом',
    en: 'The same Idempotency-Key was used with a different request',
  },
  PAYLOAD_TOO_LARGE: {
    'uz-Latn': 'Fayl hajmi ruxsat etilgan chegaradan katta',
    'uz-Cyrl': 'Файл ҳажми рухсат этилган чегарадан катта',
    ru: 'Размер файла превышает допустимый предел',
    en: 'The file exceeds the allowed size limit',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    'uz-Latn': "Fayl turi qo'llab-quvvatlanmaydi",
    'uz-Cyrl': 'Файл тури қўллаб-қувватланмайди',
    ru: 'Тип файла не поддерживается',
    en: 'Unsupported file type',
  },
  BUSINESS_RULE_VIOLATION: {
    'uz-Latn': 'Amal tizim qoidalariga zid',
    'uz-Cyrl': 'Амал тизим қоидаларига зид',
    ru: 'Операция нарушает правила системы',
    en: 'The operation violates a business rule',
  },
  RATE_LIMITED: {
    'uz-Latn': "So'rovlar soni chegaradan oshdi, biroz kuting",
    'uz-Cyrl': 'Сўровлар сони чегарадан ошди, бироз кутинг',
    ru: 'Превышено количество запросов, подождите',
    en: 'Too many requests, please wait',
  },
  DEPENDENCY_UNAVAILABLE: {
    'uz-Latn': 'Tashqi xizmat vaqtincha mavjud emas',
    'uz-Cyrl': 'Ташқи хизмат вақтинча мавжуд эмас',
    ru: 'Внешний сервис временно недоступен',
    en: 'An external service is temporarily unavailable',
  },
  INTERNAL_ERROR: {
    'uz-Latn': 'Tizimda kutilmagan xatolik yuz berdi',
    'uz-Cyrl': 'Тизимда кутилмаган хатолик юз берди',
    ru: 'Произошла непредвиденная ошибка',
    en: 'An unexpected error occurred',
  },
};

export { DEFAULT_MESSAGES };
