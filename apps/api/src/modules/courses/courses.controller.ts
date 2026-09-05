/**
 * Maqsad: F-04 endpointlari — kurs, tuzilma, tartiblash, nusxalash, yozilish.
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  cloneCourseSchema,
  createCourseSchema,
  createLessonSchema,
  createModuleSchema,
  createResourceSchema,
  createTopicSchema,
  cursorPaginationSchema,
  enrollSchema,
  listCoursesSchema,
  publishCourseSchema,
  reorderSchema,
  updateCourseSchema,
  updateLessonSchema,
  uuidSchema,
  type CloneCourseInput,
  type CreateCourseInput,
  type CreateLessonInput,
  type CreateModuleInput,
  type CreateResourceInput,
  type CreateTopicInput,
  type CursorPagination,
  type EnrollInput,
  type ListCoursesInput,
  type ReorderInput,
} from '@lms/shared';
import { CoursesService } from './courses.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const listQuerySchema = listCoursesSchema.merge(cursorPaginationSchema);
const assignTeacherSchema = z.object({
  userId: uuidSchema,
  role: z.enum(['LEAD', 'ASSISTANT', 'EXAMINER']).default('ASSISTANT'),
  workloadHours: z.coerce.number().int().min(0).max(2000).default(0),
});
const reorderBodySchema = reorderSchema.extend({
  entity: z.enum(['module', 'topic', 'lesson', 'resource']),
});

@ApiTags('courses')
@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @RequirePermission([
    'course:read:all',
    'course:read:own_faculty',
    'course:read:own_department',
    'course:read:own_course',
    'course:read:own',
  ])
  @ApiOperation({ summary: 'Kurslar katalogi (rolga mos filtrlangan)' })
  async list(
    @Query(zodQuery(listQuerySchema)) query: ListCoursesInput & CursorPagination,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.list(query, query, actor);
  }

  @Get(':id')
  @RequirePermission(
    [
      'course:read:all',
      'course:read:own_faculty',
      'course:read:own_department',
      'course:read:own_course',
      'course:read:own',
    ],
    { resource: 'course', path: 'params.id' },
  )
  @ApiOperation({ summary: "Kursning to'liq tuzilishi (modul → mavzu → dars → resurs)" })
  async getStructure(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.getStructure(id, actor);
  }

  @Post()
  @RequirePermission(['course:create:own', 'course:create:own_department'])
  @ApiOperation({ summary: 'Kurs yaratish' })
  async create(
    @Body(zodBody(createCourseSchema)) dto: CreateCourseInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.create(dto, actor);
  }

  @Patch(':id')
  @RequirePermission(['course:update:own_course', 'course:update:own_department'], {
    resource: 'course',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Kursni yangilash' })
  async update(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateCourseSchema)) dto: Partial<CreateCourseInput>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.update(id, dto, actor);
  }

  @Patch(':id/status')
  @RequirePermission(
    ['course:publish:own_course', 'course:publish:own_department', 'course:publish:own_faculty'],
    { resource: 'course', path: 'params.id' },
  )
  @ApiOperation({ summary: 'Kursni nashr etish yoki arxivlash' })
  async setStatus(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(publishCourseSchema))
    dto: { status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED'; reason?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.setStatus(id, dto.status, dto.reason, actor);
  }

  @Post(':id/clone')
  @RequirePermission(['course:create:own', 'course:create:own_department'], {
    resource: 'course',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Kursni nusxalash (talabalar va baholar nusxalanmaydi)' })
  async clone(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(cloneCourseSchema)) dto: CloneCourseInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.clone(id, dto, actor);
  }

  // --- Tuzilma --------------------------------------------------------------

  @Post('modules')
  @RequirePermission('lesson:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: "Modul qo'shish" })
  async createModule(
    @Body(zodBody(createModuleSchema)) dto: CreateModuleInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.createModule(dto, actor);
  }

  @Post('topics')
  @RequirePermission('lesson:manage:own_course')
  @ApiOperation({ summary: "Mavzu qo'shish" })
  async createTopic(
    @Body(zodBody(createTopicSchema)) dto: CreateTopicInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.createTopic(dto, actor);
  }

  @Post('lessons')
  @RequirePermission('lesson:manage:own_course')
  @ApiOperation({ summary: "Dars qo'shish" })
  async createLesson(
    @Body(zodBody(createLessonSchema)) dto: CreateLessonInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.createLesson(dto, actor);
  }

  @Get('lessons/:id')
  @RequirePermission(['lesson:read:own', 'lesson:manage:own_course', 'lesson:read:own_faculty'], {
    resource: 'lesson',
    path: 'params.id',
  })
  @ApiOperation({ summary: "Darsning to'liq mazmuni va resurslari" })
  async getLesson(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.getLesson(id, actor);
  }

  @Patch('lessons/:id')
  @RequirePermission('lesson:manage:own_course', { resource: 'lesson', path: 'params.id' })
  @ApiOperation({ summary: 'Darsni yangilash' })
  async updateLesson(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateLessonSchema)) dto: Partial<CreateLessonInput>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.updateLesson(id, dto, actor);
  }

  @Post('resources')
  @RequirePermission('resource:manage:own_course')
  @ApiOperation({ summary: "Darsga resurs qo'shish" })
  async createResource(
    @Body(zodBody(createResourceSchema)) dto: CreateResourceInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.createResource(dto, actor);
  }

  @Post('reorder')
  @RequirePermission('lesson:manage:own_course')
  @ApiOperation({ summary: "Elementlar tartibini o'zgartirish (drag-and-drop)" })
  async reorder(
    @Body(zodBody(reorderBodySchema))
    dto: ReorderInput & { entity: 'module' | 'topic' | 'lesson' | 'resource' },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.reorder(dto.entity, dto, actor);
  }

  // --- Yozilish -------------------------------------------------------------

  @Post('enroll')
  @RequirePermission(['enrollment:create:own', 'enrollment:create:own_course'])
  @ApiOperation({ summary: 'Kursga yozilish yoki talabalarni yozish' })
  async enroll(@Body(zodBody(enrollSchema)) dto: EnrollInput, @CurrentUser() actor: RequestUser) {
    return this.courses.enroll(dto, actor);
  }

  @Get(':id/enrollments')
  @RequirePermission(
    ['enrollment:read:own_course', 'enrollment:read:own_faculty', 'enrollment:read:own_group'],
    { resource: 'course', path: 'params.id' },
  )
  @ApiOperation({ summary: "Kursga yozilgan talabalar ro'yxati" })
  async enrollments(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Query(zodQuery(cursorPaginationSchema)) pagination: CursorPagination,
  ) {
    return this.courses.listEnrollments(id, pagination);
  }

  @Post(':id/teachers')
  @RequirePermission(['course:update:own_department', 'course:update:own_course'], {
    resource: 'course',
    path: 'params.id',
  })
  @ApiOperation({ summary: "O'qituvchini kursga biriktirish (yuklama)" })
  async assignTeacher(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(assignTeacherSchema))
    dto: { userId: string; role: 'LEAD' | 'ASSISTANT' | 'EXAMINER'; workloadHours: number },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.courses.assignTeacher(id, dto.userId, dto.role, dto.workloadHours, actor);
  }
}
