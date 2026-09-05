/**
 * Maqsad: PolicyGuard — RBAC + ABAC qarorlarining testlari (§3, §11).
 *
 * Bu tizimning eng muhim xavfsizlik komponenti: har bir endpoint shu
 * guard orqali o'tadi. Testlar ruxsat berish VA rad etish holatlarini
 * bir xil jiddiylik bilan tekshiradi.
 */

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { PermissionKey } from '@lms/shared';
import { PolicyGuard } from './policy.guard';
import { IS_PUBLIC_KEY, PERMISSIONS_KEY, SCOPE_SOURCE_KEY, type ScopeSource } from './decorators';
import type { RequestUser } from './auth.types';
import type { ResourceScope, ScopeResolverService } from './scope-resolver.service';
import { AppException } from '../errors/app.exception';

function makeUser(permissions: PermissionKey[], overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    email: 'user@qdu.uz',
    roles: [],
    permissions,
    sessionId: 'session-1',
    locale: 'uz-Latn',
    scope: {
      facultyIds: ['faculty-1'],
      departmentIds: ['department-1'],
      groupIds: ['group-1'],
      courseIds: ['course-1'],
      enrolledCourseIds: ['course-2'],
      memberGroupIds: ['group-2'],
    },
    ...overrides,
  };
}

function makeContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => () => undefined,
    getClass: () => class {},
  } as unknown as ExecutionContext;
}

function makeReflector(values: {
  isPublic?: boolean;
  permissions?: PermissionKey[];
  scopeSource?: ScopeSource;
}): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === IS_PUBLIC_KEY) return values.isPublic;
      if (key === PERMISSIONS_KEY) return values.permissions;
      if (key === SCOPE_SOURCE_KEY) return values.scopeSource;
      return undefined;
    },
  } as unknown as Reflector;
}

function makeResolver(scope: ResourceScope | null): ScopeResolverService {
  return {
    resolve: jest.fn().mockResolvedValue(scope),
    hasResolver: () => true,
    register: jest.fn(),
  } as unknown as ScopeResolverService;
}

