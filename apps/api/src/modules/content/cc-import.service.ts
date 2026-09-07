/**
 * Maqsad: IMS Common Cartridge paketini kursga import qilish (F-05, §10).
 *
 * Xaritalash (CC → bizning model):
 *  - 1-daraja item → Modul, 2-daraja → Mavzu, 3-daraja va chuqurroq → Dars.
 *    Sayoz daraxtda yetishmagan daraja o'sha nom bilan to'ldiriladi.
 *  - `webcontent` HTML → dars matni (sanitizatsiya bilan); boshqa fayllar → S3 + resurs
 *    (PDF/VIDEO/AUDIO/FILE kengaytma bo'yicha);
 *  - `imswl_*` (web link) → LINK resursi; `imsbasiclti_*` → LINK resursi (launch URL);
 *  - `imsdt_*` (discussion) → kurs forumida mavzu;
 *  - `imsqti_...assessment` (QTI 1.2) → savollar banki + mavzuga biriktirilgan test (nashr etilmagan).
 *
 * `dryRun` — faqat reja: nima yaratilishi va nima qo'llab-quvvatlanmasligi
 * ko'rsatiladi (§16: qo'llab-quvvatlanmagan turlar yutilmaydi).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AdmZip from 'adm-zip';
import { z } from 'zod';
import {
  MAX_IMPORT_QUESTIONS,
  localizedRichTextSchema,
  normalizeForSearch,
  questionPayloadSchema,
  type ImportIssue,
  type ImportedQuestion,
  type Locale,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { guessMimeType } from './scorm.service';
import {
  parseBasicLtiLink,
  parseCcManifest,
  parseDiscussionTopic,
  parseQti12,
  parseWebLink,
  type CcItem,
  type CcManifest,
  type CcResource,
} from './cc-parser';
import { buildCartridgeEntries, pickText, type CcExportModule } from './cc-writer';

const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_TEXT_BYTES = 5 * 1024 * 1024;

export interface ImportCartridgeInput {
  courseId: string;
  fileObjectId: string;
  locale: Locale;
  dryRun: boolean;
}

/** Reja elementi — dars ichidagi bitta narsa. */
type PlannedContent =
  | { kind: 'html'; html: string; path: string }
  | {
      kind: 'file';
      path: string;
      resourceKind: 'PDF' | 'VIDEO' | 'AUDIO' | 'FILE';
      title: string;
      /** HTML ichidan havola qilingan (rasm, ilova) — resurs qatori yaratilmaydi, faqat fayl. */
      inline?: boolean;
    }
  | { kind: 'link'; url: string; title: string }
  | { kind: 'lti'; url: string; title: string }
  | { kind: 'discussion'; title: string; text: string }
  | {
      kind: 'assessment';
      title: string;
      timeLimitMinutes: number | null;
      questions: ImportedQuestion[];
      issues: ImportIssue[];
    };

interface PlannedLesson {
  title: string;
  contents: PlannedContent[];
  /** Asosiy HTML faylning paketdagi yo'li — nisbiy havolalar shu papkaga nisbatan. */
  htmlPath?: string;
}
interface PlannedTopic {
  title: string;
  lessons: PlannedLesson[];
}
interface PlannedModule {
  title: string;
  topics: PlannedTopic[];
}

export interface CartridgePlan {
  title: string;
  schemaVersion: string;
  modules: PlannedModule[];
  /** Qo'llab-quvvatlanmagan yoki o'qib bo'lmagan elementlar. */
  skipped: Array<{ title: string; reason: string; detail?: string }>;
}

const importedQuestionSchema = z.object({
  text: localizedRichTextSchema,
  payload: questionPayloadSchema,
  defaultScore: z.number().min(0.1).max(100),
  tags: z.array(z.string().trim().max(48)).max(20),
});

/** Eksportdagi "Forum" moduli ostidagi mavzu nomi (paket tili bo'yicha). */
const FORUM_TOPIC_TITLE: Record<string, string> = {
  'uz-Latn': 'Muhokamalar',
  'uz-Cyrl': 'Муҳокамалар',
  ru: 'Обсуждения',
  en: 'Discussions',
};

