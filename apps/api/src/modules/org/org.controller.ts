/**
 * Maqsad: F-02 endpointlari — tashkiliy tuzilma va akademik kalendar.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  assignStudentToGroupSchema,
  createAcademicYearSchema,
  createDepartmentSchema,
  createFacultySchema,
  createGroupSchema,
  createSemesterSchema,
  createSpecialitySchema,
  updateDepartmentSchema,
  updateFacultySchema,
  uuidSchema,
  type CreateAcademicYearInput,
  type CreateDepartmentInput,
  type CreateFacultyInput,
  type CreateGroupInput,
  type CreateSemesterInput,
  type CreateSpecialityInput,
} from '@lms/shared';
import { OrgService } from './org.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const optionalFilters = z.object({
  facultyId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  specialityId: uuidSchema.optional(),
  curatorId: uuidSchema.optional(),
});

@ApiTags('org')
@Controller('org')
export class OrgController {
  constructor(private readonly org: OrgService) {}

  // --- Daraxt va kalendar ---------------------------------------------------

  @Get('tree')
  @ApiOperation({ summary: 'Tashkiliy tuzilma daraxti (yon panel va filtrlar uchun)' })
  async tree(@CurrentUser() actor: RequestUser) {
    return this.org.tree(actor.locale);
  }

  @Public()
  @Get('current-semester')
  @ApiOperation({ summary: 'Joriy semestr' })
  async currentSemester() {
    return this.org.currentSemester();
  }

  @Get('academic-years')
  @RequirePermission(['academicyear:read:all', 'academicyear:manage:all'])
  @ApiOperation({ summary: "O'quv yillari va semestrlar" })
  async academicYears() {
    return this.org.listAcademicYears();
  }

  @Post('academic-years')
  @RequirePermission('academicyear:manage:all')
  @ApiOperation({ summary: "O'quv yili yaratish" })
  async createAcademicYear(
    @Body(zodBody(createAcademicYearSchema)) dto: CreateAcademicYearInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.createAcademicYear(dto, actor);
  }

  @Post('semesters')
  @RequirePermission('academicyear:manage:all')
  @ApiOperation({ summary: 'Semestr yaratish' })
  async createSemester(
    @Body(zodBody(createSemesterSchema)) dto: CreateSemesterInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.createSemester(dto, actor);
  }

  // --- Fakultet -------------------------------------------------------------

  @Get('faculties')
  @ApiOperation({ summary: "Fakultetlar ro'yxati" })
  async listFaculties() {
    return this.org.listFaculties();
  }

  @Post('faculties')
  @RequirePermission('faculty:manage:all')
  @ApiOperation({ summary: 'Fakultet yaratish' })
  async createFaculty(
    @Body(zodBody(createFacultySchema)) dto: CreateFacultyInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.createFaculty(dto, actor);
  }

  @Patch('faculties/:id')
  @RequirePermission('faculty:manage:all')
  @ApiOperation({ summary: 'Fakultetni yangilash' })
  async updateFaculty(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateFacultySchema)) dto: Partial<CreateFacultyInput>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.updateFaculty(id, dto, actor);
  }

  @Delete('faculties/:id')
  @RequirePermission('faculty:manage:all')
  @ApiOperation({ summary: "Fakultetni o'chirish (faqat bo'sh bo'lsa)" })
  async deleteFaculty(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.deleteFaculty(id, actor);
  }

  // --- Kafedra --------------------------------------------------------------

  @Get('departments')
  @ApiOperation({ summary: "Kafedralar ro'yxati" })
  async listDepartments(@Query(zodQuery(optionalFilters)) query: { facultyId?: string }) {
    return this.org.listDepartments(query.facultyId);
  }

  @Post('departments')
  @RequirePermission('department:manage:all')
  @ApiOperation({ summary: 'Kafedra yaratish' })
  async createDepartment(
    @Body(zodBody(createDepartmentSchema)) dto: CreateDepartmentInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.createDepartment(dto, actor);
  }

  @Patch('departments/:id')
  @RequirePermission(['department:manage:all', 'department:update:own_department'], {
    resource: 'department',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Kafedrani yangilash' })
  async updateDepartment(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateDepartmentSchema)) dto: Partial<CreateDepartmentInput>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.updateDepartment(id, dto, actor);
  }

  // --- Yo'nalish ------------------------------------------------------------

  @Get('specialities')
  @ApiOperation({ summary: "Yo'nalishlar ro'yxati" })
  async listSpecialities(@Query(zodQuery(optionalFilters)) query: { departmentId?: string }) {
    return this.org.listSpecialities(query.departmentId);
  }

  @Post('specialities')
  @RequirePermission('speciality:manage:all')
  @ApiOperation({ summary: "Yo'nalish yaratish" })
  async createSpeciality(
    @Body(zodBody(createSpecialitySchema)) dto: CreateSpecialityInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.createSpeciality(dto, actor);
  }

  // --- Guruh ----------------------------------------------------------------

  @Get('groups')
  @ApiOperation({ summary: "Guruhlar ro'yxati" })
  async listGroups(
    @Query(zodQuery(optionalFilters))
    query: {
      specialityId?: string;
      facultyId?: string;
      curatorId?: string;
    },
  ) {
    return this.org.listGroups(query);
  }

  @Post('groups')
  @RequirePermission('group:manage:all')
  @ApiOperation({ summary: 'Guruh yaratish' })
  async createGroup(
    @Body(zodBody(createGroupSchema)) dto: CreateGroupInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.createGroup(dto, actor);
  }

  @Get('groups/:id/members')
  @RequirePermission(
    ['group:read:all', 'group:read:own_group', 'user:read:own_faculty', 'user:read:own_department'],
    { resource: 'group', path: 'params.id' },
  )
  @ApiOperation({ summary: 'Guruh talabalari' })
  async groupMembers(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.org.listGroupMembers(id);
  }

  @Post('groups/assign-student')
  @RequirePermission(['group:manage:all', 'group:update:own_faculty'])
  @ApiOperation({ summary: "Talabani guruhga biriktirish yoki ko'chirish" })
  async assignStudent(
    @Body(zodBody(assignStudentToGroupSchema))
    dto: { userId: string; groupId: string; reason?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.org.assignStudentToGroup(dto.userId, dto.groupId, dto.reason, actor);
  }
}
