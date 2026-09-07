/**
 * Maqsad: F-02 — tashkiliy tuzilma va akademik kalendar.
 *
 * Fakultet → Kafedra → Yo'nalish → Guruh iyerarxiyasi va o'quv yili/semestr.
 * Tuzilma tez-tez o'qiladi, kam o'zgaradi — shuning uchun daraxt Redis'da
 * keshlanadi va har qanday o'zgarishda bekor qilinadi.
 */

import { Injectable } from '@nestjs/common';
import { normalizeForSearch, resolveLocalized, type LocalizedText } from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import type {
  CreateAcademicYearInput,
  CreateDepartmentInput,
  CreateFacultyInput,
  CreateGroupInput,
  CreateSemesterInput,
  CreateSpecialityInput,
  UpdateAcademicYearInput,
  UpdateSemesterInput,
} from '@lms/shared';

const TREE_CACHE_KEY = 'org:tree';
const TREE_TTL_SECONDS = 300;

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
  ) {}

  // --- Fakultet -------------------------------------------------------------

  async listFaculties() {
    return this.prisma.db.faculty.findMany({
      orderBy: [{ position: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        position: true,
        dean: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { departments: true } },
      },
    });
  }

  async createFaculty(input: CreateFacultyInput, actor: RequestUser) {
    const faculty = await this.prisma.db.faculty.create({
      data: {
        code: input.code,
        name: input.name as never,
        deanId: input.deanId ?? null,
        position: input.position,
      },
      select: { id: true, code: true, name: true },
    });

    await this.invalidateTree();
    await this.audit.record({
      actorId: actor.id,
      action: 'faculty.create',
      resource: 'faculty',
      resourceId: faculty.id,
      after: { code: input.code },
    });
    return faculty;
  }

  async updateFaculty(id: string, input: Partial<CreateFacultyInput>, actor: RequestUser) {
    const before = await this.prisma.db.faculty.findUnique({
      where: { id },
      select: { code: true, name: true, deanId: true, position: true },
    });
    if (!before) throw AppException.notFound('faculty', id);

    const updated = await this.prisma.db.faculty.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name as never } : {}),
        ...(input.deanId !== undefined ? { deanId: input.deanId } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      },
      select: { id: true, code: true, name: true, deanId: true, position: true },
    });

    await this.invalidateTree();
    await this.audit.recordChange({
      actorId: actor.id,
      action: 'faculty.update',
      resource: 'faculty',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  /** Fakultetni o'chirish faqat bo'sh bo'lsa (kafedralar ko'chirilishi kerak). */
  async deleteFaculty(id: string, actor: RequestUser) {
    const departments = await this.prisma.db.department.count({ where: { facultyId: id } });
    if (departments > 0) {
      throw AppException.businessRule('errors.faculty_has_departments', { departments });
    }

    await this.prisma.softDelete('Faculty', id);
    await this.invalidateTree();
    await this.audit.record({
      actorId: actor.id,
      action: 'faculty.delete',
      resource: 'faculty',
      resourceId: id,
    });
    return { deleted: true };
  }

  // --- Kafedra --------------------------------------------------------------

  async listDepartments(facultyId?: string) {
    return this.prisma.db.department.findMany({
      where: facultyId ? { facultyId } : {},
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        facultyId: true,
        faculty: { select: { id: true, name: true } },
        head: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        _count: { select: { specialities: true, subjects: true, courses: true } },
      },
    });
  }

  async createDepartment(input: CreateDepartmentInput, actor: RequestUser) {
    const faculty = await this.prisma.db.faculty.findUnique({
      where: { id: input.facultyId },
      select: { id: true },
    });
    if (!faculty) throw AppException.notFound('faculty', input.facultyId);

    const department = await this.prisma.db.department.create({
      data: {
        facultyId: input.facultyId,
        code: input.code,
        name: input.name as never,
        headId: input.headId ?? null,
      },
      select: { id: true, code: true, name: true, facultyId: true },
    });

    await this.invalidateTree();
    await this.audit.record({
      actorId: actor.id,
      action: 'department.create',
      resource: 'department',
      resourceId: department.id,
      after: { code: input.code, facultyId: input.facultyId },
    });
    return department;
  }

  async updateDepartment(
    id: string,
    input: Partial<Omit<CreateDepartmentInput, 'facultyId'>>,
    actor: RequestUser,
  ) {
    const before = await this.prisma.db.department.findUnique({
      where: { id },
      select: { code: true, name: true, headId: true },
    });
    if (!before) throw AppException.notFound('department', id);

    const updated = await this.prisma.db.department.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name as never } : {}),
        ...(input.headId !== undefined ? { headId: input.headId } : {}),
      },
      select: { id: true, code: true, name: true, headId: true },
    });

    await this.invalidateTree();
    await this.audit.recordChange({
      actorId: actor.id,
      action: 'department.update',
      resource: 'department',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  // --- Yo'nalish ------------------------------------------------------------

  async listSpecialities(departmentId?: string) {
    return this.prisma.db.speciality.findMany({
      where: departmentId ? { departmentId } : {},
      orderBy: { code: 'asc' },
      select: {
        id: true,
        code: true,
        name: true,
        level: true,
        durationYears: true,
        departmentId: true,
        department: { select: { id: true, name: true, facultyId: true } },
        _count: { select: { groups: true, curricula: true } },
      },
    });
  }

  async createSpeciality(input: CreateSpecialityInput, actor: RequestUser) {
    const speciality = await this.prisma.db.speciality.create({
      data: {
        departmentId: input.departmentId,
        code: input.code,
        name: input.name as never,
        level: input.level,
        durationYears: input.durationYears,
      },
      select: { id: true, code: true, name: true, level: true },
    });

    await this.invalidateTree();
    await this.audit.record({
      actorId: actor.id,
      action: 'speciality.create',
      resource: 'speciality',
      resourceId: speciality.id,
      after: { code: input.code },
    });
    return speciality;
  }

  async updateSpeciality(
    id: string,
    input: Partial<Omit<CreateSpecialityInput, 'departmentId'>>,
    actor: RequestUser,
  ) {
    const before = await this.prisma.db.speciality.findUnique({
      where: { id },
      select: { code: true, name: true, level: true, durationYears: true },
    });
    if (!before) throw AppException.notFound('speciality', id);

    const updated = await this.prisma.db.speciality.update({
      where: { id },
      data: {
        ...(input.code !== undefined ? { code: input.code } : {}),
        ...(input.name !== undefined ? { name: input.name as never } : {}),
        ...(input.level !== undefined ? { level: input.level } : {}),
        ...(input.durationYears !== undefined ? { durationYears: input.durationYears } : {}),
      },
      select: { id: true, code: true, name: true, level: true, durationYears: true },
    });

    await this.invalidateTree();
    await this.audit.recordChange({
      actorId: actor.id,
      action: 'speciality.update',
      resource: 'speciality',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  // --- Guruh ----------------------------------------------------------------

  async listGroups(filters: { specialityId?: string; facultyId?: string; curatorId?: string }) {
    return this.prisma.db.group.findMany({
      where: {
        ...(filters.specialityId ? { specialityId: filters.specialityId } : {}),
        ...(filters.curatorId ? { curatorId: filters.curatorId } : {}),
        ...(filters.facultyId
          ? { speciality: { department: { facultyId: filters.facultyId } } }
          : {}),
      },
      orderBy: [{ admissionYear: 'desc' }, { name: 'asc' }],
      select: {
        id: true,
        name: true,
        admissionYear: true,
        educationForm: true,
        languageOfInstruction: true,
        curator: {
          select: { id: true, profile: { select: { firstName: true, lastName: true } } },
        },
        speciality: {
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
            department: { select: { id: true, name: true, facultyId: true } },
          },
        },
        _count: { select: { members: { where: { leftAt: null } } } },
      },
    });
  }

  async createGroup(input: CreateGroupInput, actor: RequestUser) {
    const group = await this.prisma.db.group.create({
      data: {
        specialityId: input.specialityId,
        name: input.name,
        admissionYear: input.admissionYear,
        educationForm: input.educationForm,
        curatorId: input.curatorId ?? null,
        languageOfInstruction: input.languageOfInstruction,
      },
      select: { id: true, name: true },
    });

    await this.invalidateTree();
    await this.audit.record({
      actorId: actor.id,
      action: 'group.create',
      resource: 'group',
      resourceId: group.id,
      after: { name: input.name },
    });
    return group;
  }

  async updateGroup(
    id: string,
    input: Partial<Omit<CreateGroupInput, 'specialityId'>>,
    actor: RequestUser,
  ) {
    const before = await this.prisma.db.group.findUnique({
      where: { id },
      select: {
        name: true,
        admissionYear: true,
        educationForm: true,
        curatorId: true,
        languageOfInstruction: true,
      },
    });
    if (!before) throw AppException.notFound('group', id);

    const updated = await this.prisma.db.group.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.admissionYear !== undefined ? { admissionYear: input.admissionYear } : {}),
        ...(input.educationForm !== undefined ? { educationForm: input.educationForm } : {}),
        ...(input.curatorId !== undefined ? { curatorId: input.curatorId } : {}),
        ...(input.languageOfInstruction !== undefined
          ? { languageOfInstruction: input.languageOfInstruction }
          : {}),
      },
      select: {
        id: true,
        name: true,
        admissionYear: true,
        educationForm: true,
        curatorId: true,
        languageOfInstruction: true,
      },
    });

    // Kurator o'zgarsa — uning scope keshi (`groupIds`) eskiradi
    for (const curatorId of [before.curatorId, updated.curatorId]) {
      if (curatorId) await this.cache.delByPattern(`auth:ctx:${curatorId}:*`);
    }

    await this.invalidateTree();
    await this.audit.recordChange({
      actorId: actor.id,
      action: 'group.update',
      resource: 'group',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  /**
   * Talabani guruhga biriktirish yoki ko'chirish.
   * Avvalgi a'zolik yopiladi (`leftAt`) — tarix saqlanadi (P6).
   */
  async assignStudentToGroup(
    userId: string,
    groupId: string,
    reason: string | undefined,
    actor: RequestUser,
  ) {
    const group = await this.prisma.db.group.findUnique({
      where: { id: groupId },
      select: { id: true, name: true },
    });
    if (!group) throw AppException.notFound('group', groupId);

    await this.prisma.$transaction(async (tx) => {
      await tx.groupMember.updateMany({
        where: { userId, leftAt: null },
        data: { leftAt: new Date(), reason: reason ?? 'transfer' },
      });
      await tx.groupMember.create({ data: { groupId, userId, reason: reason ?? null } });
    });

    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    await this.audit.record({
      actorId: actor.id,
      action: 'group.student_assigned',
      resource: 'group',
      resourceId: groupId,
      after: { userId, reason },
    });

    return { groupId, userId };
  }

  async listGroupMembers(groupId: string) {
    return this.prisma.db.groupMember.findMany({
      where: { groupId, leftAt: null },
      orderBy: { user: { profile: { lastName: 'asc' } } },
      select: {
        id: true,
        joinedAt: true,
        user: {
          select: {
            id: true,
            email: true,
            status: true,
            profile: { select: { firstName: true, lastName: true, middleName: true } },
          },
        },
      },
    });
  }

  // --- Akademik kalendar ----------------------------------------------------

  async listAcademicYears() {
    return this.prisma.db.academicYear.findMany({
      orderBy: { startsAt: 'desc' },
      select: {
        id: true,
        name: true,
        startsAt: true,
        endsAt: true,
        isCurrent: true,
        semesters: {
          orderBy: { number: 'asc' },
          select: {
            id: true,
            number: true,
            startsAt: true,
            endsAt: true,
            isCurrent: true,
            gradingClosesAt: true,
          },
        },
      },
    });
  }

  /**
   * O'quv yili yaratish. `isCurrent` belgilansa — oldingisi avtomatik
   * o'chiriladi (bazada ham qisman unikal indeks bilan kafolatlangan).
   */
  async createAcademicYear(input: CreateAcademicYearInput, actor: RequestUser) {
    const year = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicYear.updateMany({
          where: { isCurrent: true },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.create({
        data: {
          name: input.name,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          isCurrent: input.isCurrent,
        },
        select: { id: true, name: true, isCurrent: true },
      });
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'academic_year.create',
      resource: 'academicyear',
      resourceId: year.id,
      after: { name: input.name },
    });
    return year;
  }

  async createSemester(input: CreateSemesterInput, actor: RequestUser) {
    const semester = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.semester.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
      }
      return tx.semester.create({
        data: {
          academicYearId: input.academicYearId,
          number: input.number,
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          isCurrent: input.isCurrent,
          gradingClosesAt: input.gradingClosesAt ? new Date(input.gradingClosesAt) : null,
        },
        select: { id: true, number: true, isCurrent: true },
      });
    });

    await this.cache.del('org:current-semester');
    await this.audit.record({
      actorId: actor.id,
      action: 'semester.create',
      resource: 'academicyear',
      resourceId: semester.id,
      after: { number: input.number },
    });
    return semester;
  }

  /**
   * O'quv yilini yangilash. `isCurrent: true` berilsa boshqalari o'chiriladi —
   * yaratishdagi qoida bilan bir xil (bir vaqtda bitta joriy yil).
   */
  async updateAcademicYear(id: string, input: UpdateAcademicYearInput, actor: RequestUser) {
    const before = await this.prisma.db.academicYear.findUnique({
      where: { id },
      select: { name: true, startsAt: true, endsAt: true, isCurrent: true },
    });
    if (!before) throw AppException.notFound('academicyear', id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.academicYear.updateMany({
          where: { isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });
      }
      return tx.academicYear.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
          ...(input.endsAt !== undefined ? { endsAt: new Date(input.endsAt) } : {}),
          ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
        },
        select: { id: true, name: true, startsAt: true, endsAt: true, isCurrent: true },
      });
    });

    await this.audit.recordChange({
      actorId: actor.id,
      action: 'academic_year.update',
      resource: 'academicyear',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  async updateSemester(id: string, input: UpdateSemesterInput, actor: RequestUser) {
    const before = await this.prisma.db.semester.findUnique({
      where: { id },
      select: { startsAt: true, endsAt: true, isCurrent: true, gradingClosesAt: true },
    });
    if (!before) throw AppException.notFound('academicyear', id);

    const updated = await this.prisma.$transaction(async (tx) => {
      if (input.isCurrent) {
        await tx.semester.updateMany({
          where: { isCurrent: true, id: { not: id } },
          data: { isCurrent: false },
        });
      }
      return tx.semester.update({
        where: { id },
        data: {
          ...(input.startsAt !== undefined ? { startsAt: new Date(input.startsAt) } : {}),
          ...(input.endsAt !== undefined ? { endsAt: new Date(input.endsAt) } : {}),
          ...(input.isCurrent !== undefined ? { isCurrent: input.isCurrent } : {}),
          ...(input.gradingClosesAt !== undefined
            ? { gradingClosesAt: input.gradingClosesAt ? new Date(input.gradingClosesAt) : null }
            : {}),
        },
        select: {
          id: true,
          number: true,
          startsAt: true,
          endsAt: true,
          isCurrent: true,
          gradingClosesAt: true,
        },
      });
    });

    await this.cache.del('org:current-semester');
    await this.audit.recordChange({
      actorId: actor.id,
      action: 'semester.update',
      resource: 'academicyear',
      resourceId: id,
      before: before as Record<string, unknown>,
      after: updated as Record<string, unknown>,
    });
    return updated;
  }

  /** Joriy semestr — juda tez-tez so'raladi, shuning uchun keshlanadi. */
  async currentSemester() {
    return this.cache.remember('org:current-semester', 300, async () => {
      const semester = await this.prisma.db.semester.findFirst({
        where: { isCurrent: true },
        select: {
          id: true,
          number: true,
          startsAt: true,
          endsAt: true,
          gradingClosesAt: true,
          academicYear: { select: { id: true, name: true } },
        },
      });
      return semester;
    });
  }

  /**
   * Butun tashkiliy daraxt — yon panel va filtrlar uchun.
   * Bitta so'rovda olinadi (N+1 yo'q) va 5 daqiqa keshlanadi.
   */
  async tree(locale: string) {
    const cached = await this.cache.get<unknown>(`${TREE_CACHE_KEY}:${locale}`);
    if (cached) return cached;

    const faculties = await this.prisma.db.faculty.findMany({
      orderBy: [{ position: 'asc' }, { code: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        departments: {
          orderBy: { code: 'asc' },
          select: {
            id: true,
            code: true,
            name: true,
            specialities: {
              orderBy: { code: 'asc' },
              select: {
                id: true,
                code: true,
                name: true,
                level: true,
                groups: {
                  orderBy: [{ admissionYear: 'desc' }, { name: 'asc' }],
                  select: { id: true, name: true, admissionYear: true, educationForm: true },
                },
              },
            },
          },
        },
      },
    });

    const tree = faculties.map((faculty) => ({
      id: faculty.id,
      code: faculty.code,
      label: resolveLocalized(faculty.name as LocalizedText, locale as never),
      departments: faculty.departments.map((department) => ({
        id: department.id,
        code: department.code,
        label: resolveLocalized(department.name as LocalizedText, locale as never),
        specialities: department.specialities.map((speciality) => ({
          id: speciality.id,
          code: speciality.code,
          label: resolveLocalized(speciality.name as LocalizedText, locale as never),
          level: speciality.level,
          groups: speciality.groups,
        })),
      })),
    }));

    await this.cache.set(`${TREE_CACHE_KEY}:${locale}`, tree, TREE_TTL_SECONDS);
    return tree;
  }

  private async invalidateTree(): Promise<void> {
    await this.cache.delByPattern(`${TREE_CACHE_KEY}:*`);
  }

  /** Qidiruv indeksi uchun matn (ADR-015) — fanlar va kurslar ham shu usuldan foydalanadi. */
  static buildSearchText(name: LocalizedText, code: string): string {
    const values = Object.values(name).filter(Boolean).join(' ');
    return normalizeForSearch(`${values} ${code}`);
  }
}
