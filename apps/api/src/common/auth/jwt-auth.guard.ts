/**
 * Maqsad: JWT access tokenni tekshirish va so'rov kontekstiga foydalanuvchini
 * joylashtirish (ADR-005).
 *
 * Ruxsatlar va ABAC atributlari Redis'da 60 soniya keshlanadi — har bir so'rovda
 * 5+ ta JOIN so'rovini oldini oladi (NF-01: p95 < 300 ms).
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { permissionsForRoles, type PermissionKey, type RoleCode } from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { AppException } from '../errors/app.exception';
import { CacheService } from '../cache/cache.service';
import { PrismaService } from '../prisma/prisma.service';
import { IS_PUBLIC_KEY } from './decorators';
import {
  EMPTY_SCOPE,
  type AccessTokenPayload,
  type RequestUser,
  type UserScope,
} from './auth.types';

/** Kesh TTL — xavfsizlik (rol o'zgarishi tez ta'sir qilishi) va unumdorlik muvozanati. */
const USER_CONTEXT_TTL_SECONDS = 60;

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly cache: CacheService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request);

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Ochiq endpointlarda ham token bo'lsa uni o'qiymiz (masalan, mehmon va
    // ro'yxatdan o'tgan foydalanuvchi uchun turli katalog ko'rinishi).
    if (!token) {
      if (isPublic) return true;
      throw AppException.unauthenticated('missing_token');
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch (error) {
      if (isPublic) return true;
      throw new AppException({
        code: 'UNAUTHENTICATED',
        messageKey: 'errors.token_invalid',
        context: { reason: (error as Error).message },
        cause: error,
      });
    }

    const user = await this.loadUserContext(payload);
    if (!user) {
      if (isPublic) return true;
      throw AppException.unauthenticated('session_revoked');
    }

    request.user = user;
    return true;
  }

  /**
   * Foydalanuvchi kontekstini keshdan yoki bazadan yuklaydi.
   * Sessiya bekor qilingan bo'lsa `null` qaytaradi (chiqish, reuse detection).
   */
  private async loadUserContext(payload: AccessTokenPayload): Promise<RequestUser | null> {
    const cacheKey = `auth:ctx:${payload.sub}:${payload.sid}`;
    const cached = await this.cache.get<RequestUser>(cacheKey);
    if (cached) return cached;

    const db = this.prisma.db;

    const session = await db.session.findFirst({
      where: { id: payload.sid, userId: payload.sub, revoked: false },
      select: { id: true },
    });
    if (!session) return null;

    const account = await db.user.findFirst({
      where: { id: payload.sub, status: 'ACTIVE' },
      select: {
        id: true,
        email: true,
        locale: true,
        roles: {
          where: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
          },
          select: {
            scopeFacultyId: true,
            scopeDepartmentId: true,
            role: { select: { code: true } },
          },
        },
      },
    });
    if (!account) return null;

    const roles = account.roles.map((item) => item.role.code as RoleCode);
    const permissions = permissionsForRoles(roles) as PermissionKey[];
    const scope = await this.buildScope(account.id, account.roles);

    const user: RequestUser = {
      id: account.id,
      email: account.email,
      roles,
      permissions,
      sessionId: payload.sid,
      scope,
      locale: account.locale,
    };

    await this.cache.set(cacheKey, user, USER_CONTEXT_TTL_SECONDS);
    return user;
  }

  /**
   * ABAC atributlarini yig'adi. Uchta parallel so'rov — ketma-ket emas,
   * shuning uchun kechikish eng sekin so'rov bilan cheklanadi.
   */
  private async buildScope(
    userId: string,
    roleRows: Array<{ scopeFacultyId: string | null; scopeDepartmentId: string | null }>,
  ): Promise<UserScope> {
    const db = this.prisma.db;

    const [taught, curated, enrolled, memberships] = await Promise.all([
      db.courseTeacher.findMany({ where: { userId }, select: { courseId: true } }),
      db.group.findMany({ where: { curatorId: userId }, select: { id: true } }),
      db.enrollment.findMany({
        where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { courseId: true },
      }),
      db.groupMember.findMany({ where: { userId, leftAt: null }, select: { groupId: true } }),
    ]);

    return {
      ...EMPTY_SCOPE,
      facultyIds: unique(roleRows.map((r) => r.scopeFacultyId)),
      departmentIds: unique(roleRows.map((r) => r.scopeDepartmentId)),
      groupIds: curated.map((row) => row.id),
      courseIds: taught.map((row) => row.courseId),
      enrolledCourseIds: enrolled.map((row) => row.courseId),
      memberGroupIds: memberships.map((row) => row.groupId),
    };
  }
}

function unique(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))));
}

/** SSE endpointi — brauzerning `EventSource` API si sarlavha qo'sha olmaydi. */
const SSE_PATH_SUFFIX = '/stream';

function extractBearerToken(request: Request): string | null {
  const header = request.headers.authorization;
  if (header) {
    const [scheme, value] = header.split(' ');
    if (scheme?.toLowerCase() === 'bearer' && value) return value.trim();
  }

  // Faqat SSE oqimi uchun tokenni so'rov parametridan qabul qilamiz.
  // Boshqa endpointlarda bunga yo'l qo'yilmaydi: URL loglarga tushadi va
  // Referer sarlavhasi orqali sizib chiqishi mumkin (§11).
  if (request.path.endsWith(SSE_PATH_SUFFIX)) {
    const queryToken = (request.query as Record<string, unknown>)['access_token'];
    if (typeof queryToken === 'string' && queryToken.length > 0) return queryToken;
  }

  return null;
}
