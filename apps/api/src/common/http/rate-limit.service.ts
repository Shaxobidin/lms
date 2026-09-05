/**
 * Maqsad: rol bo'yicha differensial so'rov cheklovi (§8, NF-04).
 *
 * Nginx darajasidagi limitdan tashqari, ilova darajasida ham cheklov bor:
 * Nginx IP bo'yicha, bu yerda esa foydalanuvchi va rol bo'yicha — bir IP
 * ortidagi butun universitet bloklanib qolmasligi uchun.
 */

import { Injectable } from '@nestjs/common';
import type { RoleCode } from '@lms/shared';
import { CacheService } from '../cache/cache.service';
import { AppException } from '../errors/app.exception';

/** So'rov / daqiqa (docs/01-architecture.md §5.5). */
const ROLE_LIMITS: Record<RoleCode | 'GUEST_ANON', number> = {
  SUPER_ADMIN: 1200,
  INSTITUTION_ADMIN: 1200,
  DEANERY: 900,
  DEPARTMENT_HEAD: 900,
  METHODIST: 600,
  TEACHER: 600,
  TUTOR: 600,
  STUDENT: 300,
  EXTERNAL_EXPERT: 200,
  GUEST: 60,
  GUEST_ANON: 60,
};

/** Autentifikatsiya endpointlari uchun alohida, qat'iyroq limit. */
const AUTH_LIMIT = { attempts: 10, windowSeconds: 900 };

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

@Injectable()
export class RateLimitService {
  constructor(private readonly cache: CacheService) {}

  /** Umumiy API limiti. */
  async checkApi(identifier: string, roles: readonly RoleCode[]): Promise<RateLimitResult> {
    const limit = roles.length
      ? Math.max(...roles.map((role) => ROLE_LIMITS[role] ?? ROLE_LIMITS.GUEST))
      : ROLE_LIMITS.GUEST_ANON;

    return this.consume(`rl:api:${identifier}`, limit, 60);
  }

  /**
   * Autentifikatsiya urinishlari (brute-force himoyasi, §11).
   * Kalit sifatida IP + login juftligi ishlatiladi.
   */
  async checkAuth(identifier: string): Promise<RateLimitResult> {
    return this.consume(`rl:auth:${identifier}`, AUTH_LIMIT.attempts, AUTH_LIMIT.windowSeconds);
  }

  /** OTP so'rovi — SMS xarajatini nazorat qilish uchun. */
  async checkOtp(phone: string): Promise<RateLimitResult> {
    return this.consume(`rl:otp:${phone}`, 3, 600);
  }

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    const count = await this.cache.increment(key, windowSeconds);

    // Redis mavjud bo'lmasa `increment` 0 qaytaradi — so'rov bloklanmaydi,
    // ammo bu holat `CacheService` da loglangan bo'ladi.
    if (count === 0) {
      return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
    }

    if (count > limit) {
      const ttl = await this.cache.ttl(key);
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: ttl > 0 ? ttl : windowSeconds,
      };
    }

    return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
  }

  /** Limitdan oshsa xatolik tashlaydi (`Retry-After` sarlavhasi bilan). */
  assert(result: RateLimitResult): void {
    if (!result.allowed) {
      throw new AppException({
        code: 'RATE_LIMITED',
        messageKey: 'errors.rate_limited',
        retryAfterSeconds: result.retryAfterSeconds,
      });
    }
  }

  /** Muvaffaqiyatli kirishdan keyin hisoblagichni tozalash. */
  async reset(key: string): Promise<void> {
    await this.cache.del(`rl:auth:${key}`);
  }
}
