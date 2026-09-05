/**
 * Maqsad: ABAC filtrlarining testlari — ro'yxatlar qanday cheklanishini tekshiradi.
 *
 * Bu qism xavfsizlik uchun kritik: agar filtr noto'g'ri bo'lsa, dekanat
 * boshqa fakultet talabalarini ko'rib qolishi mumkin.
 */

import type { RequestUser } from './auth.types';
import { courseScopeWhere, effectiveScope, hasGlobalScope, userScopeWhere } from './scope-filter';

function makeUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return {
    id: 'user-1',
    email: 'user@qdu.uz',
    roles: [],
    permissions: [],
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

describe('effectiveScope', () => {
  it("eng keng scope'ni tanlaydi", () => {
    const user = makeUser({
      permissions: ['course:read:own', 'course:read:own_faculty', 'course:read:own_course'],
    });
    expect(effectiveScope(user, 'course', 'read')).toBe('own_faculty');
  });

  it('manage amali read ni ham qamrab oladi', () => {
    const user = makeUser({ permissions: ['course:manage:own_department'] });
    expect(effectiveScope(user, 'course', 'read')).toBe('own_department');
    expect(effectiveScope(user, 'course', 'update')).toBe('own_department');
  });

  it("ruxsat bo'lmasa null qaytaradi", () => {
    expect(effectiveScope(makeUser(), 'course', 'read')).toBeNull();
  });

  it('boshqa resurs ruxsatini hisobga olmaydi', () => {
    const user = makeUser({ permissions: ['grade:read:all'] });
    expect(effectiveScope(user, 'course', 'read')).toBeNull();
  });
});

describe('hasGlobalScope', () => {
  it('all scope uchun true', () => {
    expect(hasGlobalScope(makeUser({ permissions: ['user:read:all'] }), 'user', 'read')).toBe(true);
  });

  it('torroq scope uchun false', () => {
    expect(
      hasGlobalScope(makeUser({ permissions: ['user:read:own_faculty'] }), 'user', 'read'),
    ).toBe(false);
  });
});

describe('courseScopeWhere', () => {
  const user = makeUser();

  it("all uchun filtr qo'shmaydi", () => {
    expect(courseScopeWhere(user, 'all')).toBeNull();
  });

  it("own_faculty uchun fakultet bo'yicha cheklaydi", () => {
    expect(courseScopeWhere(user, 'own_faculty')).toEqual({
      department: { facultyId: { in: ['faculty-1'] } },
    });
  });

  it("own_department uchun kafedra bo'yicha cheklaydi", () => {
    expect(courseScopeWhere(user, 'own_department')).toEqual({
      departmentId: { in: ['department-1'] },
    });
  });

  it("own_course uchun faqat o'qitiladigan kurslar", () => {
    expect(courseScopeWhere(user, 'own_course')).toEqual({ id: { in: ['course-1'] } });
  });

  it("ruxsat bo'lmasa hech narsa ko'rinmaydi", () => {
    // Bu eng muhim holat: null scope hech qachon "hammasi" ga aylanmasligi kerak
    expect(courseScopeWhere(user, null)).toEqual({ id: { in: [] } });
  });
});

describe('userScopeWhere', () => {
  const user = makeUser();

  it("own uchun faqat o'zini qaytaradi", () => {
    expect(userScopeWhere(user, 'own')).toEqual({ id: 'user-1' });
  });

  it("own_group uchun guruh a'zolari bo'yicha cheklaydi", () => {
    const where = userScopeWhere(user, 'own_group') as Record<string, unknown>;
    expect(JSON.stringify(where)).toContain('group-1');
  });

  it("ruxsat bo'lmasa bo'sh natija", () => {
    expect(userScopeWhere(user, null)).toEqual({ id: { in: [] } });
  });

  it('all uchun cheklovsiz', () => {
    expect(userScopeWhere(user, 'all')).toBeNull();
  });
});
