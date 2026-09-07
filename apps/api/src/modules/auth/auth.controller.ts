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
import { AuthService } from './auth.service';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from '../../common/auth/auth-cookies';
import { zodBody } from '../../common/pipes/zod-validation.pipe';
import { ClientIp, CurrentUser, Public, TraceId } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { AppException } from '../../common/errors/app.exception';

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

    setAuthCookies(response, this.config, result.refreshToken, dto.rememberMe);
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

    setAuthCookies(response, this.config, result.refreshToken, true);
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
    clearAuthCookies(response);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Barcha qurilmalardan chiqish' })
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    const count = await this.auth.logoutAll(user.id);
    clearAuthCookies(response);
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
}
