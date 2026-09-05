/**
 * Maqsad: tizim salomatligi va metrikalar (F-17, NF-07).
 *
 * `/health/live`  — jarayon tirikmi (Docker healthcheck, k8s liveness)
 * `/health`       — bog'liqliklar (baza, kesh, saqlash) ishlayaptimi (readiness)
 * `/metrics`      — Prometheus formatidagi metrikalar
 */

import { Controller, Get, Header } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { collectDefaultMetrics, register } from 'prom-client';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { QueueService } from '../../common/queue/queue.service';
import { Public, SkipRateLimit } from '../../common/auth/decorators';
import { SkipEnvelope } from '../../common/interceptors/response.interceptor';

// Standart Node.js metrikalari bir marta ro'yxatdan o'tkaziladi
collectDefaultMetrics({ prefix: 'lms_' });

@ApiTags('system')
@Controller()
@SkipRateLimit()
export class HealthController {
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get('health/live')
  @ApiOperation({ summary: 'Jarayon tirikligini tekshirish' })
  live() {
    return { status: 'ok', uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000) };
  }

  @Public()
  @Get('health')
  @ApiOperation({ summary: "Bog'liqliklar salomatligi" })
  async health() {
    const [database, redis] = await Promise.all([this.checkDatabase(), this.cache.ping()]);

    const status = database && redis ? 'ok' : 'degraded';

    return {
      status,
      version: '1.0.0',
      environment: this.config.get('NODE_ENV', { infer: true }),
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      checks: {
        database: database ? 'up' : 'down',
        redis: redis ? 'up' : 'down',
      },
    };
  }

  @Public()
  @Get('health/queues')
  @ApiOperation({ summary: 'Navbatlar holati' })
  async queues() {
    return this.queue.stats();
  }

  @Public()
  @SkipEnvelope()
  @Get('metrics')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  @ApiOperation({ summary: 'Prometheus metrikalari' })
  async metrics(): Promise<string> {
    return register.metrics();
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }
}