@Injectable()
export class CartridgeImportService {
  private readonly logger = new Logger(CartridgeImportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async importCartridge(input: ImportCartridgeInput, actor: RequestUser) {
    const course = await this.prisma.db.course.findUnique({
      where: { id: input.courseId },
      select: { id: true },
    });
    if (!course) throw AppException.notFound('course', input.courseId);

    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: input.fileObjectId },
      select: { id: true, objectKey: true, status: true, originalName: true },
    });
    if (!file) throw AppException.notFound('file', input.fileObjectId);
    if (file.status !== 'READY') throw AppException.businessRule('errors.file_not_ready');

    const buffer = await this.storage.getObjectBuffer(file.objectKey);
    const { zip, basePath, manifest } = this.openPackage(buffer);
    const read = (path: string): Buffer | null => {
      const entry =
        zip.getEntry(`${basePath}${path}`) ??
        zip.getEntry(`${basePath}${path}`.replace(/\\/g, '/')) ??
        zip.getEntry(path);
      if (!entry || entry.isDirectory) return null;
      return entry.getData();
    };

    const plan = this.buildPlan(manifest, read, input.locale);
    const summary = summarize(plan);

    if (input.dryRun) {
      return { ...summary, fileName: file.originalName, imported: false };
    }
    if (summary.modules === 0) throw AppException.businessRule('errors.cc_empty');

    const created = await this.commit(plan, input, actor, read);

    await this.audit.record({
      actorId: actor.id,
      action: 'course.import_cartridge',
      resource: 'course',
      resourceId: input.courseId,
      after: { fileObjectId: file.id, ...summary.counts, skipped: plan.skipped.length },
    });
    this.logger.log(
      { courseId: input.courseId, ...summary.counts },
      'IMS CC paketi import qilindi',
    );

    return { ...summary, fileName: file.originalName, imported: true, ...created };
  }

  // --- Eksport ---------------------------------------------------------------------------

  /**
   * Kursni IMS CC 1.1 paketiga eksport qiladi (modul/mavzu/dars, dars HTML va
   * fayllari, havolalar, mavzu testlari QTI 1.2). ZIP S3 ga yoziladi, vaqtinchalik
   * havola qaytadi. Qo'llab-quvvatlanmagan savol turlari `skipped` da.
   */
  async exportCartridge(courseId: string, locale: Locale, actor: RequestUser) {
    const course = await this.prisma.db.course.findUnique({
      where: { id: courseId },
      select: {
        id: true,
        title: true,
        modules: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            topics: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                lessons: {
                  orderBy: { position: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    contentHtml: true,
                    resources: {
                      orderBy: { position: 'asc' },
                      select: {
                        id: true,
                        kind: true,
                        title: true,
                        externalUrl: true,
                        file: {
                          select: { id: true, objectKey: true, originalName: true, status: true },
                        },
                      },
                    },
                  },
                },
                quizzes: {
                  select: {
                    id: true,
                    title: true,
                    durationMinutes: true,
                    questions: {
                      orderBy: { position: 'asc' },
                      select: {
                        score: true,
                        question: { select: { id: true, text: true, payload: true } },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw AppException.notFound('course', courseId);
    if (course.modules.length === 0) throw AppException.businessRule('errors.export_empty');

    const zip = new AdmZip();
    const binaryFiles: Array<{ path: string; objectKey: string }> = [];
    // Dars matnidagi `/lms-file/<id>` fayllari (IMS CC importidan qolgan rasmlar)
    const inlineFiles = new Map<string, string>();
    const inlineIds = new Set<string>();
    for (const module of course.modules)
      for (const topic of module.topics)
        for (const lesson of topic.lessons) {
          const html = pickText(lesson.contentHtml as never, locale);
          for (const match of html.matchAll(/\/lms-file\/([0-9a-f-]{36})/gi))
            inlineIds.add(match[1]!);
        }
    if (inlineIds.size > 0) {
      const inlineRows = await this.prisma.db.fileObject.findMany({
        where: { id: { in: Array.from(inlineIds) }, status: 'READY' },
        select: { id: true, objectKey: true, originalName: true },
      });
      for (const row of inlineRows) {
        const path = `files/inline/${row.id.slice(0, 8)}-${safeName(row.originalName)}`;
        inlineFiles.set(row.id, path);
        binaryFiles.push({ path, objectKey: row.objectKey });
      }
    }
    const modules: CcExportModule[] = course.modules.map((module) => ({
      id: module.id,
      title: pickText(module.title as never, locale) || 'Modul',
      topics: module.topics.map((topic) => ({
        id: topic.id,
        title: pickText(topic.title as never, locale) || 'Mavzu',
        lessons: topic.lessons.map((lesson) => {
          const files: Array<{ path: string; title: string }> = [];
          const links: Array<{ id: string; title: string; url: string }> = [];
          let html = pickText(lesson.contentHtml as never, locale);
          for (const resource of lesson.resources) {
            if (resource.kind === 'LINK' && resource.externalUrl) {
              links.push({
                id: resource.id,
                title: pickText(resource.title as never, locale) || 'Havola',
                url: resource.externalUrl,
              });
            } else if (resource.file && resource.file.status === 'READY') {
              const path = `files/${lesson.id}/${safeName(resource.file.originalName)}`;
              files.push({
                path,
                title: pickText(resource.title as never, locale) || resource.file.originalName,
              });
              binaryFiles.push({ path, objectKey: resource.file.objectKey });
            }
          }
          // Dars matnidagi xususiy fayllar (`/lms-file/<id>`) ham paketga kiradi
          html = html.replace(/\/lms-file\/([0-9a-f-]{36})/gi, (whole: string, id: string) => {
            const known = inlineFiles.get(id);
            return known ? `../${known}` : whole;
          });
          return {
            id: lesson.id,
            title: pickText(lesson.title as never, locale) || 'Dars',
            html,
            files,
            links,
          };
        }),
        quizzes: topic.quizzes.map((quiz) => ({
          id: quiz.id,
          title: pickText(quiz.title as never, locale) || 'Test',
          durationMinutes: quiz.durationMinutes,
          questions: quiz.questions.map((entry) => ({
            id: entry.question.id,
            text: pickText(entry.question.text as never, locale),
            payload: entry.question.payload as never,
            defaultScore: Number(entry.score),
          })),
        })),
      })),
    }));

    // Forum mavzulari — alohida "Forum" moduli ostida discussion topic'lar
    // (Moodle/Canvas ham muhokamani modul elementi sifatida ko'rsatadi)
    const threads = await this.prisma.db.forumThread.findMany({
      where: { courseId },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'asc' }],
      select: {
        id: true,
        title: true,
        posts: {
          where: { depth: 0 },
          orderBy: { createdAt: 'asc' },
          take: 1,
          select: { contentHtml: true },
        },
      },
    });
    if (threads.length > 0) {
      modules.push({
        id: `forum-${courseId.slice(0, 8)}`,
        title: 'Forum',
        topics: [
          {
            id: `forum-topics-${courseId.slice(0, 8)}`,
            title: FORUM_TOPIC_TITLE[locale] ?? FORUM_TOPIC_TITLE['uz-Latn']!,
            lessons: [],
            quizzes: [],
            discussions: threads.map((thread) => ({
              id: thread.id,
              title: thread.title,
              html: thread.posts[0]?.contentHtml ?? '',
            })),
          },
        ],
      });
    }

    const { entries, skippedQuestions } = buildCartridgeEntries(
      pickText(course.title as never, locale) || 'Kurs',
      modules,
    );
    for (const [path, content] of entries) zip.addFile(path, Buffer.from(content, 'utf8'));
    for (const file of binaryFiles) {
      try {
        zip.addFile(file.path, await this.storage.getObjectBuffer(file.objectKey));
      } catch (error) {
        this.logger.warn(
          { objectKey: file.objectKey, error: (error as Error).message },
          "Fayl o'qilmadi, paketga kirmadi",
        );
      }
    }
    const buffer = zip.toBuffer();

    const fileName = `kurs-${courseId.slice(0, 8)}.imscc`;
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

    const counts = {
      modules: course.modules.length,
      topics: modules.reduce((sum, module) => sum + module.topics.length, 0),
      lessons: modules.reduce(
        (sum, module) =>
          sum + module.topics.reduce((inner, topic) => inner + topic.lessons.length, 0),
        0,
      ),
      files: binaryFiles.length,
      discussions: threads.length,
      quizzes: modules.reduce(
        (sum, module) =>
          sum + module.topics.reduce((inner, topic) => inner + topic.quizzes.length, 0),
        0,
      ),
    };
    await this.audit.record({
      actorId: actor.id,
      action: 'course.export_cartridge',
      resource: 'course',
      resourceId: courseId,
      after: { ...counts, skippedQuestions: skippedQuestions.length },
    });

    return {
      fileObjectId: fileObject.id,
      fileName,
      url: await this.storage.createPresignedDownload(objectKey, fileName),
      counts,
      skippedQuestions,
    };
  }

  // --- 1. Paketni ochish ---------------------------------------------------------------

  private openPackage(buffer: Buffer): { zip: AdmZip; basePath: string; manifest: CcManifest } {
    let zip: AdmZip;
    try {
      zip = new AdmZip(buffer);
    } catch {
      throw AppException.businessRule('errors.cc_manifest_missing');
    }
    const entries = zip.getEntries();
    if (entries.length > MAX_ENTRIES) {
      throw AppException.businessRule('errors.scorm_too_many_entries', { max: MAX_ENTRIES });
    }
    if (entries.reduce((sum, entry) => sum + entry.header.size, 0) > MAX_UNCOMPRESSED_BYTES) {
      throw AppException.businessRule('errors.scorm_package_too_large');
    }

    // Manifest ildizda yoki eng yuqori papkada bo'ladi — eng qisqa yo'l olinadi
    const manifestEntry = entries
      .filter((entry) => /(^|\/)imsmanifest\.xml$/i.test(entry.entryName.replace(/\\/g, '/')))
      .sort((a, b) => a.entryName.length - b.entryName.length)[0];
    if (!manifestEntry) throw AppException.businessRule('errors.cc_manifest_missing');

    const normalized = manifestEntry.entryName.replace(/\\/g, '/');
    const basePath = normalized.slice(0, normalized.length - 'imsmanifest.xml'.length);

    let manifest: CcManifest;
    try {
      manifest = parseCcManifest(manifestEntry.getData().toString('utf8'));
    } catch (error) {
      throw AppException.businessRule('errors.cc_manifest_invalid', {
        detail: (error as Error).message,
      });
    }
    return { zip, basePath, manifest };
  }

  // --- 2. Reja -----------------------------------------------------------------------------

  private buildPlan(
    manifest: CcManifest,
    read: (path: string) => Buffer | null,
    locale: Locale,
  ): CartridgePlan {
    const plan: CartridgePlan = {
      title: manifest.title,
      schemaVersion: manifest.schemaVersion,
      modules: [],
      skipped: [],
    };

    const contentsOf = (item: CcItem): PlannedContent[] => {
      const resource = item.resourceId ? manifest.resources[item.resourceId] : undefined;
      if (!item.resourceId) return [];
      if (!resource) {
        plan.skipped.push({
          title: item.title,
          reason: 'cc.resource_missing',
          detail: item.resourceId,
        });
        return [];
      }
      return this.resourceContents(resource, item.title, read, locale, plan);
    };

    /** Item va uning avlodlaridagi barcha kontent — chuqur daraxt darsga yig'iladi. */
    const flatten = (item: CcItem): PlannedContent[] => [
      ...contentsOf(item),
      ...item.children.flatMap(flatten),
    ];

    const lessonFrom = (item: CcItem): PlannedLesson => {
      const contents = flatten(item);
      const html = contents.find((content) => content.kind === 'html');
      return {
        title: item.title || 'Dars',
        contents,
        htmlPath: html && html.kind === 'html' ? html.path : undefined,
      };
    };

    const topicFrom = (item: CcItem): PlannedTopic => {
      const title = item.title || 'Mavzu';
      if (item.children.length === 0) return { title, lessons: [lessonFrom(item)] };
      const lessons = item.children.map(lessonFrom);
      // Mavzu itemining o'z resursi bo'lsa — birinchi dars
      if (item.resourceId) lessons.unshift({ title, contents: contentsOf(item) });
      return { title, lessons };
    };

    for (const item of manifest.items) {
      const title = item.title || 'Modul';
      if (item.children.length === 0) {
        plan.modules.push({ title, topics: [{ title, lessons: [lessonFrom(item)] }] });
        continue;
      }
      const topics = item.children.map(topicFrom);
      if (item.resourceId) {
        topics.unshift({ title, lessons: [{ title, contents: contentsOf(item) }] });
      }
      plan.modules.push({ title, topics });
    }

    return plan;
  }

  private resourceContents(
    resource: CcResource,
    itemTitle: string,
    read: (path: string) => Buffer | null,
    locale: Locale,
    plan: CartridgePlan,
  ): PlannedContent[] {
    const skip = (reason: string, detail?: string) => {
      plan.skipped.push({ title: itemTitle, reason, detail });
      return [] as PlannedContent[];
    };
    const readText = (path: string | null): string | null => {
      if (!path) return null;
      const data = read(path);
      if (!data || data.byteLength > MAX_TEXT_BYTES) return null;
      return data.toString('utf8');
    };

    switch (resource.kind) {
      case 'webcontent': {
        const contents: PlannedContent[] = [];
        for (const path of resource.files.length
          ? resource.files
          : resource.href
            ? [resource.href]
            : []) {
          const lower = path.toLowerCase();
          if (/\.(html?|xhtml)$/.test(lower) && path === resource.href) {
            const html = readText(path);
            if (html === null) return skip('cc.file_missing', path);
            const body = extractBody(html);
            contents.push({ kind: 'html', html: body, path });
            // HTML ichidagi rasm/ilova havolalari — paketda bo'lsa, dars bilan birga olinadi
            for (const ref of relativeRefs(body)) {
              const refPath = resolveRelative(path, ref);
              if (!read(refPath)) continue;
              if (contents.some((c) => c.kind === 'file' && c.path === refPath)) continue;
              if (resource.files.includes(refPath)) continue;
              contents.push({
                kind: 'file',
                path: refPath,
                resourceKind: resourceKindFor(refPath.toLowerCase()),
                title: refPath.split('/').pop() ?? itemTitle,
                inline: true,
              });
            }
            continue;
          }
          if (!read(path)) {
            plan.skipped.push({ title: itemTitle, reason: 'cc.file_missing', detail: path });
            continue;
          }
          contents.push({
            kind: 'file',
            path,
            resourceKind: resourceKindFor(lower),
            title: path.split('/').pop() ?? itemTitle,
          });
        }
        return contents;
      }
      case 'weblink': {
        const xml = readText(resource.href);
        const link = xml ? parseWebLink(xml) : null;
        if (!link) return skip('cc.resource_invalid', resource.href ?? resource.id);
        return [{ kind: 'link', url: link.url, title: link.title || itemTitle }];
      }
      case 'basiclti': {
        const xml = readText(resource.href);
        const link = xml ? parseBasicLtiLink(xml) : null;
        if (!link) return skip('cc.resource_invalid', resource.href ?? resource.id);
        return [{ kind: 'lti', url: link.url, title: link.title || itemTitle }];
      }
      case 'discussion': {
        const xml = readText(resource.href);
        const topic = xml ? parseDiscussionTopic(xml) : null;
        if (!topic) return skip('cc.resource_invalid', resource.href ?? resource.id);
        return [{ kind: 'discussion', title: topic.title || itemTitle, text: topic.text }];
      }
      case 'assessment': {
        // Savollar banki (`question-bank`) alohida test emas — faqat `assessment` import qilinadi
        if (!/assessment$/i.test(resource.type)) return skip('cc.unsupported_type', resource.type);
        const xml = readText(resource.href);
        if (!xml) return skip('cc.file_missing', resource.href ?? resource.id);
        const parsed = parseQti12(xml, locale);
        const valid: ImportedQuestion[] = [];
        const issues: ImportIssue[] = [...parsed.issues];
        parsed.questions.forEach((question, index) => {
          const result = importedQuestionSchema.safeParse(question);
          if (result.success) valid.push(result.data as ImportedQuestion);
          else issues.push({ line: index + 1, reason: 'import.invalid_question' });
        });
        if (valid.length === 0) return skip('cc.assessment_empty', resource.href ?? resource.id);
        return [
          {
            kind: 'assessment',
            title: parsed.title || itemTitle,
            timeLimitMinutes: parsed.timeLimitMinutes,
            questions: valid.slice(0, MAX_IMPORT_QUESTIONS),
            issues,
          },
        ];
      }
      default:
        return skip('cc.unsupported_type', resource.type);
    }
  }

  // --- 3. Yozish ---------------------------------------------------------------------------

  private async commit(
    plan: CartridgePlan,
    input: ImportCartridgeInput,
    actor: RequestUser,
    read: (path: string) => Buffer | null,
  ) {
    const locale = input.locale;
    const text = (value: string) => ({ [locale]: value.slice(0, 4000) }) as never;

    const last = await this.prisma.db.module.findFirst({
      where: { courseId: input.courseId },
      orderBy: { position: 'desc' },
      select: { position: true },
    });
    let modulePosition = (last?.position ?? -1) + 1;

    const createdIds = {
      modules: [] as string[],
      quizzes: [] as string[],
      threads: [] as string[],
    };

    // Fayllar S3 ga tranzaksiyadan TASHQARIDA yuklanadi (uzoq operatsiya);
    // bazaga yozuvlar tranzaksiyada — yarim import qolmaydi.
    const uploaded = new Map<
      string,
      { objectKey: string; sizeBytes: number; checksum: string; mime: string }
    >();
    for (const module of plan.modules) {
      for (const topic of module.topics) {
        for (const lesson of topic.lessons) {
          for (const content of lesson.contents) {
            if (content.kind !== 'file' || uploaded.has(content.path)) continue;
            const data = read(content.path);
            if (!data) continue;
            const mime = guessMimeType(content.path);
            const objectKey = this.storage.buildObjectKey('COURSE_CONTENT', content.title);
            const result = await this.storage.putObject(objectKey, data, mime);
            uploaded.set(content.path, {
              objectKey,
              sizeBytes: result.sizeBytes,
              checksum: result.checksumSha256,
              mime,
            });
          }
        }
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const module of plan.modules) {
          const createdModule = await tx.module.create({
            data: {
              courseId: input.courseId,
              title: text(module.title),
              position: modulePosition++,
            },
            select: { id: true },
          });
          createdIds.modules.push(createdModule.id);

          let topicPosition = 0;
          for (const topic of module.topics) {
            const createdTopic = await tx.topic.create({
              data: {
                moduleId: createdModule.id,
                title: text(topic.title),
                position: topicPosition++,
              },
              select: { id: true },
            });

            let lessonPosition = 0;
            for (const lesson of topic.lessons) {
              // Fayl yozuvlari darsdan OLDIN — HTML ichidagi havolalar ularning id sini oladi
              const fileIds = new Map<string, string>();
              for (const content of lesson.contents) {
                if (content.kind !== 'file' || fileIds.has(content.path)) continue;
                const stored = uploaded.get(content.path);
                if (!stored) continue;
                const fileObject = await tx.fileObject.create({
                  data: {
                    bucket: this.config.get('S3_BUCKET', { infer: true }),
                    objectKey: stored.objectKey,
                    mimeType: stored.mime,
                    sizeBytes: BigInt(stored.sizeBytes),
                    checksumSha256: stored.checksum,
                    originalName: content.title.slice(0, 255),
                    purpose: 'COURSE_CONTENT',
                    uploadedById: actor.id,
                    status: 'READY',
                  },
                  select: { id: true },
                });
                fileIds.set(content.path, fileObject.id);
              }

              const htmlPaths = new Map<string, string>();
              for (const content of lesson.contents) {
                if (content.kind === 'file') {
                  const id = fileIds.get(content.path);
                  if (id) htmlPaths.set(content.path, id);
                }
              }
              const htmlParts = lesson.contents
                .filter(
                  (content): content is Extract<PlannedContent, { kind: 'html' }> =>
                    content.kind === 'html',
                )
                .map((content) =>
                  this.sanitizer.sanitizeHtml(
                    rewriteFileRefs(content.html, lesson.htmlPath ?? '', htmlPaths),
                  ),
                );
              const createdLesson = await tx.lesson.create({
                data: {
                  topicId: createdTopic.id,
                  title: text(lesson.title),
                  position: lessonPosition++,
                  contentHtml: htmlParts.length
                    ? ({ [locale]: htmlParts.join('\n') } as never)
                    : undefined,
                },
                select: { id: true },
              });

              let resourcePosition = 0;
              for (const content of lesson.contents) {
                if (content.kind === 'file') {
                  const fileObjectId = fileIds.get(content.path);
                  if (!fileObjectId || content.inline) continue;
                  await tx.resource.create({
                    data: {
                      lessonId: createdLesson.id,
                      kind: content.resourceKind,
                      title: text(content.title),
                      fileObjectId,
                      position: resourcePosition++,
                    },
                  });
                } else if (content.kind === 'link' || content.kind === 'lti') {
                  await tx.resource.create({
                    data: {
                      lessonId: createdLesson.id,
                      kind: 'LINK',
                      title: text(
                        content.kind === 'lti' ? `${content.title} (LTI)` : content.title,
                      ),
                      externalUrl: content.url,
                      position: resourcePosition++,
                    },
                  });
                } else if (content.kind === 'discussion') {
                  const thread = await tx.forumThread.create({
                    data: {
                      courseId: input.courseId,
                      authorId: actor.id,
                      title:
                        this.sanitizer.stripHtml(content.title).slice(0, 300) ||
                        lesson.title.slice(0, 300),
                      postCount: 1,
                      lastPostAt: new Date(),
                    },
                    select: { id: true },
                  });
                  await tx.forumPost.create({
                    data: {
                      threadId: thread.id,
                      authorId: actor.id,
                      contentHtml: this.sanitizer.sanitizeHtml(content.text) || '<p></p>',
                      depth: 0,
                    },
                  });
                  createdIds.threads.push(thread.id);
                } else if (content.kind === 'assessment') {
                  const bank = await tx.questionBank.create({
                    data: {
                      courseId: input.courseId,
                      title: text(content.title),
                      ownerId: actor.id,
                    },
                    select: { id: true },
                  });
                  const questionIds: Array<{ id: string; score: number }> = [];
                  for (const question of content.questions) {
                    const questionText = this.sanitizer.sanitizeLocalized(question.text);
                    const created = await tx.question.create({
                      data: {
                        bankId: bank.id,
                        type: question.payload.type,
                        text: questionText as never,
                        payload: question.payload as never,
                        defaultScore: question.defaultScore,
                        tags: question.tags,
                        searchText: normalizeForSearch(
                          Object.values(questionText).filter(Boolean).join(' '),
                        ),
                      },
                      select: { id: true },
                    });
                    questionIds.push({ id: created.id, score: question.defaultScore });
                  }
                  const quiz = await tx.quiz.create({
                    data: {
                      courseId: input.courseId,
                      topicId: createdTopic.id,
                      title: text(content.title),
                      durationMinutes: content.timeLimitMinutes ?? 30,
                      isPublished: false,
                    },
                    select: { id: true },
                  });
                  await tx.quizQuestion.createMany({
                    data: questionIds.map((question, index) => ({
                      quizId: quiz.id,
                      questionId: question.id,
                      score: question.score,
                      position: index,
                    })),
                  });
                  createdIds.quizzes.push(quiz.id);
                }
              }
            }
          }
        }
      },
      { timeout: 120_000 },
    );

    return createdIds;
  }
}

function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 120) || 'file';
}

/** `<body>` ichini oladi (bo'lmasa butun matn) — sanitizatsiya keyin. */
function extractBody(html: string): string {
  const match = /<body[^>]*>([\s\S]*?)<\/body>/i.exec(html);
  const inner = match?.[1] ?? html;
  // CC dagi nisbiy havola belgisi — paket tashqarisida ma'nosiz, olib tashlanadi
  return inner.replace(/\$IMS-CC-FILEBASE\$\/?/g, '').trim();
}

/** HTML ichidagi nisbiy `src`/`href` lar (mutlaq, data:, mailto:, # va / bilan boshlanganlar emas). */
function relativeRefs(html: string): string[] {
  const refs = new Set<string>();
  const pattern = /\b(?:src|href)\s*=\s*["']([^"'#?]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const ref = match[1] ?? '';
    if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(ref)) continue;
    refs.add(ref);
  }
  return Array.from(refs);
}

