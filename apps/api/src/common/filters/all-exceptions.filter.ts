/**
 * Maqsad: barcha xatoliklarni yagona API konvertiga aylantirish (§8).
 *
 * Muhim: ichki tafsilotlar (SQL, stek, tashqi xizmat javobi) mijozga
 * CHIQARILMAYDI — faqat `traceId` beriladi, tafsilotlar loglarga yoziladi (NF-07).
 */

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ZodError } from 'zod';
import type { Request, Response } from 'express';
import { fail, type ApiError, type ApiFieldError } from '@lms/shared';
import { AppException, DEFAULT_MESSAGES } from '../errors/app.exception';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request & { traceId?: string }>();
    const traceId = request.traceId ?? 'unknown';

    const { status, error, logLevel } = this.normalize(exception, traceId);

    if (logLevel === 'error') {
      this.logger.error(
        {
          traceId,
          code: error.code,
          path: request.url,
          method: request.method,
          context: exception instanceof AppException ? exception.context : undefined,
          stack: exception instanceof Error ? exception.stack : undefined,
        },
        `So'rovda xatolik: ${error.code}`,
      );
    } else {
      this.logger.warn(
        { traceId, code: error.code, path: request.url, method: request.method },
        `So'rov rad etildi: ${error.code}`,
      );
    }

    if (error.retryAfterSeconds) {
      response.setHeader('Retry-After', String(error.retryAfterSeconds));
    }

    response.status(status).json(fail(error));
  }

  private normalize(
    exception: unknown,
    traceId: string,
  ): { status: number; error: ApiError; logLevel: 'warn' | 'error' } {
    // 1. Bizning domen xatoligimiz
    if (exception instanceof AppException) {
      return {
        status: exception.getStatus(),
        error: {
          code: exception.code,
          messageKey: exception.messageKey,
          message: exception.localizedMessage,
          ...(exception.details ? { details: exception.details } : {}),
          ...(exception.retryAfterSeconds
            ? { retryAfterSeconds: exception.retryAfterSeconds }
            : {}),
          traceId,
        },
        logLevel: exception.getStatus() >= 500 ? 'error' : 'warn',
      };
    }

    // 2. Zod validatsiya xatoligi (pipe tashqarisida qolgan holatlar)
    if (exception instanceof ZodError) {
      return {
        status: HttpStatus.BAD_REQUEST,
        error: {
          code: 'VALIDATION_ERROR',
          messageKey: 'errors.validation',
          message: DEFAULT_MESSAGES.VALIDATION_ERROR,
          details: zodToFieldErrors(exception),
          traceId,
        },
        logLevel: 'warn',
      };
    }

    // 3. Prisma xatoliklari — mijozga texnik tafsilotlarsiz
    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.normalizePrisma(exception, traceId);
    }

    // 4. NestJS standart xatoliklari (404 route, 413 va h.k.)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        status === HttpStatus.NOT_FOUND
          ? 'NOT_FOUND'
          : status === HttpStatus.PAYLOAD_TOO_LARGE
            ? 'PAYLOAD_TOO_LARGE'
            : status === HttpStatus.UNSUPPORTED_MEDIA_TYPE
              ? 'UNSUPPORTED_MEDIA_TYPE'
              : status === HttpStatus.TOO_MANY_REQUESTS
                ? 'RATE_LIMITED'
                : status >= 500
                  ? 'INTERNAL_ERROR'
                  : 'VALIDATION_ERROR';

      return {
        status,
        error: {
          code,
          messageKey: `errors.${code.toLowerCase()}`,
          message: DEFAULT_MESSAGES[code],
          traceId,
        },
        logLevel: status >= 500 ? 'error' : 'warn',
      };
    }

    // 5. Kutilmagan xatolik
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: {
        code: 'INTERNAL_ERROR',
        messageKey: 'errors.internal',
        message: DEFAULT_MESSAGES.INTERNAL_ERROR,
        traceId,
      },
      logLevel: 'error',
    };
  }

  private normalizePrisma(
    exception: Prisma.PrismaClientKnownRequestError,
    traceId: string,
  ): { status: number; error: ApiError; logLevel: 'warn' | 'error' } {
    switch (exception.code) {
      // Unikal cheklov buzildi
      case 'P2002': {
        const target = exception.meta?.['target'];
        const fields = Array.isArray(target) ? target : [String(target ?? 'unknown')];
        return {
          status: HttpStatus.CONFLICT,
          error: {
            code: 'CONFLICT',
            messageKey: 'errors.duplicate_value',
            message: DEFAULT_MESSAGES.CONFLICT,
            details: fields.map((field) => ({ field: String(field), code: 'duplicate' })),
            traceId,
          },
          logLevel: 'warn',
        };
      }
      // Tashqi kalit buzildi
      case 'P2003':
        return {
          status: HttpStatus.CONFLICT,
          error: {
            code: 'CONFLICT',
            messageKey: 'errors.related_record_missing',
            message: DEFAULT_MESSAGES.CONFLICT,
            traceId,
          },
          logLevel: 'warn',
        };
      // Yozuv topilmadi
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: {
            code: 'NOT_FOUND',
            messageKey: 'errors.not_found.record',
            message: DEFAULT_MESSAGES.NOT_FOUND,
            traceId,
          },
          logLevel: 'warn',
        };
      default:
        return {
          status: HttpStatus.INTERNAL_SERVER_ERROR,
          error: {
            code: 'INTERNAL_ERROR',
            messageKey: 'errors.internal',
            message: DEFAULT_MESSAGES.INTERNAL_ERROR,
            traceId,
          },
          logLevel: 'error',
        };
    }
  }
}

/** Zod xatoliklarini maydon darajasidagi ro'yxatga aylantiradi (§8). */
export function zodToFieldErrors(error: ZodError): ApiFieldError[] {
  return error.errors.map((issue) => ({
    field: issue.path.join('.') || '_root',
    // Zod `message` sifatida i18n kalitini saqlaydi (masalan `validation.email`)
    code: issue.message,
    ...(issue.code === 'invalid_type'
      ? { params: { expected: issue.expected, received: issue.received } }
      : {}),
  }));
}
