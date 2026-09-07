/**
 * Maqsad: autentifikatsiya cookie'larini bir joyda o'rnatish/tozalash (ADR-005, A-23).
 *
 * Ikki kirish nuqtasi bor — oddiy login (`/auth/*`) va LTI launch (`/lti/launch`);
 * ikkalasi ham aynan bir xil cookie qoidalarini ishlatishi shart, aks holda
 * frontend sessiyani tiklay olmaydi.
 */

import type { Response } from 'express';
import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { parseTtlSeconds } from './ttl';

/** Refresh token — `httpOnly`, faqat `/api/v1/auth` yo'liga yuboriladi. */
export const REFRESH_COOKIE = 'lms_refresh';

/**
 * Sessiya-belgisi: SIR EMAS, faqat "sessiya bo'lishi mumkin" degan bayroq.
 * Mijoz shu belgi bo'lmasa `/auth/refresh` ni umuman chaqirmaydi — anonim
 * foydalanuvchi uchun har sahifa yuklanishida keraksiz 401 so'rov ketmaydi.
 */
export const SESSION_HINT_COOKIE = 'lms_session';

/**
 * Refresh cookie: `httpOnly` (JS o'qiy olmaydi), `SameSite=Lax` (CSRF),
 * `path` cheklangan — faqat auth endpointlariga yuboriladi.
 */
export function setAuthCookies(
  response: Response,
  config: ConfigService<AppConfig, true>,
  refreshToken: string,
  rememberMe: boolean,
): void {
  const maxAgeMs =
    (rememberMe ? parseTtlSeconds(config.get('JWT_REFRESH_TTL', { infer: true })) : 86_400) * 1000;

  response.cookie(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: config.get('COOKIE_SECURE', { infer: true }),
    sameSite: 'lax',
    domain: config.get('COOKIE_DOMAIN', { infer: true }),
    path: '/api/v1/auth',
    maxAge: maxAgeMs,
  });

  // Belgi mijozga ko'rinadi (httpOnly emas) va butun sayt bo'yicha yuboriladi
  response.cookie(SESSION_HINT_COOKIE, '1', {
    httpOnly: false,
    secure: config.get('COOKIE_SECURE', { infer: true }),
    sameSite: 'lax',
    domain: config.get('COOKIE_DOMAIN', { infer: true }),
    path: '/',
    maxAge: maxAgeMs,
  });
}

/** Chiqishda ikkala cookie ham tozalanadi. */
export function clearAuthCookies(response: Response): void {
  response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  response.clearCookie(SESSION_HINT_COOKIE, { path: '/' });
}