/** `w1/reading.html` + `img/pic.png` → `w1/img/pic.png` (`..` lar yechiladi). */
function resolveRelative(fromPath: string, ref: string): string {
  const base = fromPath.split('/').slice(0, -1);
  for (const segment of decodeURIComponent(ref).replace(/\\/g, '/').split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') base.pop();
    else base.push(segment);
  }
  return base.join('/');
}

/**
 * Nisbiy havolalarni saqlangan fayllarga bog'laydi: `src="/lms-file/<id>"
 * data-file-id="<id>"`. Mijoz `data-file-id` bo'yicha vaqtinchalik havola oladi
 * (fayllar xususiy, to'g'ridan-to'g'ri URL yo'q).
 */
function rewriteFileRefs(html: string, htmlPath: string, ids: Map<string, string>): string {
  return html.replace(
    /\b(src|href)\s*=\s*(["'])([^"'#?]+)\2/gi,
    (whole: string, attr: string, quote: string, ref: string) => {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/|#)/i.test(ref)) return whole;
      const id = ids.get(resolveRelative(htmlPath, ref));
      if (!id) return whole;
      return `${attr}=${quote}/lms-file/${id}${quote} data-file-id=${quote}${id}${quote}`;
    },
  );
}

function resourceKindFor(path: string): 'PDF' | 'VIDEO' | 'AUDIO' | 'FILE' {
  if (path.endsWith('.pdf')) return 'PDF';
  if (/\.(mp4|webm|m4v|mov)$/.test(path)) return 'VIDEO';
  if (/\.(mp3|wav|ogg|m4a)$/.test(path)) return 'AUDIO';
  return 'FILE';
}

function summarize(plan: CartridgePlan) {
  const counts = {
    modules: 0,
    topics: 0,
    lessons: 0,
    files: 0,
    images: 0,
    links: 0,
    discussions: 0,
    quizzes: 0,
    questions: 0,
  };
  const issues: ImportIssue[] = [];
  for (const module of plan.modules) {
    counts.modules += 1;
    for (const topic of module.topics) {
      counts.topics += 1;
      for (const lesson of topic.lessons) {
        counts.lessons += 1;
        for (const content of lesson.contents) {
          if (content.kind === 'file') {
            if (content.inline) counts.images += 1;
            else counts.files += 1;
          } else if (content.kind === 'link' || content.kind === 'lti') counts.links += 1;
          else if (content.kind === 'discussion') counts.discussions += 1;
          else if (content.kind === 'assessment') {
            counts.quizzes += 1;
            counts.questions += content.questions.length;
            issues.push(...content.issues);
          }
        }
      }
    }
  }
  return {
    title: plan.title,
    schemaVersion: plan.schemaVersion,
    modules: counts.modules,
    counts,
    outline: plan.modules.map((module) => ({
      title: module.title,
      topics: module.topics.map((topic) => ({
        title: topic.title,
        lessons: topic.lessons.map((lesson) => ({
          title: lesson.title,
          kinds: lesson.contents.map((content) => content.kind),
        })),
      })),
    })),
    skipped: plan.skipped,
    questionIssues: issues,
  };
}
