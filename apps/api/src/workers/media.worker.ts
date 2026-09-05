/**
 * Maqsad: video transkodlash (HLS) va fayl tekshiruvi (F-05, A-11).
 *
 * FFmpeg tashqi jarayon sifatida chaqiriladi. Agar FFmpeg mavjud bo'lmasa —
 * fayl asl holida qoladi va bu HOLAT ANIQ QAYD ETILADI: video baribir
 * ko'rsatiladi, faqat adaptiv bitreyt bo'lmaydi (jimgina buzilmaydi).
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../config/configuration';
import { BaseWorker } from './worker.base';
import { PrismaService } from '../common/prisma/prisma.service';
import { StorageService } from '../common/storage/storage.service';
import { REDIS_CLIENT } from '../common/cache/cache.service';
import { QUEUES, type JobPayloads } from '../common/queue/queue.service';

/** HLS darajalari: nom, kenglik, bitreyt (kbit/s). */
const RENDITIONS: Record<string, { width: number; bitrate: number }> = {
  '360p': { width: 640, bitrate: 800 },
  '720p': { width: 1280, bitrate: 2400 },
  '1080p': { width: 1920, bitrate: 4800 },
};

@Injectable()
export class MediaWorker extends BaseWorker {
  private readonly ffmpegPath: string;
  private readonly renditions: string[];

  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {
    // Transkodlash CPU-intensiv: bir vaqtda 2 ta ish yetarli
    super(redis, QUEUES.MEDIA, config.get('APP_ROLE', { infer: true }), 2);
    this.ffmpegPath = config.get('FFMPEG_PATH', { infer: true });
    this.renditions = config.get('HLS_RENDITIONS', { infer: true });
  }

  protected async process(job: Job): Promise<unknown> {
    switch (job.name) {
      case 'media.transcode':
        return this.transcode((job.data as JobPayloads['media.transcode']).fileObjectId);
      case 'media.verify':
        return this.verify((job.data as JobPayloads['media.verify']).fileObjectId);
      default:
        return { skipped: job.name };
    }
  }

  /**
   * Videoni HLS ga o'giradi va S3 ga yuklaydi.
   * Natija `FileObject.variants` da saqlanadi va pleyer shuni o'qiydi.
   */
  private async transcode(fileObjectId: string): Promise<unknown> {
    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: fileObjectId },
      select: { id: true, objectKey: true, mimeType: true, status: true },
    });

    if (!file || file.status !== 'READY') return { skipped: 'not_ready' };
    if (!file.mimeType.startsWith('video/')) return { skipped: 'not_video' };

    const available = await this.isFfmpegAvailable();
    if (!available) {
      // FFmpeg yo'q — video asl holida ishlaydi, bu holat qayd etiladi
      await this.prisma.db.fileObject.update({
        where: { id: fileObjectId },
        data: {
          variants: {
            hls: null,
            transcodeSkipped: true,
            reason: 'ffmpeg_not_available',
          } as never,
        },
      });
      this.logger.warn(
        { fileObjectId },
        'FFmpeg topilmadi — video transkodlanmadi, asl fayl ishlatiladi',
      );
      return { skipped: 'ffmpeg_unavailable' };
    }

    const workDir = await mkdtemp(join(tmpdir(), 'lms-hls-'));

    try {
      const sourcePath = join(workDir, 'source.mp4');
      await writeFile(sourcePath, await this.storage.getObjectBuffer(file.objectKey));

      const targets = this.renditions.filter((name) => name in RENDITIONS);
      const variantList: Array<{ name: string; playlist: string; bandwidth: number }> = [];

      for (const name of targets) {
        const preset = RENDITIONS[name];
        if (!preset) continue;

        const outputDir = join(workDir, name);
        await this.runFfmpeg(
          [
            '-i',
            sourcePath,
            '-vf',
            `scale=${preset.width}:-2`,
            '-c:v',
            'libx264',
            '-preset',
            'veryfast',
            '-b:v',
            `${preset.bitrate}k`,
            '-c:a',
            'aac',
            '-b:a',
            '128k',
            '-hls_time',
            '6',
            '-hls_playlist_type',
            'vod',
            '-hls_segment_filename',
            join(outputDir, 'seg_%03d.ts'),
            '-y',
            join(outputDir, 'index.m3u8'),
          ],
          outputDir,
        );

        // Segmentlar va pleylistni S3 ga yuklaymiz
        const files = await readdir(outputDir);
        for (const entry of files) {
          const data = await readFile(join(outputDir, entry));
          await this.storage.putObject(
            `hls/${fileObjectId}/${name}/${entry}`,
            data,
            entry.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t',
          );
        }

        variantList.push({
          name,
          playlist: `hls/${fileObjectId}/${name}/index.m3u8`,
          bandwidth: preset.bitrate * 1000,
        });
      }

      // Master pleylist — brauzer sifatni avtomatik tanlaydi (adaptiv bitreyt)
      const master = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        ...variantList.flatMap((variant) => {
          const preset = RENDITIONS[variant.name];
          return [
            `#EXT-X-STREAM-INF:BANDWIDTH=${variant.bandwidth},RESOLUTION=${preset?.width ?? 640}x?`,
            `${variant.name}/index.m3u8`,
          ];
        }),
      ].join('\n');

      await this.storage.putObject(
        `hls/${fileObjectId}/master.m3u8`,
        master,
        'application/vnd.apple.mpegurl',
      );

      await this.prisma.db.fileObject.update({
        where: { id: fileObjectId },
        data: {
          variants: {
            hls: `hls/${fileObjectId}/master.m3u8`,
            renditions: variantList,
            transcodedAt: new Date().toISOString(),
          } as never,
        },
      });

      this.logger.log({ fileObjectId, variants: variantList.length }, "Video HLS ga o'girildi");
      return { variants: variantList.length };
    } finally {
      // Vaqtinchalik fayllar har qanday holatda tozalanadi
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /** Fayl imzosini qayta tekshirish (kechiktirilgan tekshiruv). */
  private async verify(fileObjectId: string): Promise<unknown> {
    const file = await this.prisma.db.fileObject.findUnique({
      where: { id: fileObjectId },
      select: { objectKey: true, mimeType: true },
    });
    if (!file) return { skipped: 'not_found' };

    const valid = await this.storage.verifyMagicBytes(file.objectKey, file.mimeType);
    if (!valid) {
      await this.prisma.db.fileObject.update({
        where: { id: fileObjectId },
        data: { status: 'QUARANTINED' },
      });
    }
    return { valid };
  }

  private async isFfmpegAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn(this.ffmpegPath, ['-version']);
      child.on('error', () => resolve(false));
      child.on('close', (code) => resolve(code === 0));
    });
  }

  private async runFfmpeg(args: string[], outputDir: string): Promise<void> {
    const { mkdir } = await import('node:fs/promises');
    await mkdir(outputDir, { recursive: true });

    return new Promise((resolve, reject) => {
      const child = spawn(this.ffmpegPath, args);
      let stderr = '';

      child.stderr.on('data', (chunk: Buffer) => {
        // FFmpeg progressni stderr ga yozadi; oxirgi 4 KB xatolik uchun yetarli
        stderr = (stderr + chunk.toString()).slice(-4096);
      });

      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`FFmpeg ${code} kod bilan tugadi: ${stderr.slice(-500)}`));
      });
    });
  }
}
