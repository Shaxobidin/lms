/**
 * Maqsad: foydalanuvchilarni boshqarish — yaratish, qidirish, rol berish,
 * profilni yangilash (F-01, F-17).
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  decodeCursor,
  encodeCursor,
  normalizeForSearch,
  type AssignRoleInput,
  type CreateUserInput,
  type CursorPagination,
  type ListUsersInput,
  type RoleCode,
  type UpdateProfileInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/security/crypto.service';
import { CacheService } from '../../common/cache/cache.service';
import { QueueService } from '../../common/queue/queue.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { effectiveScope, userScopeWhere } from '../../common/auth/scope-filter';

/** Ro'yxatlarda qaytariladigan yagona shakl — takrorlanishning oldini oladi. */
const USER_LIST_SELECT = {
  id: true,
  email: true,
  phone: true,
  status: true,
  locale: true,
  lastLoginAt: true,
  createdAt: true,
  profile: {
    select: { firstName: true, lastName: true, middleName: true },
  },
  roles: {
    where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
    select: {
      expiresAt: true,
      role: { select: { code: true, name: true } },
      scopeFaculty: { select: { id: true, name: true } },
      scopeDepartment: { select: { id: true, name: true } },
    },
  },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly cache: CacheService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Foydalanuvchilar ro'yxati — cursor pagination bilan (§8).
   *
   * Scope filtri servis qatlamida qo'llaniladi: dekanat faqat o'z fakulteti
   * talabalarini ko'radi. Guard bu yerda to'sqinlik qilmaydi (ro'yxat endpointi).
   */
  async list(
    filters: ListUsersInput,
    pagination: CursorPagination,
    actor: RequestUser,
  ): Promise<{ data: unknown[]; meta: { nextCursor: string | null; hasMore: boolean } }> {
    const where: Prisma.UserWhereInput = { deletedAt: null };

    if (filters.status) where.status = filters.status;

    if (filters.search) {
      const normalized = normalizeForSearch(filters.search);
      where.OR = [
        { searchText: { contains: normalized } },
        { email: { contains: filters.search.toLowerCase() } },
      ];
    }

    if (filters.roleCode) {
      where.roles = { some: { role: { code: filters.roleCode } } };
    }

    if (filters.groupId) {
      where.studentGroups = { some: { groupId: filters.groupId, leftAt: null } };
    }

    // ABAC: `user:read:own_faculty` bo'lsa — faqat shu fakultet talabalari
    const scopeWhere = userScopeWhere(actor, effectiveScope(actor, 'user', 'read'));
    if (scopeWhere) Object.assign(where, scopeWhere);

    if (filters.facultyId) {
      where.studentGroups = {
        some: {
          leftAt: null,
          group: { speciality: { department: { facultyId: filters.facultyId } } },
        },
      };
    }
    if (filters.departmentId) {
      where.studentGroups = {
        some: { leftAt: null, group: { speciality: { departmentId: filters.departmentId } } },
      };
    }

    const cursor = pagination.cursor ? decodeCursor<{ id: string }>(pagination.cursor) : null;

    const rows = await this.prisma.db.user.findMany({
      where,
      select: USER_LIST_SELECT,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
    });

    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page.map(toUserDto),
      meta: {
        nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null,
        hasMore,
      },
    };
  }

  async findById(id: string) {
    const user = await this.prisma.db.user.findUnique({
      where: { id },
      select: {
        ...USER_LIST_SELECT,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        twoFactorEnabled: true,
        externalId: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            birthDate: true,
            gender: true,
            address: true,
            avatarFileId: true,
          },
        },
        studentGroups: {
          where: { leftAt: null },
          select: {
            group: {
              select: {
                id: true,
                name: true,
                speciality: {
                  select: {
                    id: true,
                    name: true,
                    department: {
                      select: {
                        id: true,
                        name: true,
                        faculty: { select: { id: true, name: true } },
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

    if (!user) throw AppException.notFound('user', id);
    return user;
  }

  /**
   * Administrator tomonidan foydalanuvchi yaratish.
   * Parol berilmasa — tasodifiy generatsiya qilinadi va emailga yuboriladi.
   */
  async create(input: CreateUserInput, actor: RequestUser, ip?: string | null) {
    const existing = await this.prisma.db.user.findFirst({
      where: { OR: [{ email: input.email }, ...(input.phone ? [{ phone: input.phone }] : [])] },
      select: { id: true },
    });
    if (existing) throw AppException.conflict('errors.user_already_exists');

    const role = await this.prisma.db.role.findUnique({
      where: { code: input.roleCode },
      select: { id: true },
    });
    if (!role) throw AppException.notFound('role', input.roleCode);

    // Vaqtinchalik parol foydalanuvchiga emailga yuboriladi va birinchi
    // kirishda almashtirilishi so'raladi.
    const temporaryPassword = input.password ?? this.crypto.generateToken(9);
    const passwordHash = await this.crypto.hashPassword(temporaryPassword);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          status: 'ACTIVE',
          locale: input.locale ?? 'uz-Latn',
          externalId: input.externalId ?? null,
          searchText: normalizeForSearch(
            `${input.lastName} ${input.firstName} ${input.middleName ?? ''} ${input.email}`,
          ),
          profile: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              middleName: input.middleName ?? null,
            },
          },
          roles: {
            create: {
              roleId: role.id,
              scopeFacultyId: input.scopeFacultyId ?? null,
              scopeDepartmentId: input.scopeDepartmentId ?? null,
              grantedById: actor.id,
            },
          },
        },
        select: { id: true, email: true },
      });

      await tx.passwordHistory.create({ data: { userId: created.id, passwordHash } });

      if (input.groupId) {
        await tx.groupMember.create({ data: { groupId: input.groupId, userId: created.id } });
      }

      return created;
    });

    await this.queue.enqueue('email.send', {
      to: input.email,
      templateKey: 'email.account_created',
      locale: input.locale ?? 'uz-Latn',
      params: {
        firstName: input.firstName,
        email: input.email,
        temporaryPassword,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'user.create',
      resource: 'user',
      resourceId: user.id,
      after: { email: input.email, roleCode: input.roleCode },
      ip,
    });

    return { id: user.id, email: user.email };
  }

  async updateProfile(userId: string, input: UpdateProfileInput, actor: RequestUser) {
    const current = await this.prisma.db.userProfile.findUnique({
      where: { userId },
      select: { firstName: true, lastName: true, middleName: true, birthDate: true },
    });
    if (!current) throw AppException.notFound('user', userId);

    const profile = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.userProfile.update({
        where: { userId },
        data: {
          ...(input.firstName !== undefined ? { firstName: input.firstName } : {}),
          ...(input.lastName !== undefined ? { lastName: input.lastName } : {}),
          ...(input.middleName !== undefined ? { middleName: input.middleName } : {}),
          ...(input.birthDate !== undefined ? { birthDate: input.birthDate } : {}),
          ...(input.avatarFileId !== undefined ? { avatarFileId: input.avatarFileId } : {}),
        },
        select: { firstName: true, lastName: true, middleName: true, birthDate: true },
      });

      // Ism o'zgarsa qidiruv indeksi ham yangilanadi (ADR-015)
      if (input.firstName || input.lastName || input.middleName !== undefined) {
        const account = await tx.user.findUnique({
          where: { id: userId },
          select: { email: true },
        });
        await tx.user.update({
          where: { id: userId },
          data: {
            searchText: normalizeForSearch(
              `${updated.lastName} ${updated.firstName} ${updated.middleName ?? ''} ${account?.email ?? ''}`,
            ),
            ...(input.locale ? { locale: input.locale } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
          },
        });
      } else if (input.locale || input.phone !== undefined) {
        await tx.user.update({
          where: { id: userId },
          data: {
            ...(input.locale ? { locale: input.locale } : {}),
            ...(input.phone !== undefined ? { phone: input.phone } : {}),
          },
        });
      }

      return updated;
    });

    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    await this.audit.recordChange({
      actorId: actor.id,
      action: 'user.profile_update',
      resource: 'user',
      resourceId: userId,
      before: current as Record<string, unknown>,
      after: profile as Record<string, unknown>,
    });

    return profile;
  }

  /** Rol berish. R9 (tashqi ekspert) uchun muddat majburiy. */
  async assignRole(input: AssignRoleInput, actor: RequestUser, ip?: string | null) {
    if (input.roleCode === 'EXTERNAL_EXPERT' && !input.expiresAt) {
      throw AppException.validation([
        { field: 'expiresAt', code: 'validation.required_for_temporary_role' },
      ]);
    }

    const role = await this.prisma.db.role.findUnique({
      where: { code: input.roleCode },
      select: { id: true },
    });
    if (!role) throw AppException.notFound('role', input.roleCode);

    // `upsert` ishlatilmaydi: kompozit unikal kalitda NULL bo'lishi mumkin bo'lgan
    // ustunlar bor, Prisma esa bunday kalitga `null` uzatishga ruxsat bermaydi.
    const existingAssignment = await this.prisma.db.userRole.findFirst({
      where: {
        userId: input.userId,
        roleId: role.id,
        scopeFacultyId: input.scopeFacultyId ?? null,
        scopeDepartmentId: input.scopeDepartmentId ?? null,
      },
      select: { id: true },
    });

    if (existingAssignment) {
      await this.prisma.db.userRole.update({
        where: { id: existingAssignment.id },
        data: { expiresAt: input.expiresAt ?? null, deletedAt: null, grantedById: actor.id },
      });
    } else {
      await this.prisma.db.userRole.create({
        data: {
          userId: input.userId,
          roleId: role.id,
          scopeFacultyId: input.scopeFacultyId ?? null,
          scopeDepartmentId: input.scopeDepartmentId ?? null,
          expiresAt: input.expiresAt ?? null,
          grantedById: actor.id,
        },
      });
    }

    // Ruxsatlar keshini darhol bekor qilamiz — yangi rol keyingi so'rovda amal qiladi
    await this.cache.delByPattern(`auth:ctx:${input.userId}:*`);

    await this.audit.record({
      actorId: actor.id,
      action: 'user.role_assigned',
      resource: 'user',
      resourceId: input.userId,
      after: { roleCode: input.roleCode, scope: input.scopeFacultyId ?? input.scopeDepartmentId },
      ip,
    });

    return { assigned: true };
  }

  async revokeRole(userId: string, roleCode: RoleCode, actor: RequestUser) {
    const role = await this.prisma.db.role.findUnique({
      where: { code: roleCode },
      select: { id: true },
    });
    if (!role) throw AppException.notFound('role', roleCode);

    const removed = await this.prisma.db.userRole.updateMany({
      where: { userId, roleId: role.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    await this.audit.record({
      actorId: actor.id,
      action: 'user.role_revoked',
      resource: 'user',
      resourceId: userId,
      before: { roleCode },
    });

    return { revoked: removed.count };
  }

  /** Hisobni bloklash — o'chirish emas (P6: ma'lumot yo'qolmaydi). */
  async setStatus(
    userId: string,
    status: 'ACTIVE' | 'BLOCKED',
    reason: string,
    actor: RequestUser,
  ) {
    if (userId === actor.id) {
      throw AppException.businessRule('errors.cannot_block_self');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { status } });
      if (status === 'BLOCKED') {
        await tx.session.updateMany({
          where: { userId, revoked: false },
          data: { revoked: true, revokedReason: 'account_blocked' },
        });
      }
    });

    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    await this.audit.record({
      actorId: actor.id,
      action: `user.${status.toLowerCase()}`,
      resource: 'user',
      resourceId: userId,
      after: { status, reason },
    });

    return { status };
  }

  /** Faol sessiyalar ro'yxati — foydalanuvchi o'z xavfsizligini nazorat qiladi. */
  async listSessions(userId: string) {
    return this.prisma.db.session.findMany({
      where: { userId, revoked: false, expiresAt: { gt: new Date() } },
      select: { id: true, ip: true, userAgent: true, createdAt: true, expiresAt: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

/** Prisma natijasini API DTO siga aylantiradi. */
function toUserDto(row: {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  locale: string;
  lastLoginAt: Date | null;
  createdAt: Date;
  profile: { firstName: string; lastName: string; middleName: string | null } | null;
  roles: Array<{
    expiresAt: Date | null;
    role: { code: string; name: unknown };
    scopeFaculty: { id: string; name: unknown } | null;
    scopeDepartment: { id: string; name: unknown } | null;
  }>;
}) {
  const firstName = row.profile?.firstName ?? '';
  const lastName = row.profile?.lastName ?? '';
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    status: row.status,
    locale: row.locale,
    firstName,
    lastName,
    middleName: row.profile?.middleName ?? null,
    fullName: [lastName, firstName, row.profile?.middleName].filter(Boolean).join(' '),
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    roles: row.roles.map((item) => ({
      code: item.role.code,
      name: item.role.name,
      expiresAt: item.expiresAt,
      faculty: item.scopeFaculty,
      department: item.scopeDepartment,
    })),
  };
}