describe('PolicyGuard', () => {
  it('ochiq endpointga ruxsat beradi', async () => {
    const guard = new PolicyGuard(makeReflector({ isPublic: true }), makeResolver(null));
    await expect(guard.canActivate(makeContext({}))).resolves.toBe(true);
  });

  it("foydalanuvchi bo'lmasa 401 qaytaradi", async () => {
    const guard = new PolicyGuard(
      makeReflector({ permissions: ['course:read:all'] }),
      makeResolver(null),
    );

    await expect(guard.canActivate(makeContext({}))).rejects.toMatchObject({
      code: 'UNAUTHENTICATED',
    });
  });

  it('ruxsat talab qilinmagan endpointga autentifikatsiyadan keyin ruxsat beradi', async () => {
    const guard = new PolicyGuard(makeReflector({}), makeResolver(null));
    const request = { user: makeUser([]) };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it("kerakli ruxsat bo'lmasa 403 qaytaradi", async () => {
    const guard = new PolicyGuard(
      makeReflector({ permissions: ['grade:update:own_course'] }),
      makeResolver(null),
    );
    const request = { user: makeUser(['course:read:own']) };

    await expect(guard.canActivate(makeContext(request))).rejects.toBeInstanceOf(AppException);
    await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });

  it('all scope bilan resurs tekshiruvisiz ruxsat beradi', async () => {
    const resolver = makeResolver(null);
    const guard = new PolicyGuard(
      makeReflector({
        permissions: ['course:read:own_course'],
        scopeSource: { resource: 'course', path: 'params.id' },
      }),
      resolver,
    );
    const request = { user: makeUser(['course:read:all']), params: { id: 'course-999' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    // `all` bo'lganda resurs yuklanmasligi kerak — bu ortiqcha so'rov bo'lardi
    expect(resolver.resolve).not.toHaveBeenCalled();
  });

  describe('ABAC tekshiruvi', () => {
    const scopeSource: ScopeSource = { resource: 'course', path: 'params.id' };

    it("o'z kursiga ruxsat beradi", async () => {
      const guard = new PolicyGuard(
        makeReflector({ permissions: ['course:update:own_course'], scopeSource }),
        makeResolver({
          courseId: 'course-1',
          departmentId: 'department-9',
          facultyId: 'faculty-9',
        }),
      );
      const request = {
        user: makeUser(['course:update:own_course']),
        params: { id: 'course-1' },
      };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    });

    it('begona kursni rad etadi', async () => {
      const guard = new PolicyGuard(
        makeReflector({ permissions: ['course:update:own_course'], scopeSource }),
        makeResolver({
          courseId: 'course-777',
          departmentId: 'department-9',
          facultyId: 'faculty-9',
        }),
      );
      const request = {
        user: makeUser(['course:update:own_course']),
        params: { id: 'course-777' },
      };

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it("o'z fakultetidagi resursga ruxsat beradi", async () => {
      const guard = new PolicyGuard(
        makeReflector({ permissions: ['course:read:own_faculty'], scopeSource }),
        makeResolver({
          courseId: 'course-50',
          departmentId: 'department-9',
          facultyId: 'faculty-1',
        }),
      );
      const request = { user: makeUser(['course:read:own_faculty']), params: { id: 'course-50' } };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    });

    it('boshqa fakultetdagi resursni rad etadi', async () => {
      const guard = new PolicyGuard(
        makeReflector({ permissions: ['course:read:own_faculty'], scopeSource }),
        makeResolver({
          courseId: 'course-50',
          departmentId: 'department-9',
          facultyId: 'faculty-99',
        }),
      );
      const request = { user: makeUser(['course:read:own_faculty']), params: { id: 'course-50' } };

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it("own scope: resurs egasi bo'lsa ruxsat beradi", async () => {
      const guard = new PolicyGuard(
        makeReflector({
          permissions: ['submission:read:own'],
          scopeSource: { resource: 'submission', path: 'params.id' },
        }),
        makeResolver({ ownerId: 'user-1', courseId: 'course-77' }),
      );
      const request = { user: makeUser(['submission:read:own']), params: { id: 'sub-1' } };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    });

    it('own scope: boshqa talabaning ishini rad etadi', async () => {
      const guard = new PolicyGuard(
        makeReflector({
          permissions: ['submission:read:own'],
          scopeSource: { resource: 'submission', path: 'params.id' },
        }),
        makeResolver({ ownerId: 'user-2', courseId: 'course-77' }),
      );
      const request = { user: makeUser(['submission:read:own']), params: { id: 'sub-2' } };

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        code: 'FORBIDDEN',
      });
    });

    it('resurs topilmasa 404 qaytaradi', async () => {
      const guard = new PolicyGuard(
        makeReflector({ permissions: ['course:update:own_course'], scopeSource }),
        makeResolver(null),
      );
      const request = { user: makeUser(['course:update:own_course']), params: { id: 'yoq' } };

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
    });

    it('identifikator berilmasa validatsiya xatoligi', async () => {
      const guard = new PolicyGuard(
        makeReflector({ permissions: ['course:update:own_course'], scopeSource }),
        makeResolver({ courseId: 'course-1' }),
      );
      const request = { user: makeUser(['course:update:own_course']), params: {} };

      await expect(guard.canActivate(makeContext(request))).rejects.toMatchObject({
        code: 'VALIDATION_ERROR',
      });
    });

    it("body dan identifikatorni o'qiy oladi", async () => {
      const guard = new PolicyGuard(
        makeReflector({
          permissions: ['quiz:manage:own_course'],
          scopeSource: { resource: 'course', path: 'body.courseId' },
        }),
        makeResolver({ courseId: 'course-1' }),
      );
      const request = {
        user: makeUser(['quiz:manage:own_course']),
        body: { courseId: 'course-1' },
      };

      await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
    });
  });

  it("scope manbasi ko'rsatilmagan ro'yxat endpointini bloklamaydi", async () => {
    // Ro'yxatlar servis qatlamida filtrlanadi (scope-filter.ts)
    const guard = new PolicyGuard(
      makeReflector({ permissions: ['course:read:own_course'] }),
      makeResolver(null),
    );
    const request = { user: makeUser(['course:read:own_course']) };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });

  it('manage ruxsati aniq amalni qamrab oladi', async () => {
    const guard = new PolicyGuard(
      makeReflector({
        permissions: ['lesson:manage:own_course'],
        scopeSource: { resource: 'course', path: 'params.id' },
      }),
      makeResolver({ courseId: 'course-1' }),
    );
    const request = { user: makeUser(['lesson:manage:own_course']), params: { id: 'course-1' } };

    await expect(guard.canActivate(makeContext(request))).resolves.toBe(true);
  });
});
