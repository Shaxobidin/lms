/**
 * Maqsad: F-07 endpointlari — savollar banki, test, urinishlar, baholash.
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createQuestionBankSchema,
  createQuestionSchema,
  exportQuestionsSchema,
  importQuestionsSchema,
  createQuizSchema,
  gradeAnswerSchema,
  proctoringEventSchema,
  QUESTION_TYPES,
  saveAnswerSchema,
  setQuizQuestionsSchema,
  updateQuizSchema,
  updateQuestionSchema,
  uuidSchema,
  type CreateQuestionInput,
  type ExportQuestionsInput,
  type ImportQuestionsInput,
  type CreateQuizInput,
  type ProctoringEventInput,
  type QuestionType,
  type SaveAnswerInput,
  type SetQuizQuestionsInput,
  type UpdateQuizInput,
} from '@lms/shared';
import { QuizzesService } from './quizzes.service';
import { QuestionsService } from './questions.service';
import { QuestionImportService } from './question-import.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { ClientIp, CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const questionFilters = z.object({
  type: z.enum(QUESTION_TYPES).optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']).optional(),
  search: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(48).optional(),
});

@ApiTags('quizzes')
@Controller()
export class QuizzesController {
  constructor(
    private readonly quizzes: QuizzesService,
    private readonly questions: QuestionsService,
    private readonly questionImport: QuestionImportService,
  ) {}

  // --- Savollar banki -------------------------------------------------------

  @Post('question-banks')
  @RequirePermission(['questionbank:manage:own_course', 'questionbank:read:own_department'])
  @ApiOperation({ summary: 'Savollar banki yaratish' })
  async createBank(
    @Body(zodBody(createQuestionBankSchema))
    dto: {
      courseId?: string | null;
      subjectId?: string | null;
      title: Record<string, string>;
      isShared: boolean;
    },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.questions.createBank(dto, actor);
  }

  @Get('question-banks')
  @RequirePermission(['questionbank:manage:own_course', 'questionbank:read:own_department'])
  @ApiOperation({ summary: 'Mavjud savollar banklari' })
  async listBanks(
    @Query(zodQuery(z.object({ courseId: uuidSchema.optional() }))) query: { courseId?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.questions.listBanks(actor, query.courseId);
  }

  @Get('question-banks/:id/questions')
  @RequirePermission(['questionbank:manage:own_course', 'questionbank:read:own_department'], {
    resource: 'questionbank',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Bankdagi savollar' })
  async listQuestions(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query(zodQuery(questionFilters))
    query: { type?: QuestionType; difficulty?: string; search?: string; tag?: string },
  ) {
    return this.questions.listQuestions(id, query);
  }

  @Get('question-banks/:id/quality')
  @RequirePermission(['questionbank:manage:own_course', 'questionbank:read:own_faculty'], {
    resource: 'questionbank',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Bank sifati hisoboti (item analysis)' })
  async bankQuality(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.questions.bankQualityReport(id);
  }

  @Post('questions')
  @RequirePermission('questionbank:manage:own_course')
  @ApiOperation({ summary: "Savol qo'shish (10 turdan biri)" })
  async createQuestion(
    @Body(zodBody(createQuestionSchema)) dto: CreateQuestionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.questions.createQuestion(dto, actor);
  }

  @Patch('questions/:id')
  @RequirePermission('questionbank:manage:own_course')
  @ApiOperation({ summary: 'Savolni tahrirlash' })
  async updateQuestion(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateQuestionSchema)) dto: Partial<CreateQuestionInput>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.questions.updateQuestion(id, dto, actor);
  }

  @Post('question-banks/:id/export')
  @RequirePermission(['questionbank:manage:own_course', 'questionbank:read:own_department'], {
    resource: 'questionbank',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Savollar bankini QTI 3.0 paketiga eksport qilish' })
  async exportBank(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(exportQuestionsSchema)) dto: ExportQuestionsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.questionImport.exportBank(id, dto, actor);
  }

  @Post('questions/import')
  @RequirePermission('questionbank:manage:own_course')
  @ApiOperation({
    summary:
      "Savollarni fayldan import qilish (QTI 3.0/2.x, AIKEN, GIFT, CSV); `dryRun` — oldindan ko'rish",
  })
  async importQuestions(
    @Body(zodBody(importQuestionsSchema)) dto: ImportQuestionsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.questionImport.importFromFile(dto, actor);
  }

  @Post('questions/:id/analyze')
  @RequirePermission('questionbank:manage:own_course')
  @ApiOperation({ summary: 'Savol statistikasini qayta hisoblash' })
  async analyzeQuestion(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.questions.recalculateItemAnalysis(id);
  }

  // --- Test -----------------------------------------------------------------

  @Post('quizzes')
  @RequirePermission('quiz:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: 'Test yaratish' })
  async createQuiz(
    @Body(zodBody(createQuizSchema)) dto: CreateQuizInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.create(dto, actor);
  }

  @Get('quizzes/:id')
  @RequirePermission('quiz:manage:own_course', { resource: 'quiz', path: 'params.id' })
  @ApiOperation({ summary: 'Test sozlamalari (o`qituvchi)' })
  async quizSettings(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.quizzes.getSettings(id);
  }

  @Patch('quizzes/:id')
  @RequirePermission('quiz:manage:own_course', { resource: 'quiz', path: 'params.id' })
  @ApiOperation({ summary: 'Test sozlamalarini yangilash' })
  async updateQuiz(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateQuizSchema)) dto: UpdateQuizInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.update(id, dto, actor);
  }

  @Post('quizzes/:id/questions')
  @RequirePermission('quiz:manage:own_course', { resource: 'quiz', path: 'params.id' })
  @ApiOperation({ summary: 'Testga savollar biriktirish va variant qoidalari' })
  async setQuestions(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(setQuizQuestionsSchema)) dto: SetQuizQuestionsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.setQuestions(id, dto, actor);
  }

  @Get('quizzes/:id/questions')
  @RequirePermission('quiz:manage:own_course', { resource: 'quiz', path: 'params.id' })
  @ApiOperation({ summary: 'Testga biriktirilgan savollar (konstruktor uchun)' })
  async builderQuestions(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.quizzes.questionsForBuilder(id);
  }

  @Get('courses/:courseId/quizzes')
  @RequirePermission(['quiz:read:own', 'quiz:manage:own_course'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Kursning testlari' })
  async listForCourse(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.listForCourse(courseId, actor);
  }

  // --- Urinish oqimi --------------------------------------------------------

  @Post('quizzes/:id/attempts')
  @RequirePermission('quizattempt:create:own')
  @ApiOperation({ summary: 'Testni boshlash (variant generatsiyasi bilan)' })
  async startAttempt(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
    @ClientIp() ip: string,
  ) {
    return this.quizzes.startAttempt(id, actor, ip);
  }

  @Post('attempts/answers')
  @RequirePermission('quizattempt:create:own')
  @ApiOperation({ summary: 'Javobni saqlash (avtosaqlash)' })
  async saveAnswer(
    @Body(zodBody(saveAnswerSchema)) dto: SaveAnswerInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.saveAnswer(dto, actor);
  }

  @Post('attempts/:id/submit')
  @RequirePermission('quizattempt:create:own')
  @ApiOperation({ summary: 'Urinishni yakunlash va avtomatik baholash' })
  async submitAttempt(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.submitAttempt(id, actor);
  }

  @Get('attempts/:id/result')
  @RequirePermission(['quizattempt:read:own', 'quizattempt:read:own_course'])
  @ApiOperation({ summary: 'Urinish natijasi' })
  async attemptResult(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.attemptResult(id, actor);
  }

  @Post('attempts/proctoring')
  @RequirePermission('quizattempt:create:own')
  @ApiOperation({ summary: 'Proctoring hodisasini qayd etish' })
  async proctoring(
    @Body(zodBody(proctoringEventSchema)) dto: ProctoringEventInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.recordProctoringEvent(dto, actor);
  }

  @Post('attempts/answers/grade')
  @RequirePermission('quizattempt:grade:own_course')
  @ApiOperation({ summary: "Esse yoki kod javobini qo'lda baholash" })
  async gradeAnswer(
    @Body(zodBody(gradeAnswerSchema))
    dto: { answerId: string; score: number; feedback?: Record<string, string> },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.quizzes.gradeAnswer(dto.answerId, dto.score, dto.feedback, actor);
  }
}
