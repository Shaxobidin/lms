/**
 * Maqsad: F-13 — rol-asosli analitika, o'zlashtirish dinamikasi, faollik
 * issiqlik xaritasi va early-warning.
 *
 * Barcha og'ir agregatlar `$queryRaw` (parametrlangan) orqali bajariladi —
 * Prisma ORM ko'p bosqichli GROUP BY larda samarasiz bo'lardi (ADR-003).
 * Natijalar Redis'da 5 daqiqa keshlanadi (NF-01).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { assessRisk, round2, type AnalyticsQuery, type RiskAssessment } from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import type { RequestUser } from '../../common/auth/auth.types';
import { effectiveScope } from '../../common/auth/scope-filter';

const ANALYTICS_TTL = 300;

export interface DashboardSummary {
  scope: string;
  totals: {
    students: number;
    teachers: number;
    courses: number;
    activeCourses: number;
  };
  performance: {
    averageScore: number;
    passRate: number;
    gradedStudents: number;
  };
  attendance: {
    averagePercent: number;
    atRiskCount: number;
  };
  activity: {
    activeUsersLast7Days: number;
    submissionsLast7Days: number;
    quizAttemptsLast7Days: number;
  };
}

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
  ) {}

  /**
   * Rolga mos dashboard. Scope avtomatik qo'llaniladi: dekanat o'z
   * fakulteti, o'qituvchi o'z kurslari, talaba o'zi bo'yicha ko'radi.
   */
  async dashboard(actor: RequestUser, query: AnalyticsQuery): Promise<DashboardSummary> {
    const scope = effectiveScope(actor, 'analytics', 'read') ?? 'own';
    const cacheKey = `analytics:dash:${actor.id}:${scope}:${JSON.stringify(query)}`;

    return this.cache.remember(cacheKey, ANALYTICS_TTL, async () => {
      const courseFilter = this.buildCourseFilter(actor, scope, query);
      const since = new Date(Date.now() - 7 * 86_400_000);

      const [students, teachers, courses, activeCourses] = await Promise.all([
        this.prisma.db.enrollment.groupBy({
          by: ['userId'],
          where: { course: courseFilter, status: { in: ['ACTIVE', 'COMPLETED'] } },
        }),
        this.prisma.db.courseTeacher.groupBy({
          by: ['userId'],
          where: { course: courseFilter },
        }),
        this.prisma.db.course.count({ where: courseFilter }),
        this.prisma.db.course.count({ where: { ...courseFilter, status: 'PUBLISHED' } }),
      ]);

      const [gradeStats, attendanceStats, activity] = await Promise.all([
        this.performanceStats(courseFilter),
        this.attendanceStats(courseFilter),
        this.activityStats(courseFilter, since),
      ]);

      return {
        scope,
        totals: {
          students: students.length,
          teachers: teachers.length,
          courses,
          activeCourses,
        },
        performance: gradeStats,
        attendance: attendanceStats,
        activity,
      };
    });
  }

  /** O'zlashtirish statistikasi. */
  private async performanceStats(courseFilter: Prisma.CourseWhereInput) {
    const grades = await this.prisma.db.grade.findMany({
      where: { course: courseFilter },
      select: { userId: true, courseId: true, score: true, maxScore: true },
      take: 50_000,
    });

    const byStudentCourse = new Map<string, { earned: number; max: number }>();
    for (const grade of grades) {
      const key = `${grade.userId}:${grade.courseId}`;
      const entry = byStudentCourse.get(key) ?? { earned: 0, max: 0 };
      entry.earned += Number(grade.score);
      entry.max += Number(grade.maxScore);
      byStudentCourse.set(key, entry);
    }

    const percentages = Array.from(byStudentCourse.values())
      .filter((entry) => entry.max > 0)
      .map((entry) => (entry.earned / entry.max) * 100);

    if (percentages.length === 0) {
      return { averageScore: 0, passRate: 0, gradedStudents: 0 };
    }

    const average = percentages.reduce((sum, value) => sum + value, 0) / percentages.length;
    const passed = percentages.filter((value) => value >= 60).length;

    return {
      averageScore: round2(average),
      passRate: round2((passed / percentages.length) * 100),
      gradedStudents: percentages.length,
    };
  }

  private async attendanceStats(courseFilter: Prisma.CourseWhereInput) {
    const grouped = await this.prisma.attendance.groupBy({
      by: ['userId', 'status'],
      where: { classSession: { course: courseFilter } },
      _count: { _all: true },
    });

    const byUser = new Map<string, { attended: number; total: number }>();
    for (const row of grouped) {
      const entry = byUser.get(row.userId) ?? { attended: 0, total: 0 };
      entry.total += row._count._all;
      if (row.status !== 'ABSENT') entry.attended += row._count._all;
      byUser.set(row.userId, entry);
    }

    const percentages = Array.from(byUser.values())
      .filter((entry) => entry.total > 0)
      .map((entry) => (entry.attended / entry.total) * 100);

    if (percentages.length === 0) return { averagePercent: 0, atRiskCount: 0 };

    return {
      averagePercent: round2(
        percentages.reduce((sum, value) => sum + value, 0) / percentages.length,
      ),
      atRiskCount: percentages.filter((value) => value < 75).length,
    };
  }

  private async activityStats(courseFilter: Prisma.CourseWhereInput, since: Date) {
    const [activeUsers, submissions, attempts] = await Promise.all([
      this.prisma.db.enrollment.count({
        where: { course: courseFilter, lastAccessAt: { gte: since } },
      }),
      this.prisma.db.submission.count({
        where: { assignment: { course: courseFilter }, submittedAt: { gte: since } },
      }),
      this.prisma.db.quizAttempt.count({
        where: { quiz: { course: courseFilter }, startedAt: { gte: since } },
      }),
    ]);

    return {
      activeUsersLast7Days: activeUsers,
      submissionsLast7Days: submissions,
      quizAttemptsLast7Days: attempts,
    };
  }

  /**
   * O'zlashtirish dinamikasi — haftalar kesimida o'rtacha ball.
   * Raw SQL: Prisma date_trunc ni qo'llab-quvvatlamaydi.
   */
  async performanceTrend(courseId: string, weeks = 12) {
    return this.cache.remember(`analytics:trend:${courseId}:${weeks}`, ANALYTICS_TTL, async () => {
      const rows = await this.prisma.$queryRaw<
        Array<{ week: Date; avg_percent: number; graded: bigint }>
      >`
        SELECT
          date_trunc('week', g."createdAt") AS week,
          AVG(CASE WHEN g."maxScore" > 0 THEN g."score" / g."maxScore" * 100 ELSE 0 END) AS avg_percent,
          COUNT(*) AS graded
        FROM grades g
        WHERE g."courseId" = ${courseId}::uuid
          AND g."deletedAt" IS NULL
          AND g."createdAt" >= NOW() - (${weeks}::int * INTERVAL '1 week')
        GROUP BY 1
        ORDER BY 1 ASC
      `;

      return rows.map((row) => ({
        week: row.week,
        averagePercent: round2(Number(row.avg_percent ?? 0)),
        gradedCount: Number(row.graded),
      }));
    });
  }

  /**
   * Faollik issiqlik xaritasi: hafta kuni × soat kesimida faollik.
   * O'qituvchiga qachon material joylash samarali ekanini ko'rsatadi.
   */
  async activityHeatmap(courseId: string, days = 30) {
    return this.cache.remember(`analytics:heat:${courseId}:${days}`, ANALYTICS_TTL, async () => {
      const rows = await this.prisma.$queryRaw<
        Array<{ weekday: number; hour: number; events: bigint }>
      >`
        SELECT
          EXTRACT(ISODOW FROM lp."updatedAt" AT TIME ZONE 'Asia/Tashkent')::int AS weekday,
          EXTRACT(HOUR FROM lp."updatedAt" AT TIME ZONE 'Asia/Tashkent')::int AS hour,
          COUNT(*) AS events
        FROM lesson_progress lp
        JOIN lessons l ON l.id = lp."lessonId"
        JOIN topics t ON t.id = l."topicId"
        JOIN modules m ON m.id = t."moduleId"
        WHERE m."courseId" = ${courseId}::uuid
          AND lp."updatedAt" >= NOW() - (${days}::int * INTERVAL '1 day')
        GROUP BY 1, 2
        ORDER BY 1, 2
      `;

      return rows.map((row) => ({
        weekday: Number(row.weekday),
        hour: Number(row.hour),
        events: Number(row.events),
      }));
    });
  }

  /**
   * Early-warning: xavf ostidagi talabalarni aniqlaydi (F-13).
   * Baholash `@lms/shared` dagi tushuntiriladigan model orqali.
   */
  async atRiskStudents(courseId: string): Promise<RiskAssessment[]> {
    const enrollments = await this.prisma.db.enrollment.findMany({
      where: { courseId, status: 'ACTIVE' },
      select: {
        userId: true,
        lastAccessAt: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    });

    if (enrollments.length === 0) return [];

    const userIds = enrollments.map((item) => item.userId);

    const [attendanceRows, assignments, submissions, grades] = await Promise.all([
      this.prisma.attendance.groupBy({
        by: ['userId', 'status'],
        where: { userId: { in: userIds }, classSession: { courseId } },
        _count: { _all: true },
      }),
      this.prisma.db.assignment.findMany({
        where: { courseId, isPublished: true },
        select: { id: true, dueAt: true },
      }),
      this.prisma.db.submission.findMany({
        where: {
          userId: { in: userIds },
          assignment: { courseId },
          status: { in: ['SUBMITTED', 'LATE', 'GRADED'] },
        },
        select: { userId: true, assignmentId: true },
      }),
      this.prisma.db.grade.findMany({
        where: { courseId, userId: { in: userIds } },
        select: { userId: true, score: true, maxScore: true },
      }),
    ]);

    // Ma'lumotlarni foydalanuvchilar bo'yicha guruhlash (barchasi xotirada, N+1 yo'q)
    const attendanceByUser = new Map<string, { attended: number; total: number }>();
    for (const row of attendanceRows) {
      const entry = attendanceByUser.get(row.userId) ?? { attended: 0, total: 0 };
      entry.total += row._count._all;
      if (row.status !== 'ABSENT') entry.attended += row._count._all;
      attendanceByUser.set(row.userId, entry);
    }

    const submittedByUser = new Map<string, Set<string>>();
    for (const submission of submissions) {
      const set = submittedByUser.get(submission.userId) ?? new Set<string>();
      set.add(submission.assignmentId);
      submittedByUser.set(submission.userId, set);
    }

    const gradesByUser = new Map<string, { earned: number; max: number }>();
    for (const grade of grades) {
      const entry = gradesByUser.get(grade.userId) ?? { earned: 0, max: 0 };
      entry.earned += Number(grade.score);
      entry.max += Number(grade.maxScore);
      gradesByUser.set(grade.userId, entry);
    }

    const now = Date.now();
    const overdueAssignments = assignments.filter((item) => item.dueAt.getTime() < now);

    return enrollments
      .map((enrollment) => {
        const attendance = attendanceByUser.get(enrollment.userId);
        const attendancePercent =
          attendance && attendance.total > 0 ? (attendance.attended / attendance.total) * 100 : 100;

        const submitted = submittedByUser.get(enrollment.userId) ?? new Set<string>();
        const missed = overdueAssignments.filter((item) => !submitted.has(item.id)).length;

        const gradeEntry = gradesByUser.get(enrollment.userId);
        const currentScore =
          gradeEntry && gradeEntry.max > 0 ? (gradeEntry.earned / gradeEntry.max) * 100 : 0;

        const inactiveDays = enrollment.lastAccessAt
          ? Math.floor((now - enrollment.lastAccessAt.getTime()) / 86_400_000)
          : 30;

        const assessment = assessRisk({
          userId: enrollment.userId,
          attendancePercent,
          missedAssignments: missed,
          currentScore,
          inactiveDays,
          totalAssignments: overdueAssignments.length,
        });

        return {
          ...assessment,
          fullName: [enrollment.user.profile?.lastName, enrollment.user.profile?.firstName]
            .filter(Boolean)
            .join(' '),
        };
      })
      .filter((item) => item.level !== 'LOW')
      .sort((a, b) => b.riskScore - a.riskScore);
  }

  /** O'qituvchilar yuklamasi (F-13, kafedra mudiri uchun). */
  async teacherWorkload(departmentId: string, semesterId?: string) {
    const rows = await this.prisma.db.courseTeacher.findMany({
      where: {
        course: {
          departmentId,
          ...(semesterId ? { semesterId } : {}),
        },
      },
      select: {
        userId: true,
        role: true,
        workloadHours: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
        course: {
          select: {
            id: true,
            code: true,
            title: true,
            _count: { select: { enrollments: true } },
          },
        },
      },
    });

    const byTeacher = new Map<
      string,
      { fullName: string; totalHours: number; courses: number; students: number }
    >();

    for (const row of rows) {
      const entry = byTeacher.get(row.userId) ?? {
        fullName: [row.user.profile?.lastName, row.user.profile?.firstName]
          .filter(Boolean)
          .join(' '),
        totalHours: 0,
        courses: 0,
        students: 0,
      };
      entry.totalHours += row.workloadHours;
      entry.courses += 1;
      entry.students += row.course._count.enrollments;
      byTeacher.set(row.userId, entry);
    }

    return Array.from(byTeacher.entries())
      .map(([userId, value]) => ({ userId, ...value }))
      .sort((a, b) => b.totalHours - a.totalHours);
  }

  /** Talabaning shaxsiy paneli uchun ko'rsatkichlar. */
  async studentOverview(userId: string) {
    const [enrollments, submissions, attempts, attendance, badges] = await Promise.all([
      this.prisma.db.enrollment.findMany({
        where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: {
          progressPercent: true,
          status: true,
          course: { select: { id: true, code: true, title: true } },
        },
      }),
      this.prisma.db.submission.count({
        where: { userId, status: { in: ['SUBMITTED', 'LATE', 'GRADED'] } },
      }),
      this.prisma.db.quizAttempt.count({
        where: { userId, status: { in: ['SUBMITTED', 'GRADED'] } },
      }),
      this.prisma.attendance.groupBy({
        by: ['status'],
        where: { userId },
        _count: { _all: true },
      }),
      this.prisma.db.userBadge.count({ where: { userId } }),
    ]);

    const totalAttendance = attendance.reduce((sum, row) => sum + row._count._all, 0);
    const attended = attendance
      .filter((row) => row.status !== 'ABSENT')
      .reduce((sum, row) => sum + row._count._all, 0);

    return {
      courses: {
        total: enrollments.length,
        completed: enrollments.filter((item) => item.status === 'COMPLETED').length,
        averageProgress:
          enrollments.length === 0
            ? 0
            : round2(
                enrollments.reduce((sum, item) => sum + Number(item.progressPercent), 0) /
                  enrollments.length,
              ),
        list: enrollments,
      },
      submissions,
      quizAttempts: attempts,
      attendancePercent: totalAttendance === 0 ? 0 : round2((attended / totalAttendance) * 100),
      badges,
    };
  }

  /** Scope ga mos kurs filtri. */
  private buildCourseFilter(
    actor: RequestUser,
    scope: string,
    query: AnalyticsQuery,
  ): Prisma.CourseWhereInput {
    const filter: Prisma.CourseWhereInput = {};

    if (query.courseId) filter.id = query.courseId;
    if (query.departmentId) filter.departmentId = query.departmentId;
    if (query.facultyId) filter.department = { facultyId: query.facultyId };
    if (query.semesterId) filter.semesterId = query.semesterId;

    switch (scope) {
      case 'all':
        break;
      case 'own_faculty':
        filter.department = { facultyId: { in: actor.scope.facultyIds } };
        break;
      case 'own_department':
        filter.departmentId = { in: actor.scope.departmentIds };
        break;
      case 'own_course':
        filter.id = { in: actor.scope.courseIds };
        break;
      case 'own_group':
        filter.enrollments = { some: { groupId: { in: actor.scope.groupIds } } };
        break;
      default:
        filter.id = { in: actor.scope.enrolledCourseIds };
    }

    return filter;
  }
}
