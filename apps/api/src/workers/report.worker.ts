/**
 * Maqsad: hisobot va hujjat generatsiyasi (F-13, F-14).
 *
 * Natija S3 ga yoziladi, foydalanuvchiga bildirishnoma yuboriladi.
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import ExcelJS from 'exceljs';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';
import { BaseWorker } from './worker.base';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { SanitizerService } from '../common/security/sanitizer.service';
import { REDIS_CLIENT } from '../common/cache/cache.service';
import { EventsService, EVENT_TYPES } from '../common/events/events.service';
import { QUEUES, type JobPayloads } from '../common/queue/queue.service';
import { DocumentsService } from '../modules/documents/documents.service';
import { AnalyticsService } from '../modules/analytics/analytics.service';
import { CertificatesService } from '../modules/certificates/certificates.service';

@Injectable()
export class ReportWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly sanitizer: SanitizerService,
    private readonly events: EventsService,
    private readonly documents: DocumentsService,
    private readonly analytics: AnalyticsService,
    private readonly certificates: CertificatesService,
  ) {
    super(redis, QUEUES.REPORT, config.get('APP_ROLE', { infer: true }), 3);
  }

  protected async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'document.generate': {
        const payload = job.data as JobPayloads['document.generate'];
        const result = await this.documents.generate(payload.documentId);
        await this.notify(payload.requestedById, 'notification.report_ready', {
          documentId: payload.documentId,
        });
        return result;
      }

      case 'report.generate': {
        const payload = job.data as JobPayloads['report.generate'];
        return this.generateReport(payload);
      }

      case 'certificate.issue': {
        const payload = job.data as JobPayloads['certificate.issue'];
        return this.certificates.generatePdf(payload.certificateId);
      }

      default:
        return { skipped: job.name };
    }
  }

  /**
   * Analitik hisobotni XLSX ga eksport qiladi.
   * Har bir hisobot turi uchun alohida varaq tuzilishi.
   */
  private async generateReport(
    payload: JobPayloads['report.generate'],
  ): Promise<{ fileObjectId: string }> {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = this.config.get('TENANT_NAME', { infer: true });
    workbook.created = new Date();

    const filters = payload.filters as {
      courseId?: string;
      groupId?: string;
      departmentId?: string;
      semesterId?: string;
    };

    switch (payload.report) {
      case 'AT_RISK': {
        const sheet = workbook.addWorksheet('Xavf ostidagilar');
        sheet.columns = [
          { header: 'F.I.Sh.', key: 'fullName', width: 34 },
          { header: 'Xavf balli', key: 'riskScore', width: 12 },
          { header: 'Daraja', key: 'level', width: 10 },
          { header: 'Davomat past', key: 'lowAttendance', width: 14 },
          { header: 'Topshirilmagan', key: 'missed', width: 14 },
          { header: 'Ball past', key: 'lowScore', width: 12 },
          { header: 'Faolsiz kunlar', key: 'inactiveDays', width: 14 },
        ];
        sheet.getRow(1).font = { bold: true };

        if (filters.courseId) {
          const rows = await this.analytics.atRiskStudents(filters.courseId);
          for (const row of rows) {
            sheet.addRow({
              fullName: this.sanitizer.escapeSpreadsheetValue(
                (row as { fullName?: string }).fullName ?? row.userId,
              ),
              riskScore: row.riskScore,
              level: row.level,
              lowAttendance: row.factors.lowAttendance ? 'ha' : "yo'q",
              missed: row.factors.missedAssignments,
              lowScore: row.factors.lowScore ? 'ha' : "yo'q",
              inactiveDays: row.factors.inactiveDays,
            });
          }
        }
        break;
      }

      case 'PERFORMANCE': {
        const sheet = workbook.addWorksheet("O'zlashtirish");
        sheet.columns = [
          { header: 'Kurs', key: 'course', width: 40 },
          { header: 'Talabalar', key: 'students', width: 12 },
          { header: "O'rtacha ball", key: 'average', width: 14 },
          { header: "O'zlashtirish %", key: 'passRate', width: 16 },
        ];
        sheet.getRow(1).font = { bold: true };

        const courses = await this.prisma.db.course.findMany({
          where: {
            ...(filters.courseId ? { id: filters.courseId } : {}),
            ...(filters.departmentId ? { departmentId: filters.departmentId } : {}),
            ...(filters.semesterId ? { semesterId: filters.semesterId } : {}),
          },
          select: { id: true, code: true, title: true },
          take: 500,
        });

        for (const course of courses) {
          const grades = await this.prisma.db.grade.findMany({
            where: { courseId: course.id },
            select: { userId: true, score: true, maxScore: true },
          });

          const byUser = new Map<string, { earned: number; max: number }>();
          for (const grade of grades) {
            const entry = byUser.get(grade.userId) ?? { earned: 0, max: 0 };
            entry.earned += Number(grade.score);
            entry.max += Number(grade.maxScore);
            byUser.set(grade.userId, entry);
          }

          const percents = Array.from(byUser.values())
            .filter((entry) => entry.max > 0)
            .map((entry) => (entry.earned / entry.max) * 100);

          sheet.addRow({
            course: `${course.code} — ${JSON.stringify(course.title).slice(0, 80)}`,
            students: byUser.size,
            average:
              percents.length > 0
                ? Math.round(
                    (percents.reduce((sum, value) => sum + value, 0) / percents.length) * 100,
                  ) / 100
                : 0,
            passRate:
              percents.length > 0
                ? Math.round((percents.filter((v) => v >= 60).length / percents.length) * 10000) /
                  100
                : 0,
          });
        }
        break;
      }

      case 'TEACHER_WORKLOAD': {
        const sheet = workbook.addWorksheet('Yuklama');
        sheet.columns = [
          { header: 'F.I.Sh.', key: 'fullName', width: 34 },
          { header: 'Soat', key: 'hours', width: 10 },
          { header: 'Kurslar', key: 'courses', width: 10 },
          { header: 'Talabalar', key: 'students', width: 12 },
        ];
        sheet.getRow(1).font = { bold: true };

        if (filters.departmentId) {
          const rows = await this.analytics.teacherWorkload(
            filters.departmentId,
            filters.semesterId,
          );
          for (const row of rows) {
            sheet.addRow({
              fullName: this.sanitizer.escapeSpreadsheetValue(row.fullName),
              hours: row.totalHours,
              courses: row.courses,
              students: row.students,
            });
          }
        }
        break;
      }

      default: {
        // Qolgan hisobot turlari uchun umumiy varaq
        const sheet = workbook.addWorksheet('Hisobot');
        sheet.addRow(['Hisobot turi', payload.report]);
        sheet.addRow(['Yaratilgan', new Date().toISOString()]);
        break;
      }
    }

    const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
    const fileName = `${payload.report.toLowerCase()}-${Date.now()}.xlsx`;
    const objectKey = this.storage.buildObjectKey('DOCUMENT', fileName);
    const stored = await this.storage.putObject(
      objectKey,
      buffer,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );

    const fileObject = await this.prisma.db.fileObject.create({
      data: {
        bucket: this.config.get('S3_BUCKET', { infer: true }),
        objectKey: stored.objectKey,
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        sizeBytes: BigInt(stored.sizeBytes),
        checksumSha256: stored.checksumSha256,
        originalName: fileName,
        purpose: 'DOCUMENT',
        uploadedById: payload.requestedById,
        status: 'READY',
      },
      select: { id: true },
    });

    await this.notify(payload.requestedById, 'notification.report_ready', {
      fileObjectId: fileObject.id,
      report: payload.report,
    });

    return { fileObjectId: fileObject.id };
  }

  /** Foydalanuvchini xabardor qilish (ilova ichida va SSE orqali). */
  private async notify(
    userId: string,
    templateKey: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.notification.create({
      data: {
        userId,
        templateKey,
        params: params as never,
        channels: ['IN_APP'],
        status: 'SENT',
        sentAt: new Date(),
      },
    });

    await this.events.publish({
      type: EVENT_TYPES.JOB_COMPLETED,
      userId,
      payload: { templateKey, ...params },
    });
  }
}
