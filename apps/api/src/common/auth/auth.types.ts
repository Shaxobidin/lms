/**
 * Maqsad: autentifikatsiya kontekstining tiplari — guard'lar, dekoratorlar va
 * servislar orasidagi shartnoma.
 */

import type { PermissionKey, RoleCode } from '@lms/shared';

/** JWT access token ichidagi ma'lumot. Iloji boricha kichik saqlanadi. */
export interface AccessTokenPayload {
  /** subject — foydalanuvchi id si. */
  sub: string;
  email: string;
  roles: RoleCode[];
  /** Sessiya identifikatori — bekor qilishni tekshirish uchun. */
  sid: string;
  iat?: number;
  exp?: number;
}

/**
 * So'rov davomida mavjud bo'lgan foydalanuvchi konteksti.
 * `permissions` va `scope` Redis keshidan yuklanadi (60 s TTL).
 */
export interface RequestUser {
  id: string;
  email: string;
  roles: RoleCode[];
  permissions: PermissionKey[];
  sessionId: string;
  /** ABAC atributlari — PolicyGuard shular asosida qaror qabul qiladi. */
  scope: UserScope;
  locale: string;
}

export interface UserScope {
  /** Dekanat/metodist rolidan kelgan fakultetlar. */
  facultyIds: string[];
  /** Kafedra mudiri rolidan kelgan kafedralar. */
  departmentIds: string[];
  /** Tyutor sifatida kurator bo'lgan guruhlar. */
  groupIds: string[];
  /** O'qituvchi sifatida biriktirilgan kurslar. */
  courseIds: string[];
  /** Talaba sifatida yozilgan kurslar. */
  enrolledCourseIds: string[];
  /** Talaba a'zo bo'lgan guruh. */
  memberGroupIds: string[];
}

export const EMPTY_SCOPE: UserScope = {
  facultyIds: [],
  departmentIds: [],
  groupIds: [],
  courseIds: [],
  enrolledCourseIds: [],
  memberGroupIds: [],
};

declare module 'express' {
  interface Request {
    user?: RequestUser;
    traceId?: string;
  }
}
