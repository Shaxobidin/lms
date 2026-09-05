/** Maqsad: F-12 modulini yig'ish — sertifikat va ochiq verifikatsiya. */

import { Body, Controller, Get, Module, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  createCertificateTemplateSchema,
  issueCertificateSchema,
  revokeCertificateSchema,
  uuidSchema,
  type IssueCertificateInput,
} from '@lms/shared';
import { CertificatesService } from './certificates.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const registryFilters = z.object({
  courseId: uuidSchema.optional(),
  userId: uuidSchema.optional(),
  status: z.enum(['ISSUED', 'REVOKED']).optional(),
});

@ApiTags('certificates')
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Post('issue')
  @RequirePermission(['certificate:create:own_course', 'certificate:approve:own_faculty'], {
    resource: 'course',
    path: 'body.courseId',
  })
  @ApiOperation({ summary: 'Sertifikat berish (yakka yoki ommaviy)' })
  async issue(
    @Body(zodBody(issueCertificateSchema)) dto: IssueCertificateInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.certificates.issue(dto, actor);
  }

  @Get('registry')
  @RequirePermission([
    'certificate:read:own',
    'certificate:read:own_faculty',
    'certificate:read:all',
  ])
  @ApiOperation({ summary: 'Sertifikatlar reestri' })
  async registry(
    @Query(zodQuery(registryFilters))
    query: { courseId?: string; userId?: string; status?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    // Talaba faqat o'z sertifikatlarini ko'radi
    const canReadAll = actor.permissions.some(
      (key) => key.startsWith('certificate:read:') && !key.endsWith(':own'),
    );
    return this.certificates.registry(canReadAll ? query : { ...query, userId: actor.id });
  }

  @Post(':id/revoke')
  @RequirePermission(['certificate:approve:own_faculty', 'certificate:read:all'], {
    resource: 'certificate',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Sertifikatni bekor qilish' })
  async revoke(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(revokeCertificateSchema)) dto: { reason: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.certificates.revoke(id, dto.reason, actor);
  }

  @Get('templates')
  @RequirePermission([
    'certificate:create:own_course',
    'certificate:read:own_faculty',
    'certificate:read:all',
    'system:manage:all',
  ])
  @ApiOperation({ summary: "Sertifikat shablonlari ro'yxati" })
  async listTemplates() {
    return this.certificates.listTemplates();
  }

  @Post('templates')
  @RequirePermission(['certificate:read:all', 'system:manage:all'])
  @ApiOperation({ summary: 'Sertifikat shablonini yaratish' })
  async createTemplate(
    @Body(zodBody(createCertificateTemplateSchema)) dto: Record<string, unknown>,
  ) {
    void dto;
    // Shablon konstruktori v1 da standart shablon bilan cheklangan (docs/00-analysis.md §6)
    const id = await this.certificates.ensureDefaultTemplate();
    return { id };
  }

  /**
   * Ochiq verifikatsiya sahifasi uchun endpoint (§15).
   * Autentifikatsiya talab qilinmaydi — QR kodni har kim tekshira oladi.
   */
  @Public()
  @Get('verify/:code')
  @ApiOperation({ summary: 'Sertifikat haqiqiyligini tekshirish (ochiq)' })
  async verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }
}

@Module({
  controllers: [CertificatesController],
  providers: [CertificatesService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
