/**
 * Maqsad: sayt boshqaruvidagi "IP bloklovchi" (Moodle IP blocker) — F-17, NF-04.
 *
 * `security.ipDenyList` dagi manzil har doim rad etiladi; `security.ipAllowList`
 * to'ldirilgan bo'lsa faqat ro'yxatdagilar kiradi. Ikkalasi ham bo'sh bo'lsa
 * guard hech narsa qilmaydi (odatiy holat). Salomatlik tekshiruvi (`/health`)
 * istisno — orkestrator har doim so'ray olishi kerak.
 *
 * IP `x-forwarded-for` dan olinadi (Nginx orqasida), aks holda socket manzili.
 */

import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { isIpAllowed } from '@lms/shared';
import { AppException } from '../errors/app.exception';
import { SiteSettingsService } from '../settings/site-settings.service';

export function requestClientIp(request: Request): string {
  const forwarded = request.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0]?.trim() ?? request.ip ?? '';
  }
  return request.ip ?? '';
}

@Injectable()
export class IpBlockGuard implements CanActivate {
  constructor(private readonly settings: SiteSettingsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    if (request.path.includes('/health')) return true;

    const [allowList, denyList] = await Promise.all([
      this.settings.getList('security.ipAllowList'),
      this.settings.getList('security.ipDenyList'),
    ]);
    if (allowList.length === 0 && denyList.length === 0) return true;

    const ip = requestClientIp(request);
    if (isIpAllowed(ip, allowList, denyList)) return true;

    throw new AppException({
      code: 'FORBIDDEN',
      messageKey: 'errors.ip_blocked',
      context: { ip },
    });
  }
}
