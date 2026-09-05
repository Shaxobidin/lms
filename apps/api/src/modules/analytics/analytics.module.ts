/** Maqsad: F-13 modulini yig'ish — analitika va hisobot eksporti. */

import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  analyticsQuerySchema,
  exportRequestSchema,
  uuidSchema,
  type AnalyticsQuery,
  type ExportRequest,
} from '@lms/shared';
import { AnalyticsService } from './analytics.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { QueueService } from '../../common/queue/queue.service';

@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(
    private readonly analytics: AnalyticsService,
    private readonly queue: QueueService,
  ) {}

  @Get('dashboard')
  @RequirePermission([
    'analytics:read:own',
    'analytics:read:own_course',
    'analytics:read:own_group',
    'analytics:read:own_department',
    'analytics:read:own_faculty',
    'analytics:read:all',
  ])
  @ApiOperation({ summary: "Rolga mos dashboard ko'rsatkichlari" })
  async dashboard(
    @Query(zodQuery(analyticsQuerySchema)) query: AnalyticsQuery,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.analytics.dashboard(actor, query);
  }

  @Get('student-overview')
  @RequirePermission('analytics:read:own')
  @ApiOperation({ summary: "Talabaning shaxsiy ko'rsatkichlari" })
  async studentOverview(@CurrentUser() actor: RequestUser) {
    return this.analytics.studentOverview(actor.id);
  }

  @Get('courses/:courseId/trend')
  @RequirePermission(['analytics:read:own_course', 'analytics:read:own_faculty'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: "O'zlashtirish dinamikasi (haftalar kesimida)" })
  async trend(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @Query(zodQuery(z.object({ weeks: z.coerce.number().int().min(1).max(52).default(12) })))
    query: { weeks: number },
  ) {
    return this.analytics.performanceTrend(courseId, query.weeks);
  }

  @Get('courses/:courseId/heatmap')
  @RequirePermission(['analytics:read:own_course', 'analytics:read:own_faculty'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Faollik issiqlik xaritasi' })
  async heatmap(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @Query(zodQuery(z.object({ days: z.coerce.number().int().min(7).max(180).default(30) })))
    query: { days: number },
  ) {
    return this.analytics.activityHeatmap(courseId, query.days);
  }

  @Get('courses/:courseId/at-risk')
  @RequirePermission(
    ['analytics:read:own_course', 'analytics:read:own_group', 'analytics:read:own_faculty'],
    { resource: 'course', path: 'params.courseId' },
  )
  @ApiOperation({ summary: 'Xavf ostidagi talabalar (early-warning)' })
  async atRisk(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.analytics.atRiskStudents(courseId);
  }

  @Get('workload')
  @RequirePermission(['analytics:read:own_department', 'analytics:read:own_faculty'])
  @ApiOperation({ summary: "O'qituvchilar yuklamasi" })
  async workload(
    @Query(zodQuery(z.object({ departmentId: uuidSchema, semesterId: uuidSchema.optional() })))
    query: {
      departmentId: string;
      semesterId?: string;
    },
  ) {
    return this.analytics.teacherWorkload(query.departmentId, query.semesterId);
  }

  @Post('export')
  @RequirePermission([
    'analytics:read:own_course',
    'analytics:read:own_department',
    'analytics:read:own_faculty',
    'analytics:read:all',
  ])
  @ApiOperation({ summary: 'Hisobotni eksport qilish (navbatda bajariladi)' })
  async export(
    @Body(zodBody(exportRequestSchema)) dto: ExportRequest,
    @CurrentUser() actor: RequestUser,
  ) {
    const jobId = await this.queue.enqueue('report.generate', {
      requestedById: actor.id,
      report: dto.report,
      format: dto.format,
      filters: {
        facultyId: dto.facultyId,
        departmentId: dto.departmentId,
        courseId: dto.courseId,
        groupId: dto.groupId,
        semesterId: dto.semesterId,
      },
    });

    return { jobId, status: 'QUEUED' };
  }
}

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
