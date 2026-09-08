/**
 * Maqsad: F-04 — kurs konstruktori (kurs → modul → mavzu → dars → resurs),
 * tartiblash, nusxalash va yozilish.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
  normalizeForSearch,
  type CloneCourseInput,
  type CreateCourseInput,
  type CreateLessonInput,
  type CreateModuleInput,
  type CreateResourceInput,
  type UpdateModuleInput,
  type UpdateTopicInput,
  type UpdateResourceInput,
  type ResourceMeta,
  type CreateTopicInput,
  type CursorPagination,
  type EnrollInput,
  type ListCoursesInput,
  type LocalizedText,
  type ReorderInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { courseScopeWhere, effectiveScope } from '../../common/auth/scope-filter';
import { CurriculumService } from '../curriculum/curriculum.service';

@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly events: EventsService,
    private readonly curriculum: CurriculumService,
  ) {}

  // --- Kurs ro'yxati va kartasi ---------------------------------------------

  async list(filters: ListCoursesInput, pagination: CursorPagination, actor: RequestUser | null) {
    const where: Prisma.CourseWhereInput = {};

    if (filters.search) {
      where.searchText = { contains: normalizeForSearch(filters.search) };
    }
    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.facultyId) where.department = { facultyId: filters.facultyId };
    if (filters.semesterId) where.semesterId = filters.semesterId;
    if (filters.type) where.type = filters.type;
    if (filters.status) where.status = filters.status;
    if (filters.teacherId) where.teachers = { some: { userId: filters.teacherId } };

    if (!actor) {
      // Mehmon faqat nashr etilgan ochiq kurslarni ko'radi
      where.status = 'PUBLISHED';
      where.type = 'OPEN';
    } else {
      if (filters.onlyEnrolled) {
        where.enrollments = { some: { userId: actor.id, status: { in: ['ACTIVE', 'COMPLETED'] } } };
      }
      const scopeWhere = courseScopeWhere(actor, effectiveScope(actor, 'course', 'read'));
      if (scopeWhere) Object.assign(where, scopeWhere);
    }

    const cursor = pagination.cursor ? decodeCursor<{ id: string }>(pagination.cursor) : null;

    const rows = await this.prisma.db.course.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        type: true,
        status: true,
        deliveryMode: true,
        isPaid: true,
        priceUzs: true,
        academicHours: true,
        coverFileId: true,
        department: { select: { id: true, name: true, facultyId: true } },
        subject: { select: { id: true, code: true, name: true, credits: true } },
        semester: { select: { id: true, number: true } },
        teachers: {
          select: {
            role: true,
            user: {
              select: { id: true, profile: { select: { firstName: true, lastName: true } } },
            },
          },
        },
        _count: { select: { enrollments: true, modules: true } },
        // Joriy foydalanuvchining yozilish holati — katalogda "Yozilish" yoki
        // "Yozilgan" ko'rsatish uchun. Filtr `userId` bo'yicha, shuning uchun
        // ro'yxatda ko'pi bilan bitta yozuv qaytadi (N+1 emas).
        // Mehmon uchun `actor` yo'q — u holda bu maydon umuman so'ralmaydi
        enrollments: actor
          ? { where: { userId: actor.id }, select: { status: true }, take: 1 }
          : false,
      },
    });

    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page,
      meta: {
        nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
        hasMore,
      },
    };
  }

  /**
   * Kursning to'liq tuzilishi. Bitta so'rovda barcha darajalar olinadi —
   * bu N+1 muammosini butunlay yo'q qiladi (§7 talabi).
   */
  async getStructure(courseId: string, actor: RequestUser) {
    const isStudent = actor.scope.enrolledCourseIds.includes(courseId);
    const isTeacher = actor.scope.courseIds.includes(courseId);

    const course = await this.prisma.db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        code: true,
        title: true,
        description: true,
        status: true,
        type: true,
        deliveryMode: true,
        academicHours: true,
        gradingPolicy: true,
        subject: { select: { id: true, code: true, name: true, credits: true } },
        department: { select: { id: true, name: true } },
        teachers: {
          select: {
            role: true,
            user: {
              select: {
                id: true,
                email: true,
                profile: { select: { firstName: true, lastName: true, avatarFileId: true } },
              },
            },
          },
        },
        modules: {
          // Talaba faqat nashr etilgan bo'limlarni ko'radi
          where: isTeacher ? {} : { isPublished: true },
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            description: true,
            position: true,
            isPublished: true,
            topics: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                position: true,
                bloomLevel: true,
                // Moodle uslubi: mavzu ichida dars, topshiriq va test bir ro'yxatda
                // ko'rinadi (F-05). Topshiriq/testda `position` yo'q — yaratilish
                // tartibi barqaror tartib beradi.
                assignments: {
                  where: isTeacher ? {} : { isPublished: true },
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    kind: true,
                    dueAt: true,
                    maxScore: true,
                    isPublished: true,
                  },
                },
                quizzes: {
                  where: isTeacher ? {} : { isPublished: true },
                  orderBy: { createdAt: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    controlType: true,
                    durationMinutes: true,
                    isPublished: true,
                    _count: { select: { questions: true } },
                  },
                },
                forumThreads: {
                  where: { deletedAt: null },
                  orderBy: { createdAt: 'asc' },
                  select: { id: true, title: true, isQuestion: true, postCount: true },
                },
                meetings: {
                  where: { deletedAt: null },
                  orderBy: { startsAt: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    startsAt: true,
                    durationMinutes: true,
                    joinUrl: true,
                  },
                },
                lessons: {
                  where: isTeacher ? {} : { isPublished: true },
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    position: true,
                    durationMinutes: true,
                    isPublished: true,
                    availability: true,
                    resources: {
                      orderBy: { position: 'asc' },
                      select: {
                        id: true,
                        kind: true,
                        title: true,
                        position: true,
                        isRequired: true,
                        externalUrl: true,
                        meta: true,
                        file: {
                          select: { id: true, objectKey: true, mimeType: true, sizeBytes: true },
                        },
                      },
                    },
                    // Talabaning progressi — faqat o'ziniki
                    progress: isStudent
                      ? {
                          where: { userId: actor.id },
                          select: { state: true, secondsSpent: true, lastPosition: true },
                        }
                      : false,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!course) throw AppException.notFound('course', courseId);

    // BigInt JSON ga serializatsiya qilinmaydi — string ga o'giramiz
    return JSON.parse(
      JSON.stringify(course, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ) as unknown;
  }

  /**
   * Bitta darsning to'liq mazmuni.
   *
   * Kurs tuzilishi (`getStructure`) ATAYLAB `contentHtml` ni qaytarmaydi:
   * 70 ta darsli kursda bu javobni bir necha megabaytga oshirar edi (NF-01).
   * Dars matni faqat ochilganda alohida so'raladi.
   */
  async getLesson(lessonId: string, actor: RequestUser) {
    const lesson = await this.prisma.db.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        contentHtml: true,
        durationMinutes: true,
        isPublished: true,
        availability: true,
        position: true,
        resources: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            kind: true,
            title: true,
            externalUrl: true,
            isRequired: true,
            meta: true,
            // `originalName` va `sizeBytes`: talaba yuklab olishdan oldin
            // fayl nomi va hajmini ko'radi, o'qituvchi esa materiallar ro'yxatida
            file: {
              select: {
                id: true,
                objectKey: true,
                mimeType: true,
                variants: true,
                originalName: true,
                sizeBytes: true,
              },
            },
          },
        },
        progress: {
          where: { userId: actor.id },
          select: { state: true, secondsSpent: true, lastPosition: true, completedAt: true },
        },
        topic: {
          select: {
            id: true,
            title: true,
            module: { select: { id: true, title: true, courseId: true } },
          },
        },
      },
    });

    if (!lesson) throw AppException.notFound('lesson', lessonId);

    const courseId = lesson.topic.module.courseId;
    const isTeacher = actor.scope.courseIds.includes(courseId);
    const isEnrolled = actor.scope.enrolledCourseIds.includes(courseId);

    if (!isTeacher && !isEnrolled) throw AppException.forbidden('lesson:read:own');
    if (!isTeacher && !lesson.isPublished) {
      throw AppException.businessRule('errors.lesson_not_published');
    }

    return JSON.parse(
      JSON.stringify(lesson, (_key, value) =>
        typeof value === 'bigint' ? value.toString() : value,
      ),
    ) as unknown;
  }

  async create(input: CreateCourseInput, actor: RequestUser) {
    // Baholash siyosati berilmasa — tasdiqlangan sillabusdan meros olinadi (ADR-012)
    const gradingPolicy =
      input.gradingPolicy ??
      (input.subjectId ? await this.curriculum.getApprovedGradingPolicy(input.subjectId) : null);

    const course = await this.prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          subjectId: input.subjectId ?? null,
          semesterId: input.semesterId ?? null,
          departmentId: input.departmentId,
          code: input.code,
          title: this.sanitizer.sanitizeLocalized(input.title) as never,
          description: this.sanitizer.sanitizeLocalized(input.description ?? {}) as never,
          type: input.type,
          deliveryMode: input.deliveryMode,
          coverFileId: input.coverFileId ?? null,
          isPaid: input.isPaid,
          priceUzs: input.priceUzs,
          enrollmentLimit: input.enrollmentLimit,
          academicHours: input.academicHours,
          gradingPolicy: gradingPolicy as never,
          searchText: buildSearchText(input.title, input.code),
        },
        select: { id: true, code: true, title: true },
      });

      // Yaratuvchi avtomatik ravishda yetakchi o'qituvchi bo'ladi
      await tx.courseTeacher.create({
        data: { courseId: created.id, userId: actor.id, role: 'LEAD' },
      });

      return created;
    });

    // Yangi kurs foydalanuvchining scope'iga qo'shildi — kesh yangilanishi kerak
    await this.cache.delByPattern(`auth:ctx:${actor.id}:*`);

    await this.audit.record({
      actorId: actor.id,
      action: 'course.create',
      resource: 'course',
      resourceId: course.id,
      after: { code: input.code },
    });

    return course;
  }

  async update(courseId: string, input: Partial<CreateCourseInput>, actor: RequestUser) {
    const before = await this.prisma.db.course.findUnique({
      where: { id: courseId },
      select: {
        code: true,
        title: true,
        status: true,
        deliveryMode: true,
        isPaid: true,
        priceUzs: true,
      },
    });
    if (!before) throw AppException.notFound('course', courseId);

    const updated = await this.prisma.db.course.update({
      where: { id: courseId },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.title !== undefined
          ? {
              title: this.sanitizer.sanitizeLocalized(input.title) as never,
              searchText: buildSearchText(input.title, input.code ?? before.code),
            }
          : {}),
        ...(input.description !== undefined
          ? { description: this.sanitizer.sanitizeLocalized(input.description) as never }
          : {}),
        ...(input.deliveryMode !== undefined ? { deliveryMode: input.deliveryMode } : {}),
        ...(input.coverFileId !== undefined ? { coverFileId: input.coverFileId } : {}),
        ...(input.isPaid !== undefined ? { isPaid: input.isPaid } : {}),
        ...(input.priceUzs !== undefined ? { priceUzs: input.priceUzs } : {}),
        ...(input.enrollmentLimit !== undefined ? { enrollmentLimit: input.enrollmentLimit } : {}),
        ...(input.academicHours !== undefined ? { academicHours: input.academicHours } : {}),
        ...(input.gradingPolicy !== undefined
          ? { gradingPolicy: input.gradingPolicy as never }
          : {}),
      },
      select: { id: true, code: true, title: true, status: true },
    });

    await this.audit.recordChange({
      actorId: actor.id,
      action: 'course.update',
      resource: 'course',
      resourceId: courseId,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });

    return updated;
  }

  /**
   * Kursni nashr etish. Nashrdan oldin tuzilma tekshiriladi —
   * bo'sh kurs talabalarga ko'rinmasligi kerak.
   */
  async setStatus(
    courseId: string,
    status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
    reason: string | undefined,
    actor: RequestUser,
  ) {
    if (status === 'PUBLISHED') {
      const lessons = await this.prisma.db.lesson.count({
        where: { topic: { module: { courseId } }, isPublished: true },
      });
      if (lessons === 0) {
        throw AppException.businessRule('errors.course_has_no_published_lessons');
      }
    }

    if (status === 'ARCHIVED' && !reason) {
      throw AppException.validation([{ field: 'reason', code: 'validation.required' }]);
    }

    const course = await this.prisma.db.course.update({
      where: { id: courseId },
      data: { status },
      select: { id: true, status: true, title: true },
    });

    if (status === 'PUBLISHED') {
      await this.events.publish({
        type: EVENT_TYPES.ANNOUNCEMENT,
        courseId,
        payload: { courseId, titleKey: 'events.course_published', title: course.title },
      });
    }

    await this.audit.record({
      actorId: actor.id,
      action: `course.${status.toLowerCase()}`,
      resource: 'course',
      resourceId: courseId,
      after: { status, reason },
    });

    return course;
  }

  // --- Tuzilma elementlari --------------------------------------------------

  async createModule(input: CreateModuleInput, actor: RequestUser) {
    const position =
      input.position || (await this.nextPosition('module', { courseId: input.courseId }));

    const created = await this.prisma.db.module.create({
      data: {
        courseId: input.courseId,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        description: this.sanitizer.sanitizeLocalized(input.description ?? {}) as never,
        position,
        isPublished: input.isPublished,
      },
      select: { id: true, title: true, position: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'module.create',
      resource: 'course',
      resourceId: input.courseId,
      after: { moduleId: created.id },
    });
    return created;
  }

  async createTopic(input: CreateTopicInput, actor: RequestUser) {
    const position =
      input.position || (await this.nextPosition('topic', { moduleId: input.moduleId }));

    const created = await this.prisma.db.topic.create({
      data: {
        moduleId: input.moduleId,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        position,
        bloomLevel: input.bloomLevel ?? null,
      },
      select: { id: true, title: true, position: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'topic.create',
      resource: 'lesson',
      resourceId: created.id,
    });
    return created;
  }

  async createLesson(input: CreateLessonInput, actor: RequestUser) {
    const position =
      input.position || (await this.nextPosition('lesson', { topicId: input.topicId }));

    const created = await this.prisma.db.lesson.create({
      data: {
        topicId: input.topicId,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        contentHtml: this.sanitizer.sanitizeLocalized(input.contentHtml ?? {}) as never,
        position,
        durationMinutes: input.durationMinutes,
        isPublished: input.isPublished,
        availability: (input.availability ?? null) as never,
      },
      select: { id: true, title: true, position: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'lesson.create',
      resource: 'lesson',
      resourceId: created.id,
    });
    return created;
  }

  async updateLesson(lessonId: string, input: Partial<CreateLessonInput>, actor: RequestUser) {
    const updated = await this.prisma.db.lesson.update({
      where: { id: lessonId },
      data: {
        ...(input.title !== undefined
          ? { title: this.sanitizer.sanitizeLocalized(input.title) as never }
          : {}),
        ...(input.contentHtml !== undefined
          ? { contentHtml: this.sanitizer.sanitizeLocalized(input.contentHtml) as never }
          : {}),
        ...(input.durationMinutes !== undefined ? { durationMinutes: input.durationMinutes } : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
        ...(input.availability !== undefined ? { availability: input.availability as never } : {}),
      },
      select: { id: true, title: true, isPublished: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'lesson.update',
      resource: 'lesson',
      resourceId: lessonId,
    });
    return updated;
  }

  async updateModule(moduleId: string, input: UpdateModuleInput, actor: RequestUser) {
    const updated = await this.prisma.db.module.update({
      where: { id: moduleId },
      data: {
        ...(input.title !== undefined
          ? { title: this.sanitizer.sanitizeLocalized(input.title) as never }
          : {}),
        ...(input.description !== undefined
          ? { description: this.sanitizer.sanitizeLocalized(input.description) as never }
          : {}),
        ...(input.isPublished !== undefined ? { isPublished: input.isPublished } : {}),
      },
      select: { id: true, title: true, isPublished: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'module.update',
      resource: 'course',
      resourceId: moduleId,
    });
    return updated;
  }

  /**
   * Modulni o'chirish — ichidagi mavzular va darslar bilan birga.
   *
   * Soft delete ishlatiladi (A-26): baholar va progress yozuvlari darsga
   * ishora qiladi, shuning uchun jismoniy o'chirish tarixni buzardi.
   */
  async deleteModule(moduleId: string, actor: RequestUser) {
    const topics = await this.prisma.db.topic.findMany({
      where: { moduleId },
      select: { id: true },
    });

    for (const topic of topics) {
      await this.deleteTopic(topic.id, actor, { skipAudit: true });
    }

    await this.prisma.softDelete('Module', moduleId);
    await this.audit.record({
      actorId: actor.id,
      action: 'module.delete',
      resource: 'course',
      resourceId: moduleId,
      before: { topics: topics.length },
    });
    return { deleted: true, topics: topics.length };
  }

  async updateTopic(topicId: string, input: UpdateTopicInput, actor: RequestUser) {
    const updated = await this.prisma.db.topic.update({
      where: { id: topicId },
      data: {
        ...(input.title !== undefined
          ? { title: this.sanitizer.sanitizeLocalized(input.title) as never }
          : {}),
        ...(input.bloomLevel !== undefined ? { bloomLevel: input.bloomLevel } : {}),
      },
      select: { id: true, title: true, bloomLevel: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'topic.update',
      resource: 'lesson',
      resourceId: topicId,
    });
    return updated;
  }

  async deleteTopic(topicId: string, actor: RequestUser, options: { skipAudit?: boolean } = {}) {
    const lessons = await this.prisma.db.lesson.findMany({
      where: { topicId },
      select: { id: true },
    });

    for (const lesson of lessons) {
      await this.deleteLesson(lesson.id, actor, { skipAudit: true });
    }

    await this.prisma.softDelete('Topic', topicId);

    if (!options.skipAudit) {
      await this.audit.record({
        actorId: actor.id,
        action: 'topic.delete',
        resource: 'lesson',
        resourceId: topicId,
        before: { lessons: lessons.length },
      });
    }
    return { deleted: true, lessons: lessons.length };
  }

  async deleteLesson(lessonId: string, actor: RequestUser, options: { skipAudit?: boolean } = {}) {
    const resources = await this.prisma.db.resource.findMany({
      where: { lessonId },
      select: { id: true },
    });

    for (const resource of resources) {
      await this.prisma.softDelete('Resource', resource.id);
    }

    await this.prisma.softDelete('Lesson', lessonId);

    if (!options.skipAudit) {
      await this.audit.record({
        actorId: actor.id,
        action: 'lesson.delete',
        resource: 'lesson',
        resourceId: lessonId,
        before: { resources: resources.length },
      });
    }
    return { deleted: true, resources: resources.length };
  }

  /**
   * Resurs `meta` maydonini tozalaydi.
   *
   * `TEXT` bloki HTML qabul qiladi va u DARSDA TO'G'RIDAN-TO'G'RI ko'rsatiladi,
   * shuning uchun DOMPurify dan o'tkaziladi (§11). Fayl nomlari ham tozalanadi:
   * ular ro'yxatda matn sifatida chiqadi.
   */
  private sanitizeResourceMeta(meta: ResourceMeta | undefined): Record<string, unknown> {
    if (!meta) return {};

    return {
      ...(meta.text ? { text: this.sanitizer.sanitizeLocalized(meta.text) } : {}),
      ...(meta.files
        ? {
            files: meta.files.map((file) => ({
              fileObjectId: file.fileObjectId,
              name: this.sanitizer.stripHtml(file.name),
              sizeBytes: file.sizeBytes,
            })),
          }
        : {}),
      ...(meta.embedHeight ? { embedHeight: meta.embedHeight } : {}),
    };
  }

  async updateResource(resourceId: string, input: UpdateResourceInput, actor: RequestUser) {
    const updated = await this.prisma.db.resource.update({
      where: { id: resourceId },
      data: {
        ...(input.title !== undefined
          ? { title: this.sanitizer.sanitizeLocalized(input.title) as never }
          : {}),
        ...(input.isRequired !== undefined ? { isRequired: input.isRequired } : {}),
        ...(input.meta !== undefined
          ? { meta: this.sanitizeResourceMeta(input.meta) as never }
          : {}),
        ...(input.externalUrl !== undefined ? { externalUrl: input.externalUrl } : {}),
      },
      select: { id: true, title: true, isRequired: true, meta: true, externalUrl: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'resource.update',
      resource: 'resource',
      resourceId: resourceId,
    });
    return updated;
  }

  async deleteResource(resourceId: string, actor: RequestUser) {
    await this.prisma.softDelete('Resource', resourceId);
    await this.audit.record({
      actorId: actor.id,
      action: 'resource.delete',
      resource: 'resource',
      resourceId,
    });
    return { deleted: true };
  }

  async createResource(input: CreateResourceInput, actor: RequestUser) {
    const position =
      input.position || (await this.nextPosition('resource', { lessonId: input.lessonId }));

    const created = await this.prisma.db.resource.create({
      data: {
        lessonId: input.lessonId,
        fileObjectId: input.fileObjectId ?? null,
        kind: input.kind,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        externalUrl: input.externalUrl ?? null,
        // Matn bloki va papka tarkibi shu yerda: turga qarab har xil (F-05)
        meta: this.sanitizeResourceMeta(input.meta) as never,
        position,
        isRequired: input.isRequired,
      },
      select: { id: true, kind: true, title: true, position: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'resource.create',
      resource: 'resource',
      resourceId: created.id,
      after: { kind: input.kind },
    });
    return created;
  }

  /**
   * Drag-and-drop tartiblash (F-04). Butun ro'yxat bitta tranzaksiyada
   * yangilanadi — oraliq holatda tartib buzilmaydi.
   */
  async reorder(
    entity: 'module' | 'topic' | 'lesson' | 'resource',
    input: ReorderInput,
    actor: RequestUser,
  ) {
    await this.prisma.$transaction(
      input.orderedIds.map((id, index) => {
        const data = { position: index };
        switch (entity) {
          case 'module':
            return this.prisma.module.update({ where: { id }, data });
          case 'topic':
            return this.prisma.topic.update({ where: { id }, data });
          case 'lesson':
            return this.prisma.lesson.update({ where: { id }, data });
          case 'resource':
            return this.prisma.resource.update({ where: { id }, data });
          default:
            throw AppException.validation([{ field: 'entity', code: 'validation.unknown_entity' }]);
        }
      }),
    );

    await this.audit.record({
      actorId: actor.id,
      action: `${entity}.reorder`,
      resource: 'course',
      resourceId: input.parentId ?? null,
      after: { count: input.orderedIds.length },
    });

    return { reordered: input.orderedIds.length };
  }

  /**
   * Kursni nusxalash (F-04 — shablonlash).
   *
   * MUHIM: talabalar, yozilishlar, baholar va topshirilgan ishlar
   * HECH QACHON nusxalanmaydi — bu xavfsizlik qoidasi.
   */
  async clone(sourceId: string, input: CloneCourseInput, actor: RequestUser) {
    const source = await this.prisma.db.course.findUnique({
      where: { id: sourceId },
      select: {
        subjectId: true,
        departmentId: true,
        title: true,
        description: true,
        type: true,
        deliveryMode: true,
        academicHours: true,
        gradingPolicy: true,
        isPaid: true,
        priceUzs: true,
        modules: {
          orderBy: { position: 'asc' },
          select: {
            title: true,
            description: true,
            position: true,
            topics: {
              orderBy: { position: 'asc' },
              select: {
                title: true,
                position: true,
                bloomLevel: true,
                lessons: {
                  orderBy: { position: 'asc' },
                  select: {
                    title: true,
                    contentHtml: true,
                    position: true,
                    durationMinutes: true,
                    resources: {
                      orderBy: { position: 'asc' },
                      select: {
                        kind: true,
                        title: true,
                        externalUrl: true,
                        fileObjectId: true,
                        position: true,
                        isRequired: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!source) throw AppException.notFound('course', sourceId);

    const title = input.title ?? (source.title as LocalizedText);

    const clone = await this.prisma.$transaction(async (tx) => {
      const created = await tx.course.create({
        data: {
          subjectId: source.subjectId,
          semesterId: input.targetSemesterId ?? null,
          departmentId: source.departmentId,
          code: input.targetCode,
          title: title as never,
          description: source.description as never,
          type: source.type,
          deliveryMode: source.deliveryMode,
          academicHours: source.academicHours,
          gradingPolicy: source.gradingPolicy as never,
          isPaid: source.isPaid,
          priceUzs: source.priceUzs,
          status: 'DRAFT',
          searchText: buildSearchText(title, input.targetCode),
          teachers: { create: { userId: actor.id, role: 'LEAD' } },
        },
        select: { id: true, code: true },
      });

      if (input.includeContent) {
        for (const module of source.modules) {
          const newModule = await tx.module.create({
            data: {
              courseId: created.id,
              title: module.title as never,
              description: module.description as never,
              position: module.position,
              isPublished: false,
            },
            select: { id: true },
          });

          for (const topic of module.topics) {
            const newTopic = await tx.topic.create({
              data: {
                moduleId: newModule.id,
                title: topic.title as never,
                position: topic.position,
                bloomLevel: topic.bloomLevel,
              },
              select: { id: true },
            });

            for (const lesson of topic.lessons) {
              const newLesson = await tx.lesson.create({
                data: {
                  topicId: newTopic.id,
                  title: lesson.title as never,
                  contentHtml: lesson.contentHtml as never,
                  position: lesson.position,
                  durationMinutes: lesson.durationMinutes,
                  isPublished: false,
                },
                select: { id: true },
              });

              if (lesson.resources.length > 0) {
                await tx.resource.createMany({
                  data: lesson.resources.map((resource) => ({
                    lessonId: newLesson.id,
                    kind: resource.kind,
                    title: resource.title as never,
                    externalUrl: resource.externalUrl,
                    // Fayl obyekti qayta ishlatiladi — nusxa olinmaydi (saqlash tejaladi)
                    fileObjectId: resource.fileObjectId,
                    position: resource.position,
                    isRequired: resource.isRequired,
                  })),
                });
              }
            }
          }
        }
      }

      return created;
    });

    await this.cache.delByPattern(`auth:ctx:${actor.id}:*`);
    await this.audit.record({
      actorId: actor.id,
      action: 'course.clone',
      resource: 'course',
      resourceId: clone.id,
      after: { sourceId, targetCode: input.targetCode },
    });

    return clone;
  }

  // --- Yozilish -------------------------------------------------------------

  /**
   * Kursga yozish. Guruh bo'yicha ommaviy yozish ham qo'llab-quvvatlanadi.
   * `createMany` + `skipDuplicates` — 200 talabani bitta so'rovda yozadi.
   */
  async enroll(input: EnrollInput, actor: RequestUser) {
    const course = await this.prisma.db.course.findUnique({
      where: { id: input.courseId },
      select: {
        id: true,
        status: true,
        isPaid: true,
        enrollmentLimit: true,
        _count: { select: { enrollments: true } },
      },
    });
    if (!course) throw AppException.notFound('course', input.courseId);
    if (course.status !== 'PUBLISHED') {
      throw AppException.businessRule('errors.course_not_published');
    }

    let userIds = input.userIds ?? [];
    if (input.groupId) {
      const members = await this.prisma.db.groupMember.findMany({
        where: { groupId: input.groupId, leftAt: null },
        select: { userId: true },
      });
      userIds = [...new Set([...userIds, ...members.map((m) => m.userId)])];
    }
    if (userIds.length === 0) userIds = [actor.id];

    if (
      course.enrollmentLimit > 0 &&
      course._count.enrollments + userIds.length > course.enrollmentLimit
    ) {
      throw AppException.businessRule('errors.enrollment_limit_reached', {
        limit: course.enrollmentLimit,
      });
    }

    const result = await this.prisma.db.enrollment.createMany({
      data: userIds.map((userId) => ({
        courseId: input.courseId,
        userId,
        groupId: input.groupId ?? null,
        // Pullik kursda to'lov kutiladi (A-20)
        status: course.isPaid && userId === actor.id ? 'PENDING_PAYMENT' : 'ACTIVE',
      })),
      skipDuplicates: true,
    });

    for (const userId of userIds) {
      await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'course.enroll',
      resource: 'course',
      resourceId: input.courseId,
      after: { count: result.count, groupId: input.groupId },
    });

    return { enrolled: result.count };
  }

  async listEnrollments(courseId: string, pagination: CursorPagination) {
    const cursor = pagination.cursor ? decodeCursor<{ id: string }>(pagination.cursor) : null;

    const rows = await this.prisma.db.enrollment.findMany({
      where: { courseId },
      orderBy: [{ user: { profile: { lastName: 'asc' } } }, { id: 'asc' }],
      take: pagination.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        status: true,
        enrolledAt: true,
        progressPercent: true,
        lastAccessAt: true,
        group: { select: { id: true, name: true } },
        user: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true, middleName: true } },
          },
        },
      },
    });

    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page,
      meta: { nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null, hasMore },
    };
  }

  /** O'qituvchini kursga biriktirish (yuklama taqsimoti — F-04/F-13). */
  async assignTeacher(
    courseId: string,
    userId: string,
    role: 'LEAD' | 'ASSISTANT' | 'EXAMINER',
    workloadHours: number,
    actor: RequestUser,
  ) {
    await this.prisma.db.courseTeacher.upsert({
      where: { courseId_userId: { courseId, userId } },
      create: { courseId, userId, role, workloadHours },
      update: { role, workloadHours, deletedAt: null },
    });

    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    await this.audit.record({
      actorId: actor.id,
      action: 'course.teacher_assigned',
      resource: 'course',
      resourceId: courseId,
      after: { userId, role, workloadHours },
    });

    return { assigned: true };
  }

  /** Yangi element uchun keyingi tartib raqami. */
  private async nextPosition(
    entity: 'module' | 'topic' | 'lesson' | 'resource',
    where: Record<string, string>,
  ): Promise<number> {
    const delegates = {
      module: this.prisma.db.module,
      topic: this.prisma.db.topic,
      lesson: this.prisma.db.lesson,
      resource: this.prisma.db.resource,
    } as const;

    const result = await (
      delegates[entity] as unknown as {
        aggregate: (args: unknown) => Promise<{ _max: { position: number | null } }>;
      }
    ).aggregate({ where, _max: { position: true } });

    return (result._max.position ?? -1) + 1;
  }
}

function buildSearchText(title: LocalizedText, code: string): string {
  return normalizeForSearch(`${Object.values(title).filter(Boolean).join(' ')} ${code}`);
}
