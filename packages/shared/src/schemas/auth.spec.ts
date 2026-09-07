/**
 * Maqsad: rol berishda doira talabi (dekanat/metodist — fakultet, kafedra
 * mudiri — kafedra, tashqi ekspert — muddat) sxema darajasida tekshirilishi.
 */

import { describe, expect, it } from 'vitest';
import { assignRoleSchema, createUserSchema, roleScopeIssues } from './auth';

const userId = '11111111-1111-4111-8111-111111111111';
const facultyId = '22222222-2222-4222-8222-222222222222';
const departmentId = '33333333-3333-4333-8333-333333333333';

describe('assignRoleSchema — doira talabi', () => {
  it('dekanat roli fakultetsiz rad etiladi', () => {
    const result = assignRoleSchema.safeParse({ userId, roleCode: 'DEANERY' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('validation.scope_faculty_required');
      expect(result.error.issues[0]?.path).toEqual(['scopeFacultyId']);
    }
  });

  it('dekanat va metodist fakultet bilan qabul qilinadi', () => {
    for (const roleCode of ['DEANERY', 'METHODIST'] as const) {
      expect(
        assignRoleSchema.safeParse({ userId, roleCode, scopeFacultyId: facultyId }).success,
      ).toBe(true);
    }
  });

  it('kafedra mudiri kafedrasiz rad etiladi, kafedra bilan qabul qilinadi', () => {
    expect(assignRoleSchema.safeParse({ userId, roleCode: 'DEPARTMENT_HEAD' }).success).toBe(false);
    expect(
      assignRoleSchema.safeParse({
        userId,
        roleCode: 'DEPARTMENT_HEAD',
        scopeDepartmentId: departmentId,
      }).success,
    ).toBe(true);
  });

  it('tashqi ekspert muddatsiz rad etiladi', () => {
    const result = assignRoleSchema.safeParse({ userId, roleCode: 'EXTERNAL_EXPERT' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('validation.required_for_temporary_role');
    }
    expect(
      assignRoleSchema.safeParse({
        userId,
        roleCode: 'EXTERNAL_EXPERT',
        expiresAt: '2030-01-01T00:00:00.000Z',
      }).success,
    ).toBe(true);
  });

  it('doira talab qilmaydigan rollar (o`qituvchi, talaba) doirasiz o`tadi', () => {
    for (const roleCode of ['TEACHER', 'STUDENT', 'TUTOR', 'INSTITUTION_ADMIN'] as const) {
      expect(roleScopeIssues({ roleCode })).toEqual([]);
    }
  });

  it('foydalanuvchi yaratishda ham xuddi shu qoida amal qiladi', () => {
    const base = {
      email: 'dekan2@qdu.uz',
      firstName: 'Test',
      lastName: 'Dekan',
    };
    expect(createUserSchema.safeParse({ ...base, roleCode: 'DEANERY' }).success).toBe(false);
    expect(
      createUserSchema.safeParse({ ...base, roleCode: 'DEANERY', scopeFacultyId: facultyId })
        .success,
    ).toBe(true);
  });
});
