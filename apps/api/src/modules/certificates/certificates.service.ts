/**
 * Maqsad: F-12 — sertifikat berish, PDF generatsiyasi va QR verifikatsiya.
 *
 * PDF `pdf-lib` bilan quriladi (tashqi brauzer/LibreOffice talab qilmaydi),
 * QR kod `qrcode` kutubxonasi orqali PNG sifatida joylashtiriladi.
 * Verifikatsiya sahifasi autentifikatsiyasiz ochiladi (§15 talabi).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PDFDocument, StandardFonts, rgb, degrees } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  formatOfficialDate,
  resolveLocalized,
  type IssueCertificateInput,
  type Locale,
  type LocalizedText,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { CryptoService } from '../../common/security/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { QueueService } from '../../common/queue/queue.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';

@Injectable()
export class CertificatesService {
  private readonly logger = new Logger(CertificatesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly queue: QueueService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Sertifikat(lar) berish.
   *
   * `userIds` bo'sh bo'lsa — kursni TUGATGAN barcha talabalarga beriladi.
   * PDF generatsiyasi navbatga chiqariladi (ADR-004): 200 ta sertifikat
   * API so'rovini bloklamasligi kerak.
   */
  async issue(input: IssueCertificateInput, actor: RequestUser) {
    const [template, course] = await Promise.all([
      this.prisma.db.certificateTemplate.findUnique({
        where: { id: input.templateId },
        select: { id: true, isActive: true },
      }),
      this.prisma.db.course.findUnique({
        where: { id: input.courseId },
        select: { id: true, title: true, academicHours: true, code: true },
      }),
    ]);

    if (!template) throw AppException.notFound('certificate', input.templateId);
    if (!template.isActive) throw AppException.businessRule('errors.template_inactive');
    if (!course) throw AppException.notFound('course', input.courseId);

    let userIds = input.userIds;
    if (userIds.length === 0) {
      const completed = await this.prisma.db.enrollment.findMany({
        where: { courseId: input.courseId, status: 'COMPLETED' },
        select: { userId: true },
      });
      userIds = completed.map((item) => item.userId);
    }

    if (userIds.length === 0) {
      throw AppException.businessRule('errors.no_eligible_students');
    }

    const year = new Date().getFullYear();
    const shortName = this.config.get('TENANT_SHORT_NAME', { infer: true });
    const issued: string[] = [];

    for (const userId of userIds) {
      // Bir kurs uchun bitta sertifikat (unikal cheklov ham buni kafolatlaydi)
      const existing = await this.prisma.db.certificate.findFirst({
        where: { userId, courseId: input.courseId },
        select: { id: true },
      });
      if (existing) continue;

      const profile = await this.prisma.db.userProfile.findUnique({
        where: { userId },
        select: { firstName: true, lastName: true, middleName: true },
      });

      const serialNumber = this.crypto.generateSerialNumber(shortName, year);
      const verificationCode = this.crypto.generateToken(12);

      const certificate = await this.prisma.$transaction(async (tx) => {
        const created = await tx.certificate.create({
          data: {
            templateId: input.templateId,
            userId,
            courseId: input.courseId,
            serialNumber,
            issuedById: actor.id,
            expiresAt: input.expiresAt ?? null,
            payload: {
              fullName: [profile?.lastName, profile?.firstName, profile?.middleName]
                .filter(Boolean)
                .join(' '),
              courseTitle: course.title,
              courseCode: course.code,
              academicHours: course.academicHours,
              issuedAt: new Date().toISOString(),
              ...(input.extraFields ?? {}),
            } as never,
          },
          select: { id: true },
        });

        await tx.verificationCode.create({
          data: { certificateId: created.id, code: verificationCode },
        });

        return created;
      });

      await this.queue.enqueue('certificate.issue', { certificateId: certificate.id });
      issued.push(certificate.id);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'certificate.issued',
      resource: 'certificate',
      resourceId: input.courseId,
      after: { count: issued.length },
    });

    return { issued: issued.length, certificateIds: issued };
  }

  /**
   * PDF generatsiyasi (worker chaqiradi).
   *
   * Shablon HTML emas, balki to'g'ridan-to'g'ri PDF ga chiziladi: bu
   * brauzersiz ishlaydi, tez va deterministik natija beradi.
   */
  async generatePdf(certificateId: string): Promise<{ fileObjectId: string }> {
    const certificate = await this.prisma.db.certificate.findUnique({
      where: { id: certificateId },
      select: {
        id: true,
        serialNumber: true,
        payload: true,
        issuedAt: true,
        template: { select: { orientation: true, name: true } },
        verification: { select: { code: true } },
        user: { select: { locale: true } },
      },
    });

    if (!certificate) throw AppException.notFound('certificate', certificateId);

    const payload = certificate.payload as Record<string, unknown>;
    const locale = (certificate.user.locale as Locale) ?? 'uz-Latn';
    const isLandscape = certificate.template.orientation === 'LANDSCAPE';

    const pdf = await PDFDocument.create();
    // A4: 595 x 842 pt
    const page = pdf.addPage(isLandscape ? [842, 595] : [595, 842]);
    const { width, height } = page.getSize();

    const titleFont = await pdf.embedFont(StandardFonts.HelveticaBold);
    const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);

    const accent = rgb(0.06, 0.29, 0.53);
    const muted = rgb(0.35, 0.38, 0.42);

    // Ramka
    page.drawRectangle({
      x: 24,
      y: 24,
      width: width - 48,
      height: height - 48,
      borderColor: accent,
      borderWidth: 2,
    });
    page.drawRectangle({
      x: 32,
      y: 32,
      width: width - 64,
      height: height - 64,
      borderColor: accent,
      borderWidth: 0.5,
    });

    const institution = this.config.get('TENANT_NAME', { infer: true });
    drawCentered(page, institution, titleFont, 16, height - 90, width, accent);

    drawCentered(page, 'SERTIFIKAT', titleFont, 34, height - 150, width, accent);
    drawCentered(page, 'CERTIFICATE', bodyFont, 12, height - 172, width, muted);

    drawCentered(
      page,
      'Ushbu sertifikat quyidagi shaxsga berildi:',
      bodyFont,
      11,
      height - 215,
      width,
      muted,
    );

    drawCentered(
      page,
      String(payload['fullName'] ?? ''),
      titleFont,
      24,
      height - 255,
      width,
      rgb(0.1, 0.1, 0.12),
    );

    const courseTitle = resolveLocalized(payload['courseTitle'] as LocalizedText, locale);
    drawCentered(
      page,
      '"' + courseTitle + '" kursini muvaffaqiyatli tamomlagani uchun',
      bodyFont,
      12,
      height - 295,
      width,
      muted,
    );

    const hours = Number(payload['academicHours'] ?? 0);
    if (hours > 0) {
      drawCentered(page, `Hajmi: ${hours} akademik soat`, bodyFont, 11, height - 320, width, muted);
    }

    // QR kod — verifikatsiya sahifasiga
    const verifyUrl = `${this.config.get('WEB_PUBLIC_URL', { infer: true })}/verify/${certificate.verification?.code ?? ''}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 240 });
    const qrImage = await pdf.embedPng(Buffer.from(qrDataUrl.split(',')[1] ?? '', 'base64'));

    const qrSize = 90;
    page.drawImage(qrImage, {
      x: width - qrSize - 60,
      y: 70,
      width: qrSize,
      height: qrSize,
    });

    page.drawText('Haqiqiyligini tekshirish', {
      x: width - qrSize - 60,
      y: 58,
      size: 7,
      font: bodyFont,
      color: muted,
    });

    // Seriya raqami va sana
    page.drawText(`Seriya: ${certificate.serialNumber}`, {
      x: 60,
      y: 110,
      size: 10,
      font: bodyFont,
      color: muted,
    });
    page.drawText(`Berilgan sana: ${formatOfficialDate(certificate.issuedAt)}`, {
      x: 60,
      y: 92,
      size: 10,
      font: bodyFont,
      color: muted,
    });

    // Imzo joyi
    page.drawLine({
      start: { x: 60, y: 175 },
      end: { x: 240, y: 175 },
      thickness: 0.7,
      color: muted,
    });
    page.drawText('Rektor', { x: 60, y: 160, size: 9, font: bodyFont, color: muted });

    // Diagonal himoya belgisi (nusxa ko'chirishni qiyinlashtiradi)
    page.drawText(this.config.get('TENANT_SHORT_NAME', { infer: true }), {
      x: width / 2 - 120,
      y: height / 2 - 40,
      size: 84,
      font: titleFont,
      color: rgb(0.93, 0.95, 0.98),
      rotate: degrees(30),
    });

    const bytes = await pdf.save();

    const objectKey = this.storage.buildObjectKey('CERTIFICATE', `${certificate.serialNumber}.pdf`);
    const stored = await this.storage.putObject(objectKey, Buffer.from(bytes), 'application/pdf');

    const fileObject = await this.prisma.db.fileObject.create({
      data: {
        bucket: this.config.get('S3_BUCKET', { infer: true }),
        objectKey: stored.objectKey,
        mimeType: 'application/pdf',
        sizeBytes: BigInt(stored.sizeBytes),
        checksumSha256: stored.checksumSha256,
        originalName: `${certificate.serialNumber}.pdf`,
        purpose: 'CERTIFICATE',
        status: 'READY',
      },
      select: { id: true },
    });

    await this.prisma.db.certificate.update({
      where: { id: certificateId },
      data: { pdfFileId: fileObject.id },
    });

    this.logger.log(
      { certificateId, serial: certificate.serialNumber },
      'Sertifikat PDF yaratildi',
    );
    return { fileObjectId: fileObject.id };
  }

  /**
   * Ochiq verifikatsiya (autentifikatsiyasiz).
   * Shaxsiy ma'lumot minimal: F.I.Sh, kurs, sana va holat.
   */
  async verify(code: string) {
    const verification = await this.prisma.verificationCode.findUnique({
      where: { code },
      select: {
        id: true,
        viewCount: true,
        certificate: {
          select: {
            serialNumber: true,
            payload: true,
            status: true,
            issuedAt: true,
            expiresAt: true,
            revokedAt: true,
            revokeReason: true,
            course: { select: { title: true, academicHours: true } },
            user: { select: { profile: { select: { firstName: true, lastName: true } } } },
          },
        },
      },
    });

    if (!verification) {
      return { valid: false, reasonKey: 'certificate.not_found' };
    }

    // Ko'rishlar sonini oshiramiz (statistika)
    await this.prisma.verificationCode.update({
      where: { id: verification.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    });

    const certificate = verification.certificate;
    const now = new Date();

    if (certificate.status === 'REVOKED') {
      return {
        valid: false,
        reasonKey: 'certificate.revoked',
        revokedAt: certificate.revokedAt,
        reason: certificate.revokeReason,
      };
    }

    if (certificate.expiresAt && certificate.expiresAt < now) {
      return { valid: false, reasonKey: 'certificate.expired', expiredAt: certificate.expiresAt };
    }

    const payload = certificate.payload as Record<string, unknown>;

    return {
      valid: true,
      serialNumber: certificate.serialNumber,
      fullName: payload['fullName'] ?? '',
      courseTitle: certificate.course.title,
      academicHours: certificate.course.academicHours,
      issuedAt: certificate.issuedAt,
      expiresAt: certificate.expiresAt,
    };
  }

  async revoke(certificateId: string, reason: string, actor: RequestUser) {
    const certificate = await this.prisma.db.certificate.findUnique({
      where: { id: certificateId },
      select: { id: true, status: true, serialNumber: true },
    });
    if (!certificate) throw AppException.notFound('certificate', certificateId);
    if (certificate.status === 'REVOKED') {
      throw AppException.conflict('errors.certificate_already_revoked');
    }

    await this.prisma.db.certificate.update({
      where: { id: certificateId },
      data: { status: 'REVOKED', revokedAt: new Date(), revokeReason: reason },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'certificate.revoked',
      resource: 'certificate',
      resourceId: certificateId,
      after: { reason, serialNumber: certificate.serialNumber },
    });

    return { revoked: true };
  }

  /** Sertifikatlar reestri (F-12). */
  async registry(filters: { courseId?: string; userId?: string; status?: string }) {
    return this.prisma.db.certificate.findMany({
      where: {
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.userId ? { userId: filters.userId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: { issuedAt: 'desc' },
      take: 500,
      select: {
        id: true,
        serialNumber: true,
        status: true,
        issuedAt: true,
        expiresAt: true,
        pdfFileId: true,
        verification: { select: { code: true, viewCount: true } },
        course: { select: { id: true, code: true, title: true } },
        user: {
          select: { id: true, profile: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  /** Faol shablonlar ro'yxati — sertifikat berish formasi shu yerdan tanlaydi. */
  async listTemplates() {
    return this.prisma.db.certificateTemplate.findMany({
      where: { isActive: true, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        orientation: true,
        fields: true,
        isActive: true,
        createdAt: true,
      },
    });
  }

  /** Standart shablonni yaratish (seed va birinchi ishga tushirish uchun). */
  async ensureDefaultTemplate(): Promise<string> {
    const existing = await this.prisma.db.certificateTemplate.findFirst({
      where: { isActive: true },
      select: { id: true },
    });
    if (existing) return existing.id;

    const created = await this.prisma.db.certificateTemplate.create({
      data: {
        name: {
          'uz-Latn': 'Standart sertifikat',
          'uz-Cyrl': 'Стандарт сертификат',
          ru: 'Стандартный сертификат',
          en: 'Default certificate',
        } as never,
        // PDF to'g'ridan-to'g'ri kodda chiziladi; HTML shablon kelajakdagi
        // vizual konstruktor uchun saqlanadi
        htmlTemplate: '<div class="certificate">{{fullName}} — {{courseTitle}}</div>',
        cssTemplate: '.certificate { text-align: center; font-size: 24px; }',
        orientation: 'LANDSCAPE',
        fields: ['fullName', 'courseTitle', 'academicHours', 'issuedAt', 'serialNumber'],
        isActive: true,
      },
      select: { id: true },
    });

    return created.id;
  }
}

/** Matnni sahifa markazida chizadi. */
function drawCentered(
  page: ReturnType<PDFDocument['addPage']>,
  text: string,
  font: Awaited<ReturnType<PDFDocument['embedFont']>>,
  size: number,
  y: number,
  pageWidth: number,
  color: ReturnType<typeof rgb>,
): void {
  // pdf-lib standart shriftlari kirill harflarini qo'llab-quvvatlamaydi,
  // shuning uchun matn xavfsiz (WinAnsi) belgilarga keltiriladi.
  const safeText = toWinAnsi(text);
  const textWidth = font.widthOfTextAtSize(safeText, size);
  page.drawText(safeText, {
    x: (pageWidth - textWidth) / 2,
    y,
    size,
    font,
    color,
  });
}

/**
 * O'zbek lotin alifbosidagi maxsus belgilarni WinAnsi ga moslashtiradi.
 * Kirillcha matn lotinga o'girilmaydi — bu funksiya faqat shrift
 * qo'llab-quvvatlamaydigan belgilarni almashtiradi.
 */
function toWinAnsi(text: string): string {
  return (
    text
      .replace(/[ʻʼ‘’]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[“”]/g, '"')
      // Qolgan qo'llab-quvvatlanmaydigan belgilar so'roq bilan almashadi
      .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?')
  );
}

export { toWinAnsi };
