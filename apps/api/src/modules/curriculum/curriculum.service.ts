/**
 * Maqsad: F-03 — o'quv reja, fan kartasi, sillabus va tasdiqlash oqimi.
 *
 * Sillabus versiyalanadi: har bir tahrir yangi versiya yaratadi, tasdiqlangan
 * versiya o'zgarmaydi. Bu O'UM ning auditga chidamli bo'lishini ta'minlaydi.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_GRADING_POLICY,
  normalizeForSearch,
  type ApprovalStatus,
  type CreateCurriculumInput,
  type CreateSubjectInput,
  type CreateSyllabusInput,
  type LocalizedText,
  type SyllabusTransitionInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { QueueService } from '../../common/queue/queue.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { effectiveScope } from '../../common/auth/scope-filter';

/**
 * Tasdiqlash oqimining ruxsat etilgan o'tishlari.
 * Har qanday boshqa o'tish `BUSINESS_RULE_VIOLATION` bilan rad etiladi —
 * holat mashinasi kodda tarqalib ketmasligi uchun bitta joyda.
 */
const TRANSITIONS: Record<ApprovalStatus, Partial<Record<string, ApprovalStatus>>> = {
  DRAFT: { SUBMIT: 'REVIEW' },
  REVIEW: { APPROVE: 'APPROVED', REJECT: 'REJECTED' },
  REJECTED: { SUBMIT: 'REVIEW' },
  APPROVED: { ARCHIVE: 'ARCHIVED' },
  ARCHIVED: {},
};

