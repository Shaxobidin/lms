/**
 * Maqsad: F-08 — baholash, reyting, GPA va transkript (ADR-012).
 *
 * Asosiy printsip: `Grade` — atomik ball (bitta topshiriq yoki test natijasi).
 * Yakuniy ball, GPA va reyting sillabus siyosati asosida HISOBLANADI va
 * keshlanadi. Semestr yopilganda natija `Transcript` ga muzlatiladi.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  calculateFinalGrade,
  calculateGpa,
  DEFAULT_GRADE_SCALE,
  DEFAULT_GRADING_POLICY,
  resolveBand,
  round2,
  type ControlScore,
  type ControlTypeCode,
  type FinalGradeResult,
  type GradeScaleBand,
  type GradingPolicy,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { QueueService } from '../../common/queue/queue.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';

const GRADE_CACHE_TTL = 120;

/** Transkriptning bitta fan bo'yicha yozuvi (`Transcript.entries` ichida). */
export interface TranscriptEntry {
  courseId: string;
  credits: number;
  score: number;
  letter: string;
  gpaPoints: number;
  passed: boolean;
}

@Injectable()
export class GradingService {
  private readonly logger = new Logger(GradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
    private readonly queue: QueueService,
  ) {}

  /**
   * Topshiriq bahosini jurnalga yozadi yoki yangilaydi.
   * Har bir o'zgarish `GradeHistory` ga qo'shiladi (append-only, RSK-10).
   */
  async upsertGradeFromAssignment(params: {
    courseId: string;
    userId: string;
    assignmentId: string;
    controlTypeCode: string;
    score: number;
    maxScore: number;
    actorId: string;
    reason?: string;
  }): Promise<{ gradeId: string }> {
    const controlType = await this.resolveControlType(params.controlTypeCode);

    const existing = await this.prisma.db.grade.findFirst({
      where: {
        courseId: params.courseId,
        userId: params.userId,
        sourceAssignmentId: params.assignmentId,
      },
      select: { id: true, score: true, isFinal: true },
    });

    if (existing?.isFinal) {
      throw AppException.businessRule('errors.grade_is_final');
    }

    const gradeId = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.grade.update({
          where: { id: existing.id },
          data: { score: params.score, maxScore: params.maxScore, gradedById: params.actorId },
        });
        await tx.gradeHistory.create({
          data: {
            gradeId: existing.id,
            oldScore: existing.score,
            newScore: params.score,
            changedById: params.actorId,
            reason: params.reason ?? 'assignment_regraded',
          },
        });
        return existing.id;
      }

      const created = await tx.grade.create({
        data: {
          courseId: params.courseId,
          userId: params.userId,
          controlTypeId: controlType.id,
          sourceAssignmentId: params.assignmentId,
          score: params.score,
          maxScore: params.maxScore,
          origin: 'MANUAL',
          gradedById: params.actorId,
        },
        select: { id: true },
      });

      await tx.gradeHistory.create({
        data: {
          gradeId: created.id,
          oldScore: null,
          newScore: params.score,
          changedById: params.actorId,
          reason: params.reason ?? 'assignment_graded',
        },
      });

