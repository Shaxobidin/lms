/**
 * Maqsad: F-09 endpointlari — jadval, dars sessiyalari, davomat, sabab hujjatlari.
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  attendanceReportSchema,
  checkInSchema,
  createClassSessionSchema,
  createScheduleSchema,
  generateQrSchema,
  markAttendanceSchema,
  reviewExcuseSchema,
  submitExcuseSchema,
  uuidSchema,
  type CheckInInput,
  type CreateClassSessionInput,
  type CreateScheduleInput,
  type MarkAttendanceInput,
} from '@lms/shared';
import { AttendanceService } from './attendance.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const scheduleFilters = z.object({
  groupId: uuidSchema.optional(),
  teacherId: uuidSchema.optional(),
  courseId: uuidSchema.optional(),
});

const sessionFilters = z.object({
  courseId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@ApiTags('attendance')
@Controller()
export class AttendanceController {
  constructor(private readonly attendance: AttendanceService) {}

  // --- Jadval ---------------------------------------------------------------

  @Get('schedule')
  @RequirePermission([
    'schedule:read:own',
    'schedule:read:own_course',
    'schedule:read:own_group',
    'schedule:read:own_department',
    'schedule:read:own_faculty',
    'schedule:manage:all',
  ])
  @ApiOperation({ summary: 'Haftalik dars jadvali' })
  async getSchedule(
    @Query(zodQuery(scheduleFilters))
    query: { groupId?: string; teacherId?: string; courseId?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    // Filtr berilmasa — foydalanuvchining o'z jadvali
    const filters =
      query.groupId || query.teacherId || query.courseId
        ? query
        : actor.scope.memberGroupIds.length > 0
          ? { groupId: actor.scope.memberGroupIds[0] }
          : { teacherId: actor.id };

    return this.attendance.getSchedule(filters);
  }

  @Post('schedule')
  @RequirePermission(['schedule:manage:all', 'schedule:update:own_department'])
  @ApiOperation({ summary: 'Jadval yozuvini yaratish (ziddiyat tekshiruvi bilan)' })
  async createSchedule(
    @Body(zodBody(createScheduleSchema)) dto: CreateScheduleInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.createSchedule(dto, actor);
  }

  @Post('schedule/:id/generate-sessions')
  @RequirePermission(['schedule:manage:all', 'schedule:update:own_department'])
  @ApiOperation({ summary: 'Jadval asosida dars sessiyalarini generatsiya qilish' })
  async generateSessions(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.generateSessions(id, actor);
  }

  // --- Dars sessiyalari -----------------------------------------------------

  @Get('class-sessions')
  @RequirePermission([
    'attendance:read:own',
    'attendance:read:own_course',
    'attendance:read:own_group',
    'attendance:manage:own_course',
  ])
  @ApiOperation({ summary: "Dars sessiyalari ro'yxati" })
  async listSessions(
    @Query(zodQuery(sessionFilters))
    query: {
      courseId?: string;
      groupId?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    return this.attendance.listSessions(query);
  }

  @Post('class-sessions')
  @RequirePermission('attendance:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: "Dars sessiyasini qo'lda yaratish" })
  async createSession(
    @Body(zodBody(createClassSessionSchema)) dto: CreateClassSessionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.createSession(dto, actor);
  }

  @Get('class-sessions/:id/roster')
  @RequirePermission(['attendance:manage:own_course', 'attendance:update:own_group'])
  @ApiOperation({ summary: "Sessiya ro'yxati va mavjud davomat belgilari" })
  async sessionRoster(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.attendance.sessionRoster(id);
  }

  // --- Davomat --------------------------------------------------------------

  @Post('attendance/qr')
  @RequirePermission('attendance:manage:own_course')
  @ApiOperation({ summary: 'Davomat uchun QR token generatsiya qilish' })
  async generateQr(
    @Body(zodBody(generateQrSchema))
    dto: {
      classSessionId: string;
      ttlSeconds: number;
      geoFence?: { latitude: number; longitude: number; radiusMeters: number } | null;
    },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.generateQrToken(dto.classSessionId, dto.ttlSeconds, dto.geoFence, actor);
  }

  @Post('attendance/check-in')
  @RequirePermission('attendance:read:own')
  @ApiOperation({ summary: 'QR orqali davomatni belgilash' })
  async checkIn(
    @Body(zodBody(checkInSchema)) dto: CheckInInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.checkIn(dto, actor);
  }

  @Post('attendance/mark')
  @RequirePermission(['attendance:manage:own_course', 'attendance:update:own_group'])
  @ApiOperation({ summary: "Jurnalni ommaviy to'ldirish" })
  async mark(
    @Body(zodBody(markAttendanceSchema)) dto: MarkAttendanceInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.markAttendance(dto, actor);
  }

  @Get('attendance/report')
  @RequirePermission([
    'attendance:read:own_course',
    'attendance:read:own_group',
    'attendance:read:own_department',
    'attendance:read:own_faculty',
  ])
  @ApiOperation({ summary: 'Davomat hisoboti (xavf ostidagilar belgilanadi)' })
  async report(
    @Query(zodQuery(attendanceReportSchema))
    query: {
      courseId?: string;
      groupId?: string;
      userId?: string;
      from?: Date;
      to?: Date;
    },
  ) {
    return this.attendance.report(query);
  }

  @Get('attendance/mine')
  @RequirePermission('attendance:read:own')
  @ApiOperation({ summary: 'Mening davomatim' })
  async mine(
    @Query(zodQuery(z.object({ courseId: uuidSchema.optional() }))) query: { courseId?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.myAttendance(actor.id, query.courseId);
  }

  // --- Sabab hujjatlari -----------------------------------------------------

  @Post('attendance/excuses')
  @RequirePermission('attendance:read:own')
  @ApiOperation({ summary: 'Sabab hujjatini yuborish' })
  async submitExcuse(
    @Body(zodBody(submitExcuseSchema))
    dto: { classSessionIds: string[]; fileObjectId: string; reason: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.submitExcuse(dto, actor);
  }

  @Post('attendance/excuses/review')
  @RequirePermission(['attendance:update:own_group', 'attendance:manage:own_course'])
  @ApiOperation({ summary: "Sabab hujjatini ko'rib chiqish" })
  async reviewExcuse(
    @Body(zodBody(reviewExcuseSchema))
    dto: { excuseId: string; approved: boolean; comment?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.attendance.reviewExcuse(dto.excuseId, dto.approved, dto.comment, actor);
  }
}
