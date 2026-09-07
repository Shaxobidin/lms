/**
 * Maqsad: HEMIS uslubidagi "Talaba" bo'limi (F-03, F-07, F-08, F-14).
 *
 *  - Individual shaxsiy reja: guruh → mutaxassislik → tasdiqlangan o'quv reja,
 *    semestrlar bo'yicha fanlar va talabaning shu fanlar bo'yicha natijalari.
 *  - Fan tanlov: o'quv rejadagi tanlov fanlari uchun nashr etilgan kurslar,
 *    yozilish/chiqish.
 *  - Qayta o'qish: yakuniy natijasi o'tish ballidan past kurslar + arizalar.
 *  - Yakuniy: YN nazorat testlari, kirish huquqi (JN+ON chegarasi), natija.
 *  - Ma'lumot: profil, guruh, o'quv reja, GPA, hujjatlar.
 *  - Talaba xizmatlari: arizalar (ma'lumotnoma, akademik ta'til, qayta o'qish,
 *    o'tkazish, transkript) — dekanat/kurator ko'rib chiqadi; tasdiqlangan
 *    ma'lumotnoma/transkript uchun hujjat avtomatik generatsiya qilinadi.
 *  - So'rovnomalar: ochiq so'rovnomalar, javob (anonim takrorsiz), natijalar.
 */

