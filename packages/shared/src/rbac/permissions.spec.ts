/**
 * Maqsad: ruxsatlar modelining testlari — xavfsizlikning eng kritik qismi (§11).
 */

import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  hasPermission,
  parsePermission,
  permissionsForRoles,
  ROLE_DEFINITIONS,
  ROLE_PERMISSION_MATRIX,
  type PermissionKey,
} from './permissions';

describe('parsePermission', () => {
  it("to'g'ri kalitni ajratadi", () => {
    expect(parsePermission('course:update:own_course')).toEqual({
      resource: 'course',
      action: 'update',
      scope: 'own_course',
    });
  });

  it("noto'g'ri kalitni rad etadi", () => {
    expect(parsePermission('course:update')).toBeNull();
    expect(parsePermission('unknown:update:all')).toBeNull();
    expect(parsePermission('course:fly:all')).toBeNull();
    expect(parsePermission('course:update:galaxy')).toBeNull();
  });
});

describe('hasPermission', () => {
  it('aniq mos kelgan ruxsatni beradi', () => {
    expect(hasPermission(['grade:update:own_course'], 'grade:update:own_course')).toBe(true);
  });

  it('kengroq scope torroq scope ni qamrab oladi', () => {
    expect(hasPermission(['grade:update:all'], 'grade:update:own_course')).toBe(true);
    expect(hasPermission(['grade:update:own_faculty'], 'grade:update:own')).toBe(true);
  });

  it('torroq scope kengroq scope ni QAMRAMAYDI', () => {
    expect(hasPermission(['grade:update:own'], 'grade:update:all')).toBe(false);
    expect(hasPermission(['grade:update:own_course'], 'grade:update:own_faculty')).toBe(false);
  });

  it('manage barcha CRUD amallarni qamrab oladi', () => {
    expect(hasPermission(['course:manage:own_course'], 'course:update:own_course')).toBe(true);
    expect(hasPermission(['course:manage:own_course'], 'course:delete:own_course')).toBe(true);
    expect(hasPermission(['course:manage:own_course'], 'course:read:own')).toBe(true);
  });

  it("boshqa resursga o'tmaydi", () => {
    expect(hasPermission(['course:manage:all'], 'grade:update:all')).toBe(false);
  });

  it("bo'sh ro'yxatda hech narsa bermaydi", () => {
    expect(hasPermission([], 'course:read:own')).toBe(false);
  });

  it("Set ko'rinishidagi ruxsatlar bilan ham ishlaydi", () => {
    const granted = new Set<PermissionKey>(['course:read:all']);
    expect(hasPermission(granted, 'course:read:own')).toBe(true);
  });
});

describe('rol matritsasi', () => {
  it('barcha rollar uchun ruxsatlar aniqlangan', () => {
    for (const role of ROLE_DEFINITIONS) {
      expect(ROLE_PERMISSION_MATRIX[role.code]).toBeDefined();
    }
  });

  it('matritsadagi barcha kalitlar formatga mos', () => {
    for (const [role, keys] of Object.entries(ROLE_PERMISSION_MATRIX)) {
      for (const key of keys) {
        expect(parsePermission(key), `${role} -> ${key}`).not.toBeNull();
      }
    }
  });

  it("talaba boshqa foydalanuvchining bahosini o'zgartira olmaydi", () => {
    const student = permissionsForRoles(['STUDENT']);
    expect(hasPermission(student, 'grade:update:own')).toBe(false);
    expect(hasPermission(student, 'grade:update:all')).toBe(false);
    expect(hasPermission(student, 'grade:read:own')).toBe(true);
    expect(hasPermission(student, 'grade:read:all')).toBe(false);
  });

  it("o'qituvchi tizim sozlamalariga tegmaydi", () => {
    const teacher = permissionsForRoles(['TEACHER']);
    expect(hasPermission(teacher, 'system:manage:all')).toBe(false);
    expect(hasPermission(teacher, 'user:manage:all')).toBe(false);
    expect(hasPermission(teacher, 'grade:update:own_course')).toBe(true);
  });

  it("tashqi ekspert faqat o'qish va baholash bilan cheklangan", () => {
    const expert = permissionsForRoles(['EXTERNAL_EXPERT']);
    expect(hasPermission(expert, 'submission:grade:own_course')).toBe(true);
    expect(hasPermission(expert, 'course:update:own_course')).toBe(false);
    expect(hasPermission(expert, 'course:delete:own_course')).toBe(false);
  });

  it("mehmon faqat kurslar katalogini ko'radi", () => {
    const guest = permissionsForRoles(['GUEST']);
    expect(hasPermission(guest, 'course:read:all')).toBe(true);
    expect(hasPermission(guest, 'enrollment:create:own')).toBe(false);
  });

  it('bir nechta rol ruxsatlari birlashtiriladi', () => {
    const combined = permissionsForRoles(['TEACHER', 'TUTOR']);
    expect(hasPermission(combined, 'grade:update:own_course')).toBe(true);
    expect(hasPermission(combined, 'attendance:update:own_group')).toBe(true);
  });

  it('ALL_PERMISSIONS takrorlanmas va saralangan', () => {
    const unique = new Set(ALL_PERMISSIONS);
    expect(unique.size).toBe(ALL_PERMISSIONS.length);
    expect([...ALL_PERMISSIONS]).toEqual([...ALL_PERMISSIONS].sort());
  });
});
