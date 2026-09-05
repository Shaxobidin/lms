/**
 * Maqsad: `Idempotency-Key` qo'llab-quvvatlash (§8).
 *
 * POST so'rovlarida tarmoq uzilishi tufayli takroriy yuborish sodir bo'lishi
 * mumkin (masalan, talaba topshiriq yuborayotganda internet uzildi). Bir xil
 * kalit bilan kelgan takroriy so'rov saqlangan javobni qaytaradi, amal esa
 * ikkinchi marta BAJARILMAYDI.
 *
 * Kalit bir xil, ammo tanasi boshqa bo'lsa — 409 IDEMPOTENCY_CONFLICT.
 */

import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { AppException } from '../errors/app.exception';

const TTL_SECONDS = 86_400; // 24 soat

interface StoredResponse {
  requestHash: string;
  statusCode: number;
  body: unknown;
}

@Injectable()
export class IdempotencyService {
  private readonly logger = new Logger(IdempotencyService.name);

  constructor(
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Amalni idempotent tarzda bajaradi.
   * Kalit berilmagan bo'lsa — oddiy bajarish (majburiy emas).
   */
  async execute<T>(
    key: string | undefined,
    endpoint: string,
    requestBody: unknown,
    action: () => Promise<T>,
  ): Promise<T> {
    if (!key) return action();

    const requestHash = hashBody(requestBody);
    const cacheKey = `idem:${endpoint}:${key}`;

    const existing = await this.loadStored(cacheKey, key);
    if (existing) {
      if (existing.requestHash !== requestHash) {
        throw new AppException({
          code: 'IDEMPOTENCY_CONFLICT',
          messageKey: 'errors.idempotency_conflict',
          context: { key, endpoint },
        });
      }
      this.logger.debug({ key, endpoint }, 'Idempotent javob keshdan qaytarildi');
      return existing.body as T;
    }

    const result = await action();

    const stored: StoredResponse = { requestHash, statusCode: 200, body: result };
    await this.cache.set(cacheKey, stored, TTL_SECONDS);

    // Redis tozalansa ham kafolat saqlanishi uchun bazaga ham yoziladi
    await this.prisma.idempotencyKey
      .create({
        data: {
          key,
          endpoint,
          requestHash,
          responseBody: JSON.parse(JSON.stringify(result ?? null)) as never,
          statusCode: 200,
          expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
        },
      })
      .catch((error: Error) => {
        // Yozuv allaqachon mavjud bo'lishi mumkin (parallel so'rov) — bu xato emas
        this.logger.debug({ key, error: error.message }, "Idempotency kalitini saqlab bo'lmadi");
      });

    return result;
  }

  private async loadStored(cacheKey: string, key: string): Promise<StoredResponse | null> {
    const cached = await this.cache.get<StoredResponse>(cacheKey);
    if (cached) return cached;

    const row = await this.prisma.idempotencyKey.findFirst({
      where: { key, expiresAt: { gt: new Date() } },
      select: { requestHash: true, statusCode: true, responseBody: true },
    });
    if (!row) return null;

    return {
      requestHash: row.requestHash,
      statusCode: row.statusCode,
      body: row.responseBody,
    };
  }

  /** Muddati o'tgan kalitlarni tozalash (cron orqali chaqiriladi). */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.idempotencyKey.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}

function hashBody(body: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(body ?? null))
    .digest('hex');
}
