/**
 * Maqsad: talabaning dars bo'yicha progressi va kurs progress foizi (F-04, F-13).
 *
 * Progress foizi `Enrollment.progressPercent` da materiallashtiriladi —
 * har bir ro'yxat so'rovida qayta hisoblash NF-01 ni buzardi.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { QueueService } from '../../common/queue/queue.service';
import { AppException } from '../../common/errors/app.exception';

@Injectable()
export class ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly queue: QueueService,
  ) {}

  async save(
    userId: string,
    input: { lessonId: string; secondsSpent: number; lastPosition?: number; completed: boolean },
  ) {
    const lesson = await this.prisma.db.lesson.findUnique({
      where: { id: input.lessonId },
      select: {
        id: true,
        isPublished: true,
        topic: { select: { module: { select: { courseId: true } } } },
      },
    });
    if (!lesson) throw AppException.notFound('lesson', input.lessonId);

    const courseId = lesson.topic.module.courseId;

    const enrollment = await this.prisma.db.enrollment.findUnique({
      where: { courseId_userId: { courseId, userId } },
      select: { id: true, status: true },
    });
    if (!enrollment) throw AppException.forbidden('lesson:read:own');

    const state = input.completed ? 'COMPLETED' : 'IN_PROGRESS';

    await this.prisma.db.lessonProgress.upsert({
      where: { lessonId_userId: { lessonId: input.lessonId, userId } },
      create: {
        lessonId: input.lessonId,
        userId,
        state,
        secondsSpent: input.secondsSpent,
        lastPosition: input.lastPosition ?? 0,
        completedAt: input.completed ? new Date() : null,
      },
      update: {
        state,
        // Vaqt to'planadi — har bir sessiya qo'shiladi
        secondsSpent: { increment: input.secondsSpent },
        lastPosition: input.lastPosition ?? undefined,
        completedAt: input.completed ? new Date() : undefined,
      },
    });

    const progress = await this.recalculateCourseProgress(courseId, userId);

    // Kurs tugallanganda gamifikatsiya va sertifikat oqimlari ishga tushadi
    if (progress.percent >= 100 && enrollment.status === 'ACTIVE') {
      await this.prisma.db.enrollment.update({
        where: { id: enrollment.id },
        data: { status: 'COMPLETED', completedAt: new Date() },
      });
      await this.queue.enqueue('maintenance.award_badges', {});
      await this.events.publish({
        type: EVENT_TYPES.JOB_COMPLETED,
        userId,
        payload: { courseId, event: 'course_completed' },
      });
    }

    return progress;
  }

  /**
   * Kurs progressi = tugatilgan majburiy darslar / jami nashr etilgan darslar.
   * Ikkita agregat so'rov — darslar bo'yicha aylanish yo'q (N+1 yo'q).
   */
  async recalculateCourseProgress(
    courseId: string,
    userId: string,
  ): Promise<{ percent: number; completed: number; total: number }> {
    const [total, completed] = await Promise.all([
      this.prisma.db.lesson.count({
        where: { isPublished: true, topic: { module: { courseId, isPublished: true } } },
      }),
      this.prisma.db.lessonProgress.count({
        where: {
          userId,
          state: 'COMPLETED',
          lesson: { isPublished: true, topic: { module: { courseId, isPublished: true } } },
        },
      }),
    ]);

    const percent = total === 0 ? 0 : Math.round((completed / total) * 10000) / 100;

    await this.prisma.db.enrollment.updateMany({
      where: { courseId, userId },
      data: { progressPercent: percent, lastAccessAt: new Date() },
    });

    return { percent, completed, total };
  }

  /** Kurs bo'yicha batafsil progress — talaba paneli uchun. */
  async courseProgress(courseId: string, userId: string) {
    const lessons = await this.prisma.db.lesson.findMany({
      where: { isPublished: true, topic: { module: { courseId, isPublished: true } } },
      select: {
        id: true,
        title: true,
        durationMinutes: true,
        topic: { select: { id: true, title: true, module: { select: { id: true, title: true } } } },
        progress: {
          where: { userId },
          select: { state: true, secondsSpent: true, completedAt: true },
        },
      },
      orderBy: [{ topic: { module: { position: 'asc' } } }, { position: 'asc' }],
    });

    const completed = lessons.filter((lesson) => lesson.progress[0]?.state === 'COMPLETED').length;
    const totalSeconds = lessons.reduce(
      (sum, lesson) => sum + (lesson.progress[0]?.secondsSpent ?? 0),
      0,
    );

    return {
      percent: lessons.length === 0 ? 0 : Math.round((completed / lessons.length) * 10000) / 100,
      completed,
      total: lessons.length,
      totalSecondsSpent: totalSeconds,
      lessons: lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        moduleId: lesson.topic.module.id,
        moduleTitle: lesson.topic.module.title,
        topicId: lesson.topic.id,
        durationMinutes: lesson.durationMinutes,
        state: lesson.progress[0]?.state ?? 'NOT_STARTED',
        secondsSpent: lesson.progress[0]?.secondsSpent ?? 0,
        completedAt: lesson.progress[0]?.completedAt ?? null,
      })),
    };
  }
}
