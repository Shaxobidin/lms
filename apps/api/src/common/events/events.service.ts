/**
 * Maqsad: real-time hodisalarni tarqatish — SSE + Redis pub/sub (ADR-010).
 *
 * Nima uchun WebSocket emas: SSE stateless API bilan mos, Nginx orqali sodda
 * proxylanadi, avtomatik qayta ulanadi va PWA bilan yaxshi ishlaydi.
 * Mijozdan serverga yozish oddiy REST orqali amalga oshiriladi.
 */

import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type Redis from 'ioredis';
import { Observable, Subject, filter, map } from 'rxjs';
import { REDIS_CLIENT } from '../cache/cache.service';

/** Hodisa turlari — frontend shu kalitlarga qarab reaksiya qiladi. */
export const EVENT_TYPES = {
  NOTIFICATION: 'notification.created',
  GRADE_PUBLISHED: 'grade.published',
  SUBMISSION_GRADED: 'submission.graded',
  FORUM_REPLY: 'forum.reply',
  ANNOUNCEMENT: 'announcement.published',
  JOB_PROGRESS: 'job.progress',
  JOB_COMPLETED: 'job.completed',
  ATTENDANCE_MARKED: 'attendance.marked',
  QUIZ_TIME_WARNING: 'quiz.time_warning',
  BADGE_AWARDED: 'badge.awarded',
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

export interface DomainEvent {
  type: EventType;
  /** Kimga yuboriladi. Bo'sh bo'lsa — global (masalan, tizim e'loni). */
  userId?: string;
  /** Kurs bo'yicha tarqatish (kursdagi barcha ishtirokchilarga). */
  courseId?: string;
  payload: Record<string, unknown>;
  occurredAt: string;
}

const CHANNEL = 'lms:events';

@Injectable()
export class EventsService implements OnModuleDestroy {
  private readonly logger = new Logger(EventsService.name);
  private readonly subscriber: Redis;
  private readonly stream = new Subject<DomainEvent>();

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {
    // Obuna uchun alohida ulanish kerak: Redis'da subscriber rejimidagi
    // ulanish boshqa buyruqlarni qabul qilmaydi.
    this.subscriber = this.redis.duplicate();

    this.subscriber.subscribe(CHANNEL).catch((error: Error) => {
      this.logger.error({ error: error.message }, "Hodisalar kanaliga obuna bo'lib bo'lmadi");
    });

    this.subscriber.on('message', (channel, message) => {
      if (channel !== CHANNEL) return;
      try {
        this.stream.next(JSON.parse(message) as DomainEvent);
      } catch (error) {
        this.logger.warn({ error: (error as Error).message }, "Hodisani o'qib bo'lmadi");
      }
    });
  }

  /**
   * Hodisani e'lon qiladi. Redis pub/sub orqali BARCHA API instansiyalariga
   * yetib boradi — gorizontal masshtabda ham foydalanuvchi xabarni oladi (NF-08).
   */
  async publish(event: Omit<DomainEvent, 'occurredAt'>): Promise<void> {
    const full: DomainEvent = { ...event, occurredAt: new Date().toISOString() };
    try {
      await this.redis.publish(CHANNEL, JSON.stringify(full));
    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, "Hodisani e'lon qilib bo'lmadi");
    }
  }

  /**
   * Muayyan foydalanuvchi uchun hodisalar oqimi (SSE endpointi ishlatadi).
   * `courseIds` — foydalanuvchi a'zo bo'lgan kurslar; ular bo'yicha
   * tarqatiladigan hodisalar ham yetkaziladi.
   */
  streamFor(userId: string, courseIds: readonly string[]): Observable<{ data: DomainEvent }> {
    const courseSet = new Set(courseIds);
    return this.stream.asObservable().pipe(
      filter((event) => {
        if (event.userId && event.userId === userId) return true;
        if (event.courseId && courseSet.has(event.courseId)) return true;
        return !event.userId && !event.courseId;
      }),
      map((event) => ({ data: event })),
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.stream.complete();
    await this.subscriber.quit().catch(() => undefined);
  }
}
