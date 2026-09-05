/**
 * Maqsad: F-03 endpointlari — fan, o'quv reja, sillabus va tasdiqlash oqimi.
 */

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createCurriculumSchema,
  createSubjectSchema,
  createSyllabusSchema,
  syllabusTransitionSchema,
  updateSubjectSchema,
  updateSyllabusVersionSchema,
  uuidSchema,
  type CreateCurriculumInput,
  type CreateSubjectInput,
  type CreateSyllabusInput,
  type SyllabusTransitionInput,
} from '@lms/shared';
import { CurriculumService } from './curriculum.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const subjectFilters = z.object({
  departmentId: uuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
});

const curriculumFilters = z.object({
  specialityId: uuidSchema.optional(),
  admissionYear: z.coerce.number().int().min(2000).max(2100).optional(),
});

@ApiTags('curriculum')
@Controller()
export class CurriculumController {
  constructor(private readonly curriculum: CurriculumService) {}

  // --- Fan kartasi ----------------------------------------------------------

  @Get('subjects')
  @RequirePermission([
    'subject:read:own_department',
    'subject:read:own_faculty',
    'subject:manage:all',
  ])
  @ApiOperation({ summary: "Fanlar ro'yxati" })
  async listSubjects(
    @Query(zodQuery(subjectFilters)) query: { departmentId?: string; search?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.listSubjects(query, actor);
  }

  @Post('subjects')
  @RequirePermission(['subject:manage:all', 'subject:create:own_faculty'])
  @ApiOperation({ summary: 'Fan kartasini yaratish' })
  async createSubject(
    @Body(zodBody(createSubjectSchema)) dto: CreateSubjectInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.createSubject(dto, actor);
  }

  @Patch('subjects/:id')
  @RequirePermission(
    ['subject:manage:all', 'subject:update:own_department', 'subject:update:own_faculty'],
    { resource: 'subject', path: 'params.id' },
  )
  @ApiOperation({ summary: 'Fan kartasini yangilash' })
  async updateSubject(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateSubjectSchema)) dto: Partial<CreateSubjectInput>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.updateSubject(id, dto, actor);
  }

  // --- O'quv reja -----------------------------------------------------------

  @Get('curricula')
  @RequirePermission([
    'curriculum:read:all',
    'curriculum:read:own_faculty',
    'curriculum:read:own_department',
  ])
  @ApiOperation({ summary: "O'quv rejalar ro'yxati" })
  async listCurricula(
    @Query(zodQuery(curriculumFilters)) query: { specialityId?: string; admissionYear?: number },
  ) {
    return this.curriculum.listCurricula(query);
  }

  @Get('curricula/:id')
  @RequirePermission(
    ['curriculum:read:all', 'curriculum:read:own_faculty', 'curriculum:read:own_department'],
    { resource: 'curriculum', path: 'params.id' },
  )
  @ApiOperation({ summary: "O'quv reja tarkibi va kredit balansi" })
  async getCurriculum(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.curriculum.getCurriculum(id);
  }

  @Post('curricula')
  @RequirePermission(['curriculum:create:own_faculty', 'curriculum:read:all'])
  @ApiOperation({ summary: "O'quv reja yaratish" })
  async createCurriculum(
    @Body(zodBody(createCurriculumSchema)) dto: CreateCurriculumInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.createCurriculum(dto, actor);
  }

  // --- Sillabus -------------------------------------------------------------

  @Get('syllabi/by-subject/:subjectId')
  @RequirePermission([
    'syllabus:read:own_department',
    'syllabus:read:own_faculty',
    'syllabus:read:own_course',
  ])
  @ApiOperation({ summary: 'Fanning sillabusi va barcha versiyalari' })
  async getSyllabus(@Param('subjectId', new ZodValidationPipe(uuidSchema)) subjectId: string) {
    return this.curriculum.getSyllabus(subjectId);
  }

  @Post('syllabi')
  @RequirePermission(['syllabus:create:own_faculty', 'syllabus:update:own_department'])
  @ApiOperation({ summary: 'Sillabus yaratish' })
  async createSyllabus(
    @Body(zodBody(createSyllabusSchema)) dto: CreateSyllabusInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.createSyllabus(dto, actor);
  }

  @Post('syllabi/:id/versions')
  @RequirePermission(['syllabus:update:own_faculty', 'syllabus:update:own_department'], {
    resource: 'syllabus',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Sillabusning yangi versiyasini yaratish' })
  async createVersion(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateSyllabusVersionSchema))
    dto: { content?: unknown; gradingPolicy?: unknown; changeNote?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.createSyllabusVersion(id, dto, actor);
  }

  @Post('syllabi/:id/transition')
  @RequirePermission(
    [
      'syllabus:approve:own_department',
      'syllabus:approve:own_faculty',
      'syllabus:update:own_faculty',
    ],
    { resource: 'syllabus', path: 'params.id' },
  )
  @ApiOperation({ summary: "Tasdiqlash oqimi bo'yicha holatni o'zgartirish" })
  async transition(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(syllabusTransitionSchema)) dto: SyllabusTransitionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.curriculum.transitionSyllabus(id, dto, actor);
  }
}
