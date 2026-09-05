/**
 * Maqsad: rolga qarab farqlanadigan API rate limitini QO'LLASH (promt.md §8).
 *
 * `RateLimitService` limitlar jadvalini saqlaydi, lekin uni chaqiradigan joy
 * yo'q edi — ya'ni cheklov amalda ishlamasdi. Bu guard `JwtAuthGuard` dan
 * KEYIN ishlaydi, shuning uchun `request.user` allaqachon mavjud bo'ladi va
 * limit foydalanuvchining eng keng roli bo'yicha tanlanadi.
 *
 * Identifikator: autentifikatsiyalangan foydalanuvchi uchun `user:<id>`,
 * anonim so'rov uchun `ip:<manzil>`. Foydalanuvchi bo'yicha hisoblash NAT
 * ortidagi butun universitetni bitta limitga qamab qo'yishning oldini oladi.
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import type { RoleCode } from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { RateLimitService } from './rate-limit.service';
import { SKIP_RATE_LIMIT_KEY } from '../auth/decorators';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly enabled: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.enabled = config.get('RATE_LIMIT_ENABLED', { infer: true });
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (!this.enabled) return true;

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_RATE_LIMIT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    const user = request.user;
    const identifier = user ? `user:${user.id}` : `ip:${clientIp(request)}`;
    const roles: readonly RoleCode[] = user?.roles ?? [];

    const result = await this.rateLimit.checkApi(identifier, roles);
    response.setHeader('X-RateLimit-Remaining', String(result.remaining));

    // Limitdan oshsa 429 va `Retry-After` bilan xatolik tashlanadi
    this.rateLimit.assert(result);
    return true;
  }
}

/**
 * Mijoz IP si. Nginx ortida `X-Forwarded-For` birinchi qiymati haqiqiy mijoz
 * bo'ladi; to'g'ridan-to'g'ri murojaatda Express ning o'z qiymati ishlatiladi.
 */
function clientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return (forwarded.split(',')[0] as string).trim();
  }
  return request.ip ?? 'unknown';
}
