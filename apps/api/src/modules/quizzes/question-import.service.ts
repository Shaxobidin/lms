/**
 * Maqsad: savollarni fayldan import qilish — QTI 3.0/2.x (XML yoki ZIP paket),
 * AIKEN, GIFT, CSV (F-07, §10, §12).
 *
 * Oqim: fayl (`READY` holatda) → tahlil → har bir savol ichki sxemadan o'tkaziladi →
 * `dryRun` bo'lsa oldindan ko'rish, aks holda bitta tranzaksiyada yoziladi.
 * Tahlil muammolari yutilmaydi: qator/item raqami va sabab bilan qaytariladi (§16),
 * yaroqli savollar esa baribir import qilinadi — o'qituvchi qolganini tuzatib
 * qayta yuklaydi.
 */

import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { imageDimensions } from '../../common/storage/image-dimensions';
import { z } from 'zod';
import {
  MAX_IMPORT_QUESTIONS,
  PLACEHOLDER_IMAGE_FILE_ID,
  localizedRichTextSchema,
  normalizeForSearch,
  parseTextQuestions,
  questionPayloadSchema,
  type ImportIssue,
  type ImportParseResult,
  type ExportQuestionsInput,
  type ImportQuestionsInput,
  type ImportedQuestion,
  type Locale,
} from '@lms/shared';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { parseQtiXml } from './qti-parser';
import { writeQtiItem, writeQtiManifest, type ExportableQuestion } from './qti-writer';

/** ZIP paketidagi XML fayllar soni chegarasi (zip-bomb himoyasi). */
const MAX_ZIP_ENTRIES = 2000;
const MAX_XML_BYTES = 20 * 1024 * 1024;

const importedQuestionSchema = z.object({
  text: localizedRichTextSchema,
  payload: questionPayloadSchema,
  defaultScore: z.number().min(0.1).max(100),
  tags: z.array(z.string().trim().max(48)).max(20),
  explanation: localizedRichTextSchema.optional(),
});

/** HOTSPOT — rasm paketdan olinadi va faqat tasdiqlangan importda S3 ga yuklanadi. */
type QuestionWithImage = ImportedQuestion & {
  image?: { data: Buffer; mime: string; name: string };
};

export interface ImportPreviewRow {
  index: number;
  type: string;
  text: Record<string, string | undefined>;
  defaultScore: number;
  tags: string[];
}

