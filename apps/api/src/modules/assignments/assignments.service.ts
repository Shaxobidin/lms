/**
 * Maqsad: F-06 — topshiriqlar, rubrika asosida baholash, peer-review va
 * o'xshashlikni tekshirish.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  applyLatePenalty,
  round2,
  type CreateAssignmentInput,
  type CreateRubricInput,
  type CreateSubmissionInput,
  type GradeSubmissionInput,
  type PeerReviewInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { QueueService } from '../../common/queue/queue.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { GradingService } from '../grading/grading.service';

@Injectable()
export class AssignmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly grading: GradingService,
  ) {}

  // --- Rubrika --------------------------------------------------------------

  async createRubric(input: CreateRubricInput, actor: RequestUser) {
    const totalPoints = input.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0);

    const rubric = await this.prisma.db.rubric.create({
      data: {
        courseId: input.courseId,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        description: this.sanitizer.sanitizeLocalized(input.description ?? {}) as never,
        totalPoints: Math.round(totalPoints),
        criteria: {
          create: input.criteria.map((criterion, index) => ({
            title: this.sanitizer.sanitizeLocalized(criterion.title) as never,
            description: this.sanitizer.sanitizeLocalized(criterion.description ?? {}) as never,
            maxPoints: criterion.maxPoints,
            position: criterion.position || index,
            levels: criterion.levels as never,
          })),
        },
      },
      select: { id: true, title: true, totalPoints: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'rubric.create',
      resource: 'rubric',
      resourceId: rubric.id,
    });
    return rubric;
  }

  async listRubrics(courseId: string) {
    return this.prisma.db.rubric.findMany({
      where: { courseId },
      select: {
        id: true,
        title: true,
        totalPoints: true,
        criteria: {
          orderBy: { position: 'asc' },
          select: { id: true, title: true, description: true, maxPoints: true, levels: true },
        },
      },
    });
  }

  // --- Topshiriq ------------------------------------------------------------

  async create(input: CreateAssignmentInput, actor: RequestUser) {
    // Rubrika berilgan bo'lsa, u shu kursga tegishli bo'lishi shart
    if (input.rubricId) {
      const rubric = await this.prisma.db.rubric.findUnique({
        where: { id: input.rubricId },
        select: { courseId: true },
      });
      if (!rubric || rubric.courseId !== input.courseId) {
        throw AppException.validation([
          { field: 'rubricId', code: 'validation.rubric_other_course' },
        ]);
      }
    }

    const assignment = await this.prisma.db.assignment.create({
      data: {
        courseId: input.courseId,
        topicId: input.topicId ?? null,
        rubricId: input.rubricId ?? null,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        description: this.sanitizer.sanitizeLocalized(input.description) as never,
        kind: input.kind,
        controlType: input.controlType,
        maxScore: input.maxScore,
        dueAt: input.dueAt,
        lateUntil: input.lateUntil ?? null,
        latePenaltyPercent: input.latePenaltyPercent,
        maxAttempts: input.maxAttempts,
        peerReviewEnabled: input.peerReviewEnabled,
        peerReviewCount: input.peerReviewCount,
        peerReviewDueAt: input.peerReviewDueAt ?? null,
        plagiarismCheck: input.plagiarismCheck,
        allowedMimeTypes: input.allowedMimeTypes,
        maxFileSizeMb: input.maxFileSizeMb,
        maxFiles: input.maxFiles,
        isPublished: input.isPublished,
      },
      select: { id: true, title: true, dueAt: true, maxScore: true, isPublished: true },
    });

    if (input.isPublished) {
      await this.events.publish({
        type: EVENT_TYPES.ANNOUNCEMENT,
        courseId: input.courseId,
        payload: { assignmentId: assignment.id, titleKey: 'events.assignment_published' },
      });
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'assignment.create',
      resource: 'assignment',
      resourceId: assignment.id,
      after: { courseId: input.courseId, maxScore: input.maxScore },
    });

    return assignment;
  }

  async listForCourse(courseId: string, actor: RequestUser) {
    const isStudent = actor.scope.enrolledCourseIds.includes(courseId);

    const assignments = await this.prisma.db.assignment.findMany({
      where: { courseId, ...(isStudent ? { isPublished: true } : {}) },
      orderBy: { dueAt: 'asc' },
      select: {
        id: true,
        title: true,
        description: true,
        kind: true,
        controlType: true,
        maxScore: true,
        dueAt: true,
        lateUntil: true,
        maxAttempts: true,
        peerReviewEnabled: true,
        isPublished: true,
        rubric: { select: { id: true, title: true, totalPoints: true } },
        // Talaba uchun — faqat o'z ishi; o'qituvchi uchun — statistika
        submissions: isStudent
          ? {
              where: { userId: actor.id },
              orderBy: { attemptNumber: 'desc' },
              take: 1,
              select: {
                id: true,
                status: true,
                score: true,
                submittedAt: true,
                attemptNumber: true,
              },
            }
          : false,
        _count: !isStudent ? { select: { submissions: true } } : undefined,
      },
    });

    return assignments;
  }

  // --- Topshirish -----------------------------------------------------------

  /**
   * Ishni saqlash yoki yuborish.
   *
   * Muddat nazorati server tomonida: mijoz vaqtiga ishonilmaydi.
   * Kechikish siyosati `applyLatePenalty` (sof funksiya) orqali qo'llaniladi.
   */
  async submit(input: CreateSubmissionInput, actor: RequestUser) {
    const assignment = await this.prisma.db.assignment.findUnique({
      where: { id: input.assignmentId },
      select: {
        id: true,
        courseId: true,
        isPublished: true,
        dueAt: true,
        lateUntil: true,
        maxAttempts: true,
        maxFiles: true,
        allowedMimeTypes: true,
        plagiarismCheck: true,
        kind: true,
      },
    });

    if (!assignment) throw AppException.notFound('assignment', input.assignmentId);
    if (!assignment.isPublished) throw AppException.businessRule('errors.assignment_not_published');

    const enrolled = await this.prisma.db.enrollment.findUnique({
      where: { courseId_userId: { courseId: assignment.courseId, userId: actor.id } },
      select: { status: true },
    });
    if (!enrolled || enrolled.status === 'WITHDRAWN') {
      throw AppException.forbidden('submission:create:own');
    }

    const now = new Date();
    if (input.submit) {
      const deadline = assignment.lateUntil ?? assignment.dueAt;
      if (now > deadline) {
        throw AppException.businessRule('errors.assignment_deadline_passed', {
          deadline: deadline.toISOString(),
        });
      }
    }

    if (input.fileIds.length > assignment.maxFiles) {
      throw AppException.validation([{ field: 'fileIds', code: 'validation.too_many_files' }]);
    }

    // Fayl turlarini tekshiramiz (agar oq ro'yxat belgilangan bo'lsa)
    if (assignment.allowedMimeTypes.length > 0 && input.fileIds.length > 0) {
      const files = await this.prisma.db.fileObject.findMany({
        where: { id: { in: input.fileIds } },
        select: { id: true, mimeType: true, status: true },
      });
      for (const file of files) {
        if (file.status !== 'READY') throw AppException.businessRule('errors.file_not_ready');
        if (!assignment.allowedMimeTypes.includes(file.mimeType)) {
          throw new AppException({
            code: 'UNSUPPORTED_MEDIA_TYPE',
            messageKey: 'errors.file_type_not_allowed',
            context: { mimeType: file.mimeType },
          });
        }
      }
    }

    const existing = await this.prisma.db.submission.findFirst({
      where: { assignmentId: assignment.id, userId: actor.id },
      orderBy: { attemptNumber: 'desc' },
      select: { id: true, attemptNumber: true, status: true },
    });

    // Qoralamani yangilaymiz; yuborilgan ish uchun yangi urinish ochiladi
    const isNewAttempt = !existing || existing.status !== 'DRAFT';
    if (isNewAttempt && existing && existing.attemptNumber >= assignment.maxAttempts) {
      throw AppException.businessRule('errors.max_attempts_reached', {
        maxAttempts: assignment.maxAttempts,
      });
    }

    const status = input.submit ? (now > assignment.dueAt ? 'LATE' : 'SUBMITTED') : 'DRAFT';

    const contentHtml = this.sanitizer.sanitizeHtml(input.contentHtml);

    const submission = isNewAttempt
      ? await this.prisma.db.submission.create({
          data: {
            assignmentId: assignment.id,
            userId: actor.id,
            attemptNumber: (existing?.attemptNumber ?? 0) + 1,
            contentHtml,
            fileIds: input.fileIds,
            status,
            submittedAt: input.submit ? now : null,
          },
          select: { id: true, status: true, attemptNumber: true, submittedAt: true },
        })
      : await this.prisma.db.submission.update({
          where: { id: existing.id },
          data: {
            contentHtml,
            fileIds: input.fileIds,
            status,
            submittedAt: input.submit ? now : null,
          },
          select: { id: true, status: true, attemptNumber: true, submittedAt: true },
        });

    // Plagiat tekshiruvi navbatda — API kutmaydi (ADR-004)
    if (input.submit && assignment.plagiarismCheck) {
      await this.queue.enqueue('plagiarism.check', { submissionId: submission.id });
    }

    await this.audit.record({
      actorId: actor.id,
      action: input.submit ? 'submission.submit' : 'submission.save_draft',
      resource: 'submission',
      resourceId: submission.id,
      after: { assignmentId: assignment.id, status },
    });

    return submission;
  }

  async listSubmissions(
    filters: {
      assignmentId?: string;
      courseId?: string;
      userId?: string;
      status?: string;
      ungradedOnly?: boolean;
    },
    actor: RequestUser,
  ) {
    const where: Prisma.SubmissionWhereInput = {};

    if (filters.assignmentId) where.assignmentId = filters.assignmentId;
    if (filters.userId) where.userId = filters.userId;
    if (filters.courseId) where.assignment = { courseId: filters.courseId };
    if (filters.status) where.status = filters.status as never;
    if (filters.ungradedOnly) {
      where.status = { in: ['SUBMITTED', 'LATE'] };
      where.gradedAt = null;
    }

    // Talaba faqat o'z ishlarini ko'radi
    const canGradeCourses = actor.scope.courseIds;
    const isTeacherForFilter =
      filters.courseId !== undefined && canGradeCourses.includes(filters.courseId);
    if (!isTeacherForFilter && canGradeCourses.length === 0) {
      where.userId = actor.id;
    } else if (!isTeacherForFilter) {
      where.OR = [{ userId: actor.id }, { assignment: { courseId: { in: canGradeCourses } } }];
    }

    return this.prisma.db.submission.findMany({
      where,
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: 200,
      select: {
        id: true,
        status: true,
        score: true,
        attemptNumber: true,
        submittedAt: true,
        gradedAt: true,
        similarityPercent: true,
        contentHtml: true,
        fileIds: true,
        feedback: true,
        user: {
          select: { id: true, profile: { select: { firstName: true, lastName: true } } },
        },
        assignment: {
          select: { id: true, title: true, maxScore: true, dueAt: true, courseId: true },
        },
        rubricScores: {
          select: { criterionId: true, points: true, comment: true, reviewerId: true },
        },
      },
    });
  }

  /**
   * Ishni baholash. Rubrika bo'lsa — mezonlar bo'yicha ball yig'iladi va
   * topshiriqning maksimal balliga proporsional ravishda o'girildi.
   * Kechikish jarimasi avtomatik qo'llaniladi.
   */
  async grade(submissionId: string, input: GradeSubmissionInput, actor: RequestUser) {
    const submission = await this.prisma.db.submission.findUnique({
      where: { id: submissionId },
      select: {
        id: true,
        userId: true,
        status: true,
        score: true,
        submittedAt: true,
        assignment: {
          select: {
            id: true,
            courseId: true,
            maxScore: true,
            dueAt: true,
            lateUntil: true,
            latePenaltyPercent: true,
            controlType: true,
            rubric: { select: { id: true, totalPoints: true } },
          },
        },
      },
    });

    if (!submission) throw AppException.notFound('submission', submissionId);
    if (submission.status === 'DRAFT') {
      throw AppException.businessRule('errors.cannot_grade_draft');
    }

    const assignment = submission.assignment;
    const maxScore = Number(assignment.maxScore);

    // Ballni aniqlash: rubrika ustuvor
    let rawScore: number;
    if (input.rubricScores && input.rubricScores.length > 0) {
      if (!assignment.rubric) {
        throw AppException.businessRule('errors.assignment_has_no_rubric');
      }
      const criteria = await this.prisma.db.rubricCriterion.findMany({
        where: { rubricId: assignment.rubric.id },
        select: { id: true, maxPoints: true },
      });
      const criterionMap = new Map(criteria.map((c) => [c.id, Number(c.maxPoints)]));

      let earned = 0;
      for (const entry of input.rubricScores) {
        const max = criterionMap.get(entry.criterionId);
        if (max === undefined) {
          throw AppException.validation([
            { field: 'rubricScores', code: 'validation.unknown_criterion' },
          ]);
        }
        if (entry.points > max) {
          throw AppException.validation([
            { field: 'rubricScores', code: 'validation.points_exceed_criterion_max' },
          ]);
        }
        earned += entry.points;
      }

      const rubricTotal = Number(assignment.rubric.totalPoints) || 1;
      rawScore = round2((earned / rubricTotal) * maxScore);
    } else {
      rawScore = Math.min(input.score ?? 0, maxScore);
    }

    // Kechikish jarimasi (sof funksiya — @lms/shared)
    const finalScore = submission.submittedAt
      ? applyLatePenalty(
          rawScore,
          submission.submittedAt,
          assignment.dueAt,
          assignment.lateUntil,
          Number(assignment.latePenaltyPercent),
        )
      : rawScore;

    if (finalScore === null) {
      throw AppException.businessRule('errors.submission_past_late_deadline');
    }

    const status = input.returnForRevision ? 'RETURNED' : 'GRADED';

    await this.prisma.$transaction(async (tx) => {
      await tx.submission.update({
        where: { id: submissionId },
        data: {
          score: finalScore,
          feedback: this.sanitizer.sanitizeHtml(input.feedback),
          status,
          gradedById: actor.id,
          gradedAt: new Date(),
        },
      });

      if (input.rubricScores) {
        for (const entry of input.rubricScores) {
          const existing = await tx.rubricScore.findFirst({
            where: { submissionId, criterionId: entry.criterionId, reviewerId: null },
            select: { id: true },
          });
          if (existing) {
            await tx.rubricScore.update({
              where: { id: existing.id },
              data: { points: entry.points, comment: entry.comment ?? null },
            });
          } else {
            await tx.rubricScore.create({
              data: {
                submissionId,
                criterionId: entry.criterionId,
                points: entry.points,
                comment: entry.comment ?? null,
              },
            });
          }
        }
      }
    });

    // Baho jurnalga yoziladi (F-08) — bu yerda emas, GradingService da,
    // chunki baho tarixi va qayta hisoblash o'sha modulning mas'uliyati.
    if (!input.returnForRevision) {
      await this.grading.upsertGradeFromAssignment({
        courseId: assignment.courseId,
        userId: submission.userId,
        assignmentId: assignment.id,
        controlTypeCode: assignment.controlType,
        score: finalScore,
        maxScore,
        actorId: actor.id,
      });
    }

    await this.events.publish({
      type: EVENT_TYPES.SUBMISSION_GRADED,
      userId: submission.userId,
      payload: { submissionId, assignmentId: assignment.id, score: finalScore },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'submission.grade',
      resource: 'submission',
      resourceId: submissionId,
      before: { score: submission.score },
      after: { score: finalScore, status },
    });

    return { id: submissionId, score: finalScore, status };
  }

  /**
   * Peer-review taqsimoti: har bir talabaga N ta boshqa ish beriladi.
   * Aylanma (round-robin) taqsimot — har bir ish teng miqdorda ko'rib chiqiladi.
   */
  async distributePeerReviews(assignmentId: string, actor: RequestUser) {
    const assignment = await this.prisma.db.assignment.findUnique({
      where: { id: assignmentId },
      select: { id: true, peerReviewEnabled: true, peerReviewCount: true },
    });
    if (!assignment) throw AppException.notFound('assignment', assignmentId);
    if (!assignment.peerReviewEnabled) {
      throw AppException.businessRule('errors.peer_review_disabled');
    }

    const submissions = await this.prisma.db.submission.findMany({
      where: { assignmentId, status: { in: ['SUBMITTED', 'LATE'] } },
      select: { id: true, userId: true },
      orderBy: { submittedAt: 'asc' },
    });

    if (submissions.length < assignment.peerReviewCount + 1) {
      throw AppException.businessRule('errors.not_enough_submissions_for_peer_review', {
        required: assignment.peerReviewCount + 1,
        actual: submissions.length,
      });
    }

    const assignments: Array<{ submissionId: string; reviewerId: string }> = [];
    for (let i = 0; i < submissions.length; i += 1) {
      for (let offset = 1; offset <= assignment.peerReviewCount; offset += 1) {
        const target = submissions[(i + offset) % submissions.length];
        const reviewer = submissions[i];
        // O'z ishini ko'rib chiqmaydi
        if (target && reviewer && target.userId !== reviewer.userId) {
          assignments.push({ submissionId: target.id, reviewerId: reviewer.userId });
        }
      }
    }

    const created = await this.prisma.db.peerReview.createMany({
      data: assignments,
      skipDuplicates: true,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'assignment.peer_review_distributed',
      resource: 'assignment',
      resourceId: assignmentId,
      after: { assigned: created.count },
    });

    return { assigned: created.count };
  }

  async submitPeerReview(input: PeerReviewInput, actor: RequestUser) {
    const review = await this.prisma.db.peerReview.findFirst({
      where: { submissionId: input.submissionId, reviewerId: actor.id },
      select: { id: true, submittedAt: true },
    });
    if (!review) throw AppException.forbidden('submission:grade:own_course');
    if (review.submittedAt) throw AppException.conflict('errors.peer_review_already_submitted');

    const totalPoints = input.rubricScores.reduce((sum, entry) => sum + entry.points, 0);

    await this.prisma.$transaction(async (tx) => {
      await tx.peerReview.update({
        where: { id: review.id },
        data: {
          totalPoints,
          overallComment: this.sanitizer.stripHtml(input.overallComment),
          submittedAt: new Date(),
        },
      });

      for (const entry of input.rubricScores) {
        await tx.rubricScore.create({
          data: {
            submissionId: input.submissionId,
            criterionId: entry.criterionId,
            points: entry.points,
            comment: entry.comment ?? null,
            reviewerId: actor.id,
          },
        });
      }
    });

    return { submitted: true, totalPoints };
  }

  /** Talabaga biriktirilgan peer-review ishlari. */
  async myPeerReviews(actor: RequestUser) {
    return this.prisma.db.peerReview.findMany({
      where: { reviewerId: actor.id, submittedAt: null },
      select: {
        id: true,
        submission: {
          select: {
            id: true,
            contentHtml: true,
            fileIds: true,
            submittedAt: true,
            assignment: {
              select: {
                id: true,
                title: true,
                maxScore: true,
                peerReviewDueAt: true,
                rubric: {
                  select: {
                    id: true,
                    title: true,
                    criteria: {
                      orderBy: { position: 'asc' },
                      select: { id: true, title: true, maxPoints: true, levels: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }
}
