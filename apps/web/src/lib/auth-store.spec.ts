/**
 * Maqsad: rolga qarab boshlang'ich sahifani aniqlash mantig'ini tekshirish.
 *
 * Nima uchun muhim: kirishdan keyin foydalanuvchi O'ZI ISHLATADIGAN bo'limga
 * tushishi kerak (§9 — talaba uchun soddalik, o'qituvchi uchun tezlik).
 * Bu yerda ustuvorlik tartibi ham tekshiriladi: bir nechta rol bo'lganda
 * eng "tor" rol g'olib chiqadi.
 */

import { describe, expect, it } from 'vitest';
import { defaultRouteForRoles } from './auth-store';

describe('defaultRouteForRoles', () => {
  it('har bir rol o`z bo`limiga yo`naltiriladi', () => {
    expect(defaultRouteForRoles(['STUDENT'])).toBe('/my-courses');
    expect(defaultRouteForRoles(['TEACHER'])).toBe('/courses');
    expect(defaultRouteForRoles(['EXTERNAL_EXPERT'])).toBe('/courses');
    expect(defaultRouteForRoles(['TUTOR'])).toBe('/attendance');
    expect(defaultRouteForRoles(['METHODIST'])).toBe('/curriculum');
    expect(defaultRouteForRoles(['DEPARTMENT_HEAD'])).toBe('/analytics');
    expect(defaultRouteForRoles(['DEANERY'])).toBe('/analytics');
    expect(defaultRouteForRoles(['SUPER_ADMIN'])).toBe('/admin/users');
    expect(defaultRouteForRoles(['INSTITUTION_ADMIN'])).toBe('/admin/users');
  });

  it('bir nechta rolda talaba ustuvor (o`quv jarayoni birinchi)', () => {
    expect(defaultRouteForRoles(['SUPER_ADMIN', 'STUDENT'])).toBe('/my-courses');
    expect(defaultRouteForRoles(['TEACHER', 'STUDENT'])).toBe('/my-courses');
  });

  it('o`qituvchi ma`muriy rollardan ustun', () => {
    expect(defaultRouteForRoles(['DEANERY', 'TEACHER'])).toBe('/courses');
  });

  it('noma`lum yoki bo`sh rolda umumiy panel ochiladi', () => {
    expect(defaultRouteForRoles([])).toBe('/dashboard');
    expect(defaultRouteForRoles(['UNKNOWN_ROLE'])).toBe('/dashboard');
  });
});
