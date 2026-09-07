/**
 * Maqsad: rejali texnik vazifalar (F-17).
 *
 * Cron jadvallari `@nestjs/schedule` orqali belgilanadi va vazifalar
 * BullMQ ga qo'yiladi — bir nechta instansiya bo'lganda ish ikki marta
 * bajarilmasligi uchun (taqsimlangan qulf navbat darajasida).
 */

import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';
import { BaseWorker } from './worker.base';
import { PrismaService } from '../common/prisma/prisma.service';
import { CacheService, REDIS_CLIENT } from '../common/cache/cache.service';
import { QueueService, QUEUES } from '../common/queue/queue.service';
import { IdempotencyService } from '../common/http/idempotency.service';
import { FilesService } from '../modules/content/files.service';
import { QuizzesService } from '../modules/quizzes/quizzes.service';
import { GamificationService } from '../modules/gamification/gamification.module';
import { HemisSyncService } from '../modules/integrations/hemis-sync.service';
import { LtiServicesService } from '../modules/lti/lti-services.service';

@Injectable()
export class MaintenanceWorker extends BaseWorker implements OnModuleInit {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
    private readonly idempotency: IdempotencyService,
    private readonly files: FilesService,
    private readonly quizzes: QuizzesService,
    private readonly gamification: GamificationService,
    private readonly hemisSync: HemisSyncService,
    private readonly ltiServices: LtiServicesService,
  ) {
    super(redis, QUEUES.MAINTENANCE, config.get('APP_ROLE', { infer: true }), 1);
  }

  override onModuleInit(): void {
    super.onModuleInit();
  }

  protected async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'maintenance.cleanup_uploads': {
        const [uploads, keys, sessions, otps] = await Promise.all([
          this.files.cleanupStaleUploads(24),
          this.idempotency.cleanupExpired(),
          this.cleanupExpiredSessions(),
          this.cleanupExpiredOtps(),
        ]);
        return { uploads, idempotencyKeys: keys, sessions, otps };
      }

      case 'maintenance.expire_attempts':
        return { expired: await this.quizzes.expireStaleAttempts() };

      case 'maintenance.award_badges':
        return this.gamification.evaluateBadges();

      case 'integration.hemis.sync': {
        const payload = job.data as { entity: string; since?: string };
        const since = payload.since ? new Date(payload.since) : undefined;
        if (payload.entity === 'teachers') return this.hemisSync.syncTeachers(since);
        return this.hemisSync.syncStudents(since);
      }

      case 'lti.ags.push': {
        const payload = job.data as {
          courseId: string;
          userId: string;
          quizId?: string;
          assignmentId?: string;
        };
        return this.ltiServices.pushUserGrade(
          payload.courseId,
          payload.userId,
          payload.quizId || payload.assignmentId
            ? [{ quizId: payload.quizId, assignmentId: payload.assignmentId }]
            : [],
        );
      }

      default:
        return { skipped: job.name };
    }
  }

  // --- Cron jadvallari ------------------------------------------------------

  /** Har 5 daqiqada: muddati o'tgan test urinishlarini yakunlash. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async scheduleExpireAttempts(): Promise<void> {
    if (this.config.get('APP_ROLE', { infer: true }) === 'worker') return;
    await this.queue.enqueue('maintenance.expire_attempts', {});
  }

  /** Har kuni 03:30 da: tashlandiq fayllar va muddati o'tgan kalitlarni tozalash. */
  @Cron('30 3 * * *', { timeZone: 'Asia/Tashkent' })
  async scheduleCleanup(): Promise<void> {
    if (this.config.get('APP_ROLE', { infer: true }) === 'worker') return;
    await this.queue.enqueue('maintenance.cleanup_uploads', {});
  }

  /** Har kuni 04:00 da: badge qoidalarini tekshirish. */
  @Cron('0 4 * * *', { timeZone: 'Asia/Tashkent' })
  async scheduleBadges(): Promise<void> {
    if (this.config.get('APP_ROLE', { infer: true }) === 'worker') return;
    if (!this.config.get('FEATURE_GAMIFICATION' as never, { infer: true })) return;
    await this.queue.enqueue('maintenance.award_badges', {});
  }

  /** Dushanba 00:05: haftalik XP ni nolga tushirish. */
  @Cron('5 0 * * 1', { timeZone: 'Asia/Tashkent' })
  async resetWeeklyXp(): Promise<void> {
    if (this.config.get('APP_ROLE', { infer: true }) === 'api') return;
    const count = await this.gamification.resetWeeklyXp();
    this.logger.log({ count }, 'Haftalik XP nolga tushirildi');
  }

  /** Har kuni 03:00 da: HEMIS sinxronizatsiyasi. */
  @Cron('0 3 * * *', { timeZone: 'Asia/Tashkent' })
  async scheduleHemisSync(): Promise<void> {
    if (this.config.get('APP_ROLE', { infer: true }) === 'worker') return;
    await this.queue.enqueue('integration.hemis.sync', { entity: 'students' });
    await this.queue.enqueue('integration.hemis.sync', { entity: 'teachers' });
  }

  // --- Tozalash amallari ----------------------------------------------------

  /**
   * Muddati o'tgan sessiyalarni o'chirish.
   * Yozuvlar 90 kundan keyin o'chiriladi — bu muddat ichida ular xavfsizlik
   * tekshiruvi uchun kerak bo'lishi mumkin.
   */
  private async cleanupExpiredSessions(): Promise<number> {
    const threshold = new Date(Date.now() - 90 * 86_400_000);
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: threshold } },
    });
    return result.count;
  }

  private async cleanupExpiredOtps(): Promise<number> {
    const threshold = new Date(Date.now() - 7 * 86_400_000);
    const result = await this.prisma.otpCode.deleteMany({
      where: { expiresAt: { lt: threshold } },
    });
    return result.count;
  }
}
