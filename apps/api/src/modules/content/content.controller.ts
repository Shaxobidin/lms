/**
 * Maqsad: F-05 endpointlari — fayl yuklash, SCORM pleyer, xAPI LRS,
 * dars progressi.
 */

import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  completeUploadSchema,
  exportCartridgeSchema,
  importCartridgeSchema,
  lessonProgressSchema,
  presignUploadSchema,
  uuidSchema,
  type ExportCartridgeInput,
  type ImportCartridgeInput,
  type PresignUploadInput,
} from '@lms/shared';
import { FilesService } from './files.service';
import { ScormService } from './scorm.service';
import { CartridgeImportService } from './cc-import.service';
import { XapiService } from './xapi.service';
import { ProgressService } from './progress.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const importScormSchema = z.object({
  courseId: uuidSchema,
  fileObjectId: uuidSchema,
  title: z.string().trim().min(1).max(300),
});

const commitScormSchema = z.object({
  packageId: uuidSchema,
  /** `cmi.*` kalit-qiymat juftliklari. */
  data: z.record(z.string().max(200), z.string().max(65_536)),
});

const xapiStatementSchema = z.object({
  actor: z.record(z.unknown()),
  verb: z.object({ id: z.string().url(), display: z.record(z.string()).optional() }),
  object: z.record(z.unknown()),
  result: z.record(z.unknown()).optional(),
  context: z.record(z.unknown()).optional(),
  timestamp: z.string().optional(),
});

@ApiTags('content')
@Controller('content')
export class ContentController {
  constructor(
    private readonly files: FilesService,
    private readonly scorm: ScormService,
    private readonly cartridge: CartridgeImportService,
    private readonly xapi: XapiService,
    private readonly progress: ProgressService,
  ) {}

  // --- Fayllar --------------------------------------------------------------

  @Post('files/presign')
  @RequirePermission(['file:create:own', 'file:manage:all'])
  @ApiOperation({ summary: "Faylni to'g'ridan-to'g'ri S3 ga yuklash uchun havola" })
  async presign(
    @Body(zodBody(presignUploadSchema)) dto: PresignUploadInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.files.presign(dto, actor);
  }

  @Post('files/complete')
  @RequirePermission(['file:create:own', 'file:manage:all'])
  @ApiOperation({ summary: 'Yuklashni yakunlash va faylni tekshirish' })
  async complete(
    @Body(zodBody(completeUploadSchema)) dto: { fileObjectId: string; checksumSha256?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.files.complete(dto.fileObjectId, dto.checksumSha256, actor);
  }

  @Get('files/:id/download')
  @ApiOperation({ summary: 'Faylni yuklab olish havolasi' })
  async download(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.files.getDownloadUrl(id, actor);
  }

  // --- IMS Common Cartridge ---------------------------------------------------

  @Post('cc/import')
  @RequirePermission('resource:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({
    summary: 'IMS Common Cartridge paketini kursga import qilish; `dryRun` — faqat reja',
  })
  async importCartridge(
    @Body(zodBody(importCartridgeSchema)) dto: ImportCartridgeInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.cartridge.importCartridge(dto, actor);
  }

  @Post('cc/export')
  @RequirePermission('resource:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: 'Kursni IMS Common Cartridge paketiga eksport qilish' })
  async exportCartridge(
    @Body(zodBody(exportCartridgeSchema)) dto: ExportCartridgeInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.cartridge.exportCartridge(dto.courseId, dto.locale, actor);
  }

  // --- SCORM ----------------------------------------------------------------

  @Post('scorm/import')
  @RequirePermission('resource:manage:own_course', { resource: 'course', path: 'body.courseId' })
  @ApiOperation({ summary: 'SCORM paketini import qilish (1.2 / 2004)' })
  async importScorm(
    @Body(zodBody(importScormSchema))
    dto: {
      courseId: string;
      fileObjectId: string;
      title: string;
    },
  ) {
    return this.scorm.importPackage(dto.courseId, dto.fileObjectId, dto.title);
  }

  @Get('scorm/:packageId/launch')
  @ApiOperation({ summary: "SCORM pleyerini ishga tushirish uchun ma'lumot" })
  async launchScorm(
    @Param('packageId', new ZodValidationPipe(uuidSchema)) packageId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    const fullName = actor.email;
    return this.scorm.getLaunchData(packageId, actor.id, fullName);
  }

  @Post('scorm/commit')
  @ApiOperation({ summary: 'SCORM RTE holatini saqlash (Commit)' })
  async commitScorm(
    @Body(zodBody(commitScormSchema)) dto: { packageId: string; data: Record<string, string> },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.scorm.saveTracking(dto.packageId, actor.id, dto.data);
  }

  // --- xAPI (cmi5) minimal LRS ---------------------------------------------

  @Post('xapi/statements')
  @ApiOperation({ summary: 'xAPI bayonotini saqlash' })
  async putStatement(
    @Body(zodBody(xapiStatementSchema)) statement: Record<string, unknown>,
    @Query(zodQuery(z.object({ courseId: uuidSchema.optional() }))) query: { courseId?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.xapi.store(statement, actor.id, query.courseId);
  }

  @Get('xapi/statements')
  @ApiOperation({ summary: "xAPI bayonotlarini o'qish" })
  async getStatements(
    @Query(
      zodQuery(
        z.object({
          courseId: uuidSchema.optional(),
          verb: z.string().max(300).optional(),
          limit: z.coerce.number().int().min(1).max(200).default(50),
        }),
      ),
    )
    query: { courseId?: string; verb?: string; limit: number },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.xapi.query(actor, query);
  }

  // --- Dars progressi -------------------------------------------------------

  @Put('progress')
  @RequirePermission('lesson:read:own')
  @ApiOperation({ summary: 'Dars progressini saqlash' })
  async saveProgress(
    @Body(zodBody(lessonProgressSchema))
    dto: { lessonId: string; secondsSpent: number; lastPosition?: number; completed: boolean },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.progress.save(actor.id, dto);
  }

  @Get('progress/course/:courseId')
  @ApiOperation({ summary: "Kurs bo'yicha progress" })
  async courseProgress(
    @Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.progress.courseProgress(courseId, actor.id);
  }
}
