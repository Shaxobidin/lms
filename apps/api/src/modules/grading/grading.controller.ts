/**
 * Maqsad: F-08 endpointlari — jurnal, yakuniy ball, transkript, reyting.
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { CONTROL_TYPES, uuidSchema, type ControlTypeCode } from '@lms/shared';
import { GradingService } from './grading.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';

const manualGradeSchema = z.object({
  courseId: uuidSchema,
  userId: uuidSchema,
  controlTypeCode: z.enum(CONTROL_TYPES),
  score: z.coerce.number().min(0).max(1000),
  maxScore: z.coerce.number().min(1).max(1000),
  comment: z.string().trim().max(1000).optional(),
  reason: z.string().trim().max(1000).optional(),
});

@ApiTags('grading')
@Controller('grading')
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @Get('courses/:courseId/gradebook')
  @RequirePermission(
    [
      'grade:read:own_course',
      'grade:read:own_department',
      'grade:read:own_faculty',
      'grade:read:all',
    ],
    { resource: 'course', path: 'params.courseId' },
  )
  @ApiOperation({ summary: 'Kurs jurnali (barcha talabalar kesimida)' })
  async gradebook(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.grading.courseGradebook(courseId);
  }

  @Get('courses/:courseId/my-result')
  @RequirePermission('grade:read:own')
  @ApiOperation({ summary: "Mening kurs bo'yicha natijam" })
  async myResult(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.grading.courseResult(courseId, actor.id);
  }

  @Post('manual')
  @RequirePermission(
    ['grade:create:own_course', 'grade:update:own_course', 'grade:update:own_faculty'],
    { resource: 'course', path: 'body.courseId' },
  )
  @ApiOperation({ summary: "Qo'lda baho qo'yish yoki tuzatish" })
  async setManual(
    @Body(zodBody(manualGradeSchema))
    dto: {
      courseId: string;
      userId: string;
      controlTypeCode: ControlTypeCode;
      score: number;
      maxScore: number;
      comment?: string;
      reason?: string;
    },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.grading.setManualGrade(dto, actor);
  }

  @Post('courses/:courseId/close')
  @RequirePermission(['grade:update:own_faculty', 'grade:update:all'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Semestr jurnalini yopish va transkriptni shakllantirish' })
  async closeGradebook(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.grading.closeSemesterGradebook(courseId, actor);
  }

  @Get('transcript/:userId')
  @RequirePermission(
    ['transcript:read:own', 'transcript:read:own_group', 'transcript:read:own_faculty'],
    { resource: 'user', path: 'params.userId' },
  )
  @ApiOperation({ summary: 'Talaba transkripti va kumulyativ GPA' })
  async transcript(
    @Param('userId', new ZodValidationPipe(uuidSchema)) userId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    // Talaba faqat o'z transkriptini ko'radi; kengroq scope PolicyGuard da tekshirilgan
    const canReadOthers = actor.permissions.some(
      (key) => key.startsWith('transcript:read:') && !key.endsWith(':own'),
    );
    if (userId !== actor.id && !canReadOthers) {
      throw AppException.forbidden('transcript:read:own');
    }
    return this.grading.transcript(userId);
  }

  @Get('ranking')
  @RequirePermission([
    'analytics:read:own_group',
    'analytics:read:own_faculty',
    'analytics:read:all',
  ])
  @ApiOperation({ summary: "Guruh reytingi (GPA bo'yicha)" })
  async ranking(
    @Query(zodQuery(z.object({ groupId: uuidSchema, semesterId: uuidSchema })))
    query: {
      groupId: string;
      semesterId: string;
    },
  ) {
    return this.grading.groupRanking(query.groupId, query.semesterId);
  }

  @Get(':gradeId/history')
  @RequirePermission(['grade:read:own_course', 'grade:read:own_faculty', 'auditlog:read:all'], {
    resource: 'grade',
    path: 'params.gradeId',
  })
  @ApiOperation({ summary: "Baho o'zgarishlari tarixi (apellyatsiya uchun)" })
  async history(@Param('gradeId', new ZodValidationPipe(uuidSchema)) gradeId: string) {
    return this.grading.gradeHistory(gradeId);
  }
}
