/**
 * Maqsad: barcha muvaffaqiyatli javoblarni yagona konvertga o'rash (§8).
 *
 * Kontroller sof ma'lumot qaytaradi, konvert shu yerda qo'shiladi — bu har bir
 * kontrollerda takrorlanishni yo'q qiladi va formatning bir xilligini kafolatlaydi.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, Observable } from 'rxjs';
import { ok, type ApiEnvelope, type ApiMeta } from '@lms/shared';

/** Konvertsiz javob (masalan, fayl oqimi yoki SSE) uchun belgi. */
export const SKIP_ENVELOPE = 'skipEnvelope';
export const SkipEnvelope = (): MethodDecorator => SetMetadata(SKIP_ENVELOPE, true);

/**
 * Servis `{ data, meta }` qaytarsa — meta konvertga ko'chiriladi.
 * Aks holda qaytgan qiymat butunlay `data` hisoblanadi.
 */
export interface PaginatedResult<T> {
  data: T;
  meta: ApiMeta;
}

function isPaginated<T>(value: unknown): value is PaginatedResult<T> {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    'meta' in value &&
    Object.keys(value).length === 2
  );
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiEnvelope<unknown>> {
  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler<T>): Observable<ApiEnvelope<unknown>> {
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_ENVELOPE, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (skip) {
      return next.handle() as unknown as Observable<ApiEnvelope<unknown>>;
    }

    return next.handle().pipe(
      map((result) => {
        if (isPaginated(result)) {
          return ok(result.data, result.meta);
        }
        return ok(result ?? null);
      }),
    );
  }
}
