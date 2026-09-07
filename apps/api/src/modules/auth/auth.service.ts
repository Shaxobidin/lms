/**
 * Maqsad: F-01 — autentifikatsiya biznes-mantig'i.
 *
 * Qamrov: email/parol kirish, 2FA (TOTP), refresh token rotatsiyasi va reuse
 * detection (ADR-005), parol siyosati, brute-force himoyasi, OTP, parolni tiklash.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { authenticator } from 'otplib';
import { randomUUID } from 'node:crypto';
import {
  permissionsForRoles,
  type AuthTokens,
  type AuthenticatedUser,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
  type RoleCode,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteSettingsService } from '../../common/settings/site-settings.service';
import { CacheService } from '../../common/cache/cache.service';
import { CryptoService } from '../../common/security/crypto.service';
import { RateLimitService } from '../../common/http/rate-limit.service';
import { QueueService } from '../../common/queue/queue.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import { parseTtlSeconds } from '../../common/auth/ttl';

export { parseTtlSeconds };
import type { AccessTokenPayload } from '../../common/auth/auth.types';

export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
  traceId?: string | null;
}

export interface LoginResult {
  tokens: AuthTokens;
  user: AuthenticatedUser;
  refreshToken: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly crypto: CryptoService,
    private readonly cache: CacheService,
    private readonly rateLimit: RateLimitService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly siteSettings: SiteSettingsService,
  ) {
    // TOTP: 30 soniyalik oyna, oldingi/keyingi oynaga ham ruxsat
    // (foydalanuvchi soati biroz farq qilishi mumkin)
    authenticator.options = { window: 1, step: 30 };
  }

  // --- Kirish ---------------------------------------------------------------

  async login(input: LoginInput, context: LoginContext): Promise<LoginResult> {
    const identifier = `${context.ip ?? 'unknown'}:${input.login.toLowerCase()}`;
    this.rateLimit.assert(await this.rateLimit.checkAuth(identifier));

    const user = await this.prisma.db.user.findFirst({
      where: {
        OR: [{ email: input.login.toLowerCase() }, { phone: input.login }],
      },
      select: {
        id: true,
        email: true,
        passwordHash: true,
        status: true,
        twoFactorEnabled: true,
        totpSecret: true,
        locale: true,
        failedLoginCount: true,
        lockedUntil: true,
      },
    });

    // Foydalanuvchi topilmasa ham parol tekshiruvi vaqtiga yaqin vaqt sarflaymiz —
    // javob vaqti bo'yicha email mavjudligini aniqlashning oldini oladi.
    if (!user?.passwordHash) {
      await this.crypto.verifyPassword(
        '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
        input.password,
      );
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        messageKey: 'errors.invalid_credentials',
      });
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppException({
        code: 'ACCOUNT_LOCKED',
        messageKey: 'errors.account_locked',
        context: { until: user.lockedUntil.toISOString() },
      });
    }

    const passwordValid = await this.crypto.verifyPassword(user.passwordHash, input.password);
    if (!passwordValid) {
      await this.registerFailedAttempt(user.id, user.failedLoginCount);
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        messageKey: 'errors.invalid_credentials',
      });
    }

    if (user.status !== 'ACTIVE') {
      throw new AppException({
        code: 'FORBIDDEN',
        messageKey: `errors.account_${user.status.toLowerCase()}`,
      });
    }

    // 2FA tekshiruvi
    if (user.twoFactorEnabled) {
      if (!input.totpCode) {
        throw new AppException({
          code: 'TWO_FACTOR_REQUIRED',
          messageKey: 'errors.two_factor_required',
        });
      }
      if (!this.verifyTotp(user.totpSecret, input.totpCode)) {
        await this.registerFailedAttempt(user.id, user.failedLoginCount);
        throw new AppException({
          code: 'INVALID_CREDENTIALS',
          messageKey: 'errors.invalid_totp',
        });
      }
    }

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });
    await this.rateLimit.reset(identifier);

    const session = await this.createSession(user.id, context, input.rememberMe);
    const profile = await this.buildAuthenticatedUser(user.id);

    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      resource: 'user',
      resourceId: user.id,
      ip: context.ip,
      userAgent: context.userAgent,
      traceId: context.traceId,
    });

    return {
      tokens: await this.issueAccessToken(
        user.id,
        user.email,
        profile.roles as RoleCode[],
        session.id,
      ),
      user: profile,
      refreshToken: session.refreshToken,
    };
  }

  /**
   * Tashqi identifikatsiya (LTI 1.3) orqali kirish: parol tekshirilmaydi —
   * platforma imzolagan token allaqachon tekshirilgan. Sessiya va audit
   * oddiy kirish bilan bir xil, faqat `provider` belgilanadi.
   */
  async loginExternal(
    userId: string,
    provider: string,
    context: LoginContext,
  ): Promise<LoginResult> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, status: true },
    });
    if (!user) throw AppException.notFound('user', userId);
    if (user.status !== 'ACTIVE') throw AppException.unauthenticated('account_inactive');

    await this.prisma.db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    const session = await this.createSession(user.id, context, false);
    const profile = await this.buildAuthenticatedUser(user.id);

    await this.audit.record({
      actorId: user.id,
      action: 'auth.login',
      resource: 'user',
      resourceId: user.id,
      after: { provider },
      ip: context.ip,
      userAgent: context.userAgent,
      traceId: context.traceId,
    });

    return {
      tokens: await this.issueAccessToken(
        user.id,
        user.email,
        profile.roles as RoleCode[],
        session.id,
      ),
      user: profile,
      refreshToken: session.refreshToken,
    };
  }

  /**
   * Refresh token rotatsiyasi + reuse detection (ADR-005).
   *
   * Agar allaqachon ishlatilgan (rotatsiya qilingan) token qayta kelsa —
   * bu o'g'irlik alomati: butun token oilasi bekor qilinadi va foydalanuvchi
   * barcha qurilmalardan chiqariladi.
   */
  async refresh(refreshToken: string, context: LoginContext): Promise<LoginResult> {
    const tokenHash = this.crypto.hashToken(refreshToken);

    const session = await this.prisma.db.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      select: {
        id: true,
        userId: true,
        family: true,
        revoked: true,
        expiresAt: true,
        user: { select: { email: true, status: true } },
      },
    });

    if (!session) throw AppException.unauthenticated('refresh_token_unknown');

    if (session.revoked) {
      this.logger.error(
        { userId: session.userId, family: session.family },
        'Refresh token qayta ishlatildi — butun oila bekor qilinmoqda',
      );
      await this.revokeFamily(session.family, 'token_reuse_detected');
      await this.audit.record({
        actorId: session.userId,
        action: 'auth.token_reuse_detected',
        resource: 'session',
        resourceId: session.id,
        ip: context.ip,
        traceId: context.traceId,
      });
      throw AppException.unauthenticated('refresh_token_reused');
    }

    if (session.expiresAt < new Date() || session.user.status !== 'ACTIVE') {
      await this.revokeSession(session.id, 'expired');
      throw AppException.unauthenticated('refresh_token_expired');
    }

    // Eski sessiyani bekor qilamiz va shu oilada yangisini yaratamiz
    await this.revokeSession(session.id, 'rotated');
    const next = await this.createSession(session.userId, context, true, session.family);
    const profile = await this.buildAuthenticatedUser(session.userId);

    return {
      tokens: await this.issueAccessToken(
        session.userId,
        session.user.email,
        profile.roles as RoleCode[],
        next.id,
      ),
      user: profile,
      refreshToken: next.refreshToken,
    };
  }

  async logout(sessionId: string, userId: string): Promise<void> {
    await this.revokeSession(sessionId, 'logout');
    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
  }

  /** Barcha qurilmalardan chiqish. */
  async logoutAll(userId: string): Promise<number> {
    const result = await this.prisma.db.session.updateMany({
      where: { userId, revoked: false },
      data: { revoked: true, revokedReason: 'logout_all' },
    });
    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    return result.count;
  }

  // --- Ro'yxatdan o'tish va parol -------------------------------------------

  async register(input: RegisterInput, context: LoginContext): Promise<{ userId: string }> {
    // Sayt boshqaruvi → Ro'yxatdan o'tish (F-17): yoqilganmi, domen, beriladigan rol
    if (!(await this.siteSettings.getBoolean('registration.enabled'))) {
      throw AppException.businessRule('errors.registration_disabled');
    }
    const allowedDomains = await this.siteSettings.getList('registration.allowedEmailDomains');
    const emailDomain = input.email.split('@')[1]?.toLowerCase() ?? '';
    if (
      allowedDomains.length > 0 &&
      !allowedDomains.some((domain) => domain.toLowerCase().replace(/^@/, '') === emailDomain)
    ) {
      throw AppException.businessRule('errors.email_domain_not_allowed', {
        domain: emailDomain,
      });
    }

    const existing = await this.prisma.db.user.findFirst({
      where: { email: input.email },
      select: { id: true },
    });
    if (existing) throw AppException.conflict('errors.email_already_used');

    this.assertPasswordPolicy(input.password, await this.passwordMinLengthOverride());

    const defaultRoleCode = await this.siteSettings.get<string>('registration.defaultRole');
    const roleCode = defaultRoleCode === 'GUEST' ? 'GUEST' : 'STUDENT';
    const studentRole = await this.prisma.db.role.findUnique({
      where: { code: roleCode },
      select: { id: true },
    });
    if (!studentRole) {
      throw new AppException({
        code: 'INTERNAL_ERROR',
        messageKey: 'errors.role_catalog_missing',
        context: { role: roleCode },
      });
    }

    const passwordHash = await this.crypto.hashPassword(input.password);

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email: input.email,
          phone: input.phone ?? null,
          passwordHash,
          // Ochiq ro'yxatdan o'tish — email tasdiqlanmaguncha PENDING
          status: 'PENDING',
          locale: input.locale ?? this.config.get('TENANT_DEFAULT_LOCALE', { infer: true }),
          searchText: buildUserSearchText(input.firstName, input.lastName, input.email),
          profile: {
            create: {
              firstName: input.firstName,
              lastName: input.lastName,
              middleName: input.middleName ?? null,
            },
          },
          roles: { create: { roleId: studentRole.id } },
        },
        select: { id: true },
      });

      await tx.passwordHistory.create({ data: { userId: created.id, passwordHash } });
      return created;
    });

    const verificationToken = this.crypto.generateToken();
    await this.cache.set(
      `verify:email:${this.crypto.hashToken(verificationToken)}`,
      user.id,
      86_400,
    );

    await this.queue.enqueue('email.send', {
      to: input.email,
      templateKey: 'email.verify_address',
      locale: input.locale ?? 'uz-Latn',
      params: {
        link: `${this.config.get('WEB_PUBLIC_URL', { infer: true })}/verify-email?token=${verificationToken}`,
        firstName: input.firstName,
      },
    });

    await this.audit.record({
      actorId: user.id,
      action: 'auth.register',
      resource: 'user',
      resourceId: user.id,
      ip: context.ip,
      traceId: context.traceId,
    });

    return { userId: user.id };
  }

  async verifyEmail(token: string): Promise<void> {
    const cacheKey = `verify:email:${this.crypto.hashToken(token)}`;
    const userId = await this.cache.get<string>(cacheKey);
    if (!userId) throw AppException.businessRule('errors.verification_token_invalid');

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { status: 'ACTIVE', emailVerifiedAt: new Date() },
    });
    await this.cache.del(cacheKey);
  }

  async requestPasswordReset(email: string): Promise<void> {
    const user = await this.prisma.db.user.findFirst({
      where: { email: email.toLowerCase() },
      select: { id: true, locale: true, profile: { select: { firstName: true } } },
    });

    // Foydalanuvchi mavjudligini oshkor qilmaymiz — javob har doim bir xil
    if (!user) return;

    const token = this.crypto.generateToken();
    await this.prisma.db.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: this.crypto.hashToken(token),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await this.queue.enqueue('email.send', {
      to: email,
      templateKey: 'email.reset_password',
      locale: user.locale,
      params: {
        link: `${this.config.get('WEB_PUBLIC_URL', { infer: true })}/reset-password?token=${token}`,
        firstName: user.profile?.firstName ?? '',
      },
    });
  }

  async resetPassword(input: ResetPasswordInput): Promise<void> {
    const tokenHash = this.crypto.hashToken(input.token);
    const record = await this.prisma.db.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, userId: true },
    });
    if (!record) throw AppException.businessRule('errors.reset_token_invalid');

    this.assertPasswordPolicy(input.password, await this.passwordMinLengthOverride());
    await this.assertPasswordNotReused(record.userId, input.password);

    const passwordHash = await this.crypto.hashPassword(input.password);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.passwordHistory.create({ data: { userId: record.userId, passwordHash } });
      // Parol o'zgarganda barcha sessiyalar bekor qilinadi (§11)
      await tx.session.updateMany({
        where: { userId: record.userId, revoked: false },
        data: { revoked: true, revokedReason: 'password_changed' },
      });
    });

    await this.cache.delByPattern(`auth:ctx:${record.userId}:*`);
    await this.audit.record({
      actorId: record.userId,
      action: 'auth.password_reset',
      resource: 'user',
      resourceId: record.userId,
    });
  }

  async changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) throw AppException.notFound('user', userId);

    const valid = await this.crypto.verifyPassword(user.passwordHash, input.currentPassword);
    if (!valid) {
      throw new AppException({
        code: 'INVALID_CREDENTIALS',
        messageKey: 'errors.current_password_invalid',
      });
    }

    this.assertPasswordPolicy(input.newPassword, await this.passwordMinLengthOverride());
    await this.assertPasswordNotReused(userId, input.newPassword);

    const passwordHash = await this.crypto.hashPassword(input.newPassword);
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { passwordHash } });
      await tx.passwordHistory.create({ data: { userId, passwordHash } });
    });

    await this.audit.record({
      actorId: userId,
      action: 'auth.password_changed',
      resource: 'user',
      resourceId: userId,
    });
  }

  // --- Ikki bosqichli tasdiqlash (TOTP) -------------------------------------

  /** 2FA sozlash: sirni yaratadi va otpauth:// URI qaytaradi (QR uchun). */
  async beginTwoFactorSetup(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { email: true, twoFactorEnabled: true },
    });
    if (!user) throw AppException.notFound('user', userId);
    if (user.twoFactorEnabled) throw AppException.conflict('errors.two_factor_already_enabled');

    const secret = authenticator.generateSecret();
    // Sir tasdiqlanmaguncha bazaga yozilmaydi — faqat keshda 10 daqiqa
    await this.cache.set(`2fa:setup:${userId}`, secret, 600);

    const issuer = this.config.get('TENANT_SHORT_NAME', { infer: true });
    return {
      secret,
      otpauthUrl: authenticator.keyuri(user.email, issuer, secret),
    };
  }

  async confirmTwoFactorSetup(userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    const secret = await this.cache.get<string>(`2fa:setup:${userId}`);
    if (!secret) throw AppException.businessRule('errors.two_factor_setup_expired');

    if (!authenticator.check(code, secret)) {
      throw new AppException({ code: 'INVALID_CREDENTIALS', messageKey: 'errors.invalid_totp' });
    }

    // Tiklash kodlari — telefon yo'qolganda kirish uchun
    const recoveryCodes = Array.from({ length: 8 }, () => this.crypto.generateToken(6));
    const hashedCodes = recoveryCodes.map((code) => this.crypto.hashToken(code));

    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: true,
        totpSecret: this.crypto.encrypt(secret),
      },
    });
    await this.cache.set(`2fa:recovery:${userId}`, hashedCodes, 0);
    await this.cache.del(`2fa:setup:${userId}`);
    await this.cache.delByPattern(`auth:ctx:${userId}:*`);

    await this.audit.record({
      actorId: userId,
      action: 'auth.two_factor_enabled',
      resource: 'user',
      resourceId: userId,
    });

    return { recoveryCodes };
  }

  async disableTwoFactor(userId: string, code: string): Promise<void> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { totpSecret: true, twoFactorEnabled: true },
    });
    if (!user?.twoFactorEnabled) throw AppException.conflict('errors.two_factor_not_enabled');
    if (!this.verifyTotp(user.totpSecret, code)) {
      throw new AppException({ code: 'INVALID_CREDENTIALS', messageKey: 'errors.invalid_totp' });
    }

    await this.prisma.db.user.update({
      where: { id: userId },
      data: { twoFactorEnabled: false, totpSecret: null },
    });
    await this.cache.del(`2fa:recovery:${userId}`);
    await this.cache.delByPattern(`auth:ctx:${userId}:*`);
  }

  // --- Yordamchilar ---------------------------------------------------------

  private verifyTotp(encryptedSecret: string | null, code: string): boolean {
    if (!encryptedSecret) return false;
    try {
      return authenticator.check(code, this.crypto.decrypt(encryptedSecret));
    } catch (error) {
      this.logger.error({ error: (error as Error).message }, "TOTP sirini ochib bo'lmadi");
      return false;
    }
  }

  private async registerFailedAttempt(userId: string, currentCount: number): Promise<void> {
    const maxAttempts = this.config.get('LOGIN_MAX_ATTEMPTS', { infer: true });
    const lockoutMinutes = this.config.get('LOGIN_LOCKOUT_MINUTES', { infer: true });
    const next = currentCount + 1;

    await this.prisma.db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: next,
        lockedUntil: next >= maxAttempts ? new Date(Date.now() + lockoutMinutes * 60_000) : null,
      },
    });
  }

  private async createSession(
    userId: string,
    context: LoginContext,
    rememberMe: boolean,
    family?: string,
  ): Promise<{ id: string; refreshToken: string }> {
    const refreshToken = this.crypto.generateToken(48);
    const ttlDays = rememberMe ? 30 : 1;

    const session = await this.prisma.db.session.create({
      data: {
        userId,
        refreshTokenHash: this.crypto.hashToken(refreshToken),
        family: family ?? randomUUID(),
        ip: context.ip ?? null,
        userAgent: context.userAgent?.slice(0, 512) ?? null,
        expiresAt: new Date(Date.now() + ttlDays * 86_400_000),
      },
      select: { id: true },
    });

    return { id: session.id, refreshToken };
  }

  private async revokeSession(sessionId: string, reason: string): Promise<void> {
    await this.prisma.db.session.update({
      where: { id: sessionId },
      data: { revoked: true, revokedReason: reason },
    });
  }

  private async revokeFamily(family: string, reason: string): Promise<void> {
    const sessions = await this.prisma.db.session.findMany({
      where: { family },
      select: { userId: true },
      take: 1,
    });
    await this.prisma.db.session.updateMany({
      where: { family, revoked: false },
      data: { revoked: true, revokedReason: reason },
    });
    const userId = sessions[0]?.userId;
    if (userId) await this.cache.delByPattern(`auth:ctx:${userId}:*`);
  }

  private async issueAccessToken(
    userId: string,
    email: string,
    roles: RoleCode[],
    sessionId: string,
  ): Promise<AuthTokens> {
    const payload: AccessTokenPayload = { sub: userId, email, roles, sid: sessionId };
    const accessToken = await this.jwt.signAsync(payload);
    return {
      accessToken,
      expiresIn: parseTtlSeconds(this.config.get('JWT_ACCESS_TTL', { infer: true })),
      tokenType: 'Bearer',
    };
  }

  /** Frontend uchun to'liq foydalanuvchi profili (ruxsatlar va scope bilan). */
  async buildAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        locale: true,
        twoFactorEnabled: true,
        profile: {
          select: {
            firstName: true,
            lastName: true,
            middleName: true,
            avatar: { select: { objectKey: true } },
          },
        },
        roles: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          select: {
            scopeFacultyId: true,
            scopeDepartmentId: true,
            role: { select: { code: true } },
          },
        },
      },
    });
    if (!user) throw AppException.notFound('user', userId);

    const roles = user.roles.map((item) => item.role.code as RoleCode);

    const [taught, curated, enrolled, memberships] = await Promise.all([
      this.prisma.db.courseTeacher.findMany({ where: { userId }, select: { courseId: true } }),
      this.prisma.db.group.findMany({ where: { curatorId: userId }, select: { id: true } }),
      this.prisma.db.enrollment.findMany({
        where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        select: { courseId: true },
      }),
      this.prisma.db.groupMember.findMany({
        where: { userId, leftAt: null },
        select: { groupId: true },
      }),
    ]);

    const firstName = user.profile?.firstName ?? '';
    const lastName = user.profile?.lastName ?? '';

    return {
      id: user.id,
      email: user.email,
      firstName,
      lastName,
      middleName: user.profile?.middleName ?? null,
      fullName: [lastName, firstName, user.profile?.middleName].filter(Boolean).join(' '),
      locale: user.locale,
      avatarUrl: user.profile?.avatar?.objectKey ?? null,
      roles,
      permissions: permissionsForRoles(roles),
      twoFactorEnabled: user.twoFactorEnabled,
      scope: {
        facultyIds: uniq(user.roles.map((r) => r.scopeFacultyId)),
        departmentIds: uniq(user.roles.map((r) => r.scopeDepartmentId)),
        groupIds: [...curated.map((g) => g.id), ...memberships.map((m) => m.groupId)],
        courseIds: [...taught.map((t) => t.courseId), ...enrolled.map((e) => e.courseId)],
      },
      // `sessionId` frontendga kerak emas, ammo chiqish uchun ichkarida ishlatiladi
    };
  }

  /** Parol siyosati (§11) — `.env` orqali sozlanadi. */
  /** Sayt boshqaruvidagi `security.passwordMinLength` — `.env` dan kichik bo'lsa e'tiborsiz. */
  private async passwordMinLengthOverride(): Promise<number> {
    const value = await this.siteSettings.get<number>('security.passwordMinLength');
    return Number.isFinite(value) ? value : 0;
  }

  assertPasswordPolicy(password: string, minLengthOverride = 0): void {
    const minLength = Math.max(
      this.config.get('PASSWORD_MIN_LENGTH', { infer: true }),
      minLengthOverride,
    );
    const errors: Array<{ field: string; code: string }> = [];

    if (password.length < minLength) {
      errors.push({ field: 'password', code: 'validation.password_too_short' });
    }
    if (
      this.config.get('PASSWORD_REQUIRE_MIXED_CASE', { infer: true }) &&
      !(/[a-z]/.test(password) && /[A-Z]/.test(password))
    ) {
      errors.push({ field: 'password', code: 'validation.password_needs_mixed_case' });
    }
    if (this.config.get('PASSWORD_REQUIRE_DIGIT', { infer: true }) && !/\d/.test(password)) {
      errors.push({ field: 'password', code: 'validation.password_needs_digit' });
    }
    if (
      this.config.get('PASSWORD_REQUIRE_SYMBOL', { infer: true }) &&
      !/[^A-Za-z0-9]/.test(password)
    ) {
      errors.push({ field: 'password', code: 'validation.password_needs_symbol' });
    }
    if (COMMON_PASSWORDS.has(password.toLowerCase())) {
      errors.push({ field: 'password', code: 'validation.password_too_common' });
    }

    if (errors.length > 0) throw AppException.validation(errors);
  }

  /** Oxirgi N ta parolni qayta ishlatishga yo'l qo'yilmaydi. */
  private async assertPasswordNotReused(userId: string, password: string): Promise<void> {
    const historySize = this.config.get('PASSWORD_HISTORY_SIZE', { infer: true });
    if (historySize <= 0) return;

    const history = await this.prisma.db.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: historySize,
      select: { passwordHash: true },
    });

    for (const entry of history) {
      if (await this.crypto.verifyPassword(entry.passwordHash, password)) {
        throw AppException.validation([
          { field: 'password', code: 'validation.password_recently_used' },
        ]);
      }
    }
  }
}

/** Eng ko'p uchraydigan zaif parollar (qisqartirilgan ro'yxat). */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'qwerty123',
  '12345678',
  '123456789',
  '1234567890',
  'admin123',
  'welcome123',
  'parol123',
  'talaba123',
  'student123',
]);

function uniq(values: Array<string | null>): string[] {
  return Array.from(new Set(values.filter((v): v is string => Boolean(v))));
}

function buildUserSearchText(firstName: string, lastName: string, email: string): string {
  return `${lastName} ${firstName} ${email}`.toLowerCase();
}
