/**
 * Maqsad: BullMQ ishlovchilari uchun umumiy asos.
 *
 * Har bir ishlovchi shu klassdan meros oladi: ulanish, xatoliklarni loglash,
 * `APP_ROLE` ga qarab yoqish/o'chirish va to'g'ri yopilish shu yerda.
 */

import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker, type Processor } from 'bullmq';
import type Redis from 'ioredis';

export abstract class BaseWorker implements OnModuleInit, OnModuleDestroy {
  protected readonly logger: Logger;
  private worker: Worker | null = null;

  protected constructor(
    private readonly redis: Redis,
    private readonly queueName: string,
    private readonly appRole: string,
    /** Bir vaqtda nechta ish bajarilsin. Og'ir ishlar uchun kichik qiymat. */
    private readonly concurrency = 5,
  ) {
    this.logger = new Logger(`${this.constructor.name}`);
  }

  /** Har bir ishlovchi shu metodni amalga oshiradi. */
  protected abstract process(job: Job): Promise<unknown>;

  onModuleInit(): void {
    if (this.appRole === 'api') {
      this.logger.debug(`"${this.queueName}" navbati API rejimida ishga tushirilmadi`);
      return;
    }

    const processor: Processor = async (job) => {
      const startedAt = Date.now();
      try {
        const result = await this.process(job);
        this.logger.debug(
          { job: job.name, jobId: job.id, durationMs: Date.now() - startedAt },
          'Ish bajarildi',
        );
        return result;
      } catch (error) {
        // Xatolik yutilmaydi: loglanadi va BullMQ qayta urinadi (§16)
        this.logger.error(
          {
            job: job.name,
            jobId: job.id,
            attempt: job.attemptsMade + 1,
            error: (error as Error).message,
            stack: (error as Error).stack,
          },
          'Ish bajarilmadi',
        );
        throw error;
      }
    };

    this.worker = new Worker(this.queueName, processor, {
      connection: this.redis.duplicate(),
      concurrency: this.concurrency,
    });

    this.worker.on('failed', (job, error) => {
      if (job && job.attemptsMade >= (job.opts.attempts ?? 1)) {
        this.logger.error(
          { job: job.name, jobId: job.id, error: error.message },
          'Ish barcha urinishlardan keyin ham bajarilmadi',
        );
      }
    });

    this.logger.log(`"${this.queueName}" navbati ishga tushdi (concurrency: ${this.concurrency})`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
