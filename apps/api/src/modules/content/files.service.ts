/**
 * Maqsad: F-05 — fayl yuklash oqimi (ADR-009).
 *
 * Oqim:
 *  1. Mijoz `presign` so'raydi → server `FileObject` (PENDING) yaratadi va
 *     presigned PUT URL qaytaradi;
 *  2. Mijoz faylni to'g'ridan-to'g'ri S3 ga yuklaydi;
 *  3. Mijoz `complete` chaqiradi → server hajm, MIME va magic bytes ni tekshiradi;
 *  4. Video bo'lsa — HLS transkodlash navbatga tushadi.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PresignUploadInput } from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { QueueService } from '../../common/queue/queue.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';

/** Maqsad bo'yicha hajm chegaralari (MB). Video eng kattasi. */
const PURPOSE_SIZE_LIMITS: Record<string, number> = {
  AVATAR: 5,
  SUBMISSION: 100,
  DOCUMENT: 50,
  EXCUSE: 20,
  COURSE_CONTENT: 512,
  SCORM: 512,
};

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async presign(input: PresignUploadInput, actor: RequestUser) {
    const limitMb = Math.min(
      PURPOSE_SIZE_LIMITS[input.purpose] ?? 50,
      this.config.get('MAX_UPLOAD_SIZE_MB', { infer: true }),
    );

    if (input.sizeBytes > limitMb * 1024 * 1024) {
      throw new AppException({
        code: 'PAYLOAD_TOO_LARGE',
        messageKey: 'errors.file_too_large',
        context: { limitMb },
      });
    }

    const objectKey = this.storage.buildObjectKey(input.purpose, input.fileName);

    const fileObject = await this.prisma.db.fileObject.create({
      data: {
        bucket: this.config.get('S3_BUCKET', { infer: true }),
        objectKey,
        mimeType: input.mimeType,
        sizeBytes: BigInt(input.sizeBytes),
        originalName: input.fileName.slice(0, 255),
        purpose: input.purpose,
        uploadedById: actor.id,
        status: 'PENDING',
      },
      select: { id: true },
    });

    const { uploadUrl, requiredHeaders } = await this.storage.createPresignedUpload({
      objectKey,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
    });

    return {
      fileObjectId: fileObject.id,
      uploadUrl,
      objectKey,
      requiredHeaders,
      expiresInSeconds: this.config.get('S3_PRESIGN_TTL', { infer: true }),
    };
  }

  /**
   * Yuklashni yakunlash va tekshirish.
   *
   * Tekshiruv MUVAFFAQIYATSIZ bo'lsa fayl `QUARANTINED` holatiga o'tadi va
   * hech qayerda ishlatilmaydi — bu MIME soxtalashtirish orqali hujumni to'sadi (§11).
   */
  async complete(fileObjectId: string, checksum: string | undefined, actor: RequestUser) {
    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: fileObjectId },
      select: {
        id: true,
        objectKey: true,
        mimeType: true,
        sizeBytes: true,
        purpose: true,
        uploadedById: true,
        status: true,
      },
    });

    if (!file) throw AppException.notFound('file', fileObjectId);
    if (file.uploadedById !== actor.id) throw AppException.forbidden('file:update:own');
    if (file.status === 'READY') return { id: file.id, status: file.status };

    const head = await this.storage.headObject(file.objectKey);
    if (!head) {
      await this.markFailed(file.id, 'object_not_found');
      throw AppException.businessRule('errors.upload_not_found');
    }

    // Haqiqiy hajm e'lon qilingan hajmdan farq qilmasligi kerak
    if (BigInt(head.sizeBytes) !== file.sizeBytes) {
      await this.markFailed(file.id, 'size_mismatch');
      throw AppException.businessRule('errors.upload_size_mismatch');
    }

    const magicOk = await this.storage.verifyMagicBytes(file.objectKey, file.mimeType);
    if (!magicOk) {
      await this.prisma.db.fileObject.update({
        where: { id: file.id },
        data: { status: 'QUARANTINED' },
      });
      await this.audit.record({
        actorId: actor.id,
        action: 'file.quarantined',
        resource: 'file',
        resourceId: file.id,
        after: { reason: 'magic_bytes_mismatch', declaredMime: file.mimeType },
      });
      throw new AppException({
        code: 'UNSUPPORTED_MEDIA_TYPE',
        messageKey: 'errors.file_content_mismatch',
      });
    }

    const updated = await this.prisma.db.fileObject.update({
      where: { id: file.id },
      data: { status: 'READY', checksumSha256: checksum ?? null },
      select: { id: true, status: true, objectKey: true, mimeType: true },
    });

    // Video bo'lsa HLS ga o'giriladi (A-11) — API kutmaydi
    if (file.mimeType.startsWith('video/')) {
      await this.queue.enqueue('media.transcode', { fileObjectId: file.id });
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'file.uploaded',
      resource: 'file',
      resourceId: file.id,
      after: { purpose: file.purpose, mimeType: file.mimeType },
    });

    return { id: updated.id, status: updated.status };
  }

  /** Xususiy fayl uchun vaqtinchalik yuklab olish havolasi. */
  async getDownloadUrl(fileObjectId: string, actor: RequestUser) {
    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: fileObjectId },
      select: {
        objectKey: true,
        originalName: true,
        status: true,
        purpose: true,
        uploadedById: true,
      },
    });

    if (!file) throw AppException.notFound('file', fileObjectId);
    if (file.status !== 'READY') throw AppException.businessRule('errors.file_not_ready');

    // Talabaning topshirig'i faqat o'ziga va o'qituvchiga ko'rinadi.
    // Kurs kontenti uchun ruxsat PolicyGuard darajasida tekshirilgan.
    if (file.purpose === 'SUBMISSION' || file.purpose === 'EXCUSE') {
      const isOwner = file.uploadedById === actor.id;
      const canGrade = actor.permissions.some((key) => key.startsWith('submission:grade'));
      if (!isOwner && !canGrade) throw AppException.forbidden('file:read:own');
    }

    const url = await this.storage.createPresignedDownload(file.objectKey, file.originalName);
    return { url, fileName: file.originalName };
  }

  private async markFailed(id: string, reason: string): Promise<void> {
    await this.prisma.db.fileObject.update({ where: { id }, data: { status: 'FAILED' } });
    this.logger.warn({ fileObjectId: id, reason }, 'Fayl yuklash tekshiruvi muvaffaqiyatsiz');
  }

  /**
   * Tashlandiq `PENDING` yozuvlarni tozalash (ADR-009).
   * Mijoz yuklashni boshlab, tugatmasa — bunday yozuvlar to'planib qoladi.
   */
  async cleanupStaleUploads(olderThanHours = 24): Promise<number> {
    const threshold = new Date(Date.now() - olderThanHours * 3_600_000);
    const stale = await this.prisma.db.fileObject.findMany({
      where: { status: 'PENDING', createdAt: { lt: threshold } },
      select: { id: true, objectKey: true },
      take: 500,
    });

    for (const file of stale) {
      await this.storage.deleteObject(file.objectKey).catch((error: Error) => {
        this.logger.warn(
          { objectKey: file.objectKey, error: error.message },
          "Obyektni o'chirib bo'lmadi",
        );
      });
      await this.prisma.softDelete('FileObject', file.id);
    }

    return stale.length;
  }
}