      return created.id;
    });

    await this.invalidate(params.courseId, params.userId);

    // LTI AGS: topshiriq bahosi platformadagi alohida line item'ga ham boradi
    await this.queue.enqueue('lti.ags.push', {
      courseId: params.courseId,
      userId: params.userId,
      assignmentId: params.assignmentId,
    });

    return { gradeId };
  }

  /** Test natijasini jurnalga yozadi (avtomatik baholash oqimi). */
  async upsertGradeFromQuiz(params: {
    courseId: string;
    userId: string;
    quizId: string;
    controlTypeCode: string;
    score: number;
    maxScore: number;
    actorId?: string;
  }): Promise<{ gradeId: string }> {
    const controlType = await this.resolveControlType(params.controlTypeCode);

    const existing = await this.prisma.db.grade.findFirst({
      where: { courseId: params.courseId, userId: params.userId, sourceQuizId: params.quizId },
      select: { id: true, score: true, isFinal: true },
    });

    if (existing?.isFinal) throw AppException.businessRule('errors.grade_is_final');

    const gradeId = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.grade.update({
          where: { id: existing.id },
          data: { score: params.score, maxScore: params.maxScore },
        });
        await tx.gradeHistory.create({
          data: {
            gradeId: existing.id,
            oldScore: existing.score,
            newScore: params.score,
            changedById: params.actorId ?? params.userId,
            reason: 'quiz_attempt_graded',
          },
        });
        return existing.id;
      }

      const created = await tx.grade.create({
        data: {
          courseId: params.courseId,
          userId: params.userId,
          controlTypeId: controlType.id,
          sourceQuizId: params.quizId,
          score: params.score,
          maxScore: params.maxScore,
          origin: 'AUTO',
          gradedById: params.actorId ?? null,
        },
        select: { id: true },
      });

      await tx.gradeHistory.create({
        data: {
          gradeId: created.id,
          oldScore: null,
          newScore: params.score,
          changedById: params.actorId ?? params.userId,
          reason: 'quiz_attempt_graded',
        },
      });

      return created.id;
    });

    await this.invalidate(params.courseId, params.userId);

    await this.events.publish({
      type: EVENT_TYPES.GRADE_PUBLISHED,
      userId: params.userId,
      payload: { courseId: params.courseId, quizId: params.quizId, score: params.score },
    });

    // LTI AGS: platformadan kelgan talabalar uchun baho qaytariladi (havola bo'lmasa ishchi o'tkazib yuboradi)
    await this.queue.enqueue('lti.ags.push', {
      courseId: params.courseId,
      userId: params.userId,
      quizId: params.quizId,
    });

    return { gradeId };
  }

  /**
   * Qo'lda baho qo'yish yoki tuzatish. Jurnal yopilgandan keyin faqat
   * dekanat ruxsati bilan (RSK-10) — bu `grade:update:own_faculty` ruxsati
   * orqali tekshiriladi va sabab talab qilinadi.
   */
  async setManualGrade(
    params: {
      courseId: string;
      userId: string;
      controlTypeCode: ControlTypeCode;
      score: number;
      maxScore: number;
      comment?: string;
      reason?: string;
    },
    actor: RequestUser,
  ) {
    const controlType = await this.resolveControlType(params.controlTypeCode);

    const existing = await this.prisma.db.grade.findFirst({
      where: {
        courseId: params.courseId,
        userId: params.userId,
        controlTypeId: controlType.id,
        sourceAssignmentId: null,
        sourceQuizId: null,
      },
      select: { id: true, score: true, isFinal: true },
    });

    if (existing?.isFinal) {
      const canOverride = actor.permissions.some(
        (key) => key === 'grade:update:own_faculty' || key === 'grade:update:all',
      );
      if (!canOverride) throw AppException.businessRule('errors.grade_is_final');
      if (!params.reason) {
        throw AppException.validation([
          { field: 'reason', code: 'validation.required_to_override' },
        ]);
      }
    }

    const gradeId = await this.prisma.$transaction(async (tx) => {
      if (existing) {
        await tx.grade.update({
          where: { id: existing.id },
          data: {
            score: params.score,
            maxScore: params.maxScore,
            comment: params.comment ?? null,
            gradedById: actor.id,
          },
        });
        await tx.gradeHistory.create({
          data: {
            gradeId: existing.id,
            oldScore: existing.score,
            newScore: params.score,
            changedById: actor.id,
            reason: params.reason ?? 'manual_correction',
          },
        });
        return existing.id;
      }

      const created = await tx.grade.create({
        data: {
          courseId: params.courseId,
          userId: params.userId,
          controlTypeId: controlType.id,
          score: params.score,
          maxScore: params.maxScore,
          origin: 'MANUAL',
          gradedById: actor.id,
          comment: params.comment ?? null,
        },
        select: { id: true },
      });
      await tx.gradeHistory.create({
        data: {
          gradeId: created.id,
          oldScore: null,
          newScore: params.score,
          changedById: actor.id,
          reason: params.reason ?? 'manual_grade',
        },
      });
      return created.id;
    });

    await this.invalidate(params.courseId, params.userId);
    await this.audit.record({
      actorId: actor.id,
      action: 'grade.manual_set',
      resource: 'grade',
      resourceId: gradeId,
      before: { score: existing?.score ?? null },
      after: { score: params.score, reason: params.reason },
    });

    await this.events.publish({
      type: EVENT_TYPES.GRADE_PUBLISHED,
      userId: params.userId,
      payload: { courseId: params.courseId, score: params.score },
    });

    // LTI AGS: platformadan kelgan talabalar uchun baho qaytariladi (havola bo'lmasa ishchi o'tkazib yuboradi)
    await this.queue.enqueue('lti.ags.push', { courseId: params.courseId, userId: params.userId });

    return { gradeId, score: params.score };
  }

  /**
   * Talabaning kurs bo'yicha yakuniy natijasi.
   * Hisoblash `@lms/shared` dagi sof funksiyalar orqali — bir xil mantiq
   * frontend va hisobotlarda ham ishlatiladi.
   */
  async courseResult(
    courseId: string,
    userId: string,
  ): Promise<FinalGradeResult & { raw: ControlScore[] }> {
    const cacheKey = `grade:course:${courseId}:${userId}`;
    const cached = await this.cache.get<FinalGradeResult & { raw: ControlScore[] }>(cacheKey);
    if (cached) return cached;

    const [grades, policy, scale] = await Promise.all([
      this.prisma.db.grade.findMany({
        where: { courseId, userId },
        select: {
          score: true,
          maxScore: true,
          controlType: { select: { code: true } },
        },
      }),
      this.resolvePolicy(courseId),
      this.resolveScale(),
    ]);

    const totals = new Map<ControlTypeCode, { earned: number; max: number }>();
    for (const grade of grades) {
      const code = grade.controlType.code as ControlTypeCode;
      const entry = totals.get(code) ?? { earned: 0, max: 0 };
      entry.earned += Number(grade.score);
      entry.max += Number(grade.maxScore);
      totals.set(code, entry);
    }

    const raw: ControlScore[] = Array.from(totals.entries()).map(([controlType, value]) => ({
      controlType,
      earned: round2(value.earned),
      max: round2(value.max),
    }));

    const result = { ...calculateFinalGrade(raw, policy, scale), raw };
    await this.cache.set(cacheKey, result, GRADE_CACHE_TTL);
    return result;
  }

  /** Kurs jurnali — o'qituvchi uchun barcha talabalar kesimida. */
  async courseGradebook(courseId: string) {
    const [enrollments, grades, policy, scale] = await Promise.all([
      this.prisma.db.enrollment.findMany({
        where: { courseId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: {
          userId: true,
          user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          group: { select: { id: true, name: true } },
        },
        orderBy: { user: { profile: { lastName: 'asc' } } },
      }),
      this.prisma.db.grade.findMany({
        where: { courseId },
        select: {
          userId: true,
          score: true,
          maxScore: true,
          isFinal: true,
          controlType: { select: { code: true } },
          sourceAssignment: { select: { id: true, title: true } },
          sourceQuiz: { select: { id: true, title: true } },
        },
      }),
      this.resolvePolicy(courseId),
      this.resolveScale(),
    ]);

    // Bitta so'rovdan olingan baholarni talabalar bo'yicha guruhlaymiz (N+1 yo'q)
    const byUser = new Map<string, typeof grades>();
    for (const grade of grades) {
      const list = byUser.get(grade.userId) ?? [];
      list.push(grade);
      byUser.set(grade.userId, list);
    }

    return enrollments.map((enrollment) => {
      const userGrades = byUser.get(enrollment.userId) ?? [];
      const totals = new Map<ControlTypeCode, { earned: number; max: number }>();
      for (const grade of userGrades) {
        const code = grade.controlType.code as ControlTypeCode;
        const entry = totals.get(code) ?? { earned: 0, max: 0 };
        entry.earned += Number(grade.score);
        entry.max += Number(grade.maxScore);
        totals.set(code, entry);
      }

      const raw: ControlScore[] = Array.from(totals.entries()).map(([controlType, value]) => ({
        controlType,
        earned: round2(value.earned),
        max: round2(value.max),
      }));

      const final = calculateFinalGrade(raw, policy, scale);

      return {
        userId: enrollment.userId,
        fullName: [enrollment.user.profile?.lastName, enrollment.user.profile?.firstName]
          .filter(Boolean)
          .join(' '),
        group: enrollment.group,
        controls: raw,
        final,
        items: userGrades.map((grade) => ({
          controlType: grade.controlType.code,
          score: Number(grade.score),
          maxScore: Number(grade.maxScore),
          isFinal: grade.isFinal,
          source: grade.sourceAssignment ?? grade.sourceQuiz ?? null,
        })),
      };
    });
  }

  /**
   * Semestr jurnalini yopish: barcha baholar `isFinal` qilinadi va
   * `Transcript` yozuvi shakllantiriladi (ADR-012).
   * Taqsimlangan qulf ostida bajariladi — ikki marta yopilib qolmasligi uchun.
   */
  async closeSemesterGradebook(courseId: string, actor: RequestUser) {
    const result = await this.cache.withLock(`gradebook:${courseId}`, 120, async () => {
      const course = await this.prisma.db.course.findUnique({
        where: { id: courseId },
        select: { id: true, semesterId: true, subject: { select: { credits: true } } },
      });
      if (!course) throw AppException.notFound('course', courseId);
      if (!course.semesterId) {
        throw AppException.businessRule('errors.course_has_no_semester');
      }

      const gradebook = await this.courseGradebook(courseId);

      await this.prisma.$transaction(async (tx) => {
        await tx.grade.updateMany({ where: { courseId }, data: { isFinal: true } });

        for (const row of gradebook) {
          const existing = await tx.transcript.findUnique({
            where: {
              userId_semesterId: { userId: row.userId, semesterId: course.semesterId as string },
            },
            select: { id: true, entries: true },
          });

          const entry = {
            courseId,
            credits: course.subject?.credits ?? 0,
            score: row.final.score,
            letter: row.final.letter,
            gpaPoints: row.final.gpaPoints,
            passed: row.final.passed,
          };

          // Transkript yozuvlari `jsonb` da saqlanadi — o'qishda aniq tipga keltiriladi
          const previous: TranscriptEntry[] = Array.isArray(existing?.entries)
            ? (existing.entries as unknown as TranscriptEntry[]).filter(
                (item) => item.courseId !== courseId,
              )
            : [];
          const entries: TranscriptEntry[] = [...previous, entry];

          const gpaSource = entries.map((item) => ({
            credits: item.credits,
            score: item.score,
          }));

          const totalCredits = entries.reduce((sum, item) => sum + item.credits, 0);
          const earnedCredits = entries
            .filter((item) => item.passed)
            .reduce((sum, item) => sum + item.credits, 0);

          if (existing) {
            await tx.transcript.update({
              where: { id: existing.id },
              data: {
                entries: entries as never,
                gpa: calculateGpa(gpaSource),
                totalCredits,
                earnedCredits,
              },
            });
          } else {
            await tx.transcript.create({
              data: {
                userId: row.userId,
                semesterId: course.semesterId as string,
                entries: entries as never,
                gpa: calculateGpa(gpaSource),
                totalCredits,
                earnedCredits,
              },
            });
          }
        }
      });

      await this.cache.delByPattern(`grade:course:${courseId}:*`);
      await this.audit.record({
        actorId: actor.id,
        action: 'gradebook.closed',
        resource: 'course',
        resourceId: courseId,
        after: { students: gradebook.length },
      });

      return { closed: true, students: gradebook.length };
    });

    if (!result) throw AppException.conflict('errors.gradebook_close_in_progress');
    return result;
  }

  /** Talabaning transkripti — barcha semestrlar bo'yicha. */
  async transcript(userId: string) {
    const transcripts = await this.prisma.db.transcript.findMany({
      where: { userId },
      orderBy: { semester: { startsAt: 'asc' } },
      select: {
        id: true,
        entries: true,
        gpa: true,
        totalCredits: true,
        earnedCredits: true,
        semester: {
          select: {
            id: true,
            number: true,
            academicYear: { select: { name: true } },
          },
        },
      },
    });

    const allEntries = transcripts.flatMap(
      (item) =>
        (Array.isArray(item.entries) ? item.entries : []) as Array<{
          credits: number;
          score: number;
        }>,
    );

    return {
      semesters: transcripts,
      cumulative: {
        gpa: calculateGpa(allEntries),
        totalCredits: transcripts.reduce((sum, item) => sum + item.totalCredits, 0),
        earnedCredits: transcripts.reduce((sum, item) => sum + item.earnedCredits, 0),
      },
    };
  }

  /** Guruh reytingi — talabalar yakuniy ball bo'yicha saralanadi. */
  async groupRanking(groupId: string, semesterId: string) {
    const members = await this.prisma.db.groupMember.findMany({
      where: { groupId, leftAt: null },
      select: {
        userId: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    const transcripts = await this.prisma.db.transcript.findMany({
      where: { semesterId, userId: { in: members.map((m) => m.userId) } },
      select: { userId: true, gpa: true, earnedCredits: true, totalCredits: true },
    });

    const byUser = new Map(transcripts.map((item) => [item.userId, item]));

    return members
      .map((member) => {
        const transcript = byUser.get(member.userId);
        return {
          userId: member.userId,
          fullName: [member.user.profile?.lastName, member.user.profile?.firstName]
            .filter(Boolean)
            .join(' '),
          gpa: transcript ? Number(transcript.gpa) : 0,
          earnedCredits: transcript?.earnedCredits ?? 0,
          totalCredits: transcript?.totalCredits ?? 0,
        };
      })
      .sort((a, b) => b.gpa - a.gpa)
      .map((row, index) => ({ ...row, rank: index + 1 }));
  }

  /** Baho tarixi — apellyatsiya va audit uchun. */
  async gradeHistory(gradeId: string) {
    return this.prisma.gradeHistory.findMany({
      where: { gradeId },
      orderBy: { changedAt: 'desc' },
      select: {
        id: true,
        oldScore: true,
        newScore: true,
        reason: true,
        changedAt: true,
        changedById: true,
      },
    });
  }

  // --- Yordamchilar ---------------------------------------------------------

  private async resolveControlType(code: string): Promise<{ id: string }> {
    const controlType = await this.prisma.controlType.findUnique({
      where: { code },
      select: { id: true },
    });
    if (!controlType) {
      throw new AppException({
        code: 'INTERNAL_ERROR',
        messageKey: 'errors.control_type_missing',
        context: { code },
      });
    }
    return controlType;
  }

  /** Kursning baholash siyosati; bo'lmasa standart (A-18). */
  private async resolvePolicy(courseId: string): Promise<GradingPolicy> {
    const course = await this.prisma.db.course.findUnique({
      where: { id: courseId },
      select: { gradingPolicy: true },
    });

    const policy = course?.gradingPolicy as GradingPolicy | null;
    if (!policy?.weights) return DEFAULT_GRADING_POLICY;
    return policy;
  }

  /** Baholash shkalasi bazadan; bo'lmasa standart (A-17). */
  private async resolveScale(): Promise<readonly GradeScaleBand[]> {
    return this.cache.remember('grading:scale', 600, async () => {
      const rows = await this.prisma.gradeScale.findMany({ orderBy: { minScore: 'desc' } });
      if (rows.length === 0) return DEFAULT_GRADE_SCALE as GradeScaleBand[];
      return rows.map((row) => ({
        min: Number(row.minScore),
        max: Number(row.maxScore),
        letter: row.letter as GradeScaleBand['letter'],
        gpa: Number(row.gpaPoints),
        five: row.fiveScale,
        labelKey: row.labelKey,
      }));
    });
  }

  private async invalidate(courseId: string, userId: string): Promise<void> {
    await this.cache.del(`grade:course:${courseId}:${userId}`);
  }

  /** Ballni harf va GPA ga o'girish — hisobotlar uchun ochiq yordamchi. */
  async describeScore(score: number) {
    const scale = await this.resolveScale();
    const band = resolveBand(score, scale);
    return { score, letter: band.letter, gpa: band.gpa, five: band.five, labelKey: band.labelKey };
  }
}
