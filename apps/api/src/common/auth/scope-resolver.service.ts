/**
 * Maqsad: ABAC — "bu resurs qaysi fakultet/kafedra/kurs/guruhga tegishli?" degan
 * savolga javob beruvchi registr (docs/01-architecture.md §4.2).
 *
 * Har bir resurs turi uchun bitta resolver ro'yxatdan o'tkaziladi. PolicyGuard
 * shu registrga murojaat qiladi va domen kodi avtorizatsiya haqida bilmaydi.
 */

import { Injectable, Logger } from '@nestjs/common';
import type { Resource } from '@lms/shared';
import { PrismaService } from '../prisma/prisma.service';

/** Resursning tegishlilik atributlari. */
export interface ResourceScope {
  facultyId?: string | null;
  departmentId?: string | null;
  courseId?: string | null;
  groupId?: string | null;
  /** Resurs egasi (talaba ishi, xabar va h.k.). */
  ownerId?: string | null;
}

type Resolver = (id: string) => Promise<ResourceScope | null>;

@Injectable()
export class ScopeResolverService {
  private readonly logger = new Logger(ScopeResolverService.name);
  private readonly resolvers = new Map<Resource, Resolver>();

  constructor(private readonly prisma: PrismaService) {
    this.registerDefaults();
  }

  register(resource: Resource, resolver: Resolver): void {
    this.resolvers.set(resource, resolver);
  }

  /**
   * Resursning scope atributlarini qaytaradi.
   * `null` — resurs topilmadi yoki bu tur uchun resolver yo'q.
   */
  async resolve(resource: Resource, id: string): Promise<ResourceScope | null> {
    const resolver = this.resolvers.get(resource);
    if (!resolver) {
      this.logger.warn(`"${resource}" resursi uchun scope resolver ro'yxatdan o'tmagan`);
      return null;
    }
    return resolver(id);
  }

  hasResolver(resource: Resource): boolean {
    return this.resolvers.has(resource);
  }

