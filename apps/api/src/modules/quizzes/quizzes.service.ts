/**
 * Maqsad: F-07 — test/imtihon o'tkazish: urinish boshlash, javob saqlash,
 * yakunlash va avtomatik baholash.
 *
 * Xavfsizlik printsiplari:
 *  - taymer SERVER tomonida (`QuizAttempt.expiresAt`), mijoz vaqtiga ishonilmaydi;
 *  - to'g'ri javoblar urinish davomida mijozga HECH QACHON yuborilmaydi;
 *  - variant urug'i (`seed`) saqlanadi — apellyatsiyada aynan o'sha variant tiklanadi.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  autograde,
  requiresManualGrading,
  resolveAttemptScore,
  round2,
  selectQuestionsForAttempt,
  shuffle,
  createSeededRandom,
  type CreateQuizInput,
  type ProctoringEventInput,
  type QuestionPayload,
  type QuestionResponse,
  type SaveAnswerInput,
  type SetQuizQuestionsInput,
  type UpdateQuizInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { QueueService } from '../../common/queue/queue.service';
import { CryptoService } from '../../common/security/crypto.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { GradingService } from '../grading/grading.service';
import { stripAnswers } from './strip-answers';

@Injectable()
export class QuizzesService {
  private readonly logger = new Logger(QuizzesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly queue: QueueService,
    private readonly crypto: CryptoService,
    private readonly grading: GradingService,
  ) {}

  // --- Test konstruktori ----------------------------------------------------

  async create(input: CreateQuizInput, actor: RequestUser) {
    const quiz = await this.prisma.db.quiz.create({
      data: {
        courseId: input.courseId,
        topicId: input.topicId ?? null,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        description: this.sanitizer.sanitizeLocalized(input.description ?? {}) as never,
        controlType: input.controlType,
        durationMinutes: input.durationMinutes,
        maxAttempts: input.maxAttempts,
        gradingMethod: input.gradingMethod,
        shuffleQuestions: input.shuffleQuestions,
        shuffleOptions: input.shuffleOptions,
        questionsPerAttempt: input.questionsPerAttempt,
        questionsPerPage: input.questionsPerPage,
        allowBacktrack: input.allowBacktrack,
        opensAt: input.opensAt ?? null,
        closesAt: input.closesAt ?? null,
        passScore: input.passScore,
        proctoringEnabled: input.proctoringEnabled,
        showAnswers: input.showAnswers,
        isPublished: input.isPublished,
      },
      select: { id: true, title: true, durationMinutes: true, isPublished: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'quiz.create',
      resource: 'quiz',
      resourceId: quiz.id,
      after: { courseId: input.courseId, controlType: input.controlType },
    });
    return quiz;
  }

  /** Test sozlamalari (o'qituvchi uchun, urinishlar soni bilan). */
  async getSettings(quizId: string) {
    const quiz = await this.prisma.db.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        courseId: true,
        topicId: true,
        title: true,
        description: true,
        controlType: true,
        durationMinutes: true,
        maxAttempts: true,
        gradingMethod: true,
        shuffleQuestions: true,
        shuffleOptions: true,
        questionsPerAttempt: true,
        opensAt: true,
        closesAt: true,
        passScore: true,
        proctoringEnabled: true,
        showAnswers: true,
        questionsPerPage: true,
        allowBacktrack: true,
        isPublished: true,
        _count: { select: { attempts: true, questions: true } },
      },
    });
    if (!quiz) throw AppException.notFound('quiz', quizId);
    const { _count, ...rest } = quiz;
    return { ...rest, attempts: _count.attempts, questionCount: _count.questions };
  }

  /**
   * Test sozlamalarini yangilash (Moodle "Edit settings"). Urinish boshlangan
   * bo'lsa ham vaqt/nashr sozlamalari o'zgartiriladi — savollar emas (u alohida
   * `setQuestions` da qulflanadi).
   */
  async update(quizId: string, input: UpdateQuizInput, actor: RequestUser) {
    const existing = await this.prisma.db.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, opensAt: true, closesAt: true },
    });
    if (!existing) throw AppException.notFound('quiz', quizId);

    const opensAt = input.opensAt !== undefined ? input.opensAt : existing.opensAt;
    const closesAt = input.closesAt !== undefined ? input.closesAt : existing.closesAt;
    if (opensAt && closesAt && closesAt <= opensAt) {
      throw AppException.validation([{ field: 'closesAt', code: 'validation.start_before_end' }]);
    }

    const quiz = await this.prisma.db.quiz.update({
      where: { id: quizId },
      data: {
        ...(input.topicId !== undefined ? { topicId: input.topicId } : {}),
        ...(input.title !== undefined
          ? { title: this.sanitizer.sanitizeLocalized(input.title) as never }
          : {}),
        ...(input.description !== undefined
          ? { description: this.sanitizer.sanitizeLocalized(input.description) as never }
          : {}),
        ...(input.controlType !== undefined ? { controlType: input.controlType } : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.maxAttempts !== undefined ? { maxAttempts: input.maxAttempts } : {}),
        ...(input.gradingMethod !== undefined ? { gradingMethod: input.gradingMethod } : {}),
        ...(input.shuffleQuestions !== undefined
          ? { shuffleQuestions: input.shuffleQuestions }
          : {}),
        ...(input.shuffleOptions !== undefined ? { shuffleOptions: input.shuffleOptions } : {}),
        ...(input.questionsPerAttempt !== undefined
          ? { questionsPerAttempt: input.questionsPerAttempt }
          : {}),
        ...(input.questionsPerPage !== undefined
          ? { questionsPerPage: input.questionsPerPage }
          : {}),
        ...(input.allowBacktrack !== undefined ? { allowBacktrack: input.allowBacktrack } : {}),
        ...(input.opensAt !== undefined ? { opensAt: input.opensAt } : {}),
        ...(input.closesAt !== undefined ? { closesAt: input.closesAt } : {}),
        ...(input.passScore !== undefined ? { passScore: input.passScore } : {}),
        ...(input.proctoringEnabled !== undefined
          ? { proctoringEnabled: input.proctoringEnabled }
          : {}),
        ...(input.showAnswers !== undefined ? { showAnswers: input.showAnswers } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      },
      select: { id: true, title: true, durationMinutes: true, isPublished: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'quiz.update',
      resource: 'quiz',
      resourceId: quizId,
      after: input as Record<string, unknown>,
    });
    return quiz;
  }

  async setQuestions(quizId: string, input: SetQuizQuestionsInput, actor: RequestUser) {
    const attempts = await this.prisma.db.quizAttempt.count({ where: { quizId } });
    if (attempts > 0) {
      throw AppException.businessRule('errors.quiz_has_attempts', { attempts });
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.quizQuestion.deleteMany({ where: { quizId } });
      await tx.quizQuestion.createMany({
        data: input.questions.map((item) => ({
          quizId,
          questionId: item.questionId,
          score: item.score,
          position: item.position,
          poolTag: item.poolTag ?? null,
        })),
      });
      await tx.quiz.update({
        where: { id: quizId },
        data: { poolSelection: input.poolSelection as never },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'quiz.questions_set',
      resource: 'quiz',
      resourceId: quizId,
      after: { count: input.questions.length },
    });

    return { questions: input.questions.length };
  }

  async listForCourse(courseId: string, actor: RequestUser) {
    const isStudent = actor.scope.enrolledCourseIds.includes(courseId);

    return this.prisma.db.quiz.findMany({
      where: { courseId, ...(isStudent ? { isPublished: true } : {}) },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        controlType: true,
        durationMinutes: true,
        maxAttempts: true,
        opensAt: true,
        closesAt: true,
        passScore: true,
        isPublished: true,
        proctoringEnabled: true,
        showAnswers: true,
        _count: { select: { questions: true } },
        attempts: isStudent
          ? {
              where: { userId: actor.id },
              orderBy: { attemptNumber: 'desc' },
              select: {
                id: true,
                attemptNumber: true,
                status: true,
                score: true,
                maxScore: true,
                submittedAt: true,
              },
            }
          : false,
      },
    });
  }

  /**
   * Test konstruktori uchun testning joriy holati (F-07).
   *
   * `startAttempt` dan farqi: bu yerda to'g'ri javoblar OLIB TASHLANMAYDI,
   * chunki metod faqat `quiz:manage:own_course` ruxsati bilan chaqiriladi —
   * o'qituvchi savol matnini va ballarni ko'rishi kerak. Urinish boshlangan
   * testda savollar ro'yxati qulflanadi (`setQuestions` uni rad etadi),
   * shuning uchun `locked` bayrog'i ham qaytariladi.
   */
  async questionsForBuilder(quizId: string) {
    const quiz = await this.prisma.db.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        courseId: true,
        title: true,
        controlType: true,
        durationMinutes: true,
        questionsPerAttempt: true,
        questionsPerPage: true,
        poolSelection: true,
        isPublished: true,
      },
    });
    if (!quiz) throw AppException.notFound('quiz', quizId);

    const [questions, attempts] = await Promise.all([
      this.prisma.quizQuestion.findMany({
        // Soft delete kengaytmasi faqat RO'YXAT munosabatlarini filtrlaydi,
        // `question` esa birlik munosabat — shuning uchun filtr qo'lda qo'yiladi.
        where: { quizId, question: { deletedAt: null } },
        orderBy: { position: 'asc' },
        select: {
          questionId: true,
          score: true,
          position: true,
          poolTag: true,
          question: {
            select: {
              id: true,
              type: true,
              text: true,
              difficulty: true,
              bloomLevel: true,
              defaultScore: true,
              bankId: true,
            },
          },
        },
      }),
      this.prisma.db.quizAttempt.count({ where: { quizId } }),
    ]);

    return { quiz, questions, locked: attempts > 0, attempts };
  }

  // --- Urinish oqimi --------------------------------------------------------

  /**
   * Urinish boshlash.
   *
   * Variant `seed` asosida deterministik tarzda generatsiya qilinadi:
   * urug' `attemptId + userId` dan hosil bo'ladi, shuning uchun apellyatsiya
   * vaqtida aynan o'sha savollar tartibi qayta tiklanadi.
   */
  async startAttempt(quizId: string, actor: RequestUser, ip?: string | null) {
    const quiz = await this.prisma.db.quiz.findUnique({
      where: { id: quizId },
      select: {
        id: true,
        courseId: true,
        isPublished: true,
        opensAt: true,
        closesAt: true,
        durationMinutes: true,
        maxAttempts: true,
        shuffleQuestions: true,
        questionsPerAttempt: true,
        poolSelection: true,
        questions: {
          orderBy: { position: 'asc' },
          select: { questionId: true, score: true, poolTag: true },
        },
      },
    });

    if (!quiz) throw AppException.notFound('quiz', quizId);
    if (!quiz.isPublished) throw AppException.businessRule('errors.quiz_not_published');
    if (quiz.questions.length === 0)
      throw AppException.businessRule('errors.quiz_has_no_questions');

    const now = new Date();
    if (quiz.opensAt && now < quiz.opensAt) {
      throw AppException.businessRule('errors.quiz_not_open_yet', {
        opensAt: quiz.opensAt.toISOString(),
      });
    }
    if (quiz.closesAt && now > quiz.closesAt) {
      throw AppException.businessRule('errors.quiz_closed', {
        closesAt: quiz.closesAt.toISOString(),
      });
    }

    const enrollment = await this.prisma.db.enrollment.findUnique({
      where: { courseId_userId: { courseId: quiz.courseId, userId: actor.id } },
      select: { status: true },
    });
    if (!enrollment || enrollment.status === 'WITHDRAWN') {
      throw AppException.forbidden('quizattempt:create:own');
    }

    // Tugallanmagan urinish bo'lsa — uni davom ettiramiz (internet uzilishi holati)
    const inProgress = await this.prisma.db.quizAttempt.findFirst({
      where: { quizId, userId: actor.id, status: 'IN_PROGRESS' },
      select: { id: true, expiresAt: true, questionOrder: true, attemptNumber: true, seed: true },
    });
    if (inProgress) {
      if (inProgress.expiresAt > now) {
        return this.buildAttemptPayload(inProgress.id, actor.id);
      }
      // Muddati o'tgan urinish avtomatik yakunlanadi
      await this.submitAttempt(inProgress.id, actor, { expired: true });
    }

    const previousCount = await this.prisma.db.quizAttempt.count({
      where: { quizId, userId: actor.id },
    });
    if (previousCount >= quiz.maxAttempts) {
      throw AppException.businessRule('errors.max_attempts_reached', {
        maxAttempts: quiz.maxAttempts,
      });
    }

    const attemptNumber = previousCount + 1;
    const seed = this.crypto.deterministicSeed(quizId, actor.id, String(attemptNumber));

    const selected = selectQuestionsForAttempt(
      quiz.questions.map((item) => ({
        questionId: item.questionId,
        poolTag: item.poolTag ?? undefined,
        score: Number(item.score),
      })),
      (quiz.poolSelection as Array<{ poolTag: string; take: number }>) ?? [],
      quiz.questionsPerAttempt,
      seed,
    );

    const ordered = quiz.shuffleQuestions ? shuffle(selected, createSeededRandom(seed)) : selected;

    const maxScore = round2(ordered.reduce((sum, item) => sum + item.score, 0));

    /**
     * Poyga holati: bir vaqtda kelgan ikkita so'rov `previousCount` ni bir xil
     * hisoblaydi va bir xil `attemptNumber` bilan yozuv yaratmoqchi bo'ladi
     * (React StrictMode `useEffect` ni ikki marta chaqiradi, foydalanuvchi ham
     * ikki marta bosishi mumkin). `@@unique([quizId, userId, attemptNumber])`
     * ikkinchisini rad etadi — bu TO'G'RI himoya, lekin foydalanuvchiga xato
     * ko'rsatish noto'g'ri bo'lardi: u aynan shu urinishni so'ragan.
     *
     * Shu sababli cheklov buzilganda birinchi so'rov yaratgan faol urinish
     * qaytariladi — natija ikkala holatda ham bir xil bo'ladi (idempotent).
     */
    let attempt: { id: string };
    try {
      attempt = await this.prisma.db.quizAttempt.create({
        data: {
          quizId,
          userId: actor.id,
          attemptNumber,
          status: 'IN_PROGRESS',
          questionOrder: ordered.map((item) => item.questionId) as never,
          seed,
          maxScore,
          expiresAt: new Date(now.getTime() + quiz.durationMinutes * 60_000),
          ip: ip ?? null,
        },
        select: { id: true },
      });
    } catch (error) {
      const isDuplicate =
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
      if (!isDuplicate) throw error;

      const concurrent = await this.prisma.db.quizAttempt.findFirst({
        where: { quizId, userId: actor.id, status: 'IN_PROGRESS' },
        select: { id: true },
      });
      // Yozuv boshqa sababdan takrorlangan bo'lsa — xatoni yashirmaymiz
      if (!concurrent) throw error;

      this.logger.warn(
        `Urinish yaratishda poyga aniqlandi (quiz=${quizId}, user=${actor.id}) — mavjud urinish qaytarildi`,
      );
      return this.buildAttemptPayload(concurrent.id, actor.id);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'quiz.attempt_started',
      resource: 'quizattempt',
      resourceId: attempt.id,
      after: { quizId, attemptNumber },
      ip,
    });

    return this.buildAttemptPayload(attempt.id, actor.id);
  }

  /**
   * Urinish uchun savollarni tayyorlaydi.
   * TO'G'RI JAVOBLAR OLIB TASHLANADI — bu eng muhim xavfsizlik qadami.
   */
  private async buildAttemptPayload(attemptId: string, userId: string) {
    // `userId` shartga KIRITILADI: urinish faqat egasiga qaytariladi.
    // Aks holda identifikatorni bilgan boshqa talaba savollarni ko'ra olardi.
    const attempt = await this.prisma.db.quizAttempt.findFirst({
      where: { id: attemptId, userId },
      select: {
        id: true,
        attemptNumber: true,
        status: true,
        questionOrder: true,
        seed: true,
        maxScore: true,
        startedAt: true,
        expiresAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            questionsPerPage: true,
            allowBacktrack: true,
            shuffleOptions: true,
            proctoringEnabled: true,
            questions: { select: { questionId: true, score: true } },
          },
        },
        answers: {
          select: { questionId: true, response: true, flagged: true },
        },
      },
    });

    if (!attempt || attempt.status !== 'IN_PROGRESS') {
      throw AppException.notFound('quizattempt', attemptId);
    }

    const order = attempt.questionOrder as string[];
    const scoreMap = new Map(
      attempt.quiz.questions.map((item) => [item.questionId, Number(item.score)]),
    );

    const questions = await this.prisma.db.question.findMany({
      where: { id: { in: order } },
      select: {
        id: true,
        type: true,
        text: true,
        payload: true,
        imageFileId: true,
      },
    });

    const questionMap = new Map(questions.map((question) => [question.id, question]));
    const random = createSeededRandom(attempt.seed);
    const answerMap = new Map(attempt.answers.map((answer) => [answer.questionId, answer]));

    const items = order
      .map((questionId) => questionMap.get(questionId))
      .filter((question): question is NonNullable<typeof question> => Boolean(question))
      .map((question) => ({
        id: question.id,
        type: question.type,
        text: question.text,
        imageFileId: question.imageFileId,
        score: scoreMap.get(question.id) ?? 1,
        payload: stripAnswers(
          question.payload as unknown as QuestionPayload,
          attempt.quiz.shuffleOptions,
          random,
        ),
        savedResponse: answerMap.get(question.id)?.response ?? null,
        flagged: answerMap.get(question.id)?.flagged ?? false,
      }));

    return {
      attemptId: attempt.id,
      attemptNumber: attempt.attemptNumber,
      quiz: {
        id: attempt.quiz.id,
        title: attempt.quiz.title,
        questionsPerPage: attempt.quiz.questionsPerPage,
        allowBacktrack: attempt.quiz.allowBacktrack,
        proctoringEnabled: attempt.quiz.proctoringEnabled,
      },
      maxScore: Number(attempt.maxScore),
      startedAt: attempt.startedAt,
      expiresAt: attempt.expiresAt,
      // Mijozga qolgan vaqt serverdan beriladi
      remainingSeconds: Math.max(0, Math.floor((attempt.expiresAt.getTime() - Date.now()) / 1000)),
      questions: items,
    };
  }

  /**
   * Javobni saqlash (avtosaqlash).
   *
   * Har bir javob alohida saqlanadi — internet uzilsa ham oldingi javoblar
   * yo'qolmaydi (RSK-08). Baholash bu bosqichda BAJARILMAYDI: to'g'ri javob
   * haqidagi ma'lumot javob vaqtida sizib chiqmasligi kerak.
   */
  async saveAnswer(input: SaveAnswerInput, actor: RequestUser) {
    const attempt = await this.prisma.db.quizAttempt.findUnique({
      where: { id: input.attemptId },
      select: {
        id: true,
        userId: true,
        status: true,
        expiresAt: true,
        questionOrder: true,
        quiz: { select: { questions: { select: { questionId: true, score: true } } } },
      },
    });

    if (!attempt) throw AppException.notFound('quizattempt', input.attemptId);
    if (attempt.userId !== actor.id) throw AppException.forbidden('quizattempt:create:own');
    if (attempt.status !== 'IN_PROGRESS') {
      throw AppException.businessRule('errors.attempt_not_in_progress');
    }
    if (attempt.expiresAt < new Date()) {
      throw AppException.businessRule('errors.attempt_time_expired');
    }

    const order = attempt.questionOrder as string[];
    if (!order.includes(input.questionId)) {
      throw AppException.businessRule('errors.question_not_in_attempt');
    }

    const maxScore =
      attempt.quiz.questions.find((item) => item.questionId === input.questionId)?.score ?? 1;

    await this.prisma.db.quizAnswer.upsert({
      where: {
        attemptId_questionId: { attemptId: input.attemptId, questionId: input.questionId },
      },
      create: {
        attemptId: input.attemptId,
        questionId: input.questionId,
        response: input.response as never,
        maxScore: Number(maxScore),
        flagged: input.flagged,
      },
      update: { response: input.response as never, flagged: input.flagged },
    });

    return { saved: true };
  }

  /**
   * Urinishni yakunlash va avtomatik baholash.
   *
   * Baholash `@lms/shared` dagi `autograde` sof funksiyasi orqali — u 10 ta
   * savol turini qamrab oladi va to'liq test bilan qoplangan.
   * Esse/kod savollari qo'lda baholash uchun belgilanadi.
   */
  async submitAttempt(attemptId: string, actor: RequestUser, options: { expired?: boolean } = {}) {
    const attempt = await this.prisma.db.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        status: true,
        maxScore: true,
        quiz: {
          select: {
            id: true,
            courseId: true,
            controlType: true,
            gradingMethod: true,
            questions: { select: { questionId: true, score: true } },
          },
        },
        answers: {
          select: { id: true, questionId: true, response: true, maxScore: true },
        },
      },
    });

    if (!attempt) throw AppException.notFound('quizattempt', attemptId);
    if (attempt.userId !== actor.id && !options.expired) {
      throw AppException.forbidden('quizattempt:create:own');
    }
    if (attempt.status !== 'IN_PROGRESS') {
      throw AppException.businessRule('errors.attempt_not_in_progress');
    }

    const questionIds = attempt.answers.map((answer) => answer.questionId);
    const questions = await this.prisma.db.question.findMany({
      where: { id: { in: questionIds } },
      select: { id: true, type: true, payload: true },
    });
    const questionMap = new Map(questions.map((question) => [question.id, question]));

    let totalScore = 0;
    let needsManual = false;

    await this.prisma.$transaction(async (tx) => {
      for (const answer of attempt.answers) {
        const question = questionMap.get(answer.questionId);
        if (!question) continue;

        const result = autograde(
          question.payload as unknown as QuestionPayload,
          answer.response as unknown as QuestionResponse | null,
          Number(answer.maxScore),
        );

        if (result.needsManualGrading) needsManual = true;
        totalScore += result.score;

        await tx.quizAnswer.update({
          where: { id: answer.id },
          data: {
            score: result.score,
            isCorrect: result.isCorrect,
            needsManualGrading: result.needsManualGrading,
            detail: (result.detail ?? null) as never,
          },
        });
      }

      await tx.quizAttempt.update({
        where: { id: attemptId },
        data: {
          status: needsManual ? 'SUBMITTED' : 'GRADED',
          score: round2(totalScore),
          submittedAt: new Date(),
          gradedAt: needsManual ? null : new Date(),
        },
      });
    });

    // Qo'lda baholash kerak bo'lmasa — baho darhol jurnalga tushadi
    if (!needsManual) {
      await this.publishAttemptGrade(attempt.quiz.id, actor.id);
    }

    // Item analysis qayta hisoblash — navbatda (og'ir agregat)
    await this.queue.enqueue('grading.recalculate', {
      courseId: attempt.quiz.courseId,
      userId: actor.id,
    });

    await this.audit.record({
      actorId: actor.id,
      action: options.expired ? 'quiz.attempt_expired' : 'quiz.attempt_submitted',
      resource: 'quizattempt',
      resourceId: attemptId,
      after: { score: round2(totalScore), needsManual },
    });

    return {
      attemptId,
      score: round2(totalScore),
      maxScore: Number(attempt.maxScore),
      status: needsManual ? 'SUBMITTED' : 'GRADED',
      needsManualGrading: needsManual,
    };
  }

  /**
   * Test bo'yicha yakuniy bahoni jurnalga chiqaradi.
   * Bir nechta urinish bo'lsa — testda belgilangan usul qo'llaniladi.
   */
  async publishAttemptGrade(quizId: string, userId: string): Promise<void> {
    const quiz = await this.prisma.db.quiz.findUnique({
      where: { id: quizId },
      select: { id: true, courseId: true, controlType: true, gradingMethod: true },
    });
    if (!quiz) return;

    const attempts = await this.prisma.db.quizAttempt.findMany({
      where: { quizId, userId, status: { in: ['SUBMITTED', 'GRADED'] } },
      orderBy: { attemptNumber: 'asc' },
      select: { score: true, maxScore: true },
    });
    if (attempts.length === 0) return;

    const scores = attempts.map((attempt) => Number(attempt.score ?? 0));
    const finalScore = resolveAttemptScore(
      scores,
      quiz.gradingMethod as 'HIGHEST' | 'LAST' | 'AVERAGE' | 'FIRST',
    );
    const maxScore = Number(attempts[0]?.maxScore ?? 0);

    // PRACTICE turidagi testlar jurnalga tushmaydi (mashq uchun)
    if (quiz.controlType === 'PRACTICE') return;

    await this.grading.upsertGradeFromQuiz({
      courseId: quiz.courseId,
      userId,
      quizId,
      controlTypeCode: quiz.controlType,
      score: finalScore,
      maxScore,
    });
  }

  /** Proctoring hodisasini qayd etish (A-09). */
  async recordProctoringEvent(input: ProctoringEventInput, actor: RequestUser) {
    const attempt = await this.prisma.db.quizAttempt.findUnique({
      where: { id: input.attemptId },
      select: { id: true, userId: true, proctoringEvents: true, status: true },
    });
    if (!attempt) throw AppException.notFound('quizattempt', input.attemptId);
    if (attempt.userId !== actor.id) throw AppException.forbidden('quizattempt:create:own');

    const events = Array.isArray(attempt.proctoringEvents)
      ? (attempt.proctoringEvents as unknown[])
      : [];

    // Jurnal cheksiz o'smasligi uchun oxirgi 500 hodisa saqlanadi
    events.push({
      type: input.type,
      occurredAt: input.occurredAt.toISOString(),
      meta: input.meta ?? {},
    });

    await this.prisma.db.quizAttempt.update({
      where: { id: input.attemptId },
      data: { proctoringEvents: events.slice(-500) as never },
    });

    return { recorded: true, totalEvents: events.length };
  }

  /**
   * Urinish natijasi. To'g'ri javoblar faqat test sozlamasiga ko'ra ko'rsatiladi
   * (`showAnswers`), aks holda faqat ball qaytadi.
   */
  async attemptResult(attemptId: string, actor: RequestUser) {
    const attempt = await this.prisma.db.quizAttempt.findUnique({
      where: { id: attemptId },
      select: {
        id: true,
        userId: true,
        status: true,
        score: true,
        maxScore: true,
        submittedAt: true,
        quiz: {
          select: {
            id: true,
            title: true,
            passScore: true,
            showAnswers: true,
            closesAt: true,
            courseId: true,
          },
        },
        answers: {
          select: {
            questionId: true,
            response: true,
            score: true,
            maxScore: true,
            isCorrect: true,
            needsManualGrading: true,
            detail: true,
            graderFeedback: true,
            question: { select: { text: true, type: true, payload: true, explanation: true } },
          },
        },
      },
    });

    if (!attempt) throw AppException.notFound('quizattempt', attemptId);

    const isOwner = attempt.userId === actor.id;
    const isTeacher = actor.scope.courseIds.includes(attempt.quiz.courseId);
    if (!isOwner && !isTeacher) throw AppException.forbidden('quizattempt:read:own');

    const now = new Date();
    const canSeeAnswers =
      isTeacher ||
      attempt.quiz.showAnswers === 'AFTER_ATTEMPT' ||
      (attempt.quiz.showAnswers === 'AFTER_CLOSE' &&
        Boolean(attempt.quiz.closesAt && now > attempt.quiz.closesAt));

    return {
      attemptId: attempt.id,
      status: attempt.status,
      score: Number(attempt.score ?? 0),
      maxScore: Number(attempt.maxScore),
      percent:
        Number(attempt.maxScore) > 0
          ? round2((Number(attempt.score ?? 0) / Number(attempt.maxScore)) * 100)
          : 0,
      passed:
        Number(attempt.maxScore) > 0 &&
        (Number(attempt.score ?? 0) / Number(attempt.maxScore)) * 100 >=
          Number(attempt.quiz.passScore),
      submittedAt: attempt.submittedAt,
      answers: attempt.answers.map((answer) => ({
        questionId: answer.questionId,
        text: answer.question.text,
        type: answer.question.type,
        response: answer.response,
        score: Number(answer.score),
        maxScore: Number(answer.maxScore),
        isCorrect: answer.isCorrect,
        needsManualGrading: answer.needsManualGrading,
        feedback: answer.graderFeedback,
        // To'g'ri javob faqat ruxsat etilganda
        correctPayload: canSeeAnswers ? answer.question.payload : null,
        explanation: canSeeAnswers ? answer.question.explanation : null,
        detail: canSeeAnswers ? answer.detail : null,
      })),
    };
  }

  /** Esse/kod javoblarini qo'lda baholash. */
  async gradeAnswer(
    answerId: string,
    score: number,
    feedback: Record<string, string> | undefined,
    actor: RequestUser,
  ) {
    const answer = await this.prisma.db.quizAnswer.findUnique({
      where: { id: answerId },
      select: {
        id: true,
        maxScore: true,
        attempt: {
          select: { id: true, userId: true, quizId: true, quiz: { select: { courseId: true } } },
        },
      },
    });
    if (!answer) throw AppException.notFound('quizattempt', answerId);
    if (score > Number(answer.maxScore)) {
      throw AppException.validation([{ field: 'score', code: 'validation.score_exceeds_max' }]);
    }

    await this.prisma.db.quizAnswer.update({
      where: { id: answerId },
      data: {
        score,
        isCorrect: score >= Number(answer.maxScore),
        needsManualGrading: false,
        graderFeedback: (feedback ?? null) as never,
        gradedById: actor.id,
      },
    });

    // Urinishning umumiy balli qayta hisoblanadi
    const remaining = await this.prisma.db.quizAnswer.count({
      where: { attemptId: answer.attempt.id, needsManualGrading: true },
    });

    const aggregate = await this.prisma.quizAnswer.aggregate({
      where: { attemptId: answer.attempt.id },
      _sum: { score: true },
    });

    await this.prisma.db.quizAttempt.update({
      where: { id: answer.attempt.id },
      data: {
        score: Number(aggregate._sum.score ?? 0),
        ...(remaining === 0 ? { status: 'GRADED', gradedAt: new Date() } : {}),
      },
    });

    if (remaining === 0) {
      await this.publishAttemptGrade(answer.attempt.quizId, answer.attempt.userId);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'quiz.answer_graded',
      resource: 'quizattempt',
      resourceId: answer.attempt.id,
      after: { answerId, score },
    });

    return { graded: true, remainingManual: remaining };
  }

  /**
   * Muddati o'tgan urinishlarni avtomatik yakunlash (cron orqali).
   * Talaba brauzerni yopib qo'ysa ham natija yo'qolmaydi.
   */
  async expireStaleAttempts(): Promise<number> {
    const stale = await this.prisma.db.quizAttempt.findMany({
      where: { status: 'IN_PROGRESS', expiresAt: { lt: new Date() } },
      select: { id: true, userId: true },
      take: 200,
    });

    for (const attempt of stale) {
      try {
        await this.submitAttempt(attempt.id, { id: attempt.userId } as RequestUser, {
          expired: true,
        });
      } catch (error) {
        this.logger.error(
          { attemptId: attempt.id, error: (error as Error).message },
          "Muddati o'tgan urinishni yakunlab bo'lmadi",
        );
      }
    }

    return stale.length;
  }
}

export { stripAnswers, requiresManualGrading };
