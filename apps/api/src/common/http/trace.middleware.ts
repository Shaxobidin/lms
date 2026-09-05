/**
 * Maqsad: har bir so'rovga `traceId` biriktirish va so'rovni loglash (NF-07).
 *
 * `traceId` javob sarlavhasida (`X-Trace-Id`) va xatolik konvertida qaytariladi —
 * foydalanuvchi shu identifikatorni aytsa, log tizimida so'rovni bir zumda topish mumkin.
 */

import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Loglarda ko'rsatilmaydigan yo'llar — shovqinni kamaytiradi. */
const QUIET_PATHS = new Set(['/api/v1/health', '/api/v1/health/live', '/metrics']);

@Injectable()
export class TraceMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction): void {
    // Yuqori oqimdan (Nginx, boshqa servis) kelgan trace-id saqlanadi
    const incoming = request.headers['x-trace-id'];
    const traceId = typeof incoming === 'string' && incoming.length <= 64 ? incoming : randomUUID();

    request.traceId = traceId;
    response.setHeader('X-Trace-Id', traceId);

    const startedAt = process.hrtime.bigint();

    response.on('finish', () => {
      if (QUIET_PATHS.has(request.path)) return;

      const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
      const payload = {
        traceId,
        method: request.method,
        path: request.path,
        status: response.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        userId: request.user?.id,
      };

      if (response.statusCode >= 500) {
        this.logger.error(payload, "So'rov xatolik bilan yakunlandi");
      } else if (durationMs > 1000) {
        // Sekin so'rovlar alohida belgilanadi (NF-01: p95 < 300 ms)
        this.logger.warn(payload, "Sekin so'rov");
      } else {
        this.logger.log(payload, "So'rov bajarildi");
      }
    });

    next();
  }
}
