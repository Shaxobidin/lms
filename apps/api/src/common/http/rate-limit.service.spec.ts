/**
 * Maqsad: so'rov cheklovi mantig'ining testlari (§8, §11 — brute-force himoyasi).
 */

import type { RoleCode } from '@lms/shared';
import { RateLimitService } from './rate-limit.service';
import type { CacheService } from '../cache/cache.service';
import { AppException } from '../errors/app.exception';

/** Xotiradagi soxta kesh — Redis'siz testlash uchun. */
function makeCache(): CacheService {
  const counters = new Map<string, number>();

  return {
    increment: jest.fn(async (key: string) => {
      const next = (counters.get(key) ?? 0) + 1;
      counters.set(key, next);
      return next;
    }),
    ttl: jest.fn(async () => 45),
    del: jest.fn(async () => undefined),
  } as unknown as CacheService;
}

describe('RateLimitService', () => {
  it("limit ichidagi so'rovlarga ruxsat beradi", async () => {
    const service = new RateLimitService(makeCache());

    for (let i = 0; i < 5; i += 1) {
      const result = await service.consume('test', 10, 60);
      expect(result.allowed).toBe(true);
    }
  });

  it('limitdan oshganda rad etadi va Retry-After beradi', async () => {
    const service = new RateLimitService(makeCache());

    for (let i = 0; i < 3; i += 1) {
      await service.consume('test', 3, 60);
    }

    const result = await service.consume('test', 3, 60);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(45);
  });

  it('rad etilgan natijada aniq xatolik tashlaydi', () => {
    const service = new RateLimitService(makeCache());

    expect(() => service.assert({ allowed: false, remaining: 0, retryAfterSeconds: 30 })).toThrow(
      AppException,
    );

    try {
      service.assert({ allowed: false, remaining: 0, retryAfterSeconds: 30 });
    } catch (error) {
      expect((error as AppException).code).toBe('RATE_LIMITED');
      expect((error as AppException).getStatus()).toBe(429);
    }
  });

  it('ruxsat etilgan natijada xatolik tashlamaydi', () => {
    const service = new RateLimitService(makeCache());
    expect(() =>
      service.assert({ allowed: true, remaining: 5, retryAfterSeconds: 0 }),
    ).not.toThrow();
  });

  it("rol bo'yicha limit farqlanadi: talaba < administrator", async () => {
    const cache = makeCache();
    const service = new RateLimitService(cache);

    const student = await service.checkApi('user-1', ['STUDENT'] as RoleCode[]);
    const admin = await service.checkApi('user-2', ['SUPER_ADMIN'] as RoleCode[]);

    expect(admin.remaining).toBeGreaterThan(student.remaining);
  });

  it("bir nechta rolda eng yuqori limit qo'llanadi", async () => {
    const service = new RateLimitService(makeCache());
    const result = await service.checkApi('user-3', ['STUDENT', 'TEACHER'] as RoleCode[]);

    // O'qituvchi limiti (600) talaba limitidan (300) yuqori
    expect(result.remaining).toBeGreaterThan(300);
  });

  it('rolsiz foydalanuvchi mehmon limitini oladi', async () => {
    const service = new RateLimitService(makeCache());
    const result = await service.checkApi('anon', []);
    expect(result.remaining).toBeLessThanOrEqual(60);
  });

  it("OTP so'rovi qat'iy cheklanadi (SMS xarajati)", async () => {
    const service = new RateLimitService(makeCache());

    await service.checkOtp('+998901234567');
    await service.checkOtp('+998901234567');
    await service.checkOtp('+998901234567');

    const fourth = await service.checkOtp('+998901234567');
    expect(fourth.allowed).toBe(false);
  });

  it("kesh ishlamasa so'rovni bloklamaydi (graceful degradation)", async () => {
    const brokenCache = {
      increment: jest.fn(async () => 0),
      ttl: jest.fn(async () => -1),
      del: jest.fn(async () => undefined),
    } as unknown as CacheService;

    const service = new RateLimitService(brokenCache);
    const result = await service.consume('test', 10, 60);

    expect(result.allowed).toBe(true);
  });
});
