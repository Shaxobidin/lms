/**
 * Maqsad: SCORM paketlarini import qilish va RTE holatini saqlash (F-05, ADR-008).
 *
 * Import: ZIP arxivi `imsmanifest.xml` bo'yicha tekshiriladi, kirish nuqtasi
 * aniqlanadi va fayllar S3 ga chiqariladi. Buzuq paket ANIQ xatolik bilan rad
 * etiladi (§16 — xatoliklar yutilmaydi).
 */

import { Injectable, Logger } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { XMLParser } from 'fast-xml-parser';
import {
  EMPTY_SCORM_STATE,
  formatScorm12Time,
  isScormCompleted,
  parseIso8601Duration,
  parseScorm12Time,
  scormStateToScore,
  type ScormTrackingState,
  type ScormVersion,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { StorageService } from '../../common/storage/storage.service';
import { AppException } from '../../common/errors/app.exception';

/** Paket ichidagi fayllar soni va hajmi bo'yicha chegaralar (zip-bomb himoyasi). */
const MAX_ENTRIES = 5000;
const MAX_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024;

@Injectable()
export class ScormService {
  private readonly logger = new Logger(ScormService.name);
  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    removeNSPrefix: true,
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Yuklangan ZIP ni SCORM paketi sifatida import qiladi.
   * Manifest topilmasa yoki kirish nuqtasi aniqlanmasa — 422 xatolik.
   */
  async importPackage(courseId: string, fileObjectId: string, title: string) {
    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: fileObjectId },
      select: { id: true, objectKey: true, status: true, mimeType: true },
    });
    if (!file) throw AppException.notFound('file', fileObjectId);
    if (file.status !== 'READY') throw AppException.businessRule('errors.file_not_ready');

    const buffer = await this.storage.getObjectBuffer(file.objectKey);
    const zip = new AdmZip(buffer);
    const entries = zip.getEntries();

    if (entries.length > MAX_ENTRIES) {
      throw AppException.businessRule('errors.scorm_too_many_entries', { max: MAX_ENTRIES });
    }

    const totalSize = entries.reduce((sum, entry) => sum + entry.header.size, 0);
    if (totalSize > MAX_UNCOMPRESSED_BYTES) {
      throw AppException.businessRule('errors.scorm_package_too_large');
    }

    const manifestEntry = entries.find((entry) =>
      entry.entryName.toLowerCase().endsWith('imsmanifest.xml'),
    );
    if (!manifestEntry) {
      throw AppException.businessRule('errors.scorm_manifest_missing');
    }

    const manifestXml = manifestEntry.getData().toString('utf8');
    const parsed = this.parseManifest(manifestXml);

    // Fayllarni S3 ga chiqaramiz (pleyer ularni iframe orqali yuklaydi)
    const prefix = `scorm/${courseId}/${file.id}`;
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      // Yo'lni normallashtiramiz — `../` orqali chiqishning oldini oladi
      const safePath = entry.entryName.replace(/\\/g, '/').replace(/\.\.\//g, '');
      await this.storage.putObject(
        `${prefix}/${safePath}`,
        entry.getData(),
        guessMimeType(safePath),
      );
    }

    const scormPackage = await this.prisma.db.scormPackage.create({
      data: {
        courseId,
        fileObjectId: file.id,
        version: parsed.version,
        entryPoint: `${prefix}/${parsed.entryPoint}`,
        title: parsed.title || title,
        manifest: parsed.raw as never,
      },
      select: { id: true, version: true, entryPoint: true, title: true },
    });

    this.logger.log(
      { packageId: scormPackage.id, version: parsed.version, files: entries.length },
      'SCORM paketi import qilindi',
    );

    return scormPackage;
  }

  /**
   * `imsmanifest.xml` ni tahlil qiladi.
   * SCORM 1.2 va 2004 sxemalari farq qiladi — versiya `schemaversion` yoki
   * namespace bo'yicha aniqlanadi.
   */
  private parseManifest(xml: string): {
    version: ScormVersion;
    entryPoint: string;
    title: string;
    raw: unknown;
  } {
    let parsed: Record<string, unknown>;
    try {
      parsed = this.parser.parse(xml) as Record<string, unknown>;
    } catch (error) {
      throw AppException.businessRule('errors.scorm_manifest_invalid', {
        detail: (error as Error).message,
      });
    }

    const manifest = parsed['manifest'] as Record<string, unknown> | undefined;
    if (!manifest) throw AppException.businessRule('errors.scorm_manifest_invalid');

    const metadata = manifest['metadata'] as Record<string, unknown> | undefined;
    const schemaVersion = String(metadata?.['schemaversion'] ?? '');
    const version: ScormVersion = schemaVersion.includes('1.2') ? '1.2' : '2004';

    // Kirish nuqtasi: birinchi resursning `href` atributi
    const resources = manifest['resources'] as Record<string, unknown> | undefined;
    const resourceList = toArray(resources?.['resource']);
    const entryResource = resourceList.find((resource) => typeof resource['@_href'] === 'string');

    const entryPoint = entryResource?.['@_href'] as string | undefined;
    if (!entryPoint) {
      throw AppException.businessRule('errors.scorm_entry_point_missing');
    }

    const organizations = manifest['organizations'] as Record<string, unknown> | undefined;
    const organization = toArray(organizations?.['organization'])[0];
    const title = String(organization?.['title'] ?? '');

    return { version, entryPoint, title, raw: parsed };
  }

  /** Talabaning paket bo'yicha holatini o'qiydi (RTE `Initialize` chaqirganda). */
  async getTracking(packageId: string, userId: string): Promise<ScormTrackingState> {
    const row = await this.prisma.db.scormTracking.findUnique({
      where: { packageId_userId: { packageId, userId } },
      select: { state: true },
    });

    if (row?.state) return row.state as unknown as ScormTrackingState;

    const pkg = await this.prisma.db.scormPackage.findUnique({
      where: { id: packageId },
      select: { version: true },
    });

    return {
      version: (pkg?.version as ScormVersion) ?? '1.2',
      ...EMPTY_SCORM_STATE,
    };
  }

  /**
   * RTE `Commit` chaqirganda holatni saqlaydi.
   * Vaqt maydonlari SCORM formatidan soniyaga o'giriladi va oldingi qiymatga
   * qo'shiladi (standart bo'yicha `session_time` — joriy sessiya vaqti).
   */
  async saveTracking(
    packageId: string,
    userId: string,
    incoming: Record<string, string>,
  ): Promise<{ saved: boolean; completed: boolean; score: number | null }> {
    const current = await this.getTracking(packageId, userId);
    const version = current.version;

    const sessionTimeKey = version === '1.2' ? 'cmi.core.session_time' : 'cmi.session_time';
    const sessionTimeRaw = incoming[sessionTimeKey];
    const sessionSeconds = sessionTimeRaw
      ? version === '1.2'
        ? parseScorm12Time(sessionTimeRaw)
        : parseIso8601Duration(sessionTimeRaw)
      : 0;

    const next: ScormTrackingState = {
      version,
      completionStatus:
        incoming[version === '1.2' ? 'cmi.core.lesson_status' : 'cmi.completion_status'] ??
        current.completionStatus,
      successStatus:
        version === '1.2'
          ? (incoming['cmi.core.lesson_status'] ?? current.successStatus)
          : (incoming['cmi.success_status'] ?? current.successStatus),
      scoreScaled: numberOrNull(incoming['cmi.score.scaled']) ?? current.scoreScaled,
      scoreRaw:
        numberOrNull(incoming[version === '1.2' ? 'cmi.core.score.raw' : 'cmi.score.raw']) ??
        current.scoreRaw,
      scoreMin:
        numberOrNull(incoming[version === '1.2' ? 'cmi.core.score.min' : 'cmi.score.min']) ??
        current.scoreMin,
      scoreMax:
        numberOrNull(incoming[version === '1.2' ? 'cmi.core.score.max' : 'cmi.score.max']) ??
        current.scoreMax,
      totalTimeSeconds: current.totalTimeSeconds + sessionSeconds,
      suspendData: incoming['cmi.suspend_data'] ?? current.suspendData,
      location:
        incoming[version === '1.2' ? 'cmi.core.lesson_location' : 'cmi.location'] ??
        current.location,
      // Qayta kirishda `resume` bo'ladi
      entry: 'resume',
      exit: incoming[version === '1.2' ? 'cmi.core.exit' : 'cmi.exit'] ?? '',
      raw: { ...current.raw, ...incoming },
    };

    await this.prisma.db.scormTracking.upsert({
      where: { packageId_userId: { packageId, userId } },
      create: { packageId, userId, state: next as never },
      update: { state: next as never },
    });

    return {
      saved: true,
      completed: isScormCompleted(next),
      score: scormStateToScore(next, 100),
    };
  }

  /** Pleyer uchun boshlang'ich ma'lumot (`cmi` modelining o'qiladigan qismi). */
  async getLaunchData(packageId: string, userId: string, fullName: string) {
    const pkg = await this.prisma.db.scormPackage.findUnique({
      where: { id: packageId },
      select: { id: true, version: true, entryPoint: true, title: true, courseId: true },
    });
    if (!pkg) throw AppException.notFound('resource', packageId);

    const state = await this.getTracking(packageId, userId);

    return {
      packageId: pkg.id,
      version: pkg.version,
      title: pkg.title,
      launchUrl: this.storage.buildPublicUrl(pkg.entryPoint),
      learner: { id: userId, name: fullName },
      state: {
        ...state,
        // 1.2 pleyeri `total_time` ni o'z formatida kutadi
        totalTimeFormatted: formatScorm12Time(state.totalTimeSeconds),
      },
    };
  }
}

function toArray(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]) as Array<Record<string, unknown>>;
}

function numberOrNull(value: string | undefined): number | null {
  if (value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Kengaytma bo'yicha MIME — SCORM paketi ichidagi fayllar uchun. */
function guessMimeType(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html',
    htm: 'text/html',
    js: 'text/javascript',
    css: 'text/css',
    json: 'application/json',
    xml: 'application/xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
    woff: 'font/woff',
    woff2: 'font/woff2',
    ttf: 'font/ttf',
    pdf: 'application/pdf',
  };
  return map[extension] ?? 'application/octet-stream';
}
