/**
 * Maqsad: RBAC + ABAC qarorlarini qabul qiluvchi yagona nuqta (P3, §3).
 *
 * Algoritm (docs/01-architecture.md §4.2):
 *   1. Endpoint ochiqmi? -> ruxsat
 *   2. Foydalanuvchi autentifikatsiyadan o'tganmi? -> yo'q bo'lsa 401
 *   3. Talab qilingan kalitlardan biri foydalanuvchida bormi? -> yo'q bo'lsa 403
 *   4. Topilgan kalitning scope'i `all` bo'lsa -> ruxsat
 *   5. Aks holda resurs kontekstini yuklab, ABAC tekshiruvi
 */

import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { hasPermission, parsePermission, type PermissionKey, type Scope } from '@lms/shared';
import { AppException } from '../errors/app.exception';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, SCOPE_SOURCE_KEY, type ScopeSource } from './decorators';
import type { RequestUser } from './auth.types';
import { ScopeResolverService, type ResourceScope } from './scope-resolver.service';

@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger(PolicyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly scopeResolver: ScopeResolverService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<PermissionKey[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    const request = context.switchToHttp().getRequest<Request>();
    const user = request.user;

    if (!user) throw AppException.unauthenticated('guard_no_user');

    // Ruxsat talab qilinmagan endpoint (faqat autentifikatsiya yetarli)
    if (!required || required.length === 0) return true;

    const matched = required.find((key) => hasPermission(user.permissions, key));
    if (!matched) {
      this.logger.warn(
        { userId: user.id, required, granted: user.permissions.length },
        "Ruxsat rad etildi: kerakli kalit yo'q",
      );
      throw AppException.forbidden(required.join(' | '));
    }

    const parsed = parsePermission(matched);
    if (!parsed) throw AppException.forbidden(matched);

    // Foydalanuvchining shu resurs/amal uchun ENG KENG scope'ini aniqlaymiz.
    const effectiveScope = this.widestScope(user.permissions, matched);
    if (effectiveScope === 'all') return true;

    const scopeSource = this.reflector.getAllAndOverride<ScopeSource>(SCOPE_SOURCE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Scope manbasi ko'rsatilmagan bo'lsa (masalan, ro'yxat endpointi) — filtrlash
    // servis qatlamida `user.scope` orqali amalga oshiriladi. Guard bu yerda
    // to'sqinlik qilmaydi, aks holda "o'z kurslarim" ro'yxati ham 403 bo'lardi.
    if (!scopeSource) return true;

    const resourceId = extractPath(request, scopeSource.path);
    if (!resourceId || typeof resourceId !== 'string') {
      throw AppException.validation([{ field: scopeSource.path, code: 'validation.required' }]);
    }

    const resourceScope = await this.scopeResolver.resolve(scopeSource.resource, resourceId);
    if (!resourceScope) throw AppException.notFound(scopeSource.resource, resourceId);

    if (!this.matchesScope(effectiveScope, user, resourceScope)) {
      this.logger.warn(
        { userId: user.id, permission: matched, resourceId, scope: effectiveScope },
        "Ruxsat rad etildi: ABAC tekshiruvi o'tmadi",
      );
      throw AppException.forbidden(matched);
    }

    return true;
  }

  /**
   * Foydalanuvchida bir xil resurs+amal uchun bir nechta scope bo'lishi mumkin
   * (masalan, kafedra mudiri ham o'qituvchi). Eng keng scope tanlanadi.
   */
  private widestScope(granted: readonly PermissionKey[], required: PermissionKey): Scope {
    const req = parsePermission(required);
    if (!req) return 'own';

    const order: Scope[] = [
      'all',
      'own_faculty',
      'own_department',
      'own_course',
      'own_group',
      'own',
    ];
    for (const scope of order) {
      const candidate = `${req.resource}:${req.action}:${scope}` as PermissionKey;
      const manageCandidate = `${req.resource}:manage:${scope}` as PermissionKey;
      if (granted.includes(candidate) || granted.includes(manageCandidate)) {
        return scope;
      }
    }
    return req.scope;
  }

  /** ABAC: foydalanuvchi atributlari resurs atributlariga mos keladimi. */
  private matchesScope(scope: Scope, user: RequestUser, resource: ResourceScope): boolean {
    switch (scope) {
      case 'all':
        return true;
      case 'own_faculty':
        return Boolean(resource.facultyId && user.scope.facultyIds.includes(resource.facultyId));
      case 'own_department':
        return Boolean(
          resource.departmentId && user.scope.departmentIds.includes(resource.departmentId),
        );
      case 'own_course':
        return Boolean(resource.courseId && user.scope.courseIds.includes(resource.courseId));
      case 'own_group':
        return Boolean(resource.groupId && user.scope.groupIds.includes(resource.groupId));
      case 'own':
        // Talaba uchun: yo resurs egasi o'zi, yo yozilgan kursga tegishli
        if (resource.ownerId && resource.ownerId === user.id) return true;
        return Boolean(
          resource.courseId && user.scope.enrolledCourseIds.includes(resource.courseId),
        );
      default:
        return false;
    }
  }
}

/** `params.id`, `body.courseId` kabi yo'l bo'yicha qiymat oladi. */
function extractPath(request: Request, path: string): unknown {
  const segments = path.split('.');
  let current: unknown = request;
  for (const segment of segments) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}