  /**
   * Standart resolverlar. Har biri bitta indeksli so'rov — N+1 yo'q,
   * natija PolicyGuard tomonidan so'rov davomida keshlanadi.
   */
  private registerDefaults(): void {
    const db = this.prisma.db;

    this.register('faculty', async (id) => ({ facultyId: id }));

    this.register('department', async (id) => {
      const row = await db.department.findUnique({
        where: { id },
        select: { id: true, facultyId: true },
      });
      return row ? { departmentId: row.id, facultyId: row.facultyId } : null;
    });

    this.register('speciality', async (id) => {
      const row = await db.speciality.findUnique({
        where: { id },
        select: { departmentId: true, department: { select: { facultyId: true } } },
      });
      return row ? { departmentId: row.departmentId, facultyId: row.department.facultyId } : null;
    });

    this.register('group', async (id) => {
      const row = await db.group.findUnique({
        where: { id },
        select: {
          id: true,
          curatorId: true,
          speciality: {
            select: { departmentId: true, department: { select: { facultyId: true } } },
          },
        },
      });
      return row
        ? {
            groupId: row.id,
            ownerId: row.curatorId,
            departmentId: row.speciality.departmentId,
            facultyId: row.speciality.department.facultyId,
          }
        : null;
    });

    this.register('subject', async (id) => {
      const row = await db.subject.findUnique({
        where: { id },
        select: { departmentId: true, department: { select: { facultyId: true } } },
      });
      return row ? { departmentId: row.departmentId, facultyId: row.department.facultyId } : null;
    });

    this.register('curriculum', async (id) => {
      const row = await db.curriculum.findUnique({
        where: { id },
        select: {
          speciality: {
            select: { departmentId: true, department: { select: { facultyId: true } } },
          },
        },
      });
      return row
        ? {
            departmentId: row.speciality.departmentId,
            facultyId: row.speciality.department.facultyId,
          }
        : null;
    });

    this.register('syllabus', async (id) => {
      const row = await db.syllabus.findUnique({
        where: { id },
        select: { departmentId: true, department: { select: { facultyId: true } } },
      });
      return row ? { departmentId: row.departmentId, facultyId: row.department.facultyId } : null;
    });

    this.register('course', async (id) => {
      const row = await db.course.findUnique({
        where: { id },
        select: {
          id: true,
          departmentId: true,
          department: { select: { facultyId: true } },
        },
      });
      return row
        ? {
            courseId: row.id,
            departmentId: row.departmentId,
            facultyId: row.department.facultyId,
          }
        : null;
    });

    this.register('lesson', async (id) => {
      const row = await db.lesson.findUnique({
        where: { id },
        select: {
          topic: {
            select: {
              module: {
                select: {
                  course: {
                    select: {
                      id: true,
                      departmentId: true,
                      department: { select: { facultyId: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
      const course = row?.topic.module.course;
      return course
        ? {
            courseId: course.id,
            departmentId: course.departmentId,
            facultyId: course.department.facultyId,
          }
        : null;
    });

    this.register('assignment', async (id) => {
      const row = await db.assignment.findUnique({
        where: { id },
        select: {
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            courseId: row.courseId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('submission', async (id) => {
      const row = await db.submission.findUnique({
        where: { id },
        select: {
          userId: true,
          assignment: {
            select: {
              courseId: true,
              course: {
                select: { departmentId: true, department: { select: { facultyId: true } } },
              },
            },
          },
        },
      });
      return row
        ? {
            ownerId: row.userId,
            courseId: row.assignment.courseId,
            departmentId: row.assignment.course.departmentId,
            facultyId: row.assignment.course.department.facultyId,
          }
        : null;
    });

    this.register('quiz', async (id) => {
      const row = await db.quiz.findUnique({
        where: { id },
        select: {
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            courseId: row.courseId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('quizattempt', async (id) => {
      const row = await db.quizAttempt.findUnique({
        where: { id },
        select: {
          userId: true,
          quiz: {
            select: {
              courseId: true,
              course: {
                select: { departmentId: true, department: { select: { facultyId: true } } },
              },
            },
          },
        },
      });
      return row
        ? {
            ownerId: row.userId,
            courseId: row.quiz.courseId,
            departmentId: row.quiz.course.departmentId,
            facultyId: row.quiz.course.department.facultyId,
          }
        : null;
    });

    this.register('grade', async (id) => {
      const row = await db.grade.findUnique({
        where: { id },
        select: {
          userId: true,
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            ownerId: row.userId,
            courseId: row.courseId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('attendance', async (id) => {
      const row = await db.attendance.findUnique({
        where: { id },
        select: {
          userId: true,
          classSession: {
            select: {
              courseId: true,
              groupId: true,
              course: {
                select: { departmentId: true, department: { select: { facultyId: true } } },
              },
            },
          },
        },
      });
      return row
        ? {
            ownerId: row.userId,
            courseId: row.classSession.courseId,
            groupId: row.classSession.groupId,
            departmentId: row.classSession.course.departmentId,
            facultyId: row.classSession.course.department.facultyId,
          }
        : null;
    });

    this.register('user', async (id) => {
      const row = await db.user.findUnique({
        where: { id },
        select: {
          id: true,
          studentGroups: {
            where: { leftAt: null },
            take: 1,
            select: {
              group: {
                select: {
                  id: true,
                  speciality: {
                    select: { departmentId: true, department: { select: { facultyId: true } } },
                  },
                },
              },
            },
          },
        },
      });
      if (!row) return null;
      const membership = row.studentGroups[0];
      return {
        ownerId: row.id,
        groupId: membership?.group.id ?? null,
        departmentId: membership?.group.speciality.departmentId ?? null,
        facultyId: membership?.group.speciality.department.facultyId ?? null,
      };
    });

    this.register('enrollment', async (id) => {
      const row = await db.enrollment.findUnique({
        where: { id },
        select: {
          userId: true,
          courseId: true,
          groupId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            ownerId: row.userId,
            courseId: row.courseId,
            groupId: row.groupId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('certificate', async (id) => {
      const row = await db.certificate.findUnique({
        where: { id },
        select: {
          userId: true,
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            ownerId: row.userId,
            courseId: row.courseId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('forum', async (id) => {
      const row = await db.forumThread.findUnique({
        where: { id },
        select: {
          authorId: true,
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            ownerId: row.authorId,
            courseId: row.courseId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('questionbank', async (id) => {
      const row = await db.questionBank.findUnique({
        where: { id },
        select: {
          ownerId: true,
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
          subject: { select: { departmentId: true } },
        },
      });
      return row
        ? {
            ownerId: row.ownerId,
            courseId: row.courseId,
            departmentId: row.course?.departmentId ?? row.subject?.departmentId ?? null,
            facultyId: row.course?.department.facultyId ?? null,
          }
        : null;
    });

    this.register('rubric', async (id) => {
      const row = await db.rubric.findUnique({
        where: { id },
        select: {
          courseId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            courseId: row.courseId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });

    this.register('schedule', async (id) => {
      const row = await db.schedule.findUnique({
        where: { id },
        select: {
          courseId: true,
          groupId: true,
          teacherId: true,
          course: { select: { departmentId: true, department: { select: { facultyId: true } } } },
        },
      });
      return row
        ? {
            ownerId: row.teacherId,
            courseId: row.courseId,
            groupId: row.groupId,
            departmentId: row.course.departmentId,
            facultyId: row.course.department.facultyId,
          }
        : null;
    });
  }
}