@Injectable()
export class QuestionImportService {
  private readonly logger = new Logger(QuestionImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async importFromFile(input: ImportQuestionsInput, actor: RequestUser) {
    const bank = await this.prisma.db.questionBank.findUnique({
      where: { id: input.bankId },
      select: { id: true },
    });
    if (!bank) throw AppException.notFound('questionbank', input.bankId);

    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: input.fileObjectId },
      select: { id: true, objectKey: true, status: true, mimeType: true, originalName: true },
    });
    if (!file) throw AppException.notFound('file', input.fileObjectId);
    if (file.status !== 'READY') throw AppException.businessRule('errors.file_not_ready');

    const buffer = await this.storage.getObjectBuffer(file.objectKey);
    const parsed =
      input.format === 'QTI_3'
        ? this.parseQti(buffer, input.locale)
        : parseTextQuestions(input.format, buffer.toString('utf8'), input.locale);

    if (parsed.questions.length > MAX_IMPORT_QUESTIONS) {
      throw AppException.businessRule('errors.import_too_many', { max: MAX_IMPORT_QUESTIONS });
    }

    // Tahlilchi bergan har bir savol ichki sxemadan o'tishi shart — aks holda
    // bazaga noto'g'ri payload tushib, keyin test o'tkazishda buziladi
    const valid: QuestionWithImage[] = [];
    const issues: ImportIssue[] = [...parsed.issues];
    parsed.questions.forEach((question: QuestionWithImage, index) => {
      const result = importedQuestionSchema.safeParse(question);
      if (result.success) {
        valid.push({ ...(result.data as ImportedQuestion), image: question.image });
      } else {
        issues.push({
          line: index + 1,
          reason: 'import.invalid_question',
          detail: result.error.issues[0]?.path.join('.'),
        });
      }
    });

    const preview: ImportPreviewRow[] = valid.slice(0, 50).map((question, index) => ({
      index: index + 1,
      type: question.payload.type,
      text: question.text,
      defaultScore: question.defaultScore,
      tags: question.tags,
    }));

    if (input.dryRun) {
      return {
        format: input.format,
        fileName: file.originalName,
        total: valid.length,
        issues,
        preview,
        imported: 0,
      };
    }

    if (valid.length === 0) {
      throw AppException.businessRule('errors.import_no_questions', {
        issues: issues.length,
      });
    }

    // HOTSPOT rasmlari S3 ga tranzaksiyadan tashqarida yuklanadi
    const uploadedImages = new Map<
      QuestionWithImage,
      { objectKey: string; sizeBytes: number; checksum: string; mime: string; name: string }
    >();
    for (const question of valid) {
      if (!question.image) continue;
      const objectKey = this.storage.buildObjectKey('QUESTION_IMPORT', question.image.name);
      const stored = await this.storage.putObject(
        objectKey,
        question.image.data,
        question.image.mime,
      );
      uploadedImages.set(question, {
        objectKey,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksumSha256,
        mime: question.image.mime,
        name: question.image.name,
      });
    }

    const questionIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const question of valid) {
        const text = this.sanitizer.sanitizeLocalized(question.text);
        const image = uploadedImages.get(question);
        let imageFileId: string | null = null;
        if (image) {
          const fileObject = await tx.fileObject.create({
            data: {
              bucket: this.config.get('S3_BUCKET', { infer: true }),
              objectKey: image.objectKey,
              mimeType: image.mime,
              sizeBytes: BigInt(image.sizeBytes),
              checksumSha256: image.checksum,
              originalName: image.name.slice(0, 255),
              purpose: 'QUESTION_IMPORT',
              uploadedById: actor.id,
              status: 'READY',
            },
            select: { id: true },
          });
          imageFileId = fileObject.id;
        }
        const payload =
          question.payload.type === 'HOTSPOT' && imageFileId
            ? { ...question.payload, imageFileId }
            : question.payload;
        const created = await tx.question.create({
          data: {
            bankId: input.bankId,
            type: question.payload.type,
            text: text as never,
            payload: payload as never,
            imageFileId,
            explanation: this.sanitizer.sanitizeLocalized(question.explanation ?? {}) as never,
            defaultScore: question.defaultScore,
            difficulty: 'MEDIUM',
            tags: question.tags,
            searchText: normalizeForSearch(
              `${Object.values(text).filter(Boolean).join(' ')} ${question.tags.join(' ')}`,
            ),
          },
          select: { id: true },
        });
        ids.push(created.id);
      }
      return ids;
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'question.import',
      resource: 'questionbank',
      resourceId: input.bankId,
      after: {
        format: input.format,
        fileObjectId: file.id,
        imported: questionIds.length,
        issues: issues.length,
      },
    });

    this.logger.log(
      {
        bankId: input.bankId,
        format: input.format,
        imported: questionIds.length,
        issues: issues.length,
      },
      'Savollar import qilindi',
    );

    return {
      format: input.format,
      fileName: file.originalName,
      total: valid.length,
      imported: questionIds.length,
      issues,
      preview,
      questionIds,
    };
  }

  /**
   * Bankni QTI 3.0 paketiga eksport qiladi: ZIP S3 ga yoziladi, vaqtinchalik
   * yuklab olish havolasi qaytadi. HOTSPOT rasmlari `media/` ga kiradi.
   */
  async exportBank(bankId: string, input: ExportQuestionsInput, actor: RequestUser) {
    const bank = await this.prisma.db.questionBank.findUnique({
      where: { id: bankId },
      select: { id: true, title: true },
    });
    if (!bank) throw AppException.notFound('questionbank', bankId);

    const rows = await this.prisma.db.question.findMany({
      where: { bankId },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        text: true,
        payload: true,
        defaultScore: true,
        tags: true,
        explanation: true,
        imageFileId: true,
      },
    });
    if (rows.length === 0) throw AppException.businessRule('errors.export_empty');

    const zip = new AdmZip();
    const manifestItems: Array<{ id: string; file: string; media?: string }> = [];
    const skipped: Array<{ id: string; type: string }> = [];

    for (const row of rows) {
      const question: ExportableQuestion = {
        id: row.id,
        text: row.text as never,
        payload: row.payload as never,
        defaultScore: Number(row.defaultScore),
        tags: row.tags,
        explanation: row.explanation as never,
      };
      let media: string | undefined;
      if (question.payload.type === 'HOTSPOT') {
        const image = await this.loadImage(row.imageFileId ?? question.payload.imageFileId);
        if (image) {
          media = `media/${row.id}.${image.extension}`;
          zip.addFile(media, image.data);
          question.image = {
            fileName: `${row.id}.${image.extension}`,
            width: image.width,
            height: image.height,
          };
        }
      }
      const xml = writeQtiItem(question, input.locale);
      if (!xml) {
        skipped.push({ id: row.id, type: question.payload.type });
        continue;
      }
      const file = `items/${row.id}.xml`;
      zip.addFile(file, Buffer.from(xml, 'utf8'));
      manifestItems.push({ id: row.id, file, media });
    }

    const title =
      Object.values((bank.title ?? {}) as Record<string, string>).find(Boolean) ?? 'bank';
    zip.addFile('imsmanifest.xml', Buffer.from(writeQtiManifest(manifestItems, title), 'utf8'));
    const buffer = zip.toBuffer();

    const fileName = `qti-${bankId.slice(0, 8)}.zip`;
    const objectKey = this.storage.buildObjectKey('DOCUMENT', fileName);
    const stored = await this.storage.putObject(objectKey, buffer, 'application/zip');
    const fileObject = await this.prisma.db.fileObject.create({
      data: {
        bucket: this.config.get('S3_BUCKET', { infer: true }),
        objectKey,
        mimeType: 'application/zip',
        sizeBytes: BigInt(stored.sizeBytes),
        checksumSha256: stored.checksumSha256,
        originalName: fileName,
        purpose: 'DOCUMENT',
        uploadedById: actor.id,
        status: 'READY',
      },
      select: { id: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'question.export',
      resource: 'questionbank',
      resourceId: bankId,
      after: { format: input.format, exported: manifestItems.length, skipped: skipped.length },
    });

    return {
      fileObjectId: fileObject.id,
      fileName,
      url: await this.storage.createPresignedDownload(objectKey, fileName),
      exported: manifestItems.length,
      skipped,
    };
  }

  /** HOTSPOT rasmini S3 dan o'qib, o'lchamini aniqlaydi. */
  private async loadImage(
    fileObjectId: string | null,
  ): Promise<{ data: Buffer; width: number; height: number; extension: string } | null> {
    if (!fileObjectId) return null;
    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: fileObjectId },
      select: { objectKey: true, status: true },
    });
    if (!file || file.status !== 'READY') return null;
    const data = await this.storage.getObjectBuffer(file.objectKey);
    const dims = imageDimensions(data);
    if (!dims) return null;
    const extension =
      dims.mime === 'image/jpeg' ? 'jpg' : dims.mime === 'image/gif' ? 'gif' : 'png';
    return { data, width: dims.width, height: dims.height, extension };
  }

  /**
   * HOTSPOT savollari: rasm paketdan o'qiladi, koordinatalar pikseldan foizga
   * o'giriladi. Rasm topilmasa yoki o'lchami aniqlanmasa — savol muammo sifatida
   * qaytadi (yutilmaydi).
   */
  private attachImages(
    result: ImportParseResult,
    read: (path: string) => Buffer | null,
    baseDir: string,
  ): ImportParseResult {
    const questions: QuestionWithImage[] = [];
    const issues = [...result.issues];
    result.questions.forEach((question, position) => {
      if (!question.imageRef) {
        questions.push(question);
        return;
      }
      const relative = question.imageRef.path.replace(/\\/g, '/');
      const candidates = [baseDir ? `${baseDir}/${relative}` : relative, relative];
      const data = candidates.map(read).find((buffer): buffer is Buffer => Boolean(buffer));
      if (!data) {
        issues.push({ line: position + 1, reason: 'import.qti_image_missing', detail: relative });
        return;
      }
      const dims = imageDimensions(data);
      const width = question.imageRef.width ?? dims?.width ?? null;
      const height = question.imageRef.height ?? dims?.height ?? null;
      if (!width || !height) {
        issues.push({ line: position + 1, reason: 'import.qti_image_missing', detail: relative });
        return;
      }
      const payload = question.payload as {
        type: 'HOTSPOT';
        imageFileId: string;
        areas: Array<Record<string, number | string | Array<{ x: number; y: number }> | undefined>>;
        requiredAreaIds: string[];
      };
      const pct = (value: number, total: number) =>
        Math.max(0, Math.min(100, Math.round((value / total) * 1000) / 10));
      const areas = payload.areas.map((area) =>
        area.shape === 'POLY'
          ? {
              id: area.id,
              shape: 'POLY',
              x: pct(Number(area.x), width),
              y: pct(Number(area.y), height),
              points: ((area.points ?? []) as Array<{ x: number; y: number }>).map((point) => ({
                x: pct(Number(point.x), width),
                y: pct(Number(point.y), height),
              })),
            }
          : area.shape === 'RECT'
            ? {
                id: area.id,
                shape: 'RECT',
                x: pct(Number(area.x), width),
                y: pct(Number(area.y), height),
                width: pct(Number(area.width), width),
                height: pct(Number(area.height), height),
              }
            : {
                id: area.id,
                shape: 'CIRCLE',
                x: pct(Number(area.x), width),
                y: pct(Number(area.y), height),
                radius: pct(Number(area.radius), Math.min(width, height)),
              },
      );
      const name = relative.split('/').pop() ?? 'hotspot.png';
      questions.push({
        ...question,
        imageRef: undefined,
        payload: {
          type: 'HOTSPOT',
          imageFileId: PLACEHOLDER_IMAGE_FILE_ID,
          areas,
          requiredAreaIds: payload.requiredAreaIds,
        } as never,
        image: { data, mime: dims?.mime ?? 'application/octet-stream', name },
      });
    });
    return { questions, issues };
  }

  /**
   * QTI: yakka XML yoki ZIP paket (`imsmanifest.xml` + item fayllari).
   * ZIP ichidagi har bir `.xml` (manifest bundan mustasno) alohida tahlil qilinadi;
   * muammolarga fayl nomi qo'shiladi.
   */
  private parseQti(buffer: Buffer, locale: Locale): ImportParseResult {
    const isZip = buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
    if (!isZip) {
      if (buffer.length > MAX_XML_BYTES)
        throw AppException.businessRule('errors.import_file_too_large');
      const single = parseQtiXml(buffer.toString('utf8'), locale);
      return this.attachImages(single, () => null, '');
    }

    const zip = new AdmZip(buffer);
    const entries = zip
      .getEntries()
      .filter((entry) => !entry.isDirectory && /\.xml$/i.test(entry.entryName))
      .filter((entry) => !/imsmanifest\.xml$/i.test(entry.entryName));

    if (entries.length === 0) {
      return { questions: [], issues: [{ line: 0, reason: 'import.qti_no_items' }] };
    }
    if (entries.length > MAX_ZIP_ENTRIES) {
      throw AppException.businessRule('errors.scorm_too_many_entries', { max: MAX_ZIP_ENTRIES });
    }

    const questions: ImportedQuestion[] = [];
    const issues: ImportIssue[] = [];
    for (const entry of entries) {
      if (entry.header.size > MAX_XML_BYTES) {
        issues.push({ line: 0, reason: 'import.file_too_large', detail: entry.entryName });
        continue;
      }
      const xml = entry.getData().toString('utf8');
      // Manifestdan boshqa, item bo'lmagan XML (masalan, assessmentTest) — itemsiz deb hisoblanmaydi
      if (!/assessment-item|assessmentItem/.test(xml)) continue;
      const entryDir = entry.entryName.replace(/\\/g, '/').split('/').slice(0, -1).join('/');
      const result = this.attachImages(
        parseQtiXml(xml, locale),
        (path) => zip.getEntry(path)?.getData() ?? null,
        entryDir,
      );
      questions.push(...result.questions);
      issues.push(
        ...result.issues.map((issue) => ({
          ...issue,
          detail: issue.detail ? `${entry.entryName}: ${issue.detail}` : entry.entryName,
        })),
      );
    }

    if (questions.length === 0 && issues.length === 0) {
      issues.push({ line: 0, reason: 'import.qti_no_items' });
    }
    return { questions, issues };
  }
}