@Injectable()
export class CurriculumService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
  ) {}

  // --- Fan kartasi ----------------------------------------------------------

  async listSubjects(filters: { departmentId?: string; search?: string }, actor: RequestUser) {
    const where: Prisma.SubjectWhereInput = {};

    if (filters.departmentId) where.departmentId = filters.departmentId;
    if (filters.search) {
      where.searchText = { contains: normalizeForSearch(filters.search) };
    }

    const scope = effectiveScope(actor, 'subject', 'read');
    if (scope === 'own_department') {
      where.departmentId = { in: actor.scope.departmentIds };
    } else if (scope === 'own_faculty') {
      where.department = { facultyId: { in: actor.scope.facultyIds } };
    } else if (scope === null) {
      where.id = { in: [] };
    }

    return this.prisma.db.subject.findMany({
      where,
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        credits: true,
        controlForm: true,
        departmentId: true,
        department: { select: { id: true, name: true, facultyId: true } },
        syllabi: { select: { id: true, status: true, currentVersion: true } },
      },
    });
  }

  async createSubject(input: CreateSubjectInput, actor: RequestUser) {
    // Oldingi fanlar mavjudligini tekshiramiz — bo'lmagan fanga havola
    // o'quv rejani buzadi
    if (input.prerequisiteIds.length > 0) {
      const found = await this.prisma.db.subject.count({
        where: { id: { in: input.prerequisiteIds } },
      });
      if (found !== input.prerequisiteIds.length) {
        throw AppException.validation([
          { field: 'prerequisiteIds', code: 'validation.unknown_subject' },
        ]);
      }
    }

    const subject = await this.prisma.db.subject.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name as never,
        description: (input.description ?? null) as never,
        credits: input.credits,
        controlForm: input.controlForm,
        prerequisiteIds: input.prerequisiteIds,
        searchText: buildSearchText(input.name, input.code),
      },
      select: { id: true, code: true, name: true, credits: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'subject.create',
      resource: 'subject',
      resourceId: subject.id,
      after: { code: input.code, credits: input.credits },
    });
    return subject;
  }

  async updateSubject(id: string, input: Partial<CreateSubjectInput>, actor: RequestUser) {
    const before = await this.prisma.db.subject.findUnique({
      where: { id },
      select: { code: true, name: true, credits: true, controlForm: true },
    });
    if (!before) throw AppException.notFound('subject', id);

    const updated = await this.prisma.db.subject.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined
          ? {
              name: input.name as never,
              searchText: buildSearchText(input.name, input.code ?? before.code),
            }
          : {}),
        ...(input.description !== undefined ? { description: input.description as never } : {}),
        ...(input.credits !== undefined ? { credits: input.credits } : {}),
        ...(input.controlForm !== undefined ? { controlForm: input.controlForm } : {}),
        ...(input.prerequisiteIds !== undefined ? { prerequisiteIds: input.prerequisiteIds } : {}),
      },
      select: { id: true, code: true, name: true, credits: true, controlForm: true },
    });

    await this.audit.recordChange({
      actorId: actor.id,
      action: 'subject.update',
      resource: 'subject',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  // --- O'quv reja -----------------------------------------------------------

  async listCurricula(filters: { specialityId?: string; admissionYear?: number }) {
    return this.prisma.db.curriculum.findMany({
      where: {
        ...(filters.specialityId ? { specialityId: filters.specialityId } : {}),
        ...(filters.admissionYear ? { admissionYear: filters.admissionYear } : {}),
      },
      orderBy: [{ admissionYear: 'desc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        admissionYear: true,
        totalCredits: true,
        status: true,
        speciality: { select: { id: true, code: true, name: true } },
        _count: { select: { subjects: true } },
      },
    });
  }

  async getCurriculum(id: string) {
    const curriculum = await this.prisma.db.curriculum.findUnique({
      where: { id },
      select: {
        id: true,
        code: true,
        name: true,
        admissionYear: true,
        totalCredits: true,
        status: true,
        speciality: {
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
            durationYears: true,
            department: { select: { id: true, name: true } },
          },
        },
        subjects: {
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
            subject: {
              select: { id: true, code: true, name: true, credits: true, controlForm: true },
            },
          },
        },
      },
    });

    if (!curriculum) throw AppException.notFound('curriculum', id);

    // Semestrlar kesimida kredit yig'indisi — o'quv reja balansini tekshirish uchun
    const bySemester = new Map<number, { credits: number; hours: number; subjects: number }>();
    for (const item of curriculum.subjects) {
      const entry = bySemester.get(item.semesterNumber) ?? { credits: 0, hours: 0, subjects: 0 };
      entry.credits += item.subject.credits;
      entry.hours +=
        item.lectureHours +
        item.practiceHours +
        item.labHours +
        item.seminarHours +
        item.independentHours;
      entry.subjects += 1;
      bySemester.set(item.semesterNumber, entry);
    }

    return {
      ...curriculum,
      summary: {
        assignedCredits: curriculum.subjects.reduce((sum, i) => sum + i.subject.credits, 0),
        bySemester: Array.from(bySemester.entries())
          .map(([semester, value]) => ({ semester, ...value }))
          .sort((a, b) => a.semester - b.semester),
      },
    };
  }

  async createCurriculum(input: CreateCurriculumInput, actor: RequestUser) {
    const subjectIds = input.subjects.map((item) => item.subjectId);
    const found = await this.prisma.db.subject.count({ where: { id: { in: subjectIds } } });
    if (found !== new Set(subjectIds).size) {
      throw AppException.validation([{ field: 'subjects', code: 'validation.unknown_subject' }]);
    }

    const curriculum = await this.prisma.db.curriculum.create({
      data: {
        specialityId: input.specialityId,
        code: input.code,
        name: input.name as never,
        admissionYear: input.admissionYear,
        totalCredits: input.totalCredits,
        subjects: {
          create: input.subjects.map((item) => ({
            subjectId: item.subjectId,
            semesterNumber: item.semesterNumber,
            lectureHours: item.lectureHours,
            practiceHours: item.practiceHours,
            labHours: item.labHours,
            seminarHours: item.seminarHours,
            independentHours: item.independentHours,
            isElective: item.isElective,
          })),
        },
      },
      select: { id: true, code: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'curriculum.create',
      resource: 'curriculum',
      resourceId: curriculum.id,
      after: { code: input.code, subjects: input.subjects.length },
    });
    return curriculum;
  }

  // --- Sillabus (O'UM) ------------------------------------------------------

  async getSyllabus(subjectId: string) {
    const syllabus = await this.prisma.db.syllabus.findFirst({
      where: { subjectId },
      select: {
        id: true,
        status: true,
        currentVersion: true,
        subject: { select: { id: true, code: true, name: true, credits: true } },
        department: { select: { id: true, name: true } },
        versions: {
          orderBy: { version: 'desc' },
          select: {
            id: true,
            version: true,
            status: true,
            content: true,
            gradingPolicy: true,
            changeNote: true,
            rejectReason: true,
            approvedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!syllabus) throw AppException.notFound('syllabus', subjectId);
    return syllabus;
  }

  async createSyllabus(input: CreateSyllabusInput, actor: RequestUser) {
    const existing = await this.prisma.db.syllabus.findFirst({
      where: { subjectId: input.subjectId },
      select: { id: true },
    });
    if (existing) throw AppException.conflict('errors.syllabus_already_exists');

    const syllabus = await this.prisma.db.syllabus.create({
      data: {
        subjectId: input.subjectId,
        departmentId: input.departmentId,
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            content: input.content as never,
            gradingPolicy: input.gradingPolicy as never,
            authorId: actor.id,
          },
        },
      },
      select: { id: true, currentVersion: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'syllabus.create',
      resource: 'syllabus',
      resourceId: syllabus.id,
      after: { subjectId: input.subjectId },
    });
    return syllabus;
  }

  /**
   * Yangi versiya yaratadi. Tasdiqlangan versiya HECH QACHON o'zgartirilmaydi —
   * tahrir har doim yangi versiya sifatida saqlanadi (audit talabi).
   */
  async createSyllabusVersion(
    syllabusId: string,
    input: { content?: unknown; gradingPolicy?: unknown; changeNote?: string },
    actor: RequestUser,
  ) {
    const syllabus = await this.prisma.db.syllabus.findUnique({
      where: { id: syllabusId },
      select: {
        id: true,
        currentVersion: true,
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { content: true, gradingPolicy: true },
        },
      },
    });
    if (!syllabus) throw AppException.notFound('syllabus', syllabusId);

    const latest = syllabus.versions[0];
    const nextVersion = syllabus.currentVersion + 1;

    const created = await this.prisma.$transaction(async (tx) => {
      const version = await tx.syllabusVersion.create({
        data: {
          syllabusId,
          version: nextVersion,
          // Berilmagan bo'limlar oldingi versiyadan meros olinadi
          content: (input.content ?? latest?.content ?? {}) as never,
          gradingPolicy: (input.gradingPolicy ??
            latest?.gradingPolicy ??
            DEFAULT_GRADING_POLICY) as never,
          authorId: actor.id,
          changeNote: input.changeNote ?? null,
        },
        select: { id: true, version: true },
      });

      await tx.syllabus.update({
        where: { id: syllabusId },
        data: { currentVersion: nextVersion, status: 'DRAFT' },
      });

      return version;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'syllabus.version_created',
      resource: 'syllabus',
      resourceId: syllabusId,
      after: { version: nextVersion, changeNote: input.changeNote },
    });
    return created;
  }

  /**
   * Tasdiqlash oqimi: DRAFT -> REVIEW -> APPROVED | REJECTED -> ARCHIVED.
   * Holat mashinasi `TRANSITIONS` jadvalida — kodda `if` zanjiri yo'q.
   */
  async transitionSyllabus(syllabusId: string, input: SyllabusTransitionInput, actor: RequestUser) {
    const syllabus = await this.prisma.db.syllabus.findUnique({
      where: { id: syllabusId },
      select: {
        id: true,
        status: true,
        currentVersion: true,
        subject: { select: { id: true, name: true } },
      },
    });
    if (!syllabus) throw AppException.notFound('syllabus', syllabusId);

    const nextStatus = TRANSITIONS[syllabus.status][input.action];
    if (!nextStatus) {
      throw AppException.businessRule('errors.invalid_workflow_transition', {
        from: syllabus.status,
        action: input.action,
      });
    }

    if (input.action === 'REJECT' && !input.comment) {
      throw AppException.validation([{ field: 'comment', code: 'validation.required_on_reject' }]);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.syllabus.update({ where: { id: syllabusId }, data: { status: nextStatus } });
      await tx.syllabusVersion.updateMany({
        where: { syllabusId, version: syllabus.currentVersion },
        data: {
          status: nextStatus,
          ...(input.action === 'APPROVE'
            ? { approvedById: actor.id, approvedAt: new Date(), rejectReason: null }
            : {}),
          ...(input.action === 'REJECT' ? { rejectReason: input.comment ?? null } : {}),
        },
      });
    });

    // Muallifga bildirishnoma — tasdiqlash oqimi kutib qolmasligi uchun
    const version = await this.prisma.db.syllabusVersion.findFirst({
      where: { syllabusId, version: syllabus.currentVersion },
      select: { authorId: true },
    });
    if (version && version.authorId !== actor.id) {
      const notification = await this.prisma.db.notification.create({
        data: {
          userId: version.authorId,
          templateKey: `notification.syllabus_${input.action.toLowerCase()}`,
          params: {
            subjectName: syllabus.subject.name,
            comment: input.comment ?? '',
          } as never,
          channels: ['IN_APP', 'EMAIL'],
          linkUrl: `/methodist/syllabi/${syllabusId}`,
        },
        select: { id: true },
      });
      await this.queue.enqueue('notification.dispatch', { notificationId: notification.id });
    }

    await this.audit.record({
      actorId: actor.id,
      action: `syllabus.${input.action.toLowerCase()}`,
      resource: 'syllabus',
      resourceId: syllabusId,
      before: { status: syllabus.status },
      after: { status: nextStatus, comment: input.comment },
    });

    return { status: nextStatus };
  }

  /** Tasdiqlangan sillabusning baholash siyosati — kurs undan meros oladi. */
  async getApprovedGradingPolicy(subjectId: string): Promise<unknown | null> {
    const version = await this.prisma.db.syllabusVersion.findFirst({
      where: {
        status: 'APPROVED',
        syllabus: { subjectId },
      },
      orderBy: { version: 'desc' },
      select: { gradingPolicy: true },
    });
    return version?.gradingPolicy ?? null;
  }
}

function buildSearchText(name: LocalizedText, code: string): string {
  return normalizeForSearch(`${Object.values(name).filter(Boolean).join(' ')} ${code}`);
}
