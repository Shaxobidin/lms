/**
 * Maqsad: F-01 (autentifikatsiya va profil) uchun kirish/chiqish kontraktlari.
 */

import { z } from 'zod';
import { codeSchema, emailSchema, localeSchema, phoneSchema, uuidSchema } from './common';
import { ROLE_CODES } from '../rbac/permissions';

/**
 * Parol siyosati (§11). Minimal uzunlik va murakkablik `.env` orqali sozlanadi,
 * ammo sxema eng qat'iy standart qiymatni bilishi kerak — server tomonda
 * qo'shimcha tekshiruv `PasswordPolicyService` da amalga oshiriladi.
 */
export const passwordSchema = z
  .string()
  .min(10, { message: 'validation.password_too_short' })
  .max(128, { message: 'validation.password_too_long' })
  .regex(/[a-z]/, { message: 'validation.password_needs_lowercase' })
  .regex(/[A-Z]/, { message: 'validation.password_needs_uppercase' })
  .regex(/\d/, { message: 'validation.password_needs_digit' });

export const loginSchema = z.object({
  login: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(128),
  /** 2FA yoqilgan bo'lsa — TOTP kodi. */
  totpCode: z
    .string()
    .regex(/^\d{6}$/, { message: 'validation.totp_format' })
    .optional(),
  rememberMe: z.boolean().default(false),
});

export const registerSchema = z
  .object({
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    passwordConfirm: z.string(),
    firstName: z.string().trim().min(2).max(64),
    lastName: z.string().trim().min(2).max(64),
    middleName: z.string().trim().max(64).optional(),
    locale: localeSchema.optional(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: 'validation.password_mismatch',
    path: ['passwordConfirm'],
  });

export const refreshSchema = z.object({
  /** Cookie'da bo'lmagan mijozlar (mobil) uchun tanada ham qabul qilinadi. */
  refreshToken: z.string().min(20).max(2048).optional(),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(512),
    password: passwordSchema,
    passwordConfirm: z.string(),
  })
  .refine((value) => value.password === value.passwordConfirm, {
    message: 'validation.password_mismatch',
    path: ['passwordConfirm'],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: passwordSchema,
    newPasswordConfirm: z.string(),
  })
  .refine((value) => value.newPassword === value.newPasswordConfirm, {
    message: 'validation.password_mismatch',
    path: ['newPasswordConfirm'],
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'validation.password_must_differ',
    path: ['newPassword'],
  });

export const requestOtpSchema = z.object({
  phone: phoneSchema,
  purpose: z.enum(['LOGIN', 'VERIFY_PHONE', 'RESET_PASSWORD']),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: z.string().regex(/^\d{6}$/, { message: 'validation.otp_format' }),
  purpose: z.enum(['LOGIN', 'VERIFY_PHONE', 'RESET_PASSWORD']),
});

export const enableTwoFactorSchema = z.object({
  totpCode: z.string().regex(/^\d{6}$/, { message: 'validation.totp_format' }),
});

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(2).max(64).optional(),
  lastName: z.string().trim().min(2).max(64).optional(),
  middleName: z.string().trim().max(64).nullable().optional(),
  phone: phoneSchema.nullable().optional(),
  birthDate: z.coerce.date().nullable().optional(),
  locale: localeSchema.optional(),
  avatarFileId: uuidSchema.nullable().optional(),
});

export const assignRoleSchema = z.object({
  userId: uuidSchema,
  roleCode: z.enum(ROLE_CODES),
  scopeFacultyId: uuidSchema.nullable().optional(),
  scopeDepartmentId: uuidSchema.nullable().optional(),
  /** R9 (tashqi ekspert) uchun majburiy. */
  expiresAt: z.coerce.date().nullable().optional(),
});

export const createUserSchema = z.object({
  email: emailSchema,
  phone: phoneSchema.optional(),
  firstName: z.string().trim().min(2).max(64),
  lastName: z.string().trim().min(2).max(64),
  middleName: z.string().trim().max(64).optional(),
  locale: localeSchema.optional(),
  roleCode: z.enum(ROLE_CODES),
  scopeFacultyId: uuidSchema.optional(),
  scopeDepartmentId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  /** Bo'sh bo'lsa — tasodifiy parol generatsiya qilinadi va emailga yuboriladi. */
  password: passwordSchema.optional(),
  externalId: codeSchema.optional(),
});

export const listUsersSchema = z.object({
  search: z.string().trim().max(200).optional(),
  roleCode: z.enum(ROLE_CODES).optional(),
  facultyId: uuidSchema.optional(),
  departmentId: uuidSchema.optional(),
  groupId: uuidSchema.optional(),
  status: z.enum(['ACTIVE', 'BLOCKED', 'PENDING']).optional(),
});

// --- Javob tiplari ----------------------------------------------------------

export interface AuthTokens {
  accessToken: string;
  /** Cookie ishlatilmaganda (mobil mijoz) qaytariladi. */
  refreshToken?: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  fullName: string;
  locale: string;
  avatarUrl: string | null;
  roles: string[];
  permissions: string[];
  twoFactorEnabled: boolean;
  scope: {
    facultyIds: string[];
    departmentIds: string[];
    groupIds: string[];
    courseIds: string[];
  };
}

export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ListUsersInput = z.infer<typeof listUsersSchema>;
