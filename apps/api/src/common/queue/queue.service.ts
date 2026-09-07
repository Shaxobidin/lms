/**
 * Maqsad: og'ir vazifalarni navbatga chiqarish (ADR-004, NF-01, NF-08).
 *
 * API hech qachon 200 ms dan uzoq ishni sinxron bajarmaydi: video transkodlash,
 * DOCX/XLSX hisobot, ommaviy email/SMS, plagiat tekshiruvi va avtomatik
 * baholash — barchasi shu servis orqali navbatga tushadi.
 */

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { JobsOptions, Queue } from 'bullmq';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../cache/cache.service';

/** Navbat nomlari — bitta joyda, xato yozishning oldini oladi. */
export const QUEUES = {
  EMAIL: 'email',
  SMS: 'sms',
  TELEGRAM: 'telegram',
  MEDIA: 'media',
  REPORT: 'report',
  GRADING: 'grading',
  PLAGIARISM: 'plagiarism',
  /** Zaxira: sertifikat oqimi alohida masshtablanishi kerak bo'lsa. */
  CERTIFICATE: 'certificate',
  /** Zaxira: integratsiyalar alohida masshtablanishi kerak bo'lsa. */
  INTEGRATION: 'integration',
  NOTIFICATION: 'notification',
  MAINTENANCE: 'maintenance',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

/** Har bir navbat uchun ish turlari va yuk tiplari. */
export interface JobPayloads {
  'email.send': {
    to: string;
    templateKey: string;
    locale: string;
    params: Record<string, unknown>;
  };
  'sms.send': {
    phone: string;
    templateKey: string;
    locale: string;
    params: Record<string, unknown>;
  };
  'telegram.send': {
    chatId: string;
    templateKey: string;
    locale: string;
    params: Record<string, unknown>;
  };
  'media.transcode': { fileObjectId: string };
  'media.verify': { fileObjectId: string };
  'report.generate': {
    requestedById: string;
    report: string;
    format: string;
    filters: Record<string, unknown>;
  };
  'document.generate': {
    requestedById: string;
    documentId: string;
  };
  'grading.autograde': { attemptId: string };
  'grading.recalculate': { courseId: string; userId?: string };
  'plagiarism.check': { submissionId: string };
  'certificate.issue': { certificateId: string };
  'integration.hemis.sync': { entity: string; since?: string };
  'notification.dispatch': { notificationId: string };
  'maintenance.cleanup_uploads': Record<string, never>;
  'maintenance.expire_attempts': Record<string, never>;
  'maintenance.award_badges': Record<string, never>;
  /** LTI AGS: baho o'zgarganda platformaga yuborish (§10). */
  'lti.ags.push': { courseId: string; userId: string; quizId?: string; assignmentId?: string };
}

export type JobName = keyof JobPayloads;

/** Ish turini navbatga bog'lash. */
export const JOB_QUEUE_MAP: Record<JobName, QueueName> = {
  'email.send': QUEUES.EMAIL,
  'sms.send': QUEUES.SMS,
  'telegram.send': QUEUES.TELEGRAM,
  'media.transcode': QUEUES.MEDIA,
  'media.verify': QUEUES.MEDIA,
  'report.generate': QUEUES.REPORT,
  'document.generate': QUEUES.REPORT,
  'grading.autograde': QUEUES.GRADING,
  'grading.recalculate': QUEUES.GRADING,
  'plagiarism.check': QUEUES.PLAGIARISM,
  // Ishlovchisi ReportWorker da — shu sababli REPORT navbatiga tushadi
  'certificate.issue': QUEUES.REPORT,
  // Ishlovchisi MaintenanceWorker da
  'integration.hemis.sync': QUEUES.MAINTENANCE,
  'notification.dispatch': QUEUES.NOTIFICATION,
  'maintenance.cleanup_uploads': QUEUES.MAINTENANCE,
  'maintenance.expire_attempts': QUEUES.MAINTENANCE,
  'maintenance.award_badges': QUEUES.MAINTENANCE,
  'lti.ags.push': QUEUES.MAINTENANCE,
};

/** Standart qayta urinish siyosati: eksponensial kechikish bilan 3 marta. */
const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
  removeOnComplete: { age: 3600, count: 1000 },
  removeOnFail: { age: 86_400 },
};

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private readonly queues = new Map<QueueName, Queue>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  private queue(name: QueueName): Queue {
    let instance = this.queues.get(name);
    if (!instance) {
      instance = new Queue(name, {
        connection: this.redis.duplicate(),
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      });
      this.queues.set(name, instance);
    }
    return instance;
  }

  /**
   * Ishni navbatga qo'shadi va `jobId` qaytaradi.
   * `jobId` mijozga beriladi — u progressni SSE orqali kuzatishi mumkin.
   */
  async enqueue<T extends JobName>(
    name: T,
    payload: JobPayloads[T],
    options?: JobsOptions,
  ): Promise<string> {
    const queueName = JOB_QUEUE_MAP[name];
    const job = await this.queue(queueName).add(name, payload, options);
    this.logger.debug({ job: name, jobId: job.id, queue: queueName }, "Ish navbatga qo'shildi");
    return job.id ?? '';
  }

  /**
   * Takrorlanuvchi ish (cron). Bir xil `jobId` bilan qayta qo'shilsa
   * dublikat yaratmaydi — bu ilova qayta ishga tushganda muhim.
   */
  async schedule<T extends JobName>(name: T, payload: JobPayloads[T], cron: string): Promise<void> {
    const queueName = JOB_QUEUE_MAP[name];
    await this.queue(queueName).add(name, payload, {
      repeat: { pattern: cron, tz: 'Asia/Tashkent' },
      jobId: `repeat:${name}`,
    });
  }

  async getJobState(name: JobName, jobId: string): Promise<string | null> {
    const job = await this.queue(JOB_QUEUE_MAP[name]).getJob(jobId);
    return job ? job.getState() : null;
  }

  /** Sog'liq tekshiruvi uchun navbat statistikasi (NF-07). */
  async stats(): Promise<Record<string, { waiting: number; active: number; failed: number }>> {
    const result: Record<string, { waiting: number; active: number; failed: number }> = {};
    for (const name of Object.values(QUEUES)) {
      const queue = this.queue(name);
      const [waiting, active, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
      ]);
      result[name] = { waiting, active, failed };
    }
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Array.from(this.queues.values()).map((queue) => queue.close()));
  }
}
