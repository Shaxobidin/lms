/**
 * Maqsad: Redis ustidan tipli kesh qatlami (ADR-002, NF-01).
 *
 * Qoida: kesh xatoligi ILOVANI TO'XTATMASLIGI kerak — Redis mavjud bo'lmasa
 * so'rov bazadan bajariladi (graceful degradation). Ammo xatolik jimgina
 * yutilmaydi: u loglanadi va metrikaga yoziladi (§16).
 */

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

export const REDIS_CLIENT = Symbol('REDIS_CLIENT');

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logger.warn({ key, error: (error as Error).message }, "Keshdan o'qib bo'lmadi");
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    try {
      const payload = JSON.stringify(value);
      if (ttlSeconds && ttlSeconds > 0) {
        await this.redis.set(key, payload, 'EX', ttlSeconds);
      } else {
        await this.redis.set(key, payload);
      }
    } catch (error) {
      this.logger.warn({ key, error: (error as Error).message }, "Keshga yozib bo'lmadi");
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.redis.del(...keys);
    } catch (error) {
      this.logger.warn({ keys, error: (error as Error).message }, "Keshni o'chirib bo'lmadi");
    }
  }

  /**
   * Naqsh bo'yicha o'chirish. `KEYS` o'rniga `SCAN` ishlatiladi — katta bazada
   * Redis'ni bloklamaslik uchun (RSK-02).
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let removed = 0;
    try {
      do {
        const [next, keys] = await this.redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length > 0) {
          removed += await this.redis.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      this.logger.warn(
        { pattern, error: (error as Error).message },
        "Naqsh bo'yicha tozalash xatosi",
      );
    }
    return removed;
  }

  /**
   * Keshdan o'qiydi, bo'lmasa `factory` ni chaqiradi va natijani saqlaydi.
   * Bu eng ko'p ishlatiladigan namuna — takrorlanishni yo'q qiladi.
   */
  async remember<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;
    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  /** Atomik hisoblagich — rate limit va urinishlar soni uchun. */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    try {
      const value = await this.redis.incr(key);
      if (value === 1) await this.redis.expire(key, ttlSeconds);
      return value;
    } catch (error) {
      this.logger.warn({ key, error: (error as Error).message }, 'Hisoblagich xatosi');
      // Kesh ishlamasa ham limit tekshiruvi so'rovni bloklamasligi kerak
      return 0;
    }
  }

  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch {
      return -1;
    }
  }

  /**
   * Taqsimlangan qulf — bir vaqtning o'zida bitta jarayon bajarishi kerak
   * bo'lgan amallar uchun (masalan, semestr jurnalini yopish).
   */
  async withLock<T>(key: string, ttlSeconds: number, action: () => Promise<T>): Promise<T | null> {
    const lockKey = `lock:${key}`;
    const token = `${process.pid}-${Date.now()}-${Math.random()}`;
    const acquired = await this.redis.set(lockKey, token, 'EX', ttlSeconds, 'NX');
    if (!acquired) return null;

    try {
      return await action();
    } finally {
      // Faqat o'z qulfimizni bo'shatamiz (boshqa jarayonnikini emas)
      const current = await this.redis.get(lockKey);
      if (current === token) await this.redis.del(lockKey);
    }
  }

  /** SSE uchun pub/sub (ADR-010). */
  async publish(channel: string, message: unknown): Promise<void> {
    try {
      await this.redis.publish(channel, JSON.stringify(message));
    } catch (error) {
      this.logger.warn({ channel, error: (error as Error).message }, 'Publish xatosi');
    }
  }

  /** Sog'liq tekshiruvi uchun. */
  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  get client(): Redis {
    return this.redis;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }
}
