/**
 * Maqsad: F-06 endpointlari — topshiriq, rubrika, topshirish, baholash, peer-review.
 */

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createAssignmentSchema,
  createRubricSchema,
  createSubmissionSchema,
  gradeSubmissionSchema,
  listSubmissionsSchema,
  peerReviewSchema,
  uuidSchema,
  type CreateAssignmentInput,
  type CreateRubricInput,
  type CreateSubmissionInput,
  type GradeSubmissionInput,
  type PeerReviewInput,
} from '@lms/shared';
import { AssignmentsService } from './assignments.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

@ApiTags('assignments')
@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  // --- Rubrika --------------------------------------------------------------

  @Post('rubrics')
  @RequirePermission('rubric:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: 'Rubrika yaratish' })
  async createRubric(
    @Body(zodBody(createRubricSchema)) dto: CreateRubricInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.createRubric(dto, actor);
  }

  @Get('courses/:courseId/rubrics')
  @RequirePermission(['rubric:manage:own_course', 'course:read:own_course'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Kurs rubrikalari' })
  async listRubrics(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.assignments.listRubrics(courseId);
  }

  // --- Topshiriq ------------------------------------------------------------

  @Post('assignments')
  @RequirePermission('assignment:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: 'Topshiriq yaratish' })
  async create(
    @Body(zodBody(createAssignmentSchema)) dto: CreateAssignmentInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.create(dto, actor);
  }

  @Get('courses/:courseId/assignments')
  @RequirePermission(['assignment:read:own', 'assignment:manage:own_course'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Kursning topshiriqlari' })
  async listForCourse(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.listForCourse(courseId, actor);
  }

  // --- Topshirish va baholash ----------------------------------------------

  @Post('submissions')
  @RequirePermission('submission:create:own')
  @ApiOperation({ summary: 'Ishni saqlash (qoralama) yoki yuborish' })
  async submit(
    @Body(zodBody(createSubmissionSchema)) dto: CreateSubmissionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.submit(dto, actor);
  }

  @Get('submissions')
  @RequirePermission(['submission:read:own', 'submission:read:own_course'])
  @ApiOperation({ summary: "Topshirilgan ishlar ro'yxati" })
  async listSubmissions(
    @Query(zodQuery(listSubmissionsSchema))
    query: {
      assignmentId?: string;
      courseId?: string;
      userId?: string;
      status?: string;
      ungradedOnly?: boolean;
    },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.listSubmissions(query, actor);
  }

  @Post('submissions/:id/grade')
  @RequirePermission('submission:grade:own_course', { resource: 'submission', path: 'params.id' })
  @ApiOperation({ summary: 'Ishni baholash (rubrika yoki umumiy ball)' })
  async grade(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(gradeSubmissionSchema)) dto: GradeSubmissionInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.grade(id, dto, actor);
  }

  // --- Peer-review ----------------------------------------------------------

  @Post('assignments/:id/peer-reviews/distribute')
  @RequirePermission('assignment:manage:own_course', { resource: 'assignment', path: 'params.id' })
  @ApiOperation({ summary: 'Peer-review ishlarini taqsimlash' })
  async distribute(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.distributePeerReviews(id, actor);
  }

  @Get('peer-reviews/mine')
  @RequirePermission('submission:read:own')
  @ApiOperation({ summary: 'Menga biriktirilgan peer-review ishlari' })
  async myPeerReviews(@CurrentUser() actor: RequestUser) {
    return this.assignments.myPeerReviews(actor);
  }

  @Post('peer-reviews')
  @RequirePermission('submission:read:own')
  @ApiOperation({ summary: 'Peer-review natijasini yuborish' })
  async submitPeerReview(
    @Body(zodBody(peerReviewSchema)) dto: PeerReviewInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.assignments.submitPeerReview(dto, actor);
  }
}
