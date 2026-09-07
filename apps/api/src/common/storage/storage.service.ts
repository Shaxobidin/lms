/**
 * Maqsad: S3-mos obyekt saqlash bilan ishlash (ADR-009, F-05).
 *
 * Fayl brauzerdan to'g'ridan-to'g'ri S3 ga presigned PUT orqali yuklanadi —
 * API ning RAM/CPU si band bo'lmaydi. Yuklangandan keyin server tomonida
 * MIME va magic bytes tekshiriladi (§11).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash, randomUUID } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { AppConfig } from '../../config/configuration';
import { AppException } from '../errors/app.exception';

/**
 * Fayl imzosi (magic bytes) — kengaytmaga emas, mazmunga ishonamiz.
 * Bu `Content-Type` ni soxtalashtirish orqali zararli fayl yuklashni to'sadi.
 */
const MAGIC_SIGNATURES: Array<{ mime: string; offset: number; bytes: number[] }> = [
  { mime: 'image/jpeg', offset: 0, bytes: [0xff, 0xd8, 0xff] },
  { mime: 'image/png', offset: 0, bytes: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { mime: 'image/gif', offset: 0, bytes: [0x47, 0x49, 0x46, 0x38] },
  { mime: 'image/webp', offset: 8, bytes: [0x57, 0x45, 0x42, 0x50] },
  { mime: 'application/pdf', offset: 0, bytes: [0x25, 0x50, 0x44, 0x46] },
  // ZIP konteyneri: docx, xlsx, pptx, SCORM paketlari ham shu imzo bilan
  { mime: 'application/zip', offset: 0, bytes: [0x50, 0x4b, 0x03, 0x04] },
  { mime: 'video/mp4', offset: 4, bytes: [0x66, 0x74, 0x79, 0x70] },
  { mime: 'audio/mpeg', offset: 0, bytes: [0x49, 0x44, 0x33] },
  { mime: 'video/webm', offset: 0, bytes: [0x1a, 0x45, 0xdf, 0xa3] },
];

/** ZIP asosidagi Office/SCORM turlari — imzosi `application/zip` bo'ladi. */
const ZIP_BASED_MIMES = new Set([
  'application/zip',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
]);

export interface PresignedUpload {
  fileObjectId: string;
  uploadUrl: string;
  objectKey: string;
  expiresInSeconds: number;
  /** Mijoz PUT so'rovida aynan shu sarlavhalarni yuborishi shart. */
  requiredHeaders: Record<string, string>;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client;
  /**
   * Presigned havolalarni imzolash uchun alohida mijoz.
   *
   * Imzo Host sarlavhasini qamrab oladi, shuning uchun havola FOYDALANUVCHI
   * murojaat qiladigan manzil (`MEDIA_PUBLIC_URL`) bilan imzolanishi kerak.
   * Aks holda konteyner ichidagi nom (`minio:9000`) brauzerga tushib qoladi.
   */
  private readonly signerClient: S3Client;
  private readonly bucket: string;
  private readonly presignTtl: number;
  private readonly publicUrl: string;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    this.presignTtl = config.get('S3_PRESIGN_TTL', { infer: true });
    this.publicUrl = config.get('MEDIA_PUBLIC_URL', { infer: true });

    const internalEndpoint = config.get('S3_ENDPOINT', { infer: true });
    const clientOptions = {
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
      },
    };

    // Server-server operatsiyalari (yuklash, o'qish) ichki manzil orqali
    this.client = new S3Client({ ...clientOptions, endpoint: internalEndpoint });

    // Mijozga beriladigan havolalar tashqi manzil bilan imzolanadi
    this.signerClient =
      this.publicUrl === internalEndpoint
        ? this.client
        : new S3Client({ ...clientOptions, endpoint: this.publicUrl });
  }

  /**
   * Obyekt kaliti. Maqsad bo'yicha prefiks — kvota hisobi va hayot sikli
   * siyosatlarini (masalan, eski topshiriqlarni arxivlash) osonlashtiradi.
   */
  buildObjectKey(purpose: string, originalName: string): string {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    const safeName = sanitizeFileName(originalName);
    return `${purpose.toLowerCase()}/${year}/${month}/${randomUUID()}-${safeName}`;
  }

  async createPresignedUpload(params: {
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
  }): Promise<{ uploadUrl: string; requiredHeaders: Record<string, string> }> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.objectKey,
      ContentType: params.mimeType,
      ContentLength: params.sizeBytes,
    });

    const uploadUrl = await getSignedUrl(this.signerClient, command, {
      expiresIn: this.presignTtl,
    });

    return {
      uploadUrl,
      requiredHeaders: {
        'Content-Type': params.mimeType,
        'Content-Length': String(params.sizeBytes),
      },
    };
  }

  /** Yuklab olish uchun vaqtinchalik havola (xususiy fayllar uchun). */
  async createPresignedDownload(objectKey: string, fileName?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ...(fileName
        ? { ResponseContentDisposition: `attachment; filename="${sanitizeFileName(fileName)}"` }
        : {}),
    });
    return getSignedUrl(this.signerClient, command, { expiresIn: this.presignTtl });
  }

  /** Ochiq fayllar uchun to'g'ridan-to'g'ri havola (kurs muqovasi, avatar). */
  buildPublicUrl(objectKey: string): string {
    return `${this.publicUrl}/${this.bucket}/${objectKey}`;
  }

  async putObject(
    objectKey: string,
    body: Buffer | Uint8Array | string,
    mimeType: string,
  ): Promise<{ objectKey: string; sizeBytes: number; checksumSha256: string }> {
    const buffer = Buffer.isBuffer(body) ? body : Buffer.from(body as Uint8Array);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
      }),
    );
    return {
      objectKey,
      sizeBytes: buffer.byteLength,
      checksumSha256: createHash('sha256').update(buffer).digest('hex'),
    };
  }

  async getObjectBuffer(objectKey: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
    );
    if (!response.Body) {
      throw AppException.notFound('file', objectKey);
    }
    return streamToBuffer(response.Body as Readable);
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }

  /** Fayl haqiqatan yuklanganini va hajmini tekshiradi. */
  async headObject(objectKey: string): Promise<{ sizeBytes: number; mimeType: string } | null> {
    try {
      const response = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return {
        sizeBytes: Number(response.ContentLength ?? 0),
        mimeType: response.ContentType ?? 'application/octet-stream',
      };
    } catch (error) {
      this.logger.debug({ objectKey, error: (error as Error).message }, 'Obyekt topilmadi');
      return null;
    }
  }

  /**
   * Faylning haqiqiy turini magic bytes bo'yicha tekshiradi (§11).
   * Faqat birinchi 32 baytni o'qiydi — katta videoni to'liq yuklamaydi.
   */
  async verifyMagicBytes(objectKey: string, declaredMime: string): Promise<boolean> {
    // Matnli turlarda imzo bo'lmaydi — ular uchun tekshiruv o'tkazilmaydi
    if (declaredMime.startsWith('text/') || declaredMime === 'image/svg+xml') return true;

    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey, Range: 'bytes=0-31' }),
    );
    if (!response.Body) return false;

    const header = await streamToBuffer(response.Body as Readable);
    const expectedMime = ZIP_BASED_MIMES.has(declaredMime) ? 'application/zip' : declaredMime;

    const signature = MAGIC_SIGNATURES.find((item) => item.mime === expectedMime);
    if (!signature) {
      this.logger.warn({ declaredMime }, "Ushbu MIME turi uchun imzo qoidasi yo'q");
      return false;
    }

    return signature.bytes.every((byte, index) => header[signature.offset + index] === byte);
  }

  async computeChecksum(objectKey: string): Promise<string> {
    const buffer = await this.getObjectBuffer(objectKey);
    return createHash('sha256').update(buffer).digest('hex');
  }
}

/** Fayl nomini xavfsizlashtirish: yo'l ajratgichlari va boshqaruv belgilari olib tashlanadi. */
export function sanitizeFileName(name: string): string {
  const cleaned = Array.from(name)
    // Boshqaruv belgilari (0x00-0x1F, 0x7F), yo'l ajratgichlari va HTTP
    // sarlavhasini buzadigan qo'shtirnoq olib tashlanadi.
    .map((char) => {
      const code = char.codePointAt(0) ?? 0;
      if (code < 32 || code === 127) return '';
      if (char === '/' || char === '\\' || char === '"') return '_';
      return char;
    })
    .join('')
    .replace(/\s+/g, '_');
  return cleaned.slice(-120) || 'file';
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
  }
  return Buffer.concat(chunks);
}
