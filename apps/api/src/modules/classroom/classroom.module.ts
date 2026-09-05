/** Maqsad: F-11 modulini yig'ish. */

import { Body, Controller, Get, Module, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createMeetingSchema, uuidSchema, type CreateMeetingInput } from '@lms/shared';
import { ClassroomService } from './classroom.service';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

@ApiTags('classroom')
@Controller('classroom')
export class ClassroomController {
  constructor(private readonly classroom: ClassroomService) {}

  @Post('meetings')
  @RequirePermission('classroom:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: 'Onlayn dars yaratish' })
  async create(
    @Body(zodBody(createMeetingSchema)) dto: CreateMeetingInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.classroom.create(dto, actor);
  }

  @Get('courses/:courseId/meetings')
  @RequirePermission(['classroom:read:own', 'classroom:manage:own_course'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Kursning onlayn darslari' })
  async list(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.classroom.listForCourse(courseId);
  }

  @Post('meetings/:id/join')
  @RequirePermission(['classroom:read:own', 'classroom:manage:own_course'])
  @ApiOperation({ summary: "Onlayn darsga qo'shilish havolasi" })
  async join(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.classroom.join(id, actor);
  }

  @Post('meetings/:id/end')
  @RequirePermission('classroom:manage:own_course')
  @ApiOperation({ summary: 'Darsni yakunlash va yozuvni saqlash' })
  async end(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.classroom.end(id, actor);
  }
}

@Module({
  controllers: [ClassroomController],
  providers: [ClassroomService],
  exports: [ClassroomService],
})
export class ClassroomModule {}