import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type {
  ChooseElectiveInput,
  CreateStudentRequestInput,
  CreateSurveyInput,
  ListStudentRequestsInput,
  SurveyQuestion,
  SurveyResponseInput,
  UpdateStudentRequestInput,
  UpdateSurveyInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { QueueService } from '../../common/queue/queue.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { AppException } from '../../common/errors/app.exception';
import { SiteSettingsService } from '../../common/settings/site-settings.service';
import { effectiveScope } from '../../common/auth/scope-filter';
import type { RequestUser } from '../../common/auth/auth.types';
import { CoursesService } from '../courses/courses.service';
import { GradingService } from '../grading/grading.service';
import { DocumentsService } from '../documents/documents.service';

interface StudentContext {
  groupId: string | null;
  groupName: string | null;
  admissionYear: number | null;
  speciality: {
    id: string;
    code: string;
    name: unknown;
    durationYears: number;
    departmentId: string;
    facultyId: string;
  } | null;
  currentSemesterNumber: number | null;
  currentSemesterId: string | null;
  curriculumId: string | null;
  curriculumCode: string | null;
}

@Injectable()
export class StudentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly sanitizer: SanitizerService,
    private readonly siteSettings: SiteSettingsService,
    private readonly courses: CoursesService,
    private readonly grading: GradingService,
    private readonly documents: DocumentsService,
  ) {}

  // --- Umumiy kontekst ------------------------------------------------------------

  /** Guruh, mutaxassislik, joriy semestr raqami va tasdiqlangan o'quv reja. */
  private async context(userId: string): Promise<StudentContext> {
    // Bir nechta a'zolik bo'lsa (o'tkazish, sinov guruhlari) — tasdiqlangan o'quv
    // rejasi bor mutaxassislik guruhi afzal, aks holda eng so'nggisi
    const memberships = await this.prisma.db.groupMember.findMany({
      where: { userId, leftAt: null },
      orderBy: { joinedAt: 'desc' },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            admissionYear: true,
            speciality: {
              select: {
                id: true,
                code: true,
                name: true,
                durationYears: true,
                departmentId: true,
                department: { select: { facultyId: true } },
              },
            },
          },
        },
      },
    });
    const semester = await this.prisma.db.semester.findFirst({
      where: { isCurrent: true },
      select: { id: true, number: true, academicYear: { select: { startsAt: true } } },
    });

    let membership = memberships[0] ?? null;
    if (memberships.length > 1) {
      const withCurriculum = await this.prisma.db.curriculum.findMany({
        where: {
          specialityId: { in: memberships.map((m) => m.group.speciality.id) },
          status: 'APPROVED',
        },
        select: { specialityId: true },
      });
      const ok = new Set(withCurriculum.map((row) => row.specialityId));
      membership = memberships.find((m) => ok.has(m.group.speciality.id)) ?? membership;
    }

    const group = membership?.group ?? null;
    let currentSemesterNumber: number | null = null;
    if (group && semester) {
      const yearOffset = semester.academicYear.startsAt.getFullYear() - group.admissionYear;
      currentSemesterNumber = Math.max(1, yearOffset * 2 + semester.number);
    }

    let curriculum: { id: string; code: string } | null = null;
    if (group) {
      curriculum =
        (await this.prisma.db.curriculum.findFirst({
          where: {
            specialityId: group.speciality.id,
            admissionYear: group.admissionYear,
            status: 'APPROVED',
          },
          select: { id: true, code: true },
        })) ??
        (await this.prisma.db.curriculum.findFirst({
          where: { specialityId: group.speciality.id, status: 'APPROVED' },
          orderBy: { admissionYear: 'desc' },
          select: { id: true, code: true },
        }));
    }

    return {
      groupId: group?.id ?? null,
      groupName: group?.name ?? null,
      admissionYear: group?.admissionYear ?? null,
      speciality: group
        ? {
            id: group.speciality.id,
            code: group.speciality.code,
            name: group.speciality.name,
            durationYears: group.speciality.durationYears,
            departmentId: group.speciality.departmentId,
            facultyId: group.speciality.department.facultyId,
          }
        : null,
      currentSemesterNumber,
      currentSemesterId: semester?.id ?? null,
      curriculumId: curriculum?.id ?? null,
      curriculumCode: curriculum?.code ?? null,
    };
  }

  /** Talabaning yozilgan kurslari (faol yoki tugatilgan). */
  private async enrolledCourses(userId: string) {
    return this.prisma.db.enrollment.findMany({
      where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: {
        status: true,
        completedAt: true,
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            subjectId: true,
            semesterId: true,
            status: true,
          },
        },
      },
    });
  }

  // --- Individual shaxsiy reja -------------------------------------------------------

  async plan(actor: RequestUser) {
    const ctx = await this.context(actor.id);
    if (!ctx.curriculumId) {
      return { ...ctx, semesters: [], totalCredits: 0, earnedCredits: 0 };
    }
    const rows = await this.prisma.db.curriculumSubject.findMany({
      where: { curriculumId: ctx.curriculumId },
      orderBy: [{ semesterNumber: 'asc' }, { subject: { code: 'asc' } }],
      select: {
        id: true,
        semesterNumber: true,
        lectureHours: true,
        practiceHours: true,
        labHours: true,
        seminarHours: true,
        independentHours: true,
        isElective: true,
        subject: { select: { id: true, code: true, name: true, credits: true, controlForm: true } },
      },
    });
    const enrollments = await this.enrolledCourses(actor.id);
    const bySubject = new Map(
      enrollments.filter((e) => e.course.subjectId).map((e) => [e.course.subjectId!, e]),
    );

    let earnedCredits = 0;
    const semesters = new Map<number, unknown[]>();
    for (const row of rows) {
      const enrollment = bySubject.get(row.subject.id);
      let result: { score: number; passed: boolean; letter: string } | null = null;
      if (enrollment) {
        const courseResult = await this.grading.courseResult(enrollment.course.id, actor.id);
        if (courseResult.raw.length > 0) {
          result = {
            score: courseResult.score,
            passed: courseResult.passed,
            letter: courseResult.letter,
          };
          if (courseResult.passed) earnedCredits += row.subject.credits;
        }
      }
      const status = !enrollment
        ? row.semesterNumber < (ctx.currentSemesterNumber ?? 1)
          ? 'MISSED'
          : row.semesterNumber === ctx.currentSemesterNumber
            ? 'CURRENT'
            : 'UPCOMING'
        : result
          ? result.passed
            ? 'PASSED'
            : 'FAILED'
          : 'IN_PROGRESS';
      const list = semesters.get(row.semesterNumber) ?? [];
      list.push({
        id: row.id,
        subject: row.subject,
        hours: {
          lecture: row.lectureHours,
          practice: row.practiceHours,
          lab: row.labHours,
          seminar: row.seminarHours,
          independent: row.independentHours,
        },
        isElective: row.isElective,
        courseId: enrollment?.course.id ?? null,
        courseTitle: enrollment?.course.title ?? null,
        status,
        result,
      });
      semesters.set(row.semesterNumber, list);
    }

    return {
      ...ctx,
      totalCredits: rows.reduce((sum, row) => sum + row.subject.credits, 0),
      earnedCredits,
      semesters: Array.from(semesters.entries()).map(([number, subjects]) => ({
        number,
        isCurrent: number === ctx.currentSemesterNumber,
        subjects,
      })),
    };
  }

  // --- Fan tanlov -------------------------------------------------------------------

  async electives(actor: RequestUser) {
    const ctx = await this.context(actor.id);
    if (!ctx.curriculumId) return { ...ctx, subjects: [] };
    const current = ctx.currentSemesterNumber ?? 1;
    const rows = await this.prisma.db.curriculumSubject.findMany({
      where: {
        curriculumId: ctx.curriculumId,
        isElective: true,
        semesterNumber: { gte: current, lte: current + 1 },
      },
      orderBy: [{ semesterNumber: 'asc' }, { subject: { code: 'asc' } }],
      select: {
        semesterNumber: true,
        subject: { select: { id: true, code: true, name: true, credits: true } },
      },
    });
    if (rows.length === 0) return { ...ctx, subjects: [] };

    const courses = await this.prisma.db.course.findMany({
      where: {
        subjectId: { in: rows.map((row) => row.subject.id) },
        status: 'PUBLISHED',
      },
      select: {
        id: true,
        code: true,
        title: true,
        subjectId: true,
        enrollmentLimit: true,
        isPaid: true,
        priceUzs: true,
        _count: { select: { enrollments: { where: { status: { in: ['ACTIVE', 'COMPLETED'] } } } } },
        teachers: {
          select: {
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
          take: 2,
        },
        enrollments: {
          where: { userId: actor.id, status: { in: ['ACTIVE', 'COMPLETED', 'PENDING_PAYMENT'] } },
          select: { status: true },
          take: 1,
        },
      },
    });

    return {
      ...ctx,
      subjects: rows.map((row) => ({
        semesterNumber: row.semesterNumber,
        subject: row.subject,
        courses: courses
          .filter((course) => course.subjectId === row.subject.id)
          .map((course) => ({
            id: course.id,
            code: course.code,
            title: course.title,
            isPaid: course.isPaid,
            priceUzs: course.priceUzs,
            enrolled: course._count.enrollments,
            limit: course.enrollmentLimit,
            teachers: course.teachers.map((t) =>
              [t.user.profile?.lastName, t.user.profile?.firstName].filter(Boolean).join(' '),
            ),
            myStatus: course.enrollments[0]?.status ?? null,
          })),
      })),
    };
  }

  async chooseElective(input: ChooseElectiveInput, actor: RequestUser) {
    const data = await this.electives(actor);
    const allowed = data.subjects.some((row) =>
      row.courses.some((course) => course.id === input.courseId),
    );
    if (!allowed) throw AppException.businessRule('errors.elective_not_available');
    const result = await this.courses.enroll({ courseId: input.courseId }, actor);
    await this.audit.record({
      actorId: actor.id,
      action: 'student.elective.choose',
      resource: 'enrollment',
      resourceId: input.courseId,
    });
    return result;
  }

  async withdrawElective(courseId: string, actor: RequestUser) {
    const enrollment = await this.prisma.db.enrollment.findFirst({
      where: { userId: actor.id, courseId, status: { in: ['ACTIVE', 'PENDING_PAYMENT'] } },
      select: { id: true, course: { select: { subjectId: true } } },
    });
    if (!enrollment) throw AppException.notFound('enrollment', courseId);
    const data = await this.electives(actor);
    const isElective = data.subjects.some((row) => row.subject.id === enrollment.course.subjectId);
    if (!isElective) throw AppException.businessRule('errors.elective_not_available');
    const graded = await this.prisma.db.grade.count({ where: { userId: actor.id, courseId } });
    if (graded > 0) throw AppException.businessRule('errors.elective_has_grades');

    await this.prisma.db.enrollment.update({
      where: { id: enrollment.id },
      data: { status: 'WITHDRAWN' },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'student.elective.withdraw',
      resource: 'enrollment',
      resourceId: enrollment.id,
    });
    return { withdrawn: true };
  }

  // --- Qayta o'qish -------------------------------------------------------------------

  async retakes(actor: RequestUser) {
    const enrollments = await this.enrolledCourses(actor.id);
    const passingScore = await this.siteSettings.get<number>('grading.passingScore');
    const requests = await this.prisma.db.studentRequest.findMany({
      where: { userId: actor.id, type: 'RETAKE' },
      select: { id: true, courseId: true, status: true, createdAt: true },
    });
    const rows = [];
    for (const enrollment of enrollments) {
      const result = await this.grading.courseResult(enrollment.course.id, actor.id);
      if (result.raw.length === 0) continue;
      const failed =
        !result.passed &&
        (enrollment.status === 'COMPLETED' ||
          result.score < (Number.isFinite(passingScore) ? passingScore : 60));
      if (!failed) continue;
      rows.push({
        course: enrollment.course,
        score: result.score,
        letter: result.letter,
        eligibleForFinal: result.eligibleForFinal,
        request: requests.find((request) => request.courseId === enrollment.course.id) ?? null,
      });
    }
    return { passingScore, courses: rows };
  }

  // --- Yakuniy ------------------------------------------------------------------------

  async finals(actor: RequestUser) {
    const enrollments = await this.enrolledCourses(actor.id);
    const courseIds = enrollments.map((e) => e.course.id);
    const quizzes = await this.prisma.db.quiz.findMany({
      where: { courseId: { in: courseIds }, controlType: 'YN', isPublished: true },
      orderBy: [{ opensAt: 'asc' }],
      select: {
        id: true,
        courseId: true,
        title: true,
        opensAt: true,
        closesAt: true,
        durationMinutes: true,
        maxAttempts: true,
        passScore: true,
        attempts: {
          where: { userId: actor.id },
          select: { status: true, score: true, submittedAt: true },
          orderBy: { submittedAt: 'desc' },
        },
      },
    });
    const rows = [];
    for (const enrollment of enrollments) {
      const result = await this.grading.courseResult(enrollment.course.id, actor.id);
      const courseQuizzes = quizzes.filter((quiz) => quiz.courseId === enrollment.course.id);
      rows.push({
        course: enrollment.course,
        eligibleForFinal: result.eligibleForFinal,
        breakdown: result.breakdown,
        score: result.score,
        passed: result.passed,
        letter: result.letter,
        exams: courseQuizzes.map((quiz) => ({
          id: quiz.id,
          title: quiz.title,
          opensAt: quiz.opensAt,
          closesAt: quiz.closesAt,
          durationMinutes: quiz.durationMinutes,
          maxAttempts: quiz.maxAttempts,
          passScore: Number(quiz.passScore),
          attemptsUsed: quiz.attempts.length,
          bestScore: quiz.attempts.reduce<number | null>(
            (best, attempt) =>
              attempt.score === null
                ? best
                : Math.max(best ?? Number.NEGATIVE_INFINITY, Number(attempt.score)),
            null,
          ),
        })),
      });
    }
    return { courses: rows };
  }

  // --- Ma'lumot ------------------------------------------------------------------------

  async info(actor: RequestUser) {
    const ctx = await this.context(actor.id);
    const user = await this.prisma.db.user.findUniqueOrThrow({
      where: { id: actor.id },
      select: {
        email: true,
        phone: true,
        createdAt: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            birthDate: true,
            address: true,
          },
        },
      },
    });
    const transcript = await this.grading.transcript(actor.id);
    const semesters = transcript.semesters;
    const lastGpa = semesters.length > 0 ? Number(semesters[semesters.length - 1]!.gpa) : null;
    const documents = await this.prisma.db.generatedDocument.findMany({
      where: {
        OR: [{ createdById: actor.id }, { studentRequests: { some: { userId: actor.id } } }],
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, templateKey: true, status: true, createdAt: true, fileObjectId: true },
    });
    const requestCounts = await this.prisma.db.studentRequest.groupBy({
      by: ['status'],
      where: { userId: actor.id },
      _count: { _all: true },
    });
    return {
      profile: { email: user.email, phone: user.phone, ...user.profile, since: user.createdAt },
      group: ctx.groupName,
      admissionYear: ctx.admissionYear,
      speciality: ctx.speciality,
      curriculumCode: ctx.curriculumCode,
      currentSemesterNumber: ctx.currentSemesterNumber,
      gpa: lastGpa,
      transcripts: semesters.length,
      documents,
      requests: Object.fromEntries(requestCounts.map((row) => [row.status, row._count._all])),
    };
  }

  // --- Talaba xizmatlari (arizalar) ----------------------------------------------------

  async myRequests(actor: RequestUser) {
    return this.prisma.db.studentRequest.findMany({
      where: { userId: actor.id },
      orderBy: { createdAt: 'desc' },
      select: this.requestSelect,
    });
  }

  private readonly requestSelect = {
    id: true,
    type: true,
    subject: true,
    details: true,
    status: true,
    resolution: true,
    documentId: true,
    handledAt: true,
    createdAt: true,
    course: { select: { id: true, code: true, title: true } },
    user: {
      select: {
        id: true,
        email: true,
        profile: { select: { firstName: true, lastName: true } },
        studentGroups: {
          where: { leftAt: null },
          take: 1,
          select: { group: { select: { name: true } } },
        },
      },
    },
    handledBy: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
  } as const;

  async createRequest(input: CreateStudentRequestInput, actor: RequestUser) {
    if (input.courseId) {
      const enrolled = await this.prisma.db.enrollment.findFirst({
        where: { userId: actor.id, courseId: input.courseId },
        select: { id: true },
      });
      if (!enrolled) throw AppException.businessRule('errors.request_course_not_enrolled');
    }
    const open = await this.prisma.db.studentRequest.count({
      where: {
        userId: actor.id,
        type: input.type,
        courseId: input.courseId ?? null,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
    });
    if (open > 0) throw AppException.businessRule('errors.request_already_open');

    const created = await this.prisma.db.studentRequest.create({
      data: {
        userId: actor.id,
        type: input.type,
        courseId: input.courseId ?? null,
        subject: this.sanitizer.stripHtml(input.subject).slice(0, 200),
        details: input.details ? this.sanitizer.stripHtml(input.details).slice(0, 2000) : null,
      },
      select: this.requestSelect,
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'student.request.create',
      resource: 'studentrequest',
      resourceId: created.id,
      after: { type: input.type },
    });
    return created;
  }

  /** Dekanat / kurator / administrator uchun ro'yxat — doira bo'yicha. */
  async listRequests(filters: ListStudentRequestsInput, actor: RequestUser) {
    const scope = effectiveScope(actor, 'studentrequest', 'read');
    const where: Record<string, unknown> = {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
    };
    if (scope === 'own_faculty') {
      where['user'] = {
        studentGroups: {
          some: {
            leftAt: null,
            group: { speciality: { department: { facultyId: { in: actor.scope.facultyIds } } } },
          },
        },
      };
    } else if (scope === 'own_department') {
      where['user'] = {
        studentGroups: {
          some: {
            leftAt: null,
            group: { speciality: { departmentId: { in: actor.scope.departmentIds } } },
          },
        },
      };
    } else if (scope === 'own_group') {
      where['user'] = {
        studentGroups: { some: { leftAt: null, groupId: { in: actor.scope.groupIds } } },
      };
    } else if (scope === 'own') {
      where['userId'] = actor.id;
    } else if (scope === null) {
      where['id'] = { in: [] };
    }
    return this.prisma.db.studentRequest.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      select: this.requestSelect,
    });
  }

  async updateRequest(id: string, input: UpdateStudentRequestInput, actor: RequestUser) {
    const request = await this.prisma.db.studentRequest.findUnique({
      where: { id },
      select: { id: true, userId: true, type: true, status: true, subject: true, documentId: true },
    });
    if (!request) throw AppException.notFound('studentrequest', id);
    if (request.status === 'DONE' || request.status === 'REJECTED') {
      throw AppException.businessRule('errors.request_already_closed');
    }

    // Tasdiqlangan ma'lumotnoma / transkript — hujjat avtomatik generatsiya qilinadi (F-14)
    let documentId = request.documentId;
    if (input.status === 'APPROVED' && !documentId) {
      if (request.type === 'REFERENCE') {
        const doc = await this.documents.request(
          {
            template: 'REFERENCE',
            format: 'DOCX',
            params: { userId: request.userId, purpose: request.subject, includeGrades: false },
            requireSignature: false,
          },
          actor,
        );
        documentId = doc.documentId;
      } else if (request.type === 'TRANSCRIPT') {
        const doc = await this.documents.request(
          {
            template: 'TRANSCRIPT',
            format: 'DOCX',
            params: { userId: request.userId, semesterIds: [] },
            requireSignature: false,
          },
          actor,
        );
        documentId = doc.documentId;
      }
    }

    const updated = await this.prisma.db.studentRequest.update({
      where: { id },
      data: {
        status: input.status,
        resolution: input.resolution
          ? this.sanitizer.stripHtml(input.resolution).slice(0, 2000)
          : undefined,
        handledById: actor.id,
        handledAt: new Date(),
        documentId,
      },
      select: this.requestSelect,
    });

    const notification = await this.prisma.db.notification.create({
      data: {
        userId: request.userId,
        templateKey: 'notification.student_request',
        params: {
          subject: request.subject,
          status: input.status,
          resolution: input.resolution ?? '',
        },
        channels: ['IN_APP', 'EMAIL'],
        linkUrl: '/student/services',
      },
      select: { id: true },
    });
    await this.queue.enqueue('notification.dispatch', { notificationId: notification.id });

    await this.audit.record({
      actorId: actor.id,
      action: 'student.request.update',
      resource: 'studentrequest',
      resourceId: id,
      before: { status: request.status },
      after: { status: input.status, documentId },
    });
    return updated;
  }

  // --- So'rovnomalar -------------------------------------------------------------------

  private respondentKey(surveyId: string, userId: string): string {
    return createHash('sha256').update(`${surveyId}:${userId}`).digest('hex');
  }

  /** Talaba uchun ochiq so'rovnomalar (javob berilganlari belgilanadi). */
  async surveysForMe(actor: RequestUser) {
    if (!(await this.siteSettings.getBoolean('feedback.enabled'))) return [];
    const now = new Date();
    const enrolled = await this.prisma.db.enrollment.findMany({
      where: { userId: actor.id, status: { in: ['ACTIVE', 'COMPLETED'] } },
      select: { courseId: true },
    });
    const surveys = await this.prisma.db.survey.findMany({
      where: {
        isPublished: true,
        OR: [{ opensAt: null }, { opensAt: { lte: now } }],
        AND: [
          { OR: [{ closesAt: null }, { closesAt: { gt: now } }] },
          { OR: [{ courseId: null }, { courseId: { in: enrolled.map((e) => e.courseId) } }] },
        ],
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        questions: true,
        isAnonymous: true,
        closesAt: true,
        audienceRoles: true,
        course: { select: { id: true, title: true } },
      },
    });
    const keys = surveys.map((survey) => this.respondentKey(survey.id, actor.id));
    const answered = await this.prisma.db.surveyResponse.findMany({
      where: { respondentKey: { in: keys } },
      select: { surveyId: true },
    });
    const answeredIds = new Set(answered.map((row) => row.surveyId));
    return surveys
      .filter(
        (survey) =>
          survey.audienceRoles.length === 0 ||
          survey.audienceRoles.some((role) => actor.roles.includes(role as never)),
      )
      .map((survey) => ({
        id: survey.id,
        title: survey.title,
        description: survey.description,
        questions: survey.questions,
        isAnonymous: survey.isAnonymous,
        closesAt: survey.closesAt,
        course: survey.course,
        answered: answeredIds.has(survey.id),
      }));
  }

  async respond(surveyId: string, input: SurveyResponseInput, actor: RequestUser) {
    const surveys = await this.surveysForMe(actor);
    const survey = surveys.find((row) => row.id === surveyId);
    if (!survey) throw AppException.notFound('survey', surveyId);
    if (survey.answered) throw AppException.businessRule('errors.survey_already_answered');

    const questions = survey.questions as SurveyQuestion[];
    const missing = questions.filter(
      (question) =>
        question.required !== false &&
        (input.answers[question.id] === undefined || input.answers[question.id] === ''),
    );
    if (missing.length > 0) {
      throw AppException.businessRule('errors.survey_required_missing', {
        questions: missing.map((question) => question.id),
      });
    }
    const answers: Record<string, string | number> = {};
    for (const question of questions) {
      const value = input.answers[question.id];
      if (value === undefined) continue;
      if (question.type === 'TEXT') answers[question.id] = this.sanitizer.stripHtml(String(value));
      else answers[question.id] = Number(value);
    }

    await this.prisma.db.surveyResponse.create({
      data: {
        surveyId,
        userId: survey.isAnonymous ? null : actor.id,
        respondentKey: this.respondentKey(surveyId, actor.id),
        answers,
      },
    });
    return { answered: true };
  }

  // --- So'rovnomalarni boshqarish (dekanat / metodist / administrator) --------------------

  async createSurvey(input: CreateSurveyInput, actor: RequestUser) {
    const created = await this.prisma.db.survey.create({
      data: {
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        description: input.description
          ? (this.sanitizer.sanitizeLocalized(input.description) as never)
          : undefined,
        questions: input.questions as never,
        audienceRoles: input.audienceRoles,
        courseId: input.courseId ?? null,
        isAnonymous: input.isAnonymous,
        opensAt: input.opensAt ?? null,
        closesAt: input.closesAt ?? null,
        isPublished: input.isPublished,
        createdById: actor.id,
        // Fakultet doirasi: muallifning fakulteti (dekanat/metodist) — `own_faculty` uchun
        facultyId: actor.scope.facultyIds[0] ?? null,
      },
      select: { id: true, title: true, isPublished: true },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'survey.create',
      resource: 'survey',
      resourceId: created.id,
    });
    return created;
  }

  async listSurveys(actor: RequestUser) {
    const scope = effectiveScope(actor, 'survey', 'read');
    return this.prisma.db.survey.findMany({
      where:
        scope === 'all'
          ? {}
          : scope === null
            ? { id: { in: [] } }
            : scope === 'own_faculty'
              ? {
                  OR: [
                    { createdById: actor.id },
                    { facultyId: { in: actor.scope.facultyIds } },
                    { course: { department: { facultyId: { in: actor.scope.facultyIds } } } },
                  ],
                }
              : { createdById: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        title: true,
        isPublished: true,
        isAnonymous: true,
        opensAt: true,
        closesAt: true,
        courseId: true,
        audienceRoles: true,
        createdAt: true,
        _count: { select: { responses: true } },
      },
    });
  }

  async updateSurvey(id: string, input: UpdateSurveyInput, actor: RequestUser) {
    const survey = await this.prisma.db.survey.findUnique({ where: { id }, select: { id: true } });
    if (!survey) throw AppException.notFound('survey', id);
    const updated = await this.prisma.db.survey.update({
      where: { id },
      data: {
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.closesAt !== undefined ? { closesAt: input.closesAt } : {}),
      },
      select: { id: true, isPublished: true, closesAt: true },
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'survey.update',
      resource: 'survey',
      resourceId: id,
      after: input as never,
    });
    return updated;
  }

  /** Natijalar: SCALE — o'rtacha va taqsimot, CHOICE — variantlar soni, TEXT — matnlar. */
  async surveyResults(id: string) {
    const survey = await this.prisma.db.survey.findUnique({
      where: { id },
      select: { id: true, title: true, questions: true, isAnonymous: true },
    });
    if (!survey) throw AppException.notFound('survey', id);
    const responses = await this.prisma.db.surveyResponse.findMany({
      where: { surveyId: id },
      select: { answers: true },
    });
    const questions = survey.questions as SurveyQuestion[];
    return {
      id: survey.id,
      title: survey.title,
      isAnonymous: survey.isAnonymous,
      total: responses.length,
      questions: questions.map((question) => {
        const values = responses
          .map((row) => (row.answers as Record<string, string | number>)[question.id])
          .filter((value) => value !== undefined && value !== '');
        if (question.type === 'TEXT') {
          return { ...question, answers: values.slice(0, 50).map(String) };
        }
        const numbers = values.map(Number).filter(Number.isFinite);
        const distribution: Record<string, number> = {};
        for (const value of numbers)
          distribution[String(value)] = (distribution[String(value)] ?? 0) + 1;
        const average =
          numbers.length > 0
            ? Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 100) /
              100
            : null;
        return { ...question, count: numbers.length, average, distribution };
      }),
    };
  }
}
