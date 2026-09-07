/**
 * Maqsad: LTI 1.3 endpointlari (§10).
 *
 * Ochiq (platforma chaqiradi):  GET/POST /lti/login, POST /lti/launch, GET /lti/jwks
 * Administrator:                 GET/POST/PATCH/DELETE /lti/platforms
 *
 * `login` va `launch` brauzerni yo'naltiradi — shuning uchun `@Res()` to'liq
 * boshqaruvda (javob konverti ishlatilmaydi).
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  createLtiPlatformSchema,
  ltiDeepLinkRespondSchema,
  ltiLaunchSchema,
  ltiLoginInitiationSchema,
  updateLtiPlatformSchema,
  type CreateLtiPlatformInput,
  type LtiDeepLinkRespondInput,
  type LtiLaunchInput,
  type LtiLoginInitiationInput,
  type UpdateLtiPlatformInput,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { LtiService } from './lti.service';
import { LtiServicesService } from './lti-services.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { uuidSchema } from '@lms/shared';
import {
  ClientIp,
  CurrentUser,
  Public,
  RequirePermission,
  TraceId,
} from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { setAuthCookies } from '../../common/auth/auth-cookies';

/** OIDC `state` brauzerga bog'lanadi — launch'da mos kelishi tekshiriladi. */
const STATE_COOKIE = 'lms_lti_state';

@ApiTags('lti')
@Controller('lti')
export class LtiController {
  constructor(
    private readonly lti: LtiService,
    private readonly services: LtiServicesService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  @Public()
  @Get('jwks')
  @ApiOperation({ summary: 'Tool ochiq kalitlari (JWKS)' })
  jwks() {
    return this.lti.jwks();
  }

  @Public()
  @Get('login')
  @ApiOperation({ summary: 'OIDC login initiation (GET)' })
  async loginGet(
    @Query(zodQuery(ltiLoginInitiationSchema)) query: LtiLoginInitiationInput,
    @Res() response: Response,
  ): Promise<void> {
    await this.redirectToPlatform(query, response);
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'OIDC login initiation (POST form)' })
  async loginPost(
    @Body(zodBody(ltiLoginInitiationSchema)) body: LtiLoginInitiationInput,
    @Res() response: Response,
  ): Promise<void> {
    await this.redirectToPlatform(body, response);
  }

  @Public()
  @Post('launch')
  @ApiOperation({ summary: 'LTI resurs havolasi launch (id_token form-post)' })
  async launch(
    @Body(zodBody(ltiLaunchSchema)) body: LtiLaunchInput,
    @Req() request: Request,
    @Res() response: Response,
    @ClientIp() ip: string | null,
    @TraceId() traceId: string | null,
  ): Promise<void> {
    const cookies = (request.cookies ?? {}) as Record<string, string | undefined>;
    const outcome = await this.lti.handleLaunch(body, cookies[STATE_COOKIE], {
      ip,
      userAgent: request.headers['user-agent'] ?? null,
      traceId,
    });

    response.clearCookie(STATE_COOKIE, { path: '/api/v1/lti' });
    setAuthCookies(response, this.config, outcome.login.refreshToken, false);
    response.redirect(HttpStatus.FOUND, outcome.redirectUrl);
  }

  // --- LTI Advantage: Deep Linking, AGS, NRPS ----------------------------------------

  @Get('deep-link')
  @ApiOperation({ summary: 'Deep Linking so`rovi konteksti (token bo`yicha)' })
  async deepLinkContext(
    @Query(zodQuery(z.object({ token: z.string().min(8).max(256) }))) query: { token: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.services.deepLinkContext(query.token, actor);
  }

  @Post('deep-link/respond')
  @ApiOperation({
    summary: 'Deep Linking: tanlangan kursni platformaga qaytarish (imzolangan JWT)',
  })
  async deepLinkRespond(
    @Body(zodBody(ltiDeepLinkRespondSchema)) dto: LtiDeepLinkRespondInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.services.deepLinkRespond(dto.token, dto.courseId, actor);
  }

  @Get('courses/:courseId/links')
  @RequirePermission(['course:update:own_course', 'course:update:own_department'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Kursga bog`langan LTI resurs havolalari (AGS/NRPS holati)' })
  async courseLinks(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.services.linksForCourse(courseId);
  }

  @Post('courses/:courseId/grades/push')
  @RequirePermission(['course:update:own_course', 'course:update:own_department'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'AGS: kurs baholarini platformaga yuborish' })
  async pushGrades(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.services.pushCourseGrades(courseId, actor);
  }

  @Get('courses/:courseId/members')
  @RequirePermission(['course:update:own_course', 'course:update:own_department'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'NRPS: platformadagi kurs a`zolari' })
  async members(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.services.listMembers(courseId);
  }

  @Post('courses/:courseId/members/sync')
  @RequirePermission(['course:update:own_course', 'course:update:own_department'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'NRPS: talabalarni bizga yozish (hisob ochish + kursga yozish)' })
  async syncMembers(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.services.syncMembers(courseId, actor);
  }

  @Get('platforms')
  @RequirePermission(['integration:read:all', 'integration:manage:all'])
  @ApiOperation({ summary: "Ro'yxatga olingan LTI platformalari va tool manzillari" })
  async platforms() {
    return { tool: this.lti.toolEndpoints(), platforms: await this.lti.listPlatforms() };
  }

  @Post('platforms')
  @RequirePermission('integration:manage:all')
  @ApiOperation({ summary: "LTI platformasini ro'yxatga olish" })
  async createPlatform(
    @Body(zodBody(createLtiPlatformSchema)) dto: CreateLtiPlatformInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.lti.createPlatform(dto, actor);
  }

  @Patch('platforms/:id')
  @RequirePermission('integration:manage:all')
  @ApiOperation({ summary: 'LTI platformasini tahrirlash' })
  async updatePlatform(
    @Param('id') id: string,
    @Body(zodBody(updateLtiPlatformSchema)) dto: UpdateLtiPlatformInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.lti.updatePlatform(id, dto, actor);
  }

  @Delete('platforms/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('integration:manage:all')
  @ApiOperation({ summary: "LTI platformasini o'chirish (soft delete)" })
  async deletePlatform(@Param('id') id: string, @CurrentUser() actor: RequestUser): Promise<void> {
    await this.lti.deletePlatform(id, actor);
  }

  private async redirectToPlatform(
    input: LtiLoginInitiationInput,
    response: Response,
  ): Promise<void> {
    const { redirectUrl, state } = await this.lti.initiateLogin(input);
    const secure = this.config.get('COOKIE_SECURE', { infer: true });
    response.cookie(STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      // Launch — platformadan cross-site POST; `None` faqat `Secure` bilan ishlaydi
      sameSite: secure ? 'none' : 'lax',
      path: '/api/v1/lti',
      maxAge: this.config.get('LTI_STATE_TTL_SECONDS', { infer: true }) * 1000,
    });
    response.redirect(HttpStatus.FOUND, redirectUrl);
  }
}
