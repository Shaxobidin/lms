/**
 * Maqsad: HEMIS uslubidagi "Talaba" bo'limi REST API.
 *
 *  - `/student/*` — faqat o'z ma'lumotlari (talaba);
 *  - `/student-requests` — arizalarni ko'rib chiqish (dekanat, kurator, admin);
 *  - `/surveys` — so'rovnomalarni boshqarish va natijalar.
 */

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  chooseElectiveSchema,
  createStudentRequestSchema,
  createSurveySchema,
  listStudentRequestsSchema,
  surveyResponseSchema,
  updateStudentRequestSchema,
  updateSurveySchema,
  uuidSchema,
  type ChooseElectiveInput,
  type CreateStudentRequestInput,
  type CreateSurveyInput,
  type ListStudentRequestsInput,
  type SurveyResponseInput,
  type UpdateStudentRequestInput,
  type UpdateSurveyInput,
} from '@lms/shared';
import { ZodValidationPipe, zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { StudentService } from './student.service';

@ApiTags('student')
@Controller()
export class StudentController {
  constructor(private readonly student: StudentService) {}

  // --- Talaba: o'z bo'limi --------------------------------------------------------

  @Get('student/plan')
  @RequirePermission('curriculum:read:own')
  @ApiOperation({ summary: 'Individual shaxsiy reja (o`quv reja + natijalar)' })
  async plan(@CurrentUser() actor: RequestUser) {
    return this.student.plan(actor);
  }

  @Get('student/electives')
  @RequirePermission('enrollment:create:own')
  @ApiOperation({ summary: 'Fan tanlov: tanlov fanlari va kurslar' })
  async electives(@CurrentUser() actor: RequestUser) {
    return this.student.electives(actor);
  }

  @Post('student/electives')
  @RequirePermission('enrollment:create:own')
  @ApiOperation({ summary: 'Tanlov faniga yozilish' })
  async chooseElective(
    @Body(zodBody(chooseElectiveSchema)) dto: ChooseElectiveInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.chooseElective(dto, actor);
  }

  @Delete('student/electives/:courseId')
  @RequirePermission('enrollment:create:own')
  @ApiOperation({ summary: 'Tanlov fanidan chiqish (baho qo`yilmagan bo`lsa)' })
  async withdrawElective(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.withdrawElective(courseId, actor);
  }

  @Get('student/retakes')
  @RequirePermission('grade:read:own')
  @ApiOperation({ summary: 'Qayta o`qish: o`tish balidan past kurslar' })
  async retakes(@CurrentUser() actor: RequestUser) {
    return this.student.retakes(actor);
  }

  @Get('student/finals')
  @RequirePermission('grade:read:own')
  @ApiOperation({ summary: 'Yakuniy nazorat: kirish huquqi, imtihonlar, natijalar' })
  async finals(@CurrentUser() actor: RequestUser) {
    return this.student.finals(actor);
  }

  @Get('student/info')
  @RequirePermission('transcript:read:own')
  @ApiOperation({ summary: 'Ma`lumot: profil, guruh, o`quv reja, GPA, hujjatlar' })
  async info(@CurrentUser() actor: RequestUser) {
    return this.student.info(actor);
  }

  @Get('student/requests')
  @RequirePermission('studentrequest:read:own')
  @ApiOperation({ summary: 'Mening arizalarim' })
  async myRequests(@CurrentUser() actor: RequestUser) {
    return this.student.myRequests(actor);
  }

  @Post('student/requests')
  @RequirePermission('studentrequest:create:own')
  @ApiOperation({ summary: 'Ariza berish (ma`lumotnoma, akademik ta`til, qayta o`qish, ...)' })
  async createRequest(
    @Body(zodBody(createStudentRequestSchema)) dto: CreateStudentRequestInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.createRequest(dto, actor);
  }

  @Get('student/surveys')
  @RequirePermission('survey:read:own')
  @ApiOperation({ summary: 'Ochiq so`rovnomalar' })
  async surveys(@CurrentUser() actor: RequestUser) {
    return this.student.surveysForMe(actor);
  }

  @Post('student/surveys/:id/responses')
  @RequirePermission('survey:read:own')
  @ApiOperation({ summary: 'So`rovnomaga javob berish' })
  async respond(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(surveyResponseSchema)) dto: SurveyResponseInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.respond(id, dto, actor);
  }

  // --- Xodimlar: arizalarni ko'rib chiqish ---------------------------------------------

  @Get('student-requests')
  @RequirePermission([
    'studentrequest:manage:all',
    'studentrequest:manage:own_faculty',
    'studentrequest:read:own_group',
  ])
  @ApiOperation({ summary: 'Talaba arizalari (doira bo`yicha)' })
  async listRequests(
    @Query(zodQuery(listStudentRequestsSchema)) query: ListStudentRequestsInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.listRequests(query, actor);
  }

  @Patch('student-requests/:id')
  @RequirePermission(['studentrequest:manage:all', 'studentrequest:manage:own_faculty'], {
    resource: 'studentrequest',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Arizani ko`rib chiqish (holat, izoh; ma`lumotnoma avtomatik)' })
  async updateRequest(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateStudentRequestSchema)) dto: UpdateStudentRequestInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.updateRequest(id, dto, actor);
  }

  // --- Xodimlar: so'rovnomalar ----------------------------------------------------------

  @Get('surveys')
  @RequirePermission(['survey:manage:all', 'survey:manage:own_faculty'])
  @ApiOperation({ summary: 'So`rovnomalar ro`yxati (boshqaruv)' })
  async listSurveys(@CurrentUser() actor: RequestUser) {
    return this.student.listSurveys(actor);
  }

  @Post('surveys')
  @RequirePermission(['survey:manage:all', 'survey:manage:own_faculty'])
  @ApiOperation({ summary: 'So`rovnoma yaratish' })
  async createSurvey(
    @Body(zodBody(createSurveySchema)) dto: CreateSurveyInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.createSurvey(dto, actor);
  }

  @Patch('surveys/:id')
  @RequirePermission(['survey:manage:all', 'survey:manage:own_faculty'], {
    resource: 'survey',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'So`rovnomani nashr qilish / yopish' })
  async updateSurvey(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(updateSurveySchema)) dto: UpdateSurveyInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.student.updateSurvey(id, dto, actor);
  }

  @Get('surveys/:id/results')
  @RequirePermission(['survey:manage:all', 'survey:manage:own_faculty'], {
    resource: 'survey',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'So`rovnoma natijalari (agregat)' })
  async surveyResults(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.student.surveyResults(id);
  }
}
