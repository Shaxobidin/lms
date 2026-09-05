/**
 * Maqsad: kontrollerlarda ishlatiladigan autentifikatsiya/avtorizatsiya dekoratorlari.
 *
 * Qat'iy qoida (P3): kontroller yoki servisda `if (user.role === ...)` YO'Q.
 * Faqat `@RequirePermission('resource:action:scope')`.
 */

import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import type { Request } from 'express';
import type { PermissionKey, Resource } from '@lms/shared';
import type { RequestUser } from './auth.types';
import { AppException } from '../errors/app.exception';

export const IS_PUBLIC_KEY = 'isPublic';
export const PERMISSIONS_KEY = 'requiredPermissions';
export const SCOPE_SOURCE_KEY = 'scopeSource';
export const SKIP_RATE_LIMIT_KEY = 'skipRateLimit';

/** Autentifikatsiyasiz ochiq endpoint (masalan, sertifikat verifikatsiyasi). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC_KEY, true);

/**
 * Rate limitdan ozod qilish. Faqat monitoring uchun: `/health` va `/metrics`
 * ni Prometheus tez-tez so'raydi, ular limitga kirmasligi kerak.
 */
export const SkipRateLimit = (): MethodDecorator & ClassDecorator =>
  SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/**
 * Resursni scope tekshiruvi uchun qayerdan olishni ko'rsatadi.
 * Masalan `@ScopeSource('course', 'params.id')` — URL dagi `id` kurs identifikatori.
 */
export interface ScopeSource {
  resource: Resource;
  /** `params.id`, `body.courseId`, `query.courseId` ko'rinishida yo'l. */
  path: string;
}

/**
 * Ruxsat talabi. Bir nechta kalit berilsa — ularning HAR BIRI bo'lishi shart emas,
 * bittasi yetarli (OR mantiq); bu "yoki o'z kursida, yoki butun kafedrada"
 * kabi holatlarni ifodalash uchun.
 */
export function RequirePermission(
  permissions: PermissionKey | PermissionKey[],
  scopeSource?: ScopeSource,
): MethodDecorator & ClassDecorator {
  const list = Array.isArray(permissions) ? permissions : [permissions];
  const decorators: Array<MethodDecorator & ClassDecorator> = [SetMetadata(PERMISSIONS_KEY, list)];
  if (scopeSource) decorators.push(SetMetadata(SCOPE_SOURCE_KEY, scopeSource));
  return applyDecorators(...decorators) as MethodDecorator & ClassDecorator;
}

/** Joriy foydalanuvchi. `@CurrentUser('id')` bilan bitta maydonni ham olish mumkin. */
export const CurrentUser = createParamDecorator(
  (field: keyof RequestUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const user = request.user;
    if (!user) {
      // Bu holat guard xatosini bildiradi — jimgina `undefined` qaytarmaymiz
      throw AppException.unauthenticated('user_context_missing');
    }
    return field ? user[field] : user;
  },
);

/** So'rovning trace identifikatori — loglar bilan bog'lash uchun. */
export const TraceId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  return request.traceId ?? 'unknown';
});

/** Mijoz IP manzili (audit uchun, §11). */
export const ClientIp = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<Request>();
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? request.ip;
  return request.ip;
});
