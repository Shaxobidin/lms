/**
 * Maqsad: baholash bilan bog'liq fon vazifalari (F-06, F-07, F-08).
 *
 * - plagiat tekshiruvi (A-10);
 * - item analysis qayta hisoblash (F-07);
 * - kurs progressi va baholarni qayta hisoblash.
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';
import { BaseWorker } from './worker.base';
import { PrismaService } from '../common/prisma/prisma.service';
import { CacheService, REDIS_CLIENT } from '../common/cache/cache.service';
import { SanitizerService } from '../common/security/sanitizer.service';
import { QUEUES, type JobPayloads } from '../common/queue/queue.service';
import { QuizzesService } from '../modules/quizzes/quizzes.service';
import { QuestionsService } from '../modules/quizzes/questions.service';
import { PLAGIARISM_PROVIDER, type PlagiarismProvider } from '../modules/integrations/contracts';

@Injectable()
export class GradingWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly sanitizer: SanitizerService,
    private readonly quizzes: QuizzesService,
    private readonly questions: QuestionsService,
    @Inject(PLAGIARISM_PROVIDER) private readonly plagiarism: PlagiarismProvider,
  ) {
    super(redis, QUEUES.GRADING, config.get('APP_ROLE', { infer: true }), 4);
  }

  protected async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'grading.autograde': {
        const payload = job.data as JobPayloads['grading.autograde'];
        const attempt = await this.prisma.db.quizAttempt.findUnique({
          where: { id: payload.attemptId },
          select: { userId: true, quizId: true },
        });
        if (!attempt) return { skipped: 'not_found' };
        await this.quizzes.publishAttemptGrade(attempt.quizId, attempt.userId);
        return { published: true };
      }

      case 'grading.recalculate': {
        const payload = job.data as JobPayloads['grading.recalculate'];
        return this.recalculate(payload.courseId, payload.userId);
      }

      default:
        return { skipped: job.name };
    }
  }

  /**
   * Kurs bo'yicha keshni tozalaydi va savol statistikasini yangilaydi.
   * Bu og'ir amal, shuning uchun faqat navbatda bajariladi.
   */
  private async recalculate(courseId: string, userId?: string): Promise<unknown> {
    await this.cache.delByPattern(
      userId ? `grade:course:${courseId}:${userId}` : `grade:course:${courseId}:*`,
    );
    await this.cache.delByPattern(`analytics:*`);

    // Kursdagi savollarning item analysis ko'rsatkichlarini yangilaymiz
    const questions = await this.prisma.db.question.findMany({
      where: { bank: { courseId } },
      select: { id: true },
      take: 500,
    });

    let analyzed = 0;
    for (const question of questions) {
      await this.questions.recalculateItemAnalysis(question.id);
      analyzed += 1;
    }

    return { cacheCleared: true, questionsAnalyzed: analyzed };
  }
}

/**
 * Plagiat tekshiruvi alohida navbatda — u sekin va boshqa baholash
 * vazifalarini kutib qoldirmasligi kerak.
 */
@Injectable()
export class PlagiarismWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly sanitizer: SanitizerService,
    @Inject(PLAGIARISM_PROVIDER) private readonly plagiarism: PlagiarismProvider,
  ) {
    super(redis, QUEUES.PLAGIARISM, config.get('APP_ROLE', { infer: true }), 2);
  }

  protected async process(job: Job): Promise<unknown> {
    const { submissionId } = job.data as JobPayloads['plagiarism.check'];

    const submission = await this.prisma.db.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, contentHtml: true, assignmentId: true },
    });

    if (!submission?.contentHtml) return { skipped: 'no_text' };

    // HTML teglari o'xshashlikni buzmasligi uchun sof matn olinadi
    const text = this.sanitizer.stripHtml(submission.contentHtml);
    if (text.length < 200) return { skipped: 'too_short' };

    const result = await this.plagiarism.check({
      submissionId: submission.id,
      text,
      assignmentId: submission.assignmentId,
    });

    await this.prisma.db.submission.update({
      where: { id: submissionId },
      data: {
        similarityPercent: result.similarityPercent,
        similarityDetails: {
          scope: result.scope,
          provider: this.plagiarism.name,
          matches: result.matches,
          checkedAt: new Date().toISOString(),
        } as never,
      },
    });

    return { similarityPercent: result.similarityPercent, matches: result.matches.length };
  }
}
