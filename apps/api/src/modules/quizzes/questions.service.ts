/**
 * Maqsad: F-07 — savollar banki va item analysis.
 *
 * Savol turlari `@lms/shared` dagi discriminated union bilan qat'iy
 * tiplashtirilgan, shuning uchun noto'g'ri tuzilgan savol bazaga tushmaydi.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  analyzeItem,
  normalizeForSearch,
  type CreateQuestionInput,
  type LocalizedText,
  type QuestionType,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';

@Injectable()
export class QuestionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
  ) {}

  async createBank(
    input: {
      courseId?: string | null;
      subjectId?: string | null;
      title: LocalizedText;
      isShared: boolean;
    },
    actor: RequestUser,
  ) {
    if (!input.courseId && !input.subjectId) {
      throw AppException.validation([
        { field: 'courseId', code: 'validation.course_or_subject_required' },
      ]);
    }

    return this.prisma.db.questionBank.create({
      data: {
        courseId: input.courseId ?? null,
        subjectId: input.subjectId ?? null,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        isShared: input.isShared,
        ownerId: actor.id,
      },
      select: { id: true, title: true, isShared: true },
    });
  }

  /**
   * Banklar ro'yxati: o'z banklari + kafedra ichida ulashilgan banklar.
   */
  async listBanks(actor: RequestUser, courseId?: string) {
    const where: Prisma.QuestionBankWhereInput = {
      OR: [
        { ownerId: actor.id },
        { isShared: true, subject: { departmentId: { in: actor.scope.departmentIds } } },
        { courseId: { in: actor.scope.courseIds } },
      ],
    };
    if (courseId) where.courseId = courseId;

    return this.prisma.db.questionBank.findMany({
      where,
      select: {
        id: true,
        title: true,
        isShared: true,
        courseId: true,
        subject: { select: { id: true, code: true, name: true } },
        _count: { select: { questions: true } },
      },
    });
  }

  async listQuestions(
    bankId: string,
    filters: { type?: QuestionType; difficulty?: string; search?: string; tag?: string },
  ) {
    return this.prisma.db.question.findMany({
      where: {
        bankId,
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.difficulty ? { difficulty: filters.difficulty as never } : {}),
        ...(filters.tag ? { tags: { has: filters.tag } } : {}),
        ...(filters.search ? { searchText: { contains: normalizeForSearch(filters.search) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      select: {
        id: true,
        type: true,
        text: true,
        payload: true,
        defaultScore: true,
        bloomLevel: true,
        difficulty: true,
        tags: true,
        facilityIndex: true,
        discriminationIndex: true,
        usageCount: true,
        explanation: true,
      },
    });
  }

  async createQuestion(input: CreateQuestionInput, actor: RequestUser) {
    const bank = await this.prisma.db.questionBank.findUnique({
      where: { id: input.bankId },
      select: { id: true },
    });
    if (!bank) throw AppException.notFound('questionbank', input.bankId);

    // Savol turi va payload turi mos kelishi sxema darajasida kafolatlangan
    const question = await this.prisma.db.question.create({
      data: {
        bankId: input.bankId,
        type: input.payload.type,
        text: this.sanitizer.sanitizeLocalized(input.text) as never,
        payload: input.payload as never,
        explanation: this.sanitizer.sanitizeLocalized(input.explanation ?? {}) as never,
        imageFileId: input.imageFileId ?? null,
        defaultScore: input.defaultScore,
        bloomLevel: input.bloomLevel ?? null,
        difficulty: input.difficulty,
        tags: input.tags,
        searchText: normalizeForSearch(
          `${Object.values(input.text).filter(Boolean).join(' ')} ${input.tags.join(' ')}`,
        ),
      },
      select: { id: true, type: true, defaultScore: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'question.create',
      resource: 'questionbank',
      resourceId: input.bankId,
      after: { questionId: question.id, type: question.type },
    });

    return question;
  }

  async updateQuestion(id: string, input: Partial<CreateQuestionInput>, actor: RequestUser) {
    const before = await this.prisma.db.question.findUnique({
      where: { id },
      select: { text: true, difficulty: true, defaultScore: true, usageCount: true },
    });
    if (!before) throw AppException.notFound('questionbank', id);

    // Ishlatilgan savolni o'zgartirish statistikani buzadi — ogohlantiramiz
    if (before.usageCount > 0 && input.payload) {
      throw AppException.businessRule('errors.question_already_used', {
        usageCount: before.usageCount,
      });
    }

    const updated = await this.prisma.db.question.update({
      where: { id },
      data: {
        ...(input.text !== undefined
          ? { text: this.sanitizer.sanitizeLocalized(input.text) as never }
          : {}),
        ...(input.payload !== undefined
          ? { payload: input.payload as never, type: input.payload.type }
          : {}),
        ...(input.explanation !== undefined
          ? { explanation: this.sanitizer.sanitizeLocalized(input.explanation) as never }
          : {}),
        ...(input.defaultScore !== undefined ? { defaultScore: input.defaultScore } : {}),
        ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
        ...(input.bloomLevel !== undefined ? { bloomLevel: input.bloomLevel } : {}),
        ...(input.tags !== undefined ? { tags: input.tags } : {}),
      },
      select: { id: true, type: true, difficulty: true, defaultScore: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'question.update',
      resource: 'questionbank',
      resourceId: id,
    });
    return updated;
  }

  /**
   * Item analysis (F-07): savolning qiyinlik va ajratish ko'rsatkichlarini
   * urinishlar asosida qayta hisoblaydi.
   *
   * Hisoblash `@lms/shared` dagi sof `analyzeItem` funksiyasi orqali —
   * u to'liq test bilan qoplangan.
   */
  async recalculateItemAnalysis(questionId: string) {
    const answers = await this.prisma.quizAnswer.findMany({
      where: { questionId, attempt: { status: { in: ['SUBMITTED', 'GRADED'] } } },
      select: {
        isCorrect: true,
        attempt: { select: { score: true, maxScore: true } },
      },
      take: 5000,
    });

    const attempts = answers.map((answer) => ({
      totalPercent:
        Number(answer.attempt.maxScore) > 0
          ? (Number(answer.attempt.score ?? 0) / Number(answer.attempt.maxScore)) * 100
          : 0,
      correct: answer.isCorrect,
    }));

    const analysis = analyzeItem({ attempts });

    await this.prisma.db.question.update({
      where: { id: questionId },
      data: {
        facilityIndex: analysis.facilityIndex,
        discriminationIndex: analysis.discriminationIndex,
        usageCount: analysis.sampleSize,
      },
    });

    return analysis;
  }

  /**
   * Bank bo'yicha sifat hisoboti — qayta ko'rib chiqish kerak bo'lgan
   * savollarni ajratib beradi (metodist uchun).
   */
  async bankQualityReport(bankId: string) {
    const questions = await this.prisma.db.question.findMany({
      where: { bankId, usageCount: { gt: 0 } },
      select: {
        id: true,
        text: true,
        type: true,
        difficulty: true,
        facilityIndex: true,
        discriminationIndex: true,
        usageCount: true,
      },
    });

    const needsReview = questions.filter((question) => {
      const facility = Number(question.facilityIndex ?? 0);
      const discrimination = Number(question.discriminationIndex ?? 0);
      return discrimination < 0.2 || facility < 0.2 || facility > 0.95;
    });

    return {
      total: questions.length,
      needsReview: needsReview.length,
      questions: needsReview,
      distribution: {
        easy: questions.filter((q) => Number(q.facilityIndex ?? 0) > 0.8).length,
        medium: questions.filter((q) => {
          const facility = Number(q.facilityIndex ?? 0);
          return facility >= 0.4 && facility <= 0.8;
        }).length,
        hard: questions.filter((q) => Number(q.facilityIndex ?? 0) < 0.4).length,
      },
    };
  }
}
