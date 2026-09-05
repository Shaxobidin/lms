/**
 * Maqsad: F-01 autentifikatsiya endpointlari (`/api/v1/auth/...`).
 *
 * Refresh token `httpOnly` cookie'da uzatiladi (ADR-005, A-23) — XSS orqali
 * o'g'irlanmaydi. Access token javob tanasida qaytariladi va faqat xotirada saqlanadi.
 */

import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import {
  changePasswordSchema,
  enableTwoFactorSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RegisterInput,
  type ResetPasswordInput,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { AuthService, parseTtlSeconds } from './auth.service';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { ClientIp, CurrentUser, Public, TraceId } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';

const REFRESH_COOKIE = 'lms_refresh';

/**
 * Sessiya-belgisi: SIR EMAS, faqat "sessiya bo'lishi mumkin" degan bayroq.
 * Mijoz shu belgi bo'lmasa `/auth/refresh` ni umuman chaqirmaydi — anonim
 * foydalanuvchi uchun har sahifa yuklanishida keraksiz 401 so'rov ketmaydi.
 */
const SESSION_HINT_COOKIE = 'lms_session';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Email/telefon va parol bilan tizimga kirish' })
  async login(
    @Body(zodBody(loginSchema)) dto: LoginInput,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @ClientIp() ip: string,
    @TraceId() traceId: string,
  ) {
    const result = await this.auth.login(dto, {
      ip,
      userAgent: request.headers['user-agent'] ?? null,
      traceId,
    });

    this.setRefreshCookie(response, result.refreshToken, dto.rememberMe);
    return { tokens: result.tokens, user: result.user };
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access tokenni yangilash (refresh rotatsiyasi bilan)' })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: { refreshToken?: string },
    @ClientIp() ip: string,
    @TraceId() traceId: string,
  ) {
    // Cookie birlamchi; mobil mijozlar uchun tanadagi qiymat ham qabul qilinadi
    const token =
      (request.cookies as Record<string, string> | undefined)?.[REFRESH_COOKIE] ??
      body?.refreshToken;

    if (!token) throw AppException.unauthenticated('refresh_token_missing');

    const result = await this.auth.refresh(token, {
      ip,
      userAgent: request.headers['user-agent'] ?? null,
      traceId,
    });

    this.setRefreshCookie(response, result.refreshToken, true);
    return { tokens: result.tokens, user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Joriy sessiyadan chiqish' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    await this.auth.logout(user.sessionId, user.id);
    this.clearAuthCookies(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Barcha qurilmalardan chiqish' })
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const count = await this.auth.logoutAll(user.id);
    this.clearAuthCookies(response);
    return { revokedSessions: count };
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: "Ochiq ro'yxatdan o'tish (tinglovchilar uchun)" })
  async register(
    @Body(zodBody(registerSchema)) dto: RegisterInput,
    @ClientIp() ip: string,
    @TraceId() traceId: string,
  ) {
    return this.auth.register(dto, { ip, traceId });
  }

  @Public()
  @Post('verify-email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Email manzilini tasdiqlash' })
  async verifyEmail(@Body() body: { token: string }): Promise<void> {
    if (!body?.token) {
      throw AppException.validation([{ field: 'token', code: 'validation.required' }]);
    }
    await this.auth.verifyEmail(body.token);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Parolni tiklash uchun havola so'rash" })
  async forgotPassword(@Body(zodBody(forgotPasswordSchema)) dto: { email: string }) {
    await this.auth.requestPasswordReset(dto.email);
    // Javob har doim bir xil — email mavjudligi oshkor qilinmaydi
    return { accepted: true };
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Yangi parol o'rnatish" })
  async resetPassword(@Body(zodBody(resetPasswordSchema)) dto: ResetPasswordInput): Promise<void> {
    await this.auth.resetPassword(dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Parolni almashtirish' })
  async changePassword(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(changePasswordSchema)) dto: ChangePasswordInput,
  ): Promise<void> {
    await this.auth.changePassword(user.id, dto);
  }

  @Get('me')
  @ApiOperation({ summary: 'Joriy foydalanuvchi profili, rollari va ruxsatlari' })
  async me(@CurrentUser() user: RequestUser) {
    return this.auth.buildAuthenticatedUser(user.id);
  }

  // --- 2FA ------------------------------------------------------------------

  @Post('2fa/setup')
  @ApiOperation({ summary: '2FA sozlashni boshlash (QR uchun otpauth URI)' })
  async beginTwoFactor(@CurrentUser() user: RequestUser) {
    return this.auth.beginTwoFactorSetup(user.id);
  }

  @Post('2fa/confirm')
  @ApiOperation({ summary: '2FA ni tasdiqlash va yoqish' })
  async confirmTwoFactor(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(enableTwoFactorSchema)) dto: { totpCode: string },
  ) {
    return this.auth.confirmTwoFactorSetup(user.id, dto.totpCode);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "2FA ni o'chirish" })
  async disableTwoFactor(
    @CurrentUser() user: RequestUser,
    @Body(zodBody(enableTwoFactorSchema)) dto: { totpCode: string },
  ): Promise<void> {
    await this.auth.disableTwoFactor(user.id, dto.totpCode);
  }

  /**
   * Refresh cookie: `httpOnly` (JS o'qiy olmaydi), `SameSite=Lax` (CSRF),
   * `path` cheklangan — faqat auth endpointlariga yuboriladi.
   */
  private setRefreshCookie(response: Response, token: string, rememberMe: boolean): void {
    const maxAgeMs =
      (rememberMe ? parseTtlSeconds(this.config.get('JWT_REFRESH_TTL', { infer: true })) : 86_400) *
      1000;

    response.cookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/api/v1/auth',
      maxAge: maxAgeMs,
    });

    // Belgi mijozga ko'rinadi (httpOnly emas) va butun sayt bo'yicha yuboriladi
    response.cookie(SESSION_HINT_COOKIE, '1', {
      httpOnly: false,
      secure: this.config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      domain: this.config.get('COOKIE_DOMAIN', { infer: true }),
      path: '/',
      maxAge: maxAgeMs,
    });
  }

  /** Chiqishda ikkala cookie ham tozalanadi. */
  private clearAuthCookies(response: Response): void {
    response.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    response.clearCookie(SESSION_HINT_COOKIE, { path: '/' });
  }
}
