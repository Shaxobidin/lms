/**
 * Maqsad: F-14 — hujjat aylanishi: reyting varaqasi, buyruq loyihasi,
 * ma'lumotnoma, protokol va transkript.
 *
 * Barcha DOCX hujjatlar GOST 7.32 talablariga muvofiq rasmiylashtiriladi
 * (`gost.ts`). Generatsiya navbatda bajariladi, natija `FileObject` sifatida
 * saqlanadi va foydalanuvchiga havola beriladi (ADR-004).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  WidthType,
} from 'docx';
import ExcelJS from 'exceljs';
import {
  protocolParamsSchema,
  syllabusContentSchema,
  syllabusDocumentParamsSchema,
  formatOfficialDate,
  resolveLocalized,
  type GenerateDocumentInput,
  type Locale,
  type LocalizedText,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { QueueService } from '../../common/queue/queue.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { GradingService } from '../grading/grading.service';
import {
  gostCellText,
  gostFooter,
  gostHeading,
  gostParagraph,
  gostSection,
  gostSignatureLine,
  gostSpacer,
  gostTableCaption,
  gostTitle,
} from './gost';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly queue: QueueService,
    private readonly grading: GradingService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Hujjat generatsiyasini navbatga qo'yadi va yozuv yaratadi.
   * Mijoz `documentId` bo'yicha holatni kuzatadi.
   */
  async request(input: GenerateDocumentInput, actor: RequestUser) {
    const document = await this.prisma.db.generatedDocument.create({
      data: {
        templateKey: input.template,
        format: input.format,
        params: input.params as never,
        createdById: actor.id,
        status: 'QUEUED',
      },
      select: { id: true },
    });

    const jobId = await this.queue.enqueue('document.generate', {
      requestedById: actor.id,
      documentId: document.id,
    });

    return { documentId: document.id, jobId, status: 'QUEUED' };
  }

  /** Worker chaqiradi: hujjatni haqiqatan generatsiya qiladi. */
  async generate(documentId: string): Promise<{ fileObjectId: string }> {
    const document = await this.prisma.db.generatedDocument.findUnique({
      where: { id: documentId },
      select: { id: true, templateKey: true, format: true, params: true, createdById: true },
    });
    if (!document) throw AppException.notFound('document', documentId);

    const params = document.params as Record<string, unknown>;

    let buffer: Buffer;
    let fileName: string;
    let mimeType: string;

    switch (document.templateKey) {
      case 'RATING_SHEET': {
        if (document.format === 'XLSX') {
          buffer = await this.buildRatingSheetXlsx(params);
          fileName = `reyting-varaqasi-${Date.now()}.xlsx`;
          mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        } else {
          buffer = await this.buildRatingSheetDocx(params);
          fileName = `reyting-varaqasi-${Date.now()}.docx`;
          mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        }
        break;
      }
      case 'ORDER_DRAFT': {
        buffer = await this.buildOrderDraft(params);
        fileName = `buyruq-loyihasi-${Date.now()}.docx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      }
      case 'REFERENCE': {
        buffer = await this.buildReference(params);
        fileName = `malumotnoma-${Date.now()}.docx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      }
      case 'TRANSCRIPT': {
        buffer = await this.buildTranscript(params);
        fileName = `transkript-${Date.now()}.docx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      }
      case 'ATTENDANCE_SHEET': {
        buffer = await this.buildAttendanceSheet(params);
        fileName = `davomat-${Date.now()}.xlsx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      }
      case 'PROTOCOL': {
        buffer = await this.buildProtocol(params);
        fileName = `bayonnoma-${Date.now()}.docx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      }
      case 'SYLLABUS': {
        buffer = await this.buildSyllabusDocument(params);
        fileName = `sillabus-${Date.now()}.docx`;
        mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      }
      default:
        throw AppException.businessRule('errors.unknown_document_template', {
          template: document.templateKey,
        });
    }

    const objectKey = this.storage.buildObjectKey('DOCUMENT', fileName);
    const stored = await this.storage.putObject(objectKey, buffer, mimeType);

    const fileObject = await this.prisma.db.fileObject.create({
      data: {
        bucket: this.config.get('S3_BUCKET', { infer: true }),
        objectKey: stored.objectKey,
        mimeType,
        sizeBytes: BigInt(stored.sizeBytes),
        checksumSha256: stored.checksumSha256,
        originalName: fileName,
        purpose: 'DOCUMENT',
        uploadedById: document.createdById,
        status: 'READY',
      },
      select: { id: true },
    });

    await this.prisma.db.generatedDocument.update({
      where: { id: documentId },
      data: { fileObjectId: fileObject.id, status: 'GENERATED' },
    });

    this.logger.log({ documentId, template: document.templateKey }, 'Hujjat generatsiya qilindi');
    return { fileObjectId: fileObject.id };
  }

  // --- Reyting varaqasi (GOST DOCX) ----------------------------------------

  /**
   * Reyting varaqasi — semestr yakunidagi asosiy rasmiy hujjat.
   * Format: A4 albom, Times New Roman 14 pt, 1.5 interval, sahifa raqami pastda.
   */
  private async buildRatingSheetDocx(params: Record<string, unknown>): Promise<Buffer> {
    const courseId = String(params['courseId'] ?? '');
    const groupId = String(params['groupId'] ?? '');

    const [course, group, gradebook] = await Promise.all([
      this.prisma.db.course.findUnique({
        where: { id: courseId },
        select: {
          code: true,
          title: true,
          subject: { select: { name: true, credits: true } },
          semester: {
            select: { number: true, academicYear: { select: { name: true } } },
          },
          teachers: {
            where: { role: 'LEAD' },
            select: {
              user: { select: { profile: { select: { firstName: true, lastName: true } } } },
            },
          },
        },
      }),
      this.prisma.db.group.findUnique({
        where: { id: groupId },
        select: {
          name: true,
          speciality: {
            select: {
              name: true,
              department: { select: { name: true, faculty: { select: { name: true } } } },
            },
          },
        },
      }),
      this.grading.courseGradebook(courseId),
    ]);

    if (!course || !group) throw AppException.notFound('course', courseId);

    const locale: Locale = 'uz-Latn';
    const rows = gradebook.filter((row) => row.group?.id === groupId || !row.group);

    const headerCells = [
      '№',
      'Talabaning F.I.Sh.',
      'JN (30)',
      'ON (30)',
      'YN (40)',
      'Jami (100)',
      'Baho',
      'GPA',
      'Imzo',
    ];

    const table = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: headerCells.map(
            (text) =>
              new TableCell({
                children: [gostCellText(text, { bold: true, align: AlignmentType.CENTER })],
              }),
          ),
        }),
        ...rows.map((row, index) => {
          const jn = row.controls.find((item) => item.controlType === 'JN');
          const on = row.controls.find((item) => item.controlType === 'ON');
          const yn = row.controls.find((item) => item.controlType === 'YN');

          return new TableRow({
            children: [
              new TableCell({
                children: [gostCellText(String(index + 1), { align: AlignmentType.CENTER })],
              }),
              new TableCell({ children: [gostCellText(row.fullName)] }),
              new TableCell({
                children: [
                  gostCellText(formatControl(jn?.earned, jn?.max), {
                    align: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  gostCellText(formatControl(on?.earned, on?.max), {
                    align: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  gostCellText(formatControl(yn?.earned, yn?.max), {
                    align: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [
                  gostCellText(row.final.score.toFixed(1), {
                    bold: true,
                    align: AlignmentType.CENTER,
                  }),
                ],
              }),
              new TableCell({
                children: [gostCellText(row.final.letter, { align: AlignmentType.CENTER })],
              }),
              new TableCell({
                children: [
                  gostCellText(row.final.gpaPoints.toFixed(2), { align: AlignmentType.CENTER }),
                ],
              }),
              new TableCell({ children: [gostCellText('')] }),
            ],
          });
        }),
      ],
    });

    const signatories = Array.isArray(params['signatories'])
      ? (params['signatories'] as Array<{ role: string; fullName: string }>)
      : [];

    const leadTeacher = course.teachers[0]?.user.profile;
    const teacherName = [leadTeacher?.lastName, leadTeacher?.firstName].filter(Boolean).join(' ');

    const document = new Document({
      creator: this.config.get('TENANT_NAME', { infer: true }),
      title: 'Reyting varaqasi',
      sections: [
        {
          properties: gostSection(true),
          footers: { default: gostFooter() },
          children: [
            gostParagraph(this.config.get('TENANT_NAME', { infer: true }), {
              indent: false,
              align: AlignmentType.CENTER,
              bold: true,
            }),
            gostParagraph(
              resolveLocalized(group.speciality.department.faculty.name as LocalizedText, locale) +
                ' fakulteti',
              { indent: false, align: AlignmentType.CENTER },
            ),
            gostSpacer(),
            gostTitle('Reyting varaqasi'),
            gostParagraph(
              `Fan: ${resolveLocalized(
                (course.subject?.name ?? course.title) as LocalizedText,
                locale,
              )} (${course.code})`,
              { indent: false },
            ),
            gostParagraph(`Kredit: ${course.subject?.credits ?? 0}`, { indent: false }),
            gostParagraph(`Guruh: ${group.name}`, { indent: false }),
            gostParagraph(
              `Yo'nalish: ${resolveLocalized(group.speciality.name as LocalizedText, locale)}`,
              { indent: false },
            ),
            gostParagraph(
              `O'quv yili: ${course.semester?.academicYear.name ?? '—'}, ${course.semester?.number ?? '—'}-semestr`,
              { indent: false },
            ),
            gostParagraph(`Sana: ${formatOfficialDate(new Date())}`, { indent: false }),
            gostSpacer(),
            gostTableCaption(1, 'Talabalarning nazorat natijalari'),
            table,
            gostSpacer(),
            gostParagraph(
              `Jami talabalar: ${rows.length}. O'zlashtirganlar: ${
                rows.filter((row) => row.final.passed).length
              }.`,
              { indent: false },
            ),
            gostSpacer(),
            ...(teacherName ? [gostSignatureLine("O'qituvchi", teacherName)] : []),
            ...signatories.map((item) => gostSignatureLine(item.role, item.fullName)),
          ],
        },
      ],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  /** Reyting varaqasining XLSX varianti — dekanat qo'shimcha hisob uchun. */
  private async buildRatingSheetXlsx(params: Record<string, unknown>): Promise<Buffer> {
    const courseId = String(params['courseId'] ?? '');
    const gradebook = await this.grading.courseGradebook(courseId);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = this.config.get('TENANT_NAME', { infer: true });
    const sheet = workbook.addWorksheet('Reyting');

    sheet.columns = [
      { header: '№', key: 'index', width: 6 },
      { header: 'F.I.Sh.', key: 'fullName', width: 36 },
      { header: 'Guruh', key: 'group', width: 14 },
      { header: 'JN', key: 'jn', width: 10 },
      { header: 'ON', key: 'on', width: 10 },
      { header: 'YN', key: 'yn', width: 10 },
      { header: 'Jami', key: 'total', width: 10 },
      { header: 'Baho', key: 'letter', width: 8 },
      { header: 'GPA', key: 'gpa', width: 8 },
    ];

    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).alignment = { horizontal: 'center' };

    gradebook.forEach((row, index) => {
      const jn = row.controls.find((item) => item.controlType === 'JN');
      const on = row.controls.find((item) => item.controlType === 'ON');
      const yn = row.controls.find((item) => item.controlType === 'YN');

      sheet.addRow({
        index: index + 1,
        // Formula in'yeksiyasidan himoya (§11)
        fullName: this.sanitizer.escapeSpreadsheetValue(row.fullName),
        group: row.group?.name ?? '',
        jn: jn ? Number(jn.earned) : null,
        on: on ? Number(on.earned) : null,
        yn: yn ? Number(yn.earned) : null,
        total: row.final.score,
        letter: row.final.letter,
        gpa: row.final.gpaPoints,
      });
    });

    // O'zlashtirmaganlarni ajratib ko'rsatamiz
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const total = Number(row.getCell('total').value ?? 0);
      if (total < 60) {
        row.getCell('total').font = { color: { argb: 'FFB00020' }, bold: true };
      }
    });

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  // --- Buyruq loyihasi ------------------------------------------------------

  private async buildOrderDraft(params: Record<string, unknown>): Promise<Buffer> {
    const orderType = String(params['orderType'] ?? 'ENROLLMENT');
    const userIds = Array.isArray(params['subjectUserIds'])
      ? (params['subjectUserIds'] as string[])
      : [];
    const reason = String(params['reason'] ?? '');
    const documentNumber = String(params['documentNumber'] ?? '___');
    const effectiveDate = params['effectiveDate']
      ? new Date(String(params['effectiveDate']))
      : new Date();

    const users = await this.prisma.db.user.findMany({
      where: { id: { in: userIds } },
      select: {
        profile: { select: { firstName: true, lastName: true, middleName: true } },
        studentGroups: {
          where: { leftAt: null },
          take: 1,
          select: { group: { select: { name: true } } },
        },
      },
    });

    const titles: Record<string, string> = {
      ENROLLMENT: "Talabalar safiga qabul qilish to'g'risida",
      EXPULSION: "Talabalar safidan chetlashtirish to'g'risida",
      TRANSFER: "Boshqa guruhga o'tkazish to'g'risida",
      ACADEMIC_LEAVE: "Akademik ta'til berish to'g'risida",
      REINSTATEMENT: "Talabalar safiga qayta tiklash to'g'risida",
      SCHOLARSHIP: "Stipendiya tayinlash to'g'risida",
    };

    const document = new Document({
      creator: this.config.get('TENANT_NAME', { infer: true }),
      title: 'Buyruq loyihasi',
      sections: [
        {
          properties: gostSection(),
          footers: { default: gostFooter() },
          children: [
            gostParagraph(this.config.get('TENANT_NAME', { infer: true }), {
              indent: false,
              align: AlignmentType.CENTER,
              bold: true,
            }),
            gostSpacer(),
            gostTitle('Buyruq'),
            gostParagraph(
              `${formatOfficialDate(effectiveDate)}                                    № ${documentNumber}`,
              { indent: false, align: AlignmentType.CENTER },
            ),
            gostSpacer(),
            gostParagraph(titles[orderType] ?? 'Buyruq', {
              indent: false,
              align: AlignmentType.CENTER,
              bold: true,
            }),
            gostSpacer(),
            gostParagraph(reason),
            gostSpacer(),
            gostParagraph('BUYURAMAN:', { indent: false, bold: true }),
            gostSpacer(),
            ...users.map((user, index) =>
              gostParagraph(
                `${index + 1}. ${[
                  user.profile?.lastName,
                  user.profile?.firstName,
                  user.profile?.middleName,
                ]
                  .filter(Boolean)
                  .join(' ')}` +
                  (user.studentGroups[0] ? ` (${user.studentGroups[0].group.name}-guruh)` : ''),
              ),
            ),
            gostSpacer(),
            gostParagraph(
              "Buyruqning ijrosini nazorat qilish o'quv ishlari bo'yicha prorektor zimmasiga yuklatilsin.",
            ),
            gostSpacer(),
            gostSignatureLine('Rektor', '_________________________'),
            gostSpacer(),
            gostParagraph("Loyiha — huquqiy ekspertizadan o'tkazilishi shart.", {
              indent: false,
            }),
          ],
        },
      ],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  // --- Bayonnoma (protokol) -------------------------------------------------

  /**
   * Kengash yoki komissiya bayonnomasi (GOST 7.32 + O'zDSt).
   *
   * Tuzilishi rasmiy ish yuritish qoidalariga mos: sarlavha, sana va raqam,
   * qatnashchilar, kun tartibi, muhokama va qarorlar, imzolar.
   */
  private async buildProtocol(params: Record<string, unknown>): Promise<Buffer> {
    const parsed = protocolParamsSchema.parse(params);
    const tenant = this.config.get('TENANT_NAME', { infer: true });

    // Matnlar foydalanuvchidan keladi — DOCX ga tushishidan oldin tozalanadi
    const title = this.sanitizer.stripHtml(parsed.title);
    const participants = parsed.participants.map((item) => this.sanitizer.stripHtml(item));
    const agenda = parsed.agenda.map((item) => this.sanitizer.stripHtml(item));
    const decisions = parsed.decisions.map((item) => this.sanitizer.stripHtml(item));

    const document = new Document({
      creator: tenant,
      title: 'Bayonnoma',
      sections: [
        {
          properties: gostSection(),
          footers: { default: gostFooter() },
          children: [
            gostParagraph(tenant, { indent: false, align: AlignmentType.CENTER, bold: true }),
            gostSpacer(),
            gostTitle('Bayonnoma'),
            gostParagraph(
              `${formatOfficialDate(parsed.meetingDate)}                                    № ___`,
              { indent: false, align: AlignmentType.CENTER },
            ),
            gostSpacer(),
            gostParagraph(title, { indent: false, align: AlignmentType.CENTER, bold: true }),
            gostSpacer(),

            gostHeading('Qatnashdilar', 2),
            ...participants.map((name, index) => gostParagraph(`${index + 1}. ${name}`)),
            gostSpacer(),

            gostHeading('Kun tartibi', 2),
            ...agenda.map((item, index) => gostParagraph(`${index + 1}. ${item}`)),
            gostSpacer(),

            gostHeading('Qaror qilindi', 2),
            ...(decisions.length > 0
              ? decisions.map((item, index) => gostParagraph(`${index + 1}. ${item}`))
              : [gostParagraph('Qarorlar bayonnomaga keyinchalik kiritiladi.')]),
            gostSpacer(),

            gostSignatureLine('Rais', '_________________________'),
            gostSpacer(),
            gostSignatureLine('Kotib', '_________________________'),
          ],
        },
      ],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  // --- Sillabus (O'UM) ------------------------------------------------------

  /**
   * Sillabusni rasmiy DOCX ga chiqarish: fan ma'lumotlari, maqsad, o'quv
   * natijalari (Bloom darajasi bilan), mavzular rejasi soatlar taqsimoti bilan,
   * baholash siyosati (JN/ON/YN) va adabiyotlar.
   *
   * Versiya MUZLATILGAN mazmundan olinadi (ADR-012), shuning uchun hujjat
   * o'sha paytdagi holatni aks ettiradi.
   */
  private async buildSyllabusDocument(params: Record<string, unknown>): Promise<Buffer> {
    const parsed = syllabusDocumentParamsSchema.parse(params);

    const syllabus = await this.prisma.db.syllabus.findUnique({
      where: { id: parsed.syllabusId },
      select: {
        currentVersion: true,
        subject: { select: { code: true, name: true, credits: true } },
        department: { select: { name: true } },
        versions: {
          orderBy: { version: 'desc' },
          take: 1,
          select: { version: true, content: true, gradingPolicy: true },
        },
      },
    });

    if (!syllabus) throw AppException.notFound('syllabus', parsed.syllabusId);

    const version = syllabus.versions[0];
    if (!version) {
      throw AppException.businessRule('errors.syllabus_version_missing', {
        syllabusId: parsed.syllabusId,
      });
    }

    const content = syllabusContentSchema.partial().parse(version.content ?? {});
    const policy = version.gradingPolicy as { weights?: Record<string, number> } | null;
    const locale: Locale = 'uz-Latn';
    const tenant = this.config.get('TENANT_NAME', { infer: true });

    const topics = content.topics ?? [];
    const topicsTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: ['№', 'Mavzu', "Ma'ruza", 'Amaliy', 'Lab.', 'Mustaqil'].map(
            (text) =>
              new TableCell({
                children: [gostCellText(text, { bold: true, align: AlignmentType.CENTER })],
              }),
          ),
        }),
        ...topics.map(
          (topic, index) =>
            new TableRow({
              children: [
                new TableCell({
                  children: [gostCellText(String(index + 1), { align: AlignmentType.CENTER })],
                }),
                new TableCell({
                  children: [gostCellText(resolveLocalized(topic.title as LocalizedText, locale))],
                }),
                new TableCell({
                  children: [
                    gostCellText(String(topic.lectureHours), { align: AlignmentType.CENTER }),
                  ],
                }),
                new TableCell({
                  children: [
                    gostCellText(String(topic.practiceHours), { align: AlignmentType.CENTER }),
                  ],
                }),
                new TableCell({
                  children: [gostCellText(String(topic.labHours), { align: AlignmentType.CENTER })],
                }),
                new TableCell({
                  children: [
                    gostCellText(String(topic.independentHours), { align: AlignmentType.CENTER }),
                  ],
                }),
              ],
            }),
        ),
      ],
    });

    const outcomes = content.learningOutcomes ?? [];
    const literature = content.literature ?? [];
    const weights = policy?.weights ?? { JN: 30, ON: 30, YN: 40 };

    const assessmentBlock = parsed.includeAssessment
      ? [
          gostHeading('Baholash siyosati', 2),
          gostParagraph(
            `Joriy nazorat (JN) — ${weights['JN'] ?? 0}%, oraliq nazorat (ON) — ` +
              `${weights['ON'] ?? 0}%, yakuniy nazorat (YN) — ${weights['YN'] ?? 0}%.`,
          ),
          gostParagraph(
            "Fanni o'zlashtirish uchun 100 ballik shkalada kamida 60 ball to'plash talab etiladi.",
          ),
          gostSpacer(),
        ]
      : [];

    const document = new Document({
      creator: tenant,
      title: 'Sillabus',
      sections: [
        {
          properties: gostSection(),
          footers: { default: gostFooter() },
          children: [
            gostParagraph(tenant, { indent: false, align: AlignmentType.CENTER, bold: true }),
            gostParagraph(resolveLocalized(syllabus.department.name as LocalizedText, locale), {
              indent: false,
              align: AlignmentType.CENTER,
            }),
            gostSpacer(),
            gostTitle('Sillabus'),
            gostParagraph(
              `${syllabus.subject.code} — ${resolveLocalized(syllabus.subject.name as LocalizedText, locale)}`,
              { indent: false, align: AlignmentType.CENTER, bold: true },
            ),
            gostParagraph(`Kredit: ${syllabus.subject.credits} · Versiya: ${version.version}`, {
              indent: false,
              align: AlignmentType.CENTER,
            }),
            gostSpacer(),

            gostHeading('Fanning maqsadi', 2),
            gostParagraph(
              content.goal
                ? this.sanitizer.stripHtml(resolveLocalized(content.goal as LocalizedText, locale))
                : "Maqsad sillabus versiyasida ko'rsatilmagan.",
            ),
            gostSpacer(),

            gostHeading("O'quv natijalari", 2),
            ...(outcomes.length > 0
              ? outcomes.map((outcome, index) =>
                  gostParagraph(
                    `${index + 1}. ${resolveLocalized(outcome.text as LocalizedText, locale)} ` +
                      `(Bloom: ${outcome.bloomLevel})`,
                  ),
                )
              : [gostParagraph("O'quv natijalari kiritilmagan.")]),
            gostSpacer(),

            gostTableCaption(1, 'Mavzular rejasi va soatlar taqsimoti'),
            topicsTable,
            gostSpacer(),

            ...assessmentBlock,

            gostHeading('Adabiyotlar', 2),
            ...(literature.length > 0
              ? literature.map((item, index) =>
                  gostParagraph(`${index + 1}. ${this.sanitizer.stripHtml(item.citation)}`),
                )
              : [gostParagraph("Adabiyotlar ro'yxati kiritilmagan.")]),
            gostSpacer(),

            gostSignatureLine('Kafedra mudiri', '_________________________'),
          ],
        },
      ],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  // --- Ma'lumotnoma ---------------------------------------------------------

  private async buildReference(params: Record<string, unknown>): Promise<Buffer> {
    const userId = String(params['userId'] ?? '');
    const purpose = String(params['purpose'] ?? '');
    const includeGrades = Boolean(params['includeGrades']);

    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: {
        profile: { select: { firstName: true, lastName: true, middleName: true, birthDate: true } },
        studentGroups: {
          where: { leftAt: null },
          take: 1,
          select: {
            group: {
              select: {
                name: true,
                admissionYear: true,
                educationForm: true,
                speciality: {
                  select: {
                    name: true,
                    level: true,
                    department: { select: { faculty: { select: { name: true } } } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) throw AppException.notFound('user', userId);

    const locale: Locale = 'uz-Latn';
    const membership = user.studentGroups[0]?.group;
    const fullName = [user.profile?.lastName, user.profile?.firstName, user.profile?.middleName]
      .filter(Boolean)
      .join(' ');

    const children: Paragraph[] = [
      gostParagraph(this.config.get('TENANT_NAME', { infer: true }), {
        indent: false,
        align: AlignmentType.CENTER,
        bold: true,
      }),
      gostSpacer(),
      gostTitle("Ma'lumotnoma"),
      gostSpacer(),
      gostParagraph(
        `Ushbu ma'lumotnoma ${fullName}ga berildiki, u haqiqatan ham ` +
          `${this.config.get('TENANT_NAME', { infer: true })}ning ` +
          (membership
            ? `${resolveLocalized(membership.speciality.department.faculty.name as LocalizedText, locale)} fakulteti ` +
              `${resolveLocalized(membership.speciality.name as LocalizedText, locale)} yo'nalishi ` +
              `${membership.name}-guruh talabasi hisoblanadi.`
            : 'talabasi hisoblanadi.'),
      ),
    ];

    if (membership) {
      children.push(
        gostParagraph(`Qabul yili: ${membership.admissionYear}.`),
        gostParagraph(`Ta'lim shakli: ${educationFormLabel(membership.educationForm)}.`),
      );
    }

    if (includeGrades) {
      const transcript = await this.grading.transcript(userId);
      children.push(
        gostSpacer(),
        gostHeading("O'zlashtirish ko'rsatkichlari", 2),
        gostParagraph(`Kumulyativ GPA: ${transcript.cumulative.gpa.toFixed(2)}`),
        gostParagraph(
          `To'plangan kreditlar: ${transcript.cumulative.earnedCredits} / ${transcript.cumulative.totalCredits}`,
        ),
      );
    }

    children.push(
      gostSpacer(),
      gostParagraph(`Ma'lumotnoma ${purpose} uchun berildi.`),
      gostSpacer(),
      gostParagraph(`Berilgan sana: ${formatOfficialDate(new Date())}`, { indent: false }),
      gostSpacer(),
      gostSignatureLine('Dekan', '_________________________'),
    );

    const document = new Document({
      creator: this.config.get('TENANT_NAME', { infer: true }),
      title: "Ma'lumotnoma",
      sections: [{ properties: gostSection(), footers: { default: gostFooter() }, children }],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  // --- Transkript -----------------------------------------------------------

  private async buildTranscript(params: Record<string, unknown>): Promise<Buffer> {
    const userId = String(params['userId'] ?? '');
    const transcript = await this.grading.transcript(userId);

    const user = await this.prisma.db.user.findUnique({
      where: { id: userId },
      select: { profile: { select: { firstName: true, lastName: true, middleName: true } } },
    });

    const fullName = [user?.profile?.lastName, user?.profile?.firstName, user?.profile?.middleName]
      .filter(Boolean)
      .join(' ');

    const children: Array<Paragraph | Table> = [
      gostParagraph(this.config.get('TENANT_NAME', { infer: true }), {
        indent: false,
        align: AlignmentType.CENTER,
        bold: true,
      }),
      gostSpacer(),
      gostTitle('Akademik transkript'),
      gostParagraph(`Talaba: ${fullName}`, { indent: false }),
      gostParagraph(`Sana: ${formatOfficialDate(new Date())}`, { indent: false }),
      gostSpacer(),
    ];

    let tableNumber = 1;
    for (const semester of transcript.semesters) {
      const entries = Array.isArray(semester.entries)
        ? (semester.entries as Array<{
            courseId: string;
            credits: number;
            score: number;
            letter: string;
            gpaPoints: number;
          }>)
        : [];

      const courses = await this.prisma.db.course.findMany({
        where: { id: { in: entries.map((entry) => entry.courseId) } },
        select: { id: true, title: true, subject: { select: { name: true } } },
      });
      const courseMap = new Map(courses.map((course) => [course.id, course]));

      children.push(
        gostTableCaption(
          tableNumber,
          `${semester.semester.academicYear.name}, ${semester.semester.number}-semestr`,
        ),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: ['№', 'Fan nomi', 'Kredit', 'Ball', 'Baho', 'GPA'].map(
                (text) =>
                  new TableCell({
                    children: [gostCellText(text, { bold: true, align: AlignmentType.CENTER })],
                  }),
              ),
            }),
            ...entries.map((entry, index) => {
              const course = courseMap.get(entry.courseId);
              const title = resolveLocalized(
                (course?.subject?.name ?? course?.title) as LocalizedText,
                'uz-Latn',
              );
              return new TableRow({
                children: [
                  new TableCell({
                    children: [gostCellText(String(index + 1), { align: AlignmentType.CENTER })],
                  }),
                  new TableCell({ children: [gostCellText(title)] }),
                  new TableCell({
                    children: [
                      gostCellText(String(entry.credits), { align: AlignmentType.CENTER }),
                    ],
                  }),
                  new TableCell({
                    children: [
                      gostCellText(entry.score.toFixed(1), { align: AlignmentType.CENTER }),
                    ],
                  }),
                  new TableCell({
                    children: [gostCellText(entry.letter, { align: AlignmentType.CENTER })],
                  }),
                  new TableCell({
                    children: [
                      gostCellText(entry.gpaPoints.toFixed(2), { align: AlignmentType.CENTER }),
                    ],
                  }),
                ],
              });
            }),
          ],
        }),
        gostParagraph(
          `Semestr GPA: ${Number(semester.gpa).toFixed(2)} | Kreditlar: ${semester.earnedCredits}/${semester.totalCredits}`,
          { indent: false },
        ),
        gostSpacer(),
      );
      tableNumber += 1;
    }

    children.push(
      gostParagraph(`Kumulyativ GPA: ${transcript.cumulative.gpa.toFixed(2)}`, {
        indent: false,
        bold: true,
      }),
      gostSpacer(),
      gostSignatureLine("O'quv bo'limi boshlig'i", '_________________________'),
    );

    const document = new Document({
      creator: this.config.get('TENANT_NAME', { infer: true }),
      title: 'Transkript',
      sections: [{ properties: gostSection(), footers: { default: gostFooter() }, children }],
    });

    return Buffer.from(await Packer.toBuffer(document));
  }

  // --- Davomat jadvali (XLSX) ----------------------------------------------

  private async buildAttendanceSheet(params: Record<string, unknown>): Promise<Buffer> {
    const courseId = String(params['courseId'] ?? '');
    const groupId = String(params['groupId'] ?? '');

    const [sessions, members, attendances] = await Promise.all([
      this.prisma.db.classSession.findMany({
        where: { courseId, groupId },
        orderBy: { date: 'asc' },
        select: { id: true, date: true, lessonType: true },
      }),
      this.prisma.db.groupMember.findMany({
        where: { groupId, leftAt: null },
        select: {
          userId: true,
          user: { select: { profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      this.prisma.db.attendance.findMany({
        where: { classSession: { courseId, groupId } },
        select: { userId: true, classSessionId: true, status: true },
      }),
    ]);

    const key = (userId: string, sessionId: string) => `${userId}:${sessionId}`;
    const statusMap = new Map(
      attendances.map((item) => [key(item.userId, item.classSessionId), item.status]),
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Davomat');

    const header = ['№', 'F.I.Sh.', ...sessions.map((s) => formatOfficialDate(s.date)), 'Foiz'];
    sheet.addRow(header);
    sheet.getRow(1).font = { bold: true };

    members.forEach((member, index) => {
      const marks = sessions.map((session) => {
        const status = statusMap.get(key(member.userId, session.id));
        return status === 'PRESENT'
          ? '+'
          : status === 'LATE'
            ? 'K'
            : status === 'EXCUSED'
              ? 'S'
              : '-';
      });
      const attended = marks.filter((mark) => mark !== '-').length;
      const percent = sessions.length === 0 ? 0 : Math.round((attended / sessions.length) * 100);

      sheet.addRow([
        index + 1,
        this.sanitizer.escapeSpreadsheetValue(
          [member.user.profile?.lastName, member.user.profile?.firstName].filter(Boolean).join(' '),
        ),
        ...marks,
        percent,
      ]);
    });

    sheet.getColumn(2).width = 34;
    sheet.addRow([]);
    sheet.addRow(['Belgilar: + — hozir, K — kechikdi, S — sababli, - — sababsiz']);

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  /** Hujjatlar ro'yxati (foydalanuvchining so'rovlari). */
  async list(actor: RequestUser) {
    return this.prisma.db.generatedDocument.findMany({
      where: { createdById: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        templateKey: true,
        format: true,
        status: true,
        documentNumber: true,
        signedAt: true,
        createdAt: true,
        fileObjectId: true,
      },
    });
  }

  /** Elektron imzo metadatasini saqlash (A-05). */
  async attachSignature(
    documentId: string,
    signatureHash: string,
    meta: Record<string, unknown>,
    actor: RequestUser,
  ) {
    await this.prisma.db.generatedDocument.update({
      where: { id: documentId },
      data: {
        signatureHash,
        signatureMeta: meta as never,
        signedAt: new Date(),
        status: 'SIGNED',
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'document.signed',
      resource: 'document',
      resourceId: documentId,
      after: { signatureHash: signatureHash.slice(0, 16) },
    });

    return { signed: true };
  }
}

function formatControl(earned?: number, max?: number): string {
  if (earned === undefined || max === undefined || max === 0) return '—';
  return earned.toFixed(1);
}

function educationFormLabel(form: string): string {
  const labels: Record<string, string> = {
    DAYTIME: 'kunduzgi',
    EXTRAMURAL: 'sirtqi',
    EVENING: 'kechki',
    DISTANCE: 'masofaviy',
  };
  return labels[form] ?? form;
}

export { formatControl, educationFormLabel };
