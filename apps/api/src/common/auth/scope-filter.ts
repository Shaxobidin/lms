/**
 * Maqsad: ro'yxat (list) endpointlarida ABAC filtrini qurish uchun yordamchilar.
 *
 * PolicyGuard bitta resursni tekshiradi; ro'yxatlarda esa SO'ROVNING O'ZI
 * cheklanishi kerak (aks holda dekanat butun universitet ma'lumotini olardi).
 * Shuning uchun har bir servis `effectiveScope()` yordamida o'z `where`
 * shartini quradi — bu Prisma tiplarini saqlaydi va noto'g'ri filtrni
 * kompilyatsiya bosqichida ushlaydi.
 */

import { parsePermission, SCOPE_RANK, type Action, type Resource, type Scope } from '@lms/shared';
import type { RequestUser } from './auth.types';

/**
 * Foydalanuvchining ushbu resurs+amal uchun ENG KENG scope'i.
 * Hech qanday ruxsat bo'lmasa `null`.
 */
export function effectiveScope(
  actor: RequestUser,
  resource: Resource,
  action: Action,
): Scope | null {
  // Eng keng scope = SCOPE_RANK bo'yicha eng kichik qiymat
  let best: Scope | null = null;
  for (const key of actor.permissions) {
    const parsed = parsePermission(key);
    if (!parsed || parsed.resource !== resource) continue;
    if (parsed.action !== action && parsed.action !== 'manage') continue;

    if (!best || SCOPE_RANK[parsed.scope] < SCOPE_RANK[best]) {
      best = parsed.scope;
    }
  }

  return best;
}

/** Foydalanuvchi ushbu resurs+amalni butun tizim bo'yicha bajara oladimi. */
export function hasGlobalScope(actor: RequestUser, resource: Resource, action: Action): boolean {
  return effectiveScope(actor, resource, action) === 'all';
}

/**
 * Kurslar ro'yxati uchun `where` fragmenti.
 * Har bir modul o'z tuzilishiga mos fragment qaytaruvchi funksiyaga ega bo'ladi —
 * generik "yo'l orqali" yechim Prisma tiplarini yo'qotgan bo'lardi.
 */
export function courseScopeWhere(
  actor: RequestUser,
  scope: Scope | null,
): Record<string, unknown> | null {
  switch (scope) {
    case null:
      // Ruxsat yo'q — hech narsa ko'rinmasligi uchun imkonsiz shart
      return { id: { in: [] } };
    case 'all':
      return null;
    case 'own_faculty':
      return { department: { facultyId: { in: actor.scope.facultyIds } } };
    case 'own_department':
      return { departmentId: { in: actor.scope.departmentIds } };
    case 'own_course':
      return { id: { in: actor.scope.courseIds } };
    case 'own_group':
      return { enrollments: { some: { groupId: { in: actor.scope.groupIds } } } };
    case 'own':
      return {
        OR: [{ id: { in: actor.scope.enrolledCourseIds } }, { id: { in: actor.scope.courseIds } }],
      };
    default:
      return { id: { in: [] } };
  }
}

/** Foydalanuvchilar ro'yxati uchun `where` fragmenti. */
export function userScopeWhere(
  actor: RequestUser,
  scope: Scope | null,
): Record<string, unknown> | null {
  switch (scope) {
    case null:
      return { id: { in: [] } };
    case 'all':
      return null;
    case 'own_faculty':
      return {
        studentGroups: {
          some: {
            leftAt: null,
            group: { speciality: { department: { facultyId: { in: actor.scope.facultyIds } } } },
          },
        },
      };
    case 'own_department':
      return {
        studentGroups: {
          some: {
            leftAt: null,
            group: { speciality: { departmentId: { in: actor.scope.departmentIds } } },
          },
        },
      };
    case 'own_group':
      return {
        studentGroups: { some: { leftAt: null, groupId: { in: actor.scope.groupIds } } },
      };
    case 'own_course':
      return { enrollments: { some: { courseId: { in: actor.scope.courseIds } } } };
    case 'own':
      return { id: actor.id };
    default:
      return { id: { in: [] } };
  }
}

/** Baholar/topshiriqlar kabi kursga bog'langan resurslar uchun. */
export function courseRelatedScopeWhere(
  actor: RequestUser,
  scope: Scope | null,
  options: { courseField?: string; ownerField?: string } = {},
): Record<string, unknown> | null {
  const courseField = options.courseField ?? 'courseId';
  const ownerField = options.ownerField ?? 'userId';

  switch (scope) {
    case null:
      return { [courseField]: { in: [] } };
    case 'all':
      return null;
    case 'own_faculty':
      return { course: { department: { facultyId: { in: actor.scope.facultyIds } } } };
    case 'own_department':
      return { course: { departmentId: { in: actor.scope.departmentIds } } };
    case 'own_course':
      return { [courseField]: { in: actor.scope.courseIds } };
    case 'own_group':
      return { [ownerField]: { in: [] }, groupId: { in: actor.scope.groupIds } };
    case 'own':
      return { [ownerField]: actor.id };
    default:
      return { [courseField]: { in: [] } };
  }
}
