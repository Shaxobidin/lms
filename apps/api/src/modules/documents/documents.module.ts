/** Maqsad: F-14 modulini yig'ish — hujjat generatsiyasi va elektron imzo. */

import { Body, Controller, Get, Inject, Module, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash } from 'node:crypto';
import {
  generateDocumentSchema,
  signDocumentSchema,
  uuidSchema,
  type GenerateDocumentInput,
} from '@lms/shared';
import { DocumentsService } from './documents.service';
import { zodBody, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';
import { GradingModule } from '../grading/grading.module';
import { SIGNATURE_PROVIDER, type SignatureProvider } from '../integrations/contracts';
import { AppException } from '../../common/errors/app.exception';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    @Inject(SIGNATURE_PROVIDER) private readonly signature: SignatureProvider,
  ) {}

  @Post('generate')
  @RequirePermission([
    'document:create:own_faculty',
    'document:create:all',
    'document:export:own_course',
    'document:export:own_group',
    'document:export:own_department',
    'document:export:own_faculty',
  ])
  @ApiOperation({ summary: "Hujjat generatsiyasini so'rash (GOST 7.32 formatida)" })
  async generate(
    @Body(zodBody(generateDocumentSchema)) dto: GenerateDocumentInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.documents.request(dto, actor);
  }

  @Get()
  @ApiOperation({ summary: 'Mening hujjatlarim' })
  async list(@CurrentUser() actor: RequestUser) {
    return this.documents.list(actor);
  }

  /**
   * Elektron imzoni biriktirish (A-05).
   * Imzo brauzerdagi E-IMZO plaginida yaratiladi, bu yerda tekshiriladi.
   */
  @Post(':id/sign')
  @RequirePermission(['document:create:own_faculty', 'document:create:all'])
  @ApiOperation({ summary: 'Hujjatni elektron imzo bilan tasdiqlash' })
  async sign(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(signDocumentSchema))
    dto: {
      documentId: string;
      signature: string;
      certificateSerial: string;
      signerFullName: string;
    },
    @CurrentUser() actor: RequestUser,
  ) {
    const documentHash = createHash('sha256').update(id).digest('hex');
    const verification = await this.signature.verify(documentHash, dto.signature);

    if (!verification.valid) {
      throw AppException.businessRule('errors.signature_invalid', {
        reason: verification.reason,
      });
    }

    return this.documents.attachSignature(
      id,
      createHash('sha256').update(dto.signature).digest('hex'),
      {
        provider: this.signature.name,
        certificateSerial: verification.certificateSerial ?? dto.certificateSerial,
        signerFullName: verification.signerFullName ?? dto.signerFullName,
        signedAt: verification.signedAt?.toISOString() ?? new Date().toISOString(),
      },
      actor,
    );
  }
}

@Module({
  imports: [GradingModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
