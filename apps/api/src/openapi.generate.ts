/**
 * Maqsad: OpenAPI 3.1 spetsifikatsiyasini faylga chiqarish (promt.md §8, §14).
 *
 * Ishga tushirish: `npm run openapi --workspace=@lms/api`
 * Natija: `apps/api/openapi.json`
 *
 * Spetsifikatsiya ilovaning HAQIQIY marshrutlaridan generatsiya qilinadi —
 * qo'lda yozilgan hujjat kod bilan farq qilib ketmaydi.
 */

import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function generate(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.setGlobalPrefix('api/v1', { exclude: ['metrics'] });

  const config = new DocumentBuilder()
    .setTitle('QDU LMS API')
    .setDescription(
      [
        "Qo'qon Davlat Universiteti o'quv jarayonini boshqarish tizimining REST API si.",
        '',
        '## Javob konverti',
        'Barcha javoblar bir xil shaklda qaytadi:',
        '```json',
        '{ "success": true, "data": {}, "meta": { "page": 1, "total": 0 }, "error": null }',
        '```',
        '',
        '## Autentifikatsiya',
        'Access token `Authorization: Bearer <token>` sarlavhasida uzatiladi.',
        'Refresh token `httpOnly` cookie da saqlanadi va `/auth/refresh` orqali yangilanadi.',
        '',
        '## Ruxsatlar',
        "Har bir endpoint `resource:action:scope` ko'rinishidagi ruxsatni talab qiladi.",
        "Ruxsat yetarli bo'lmasa `403 FORBIDDEN` qaytadi.",
        '',
        '## Pagination',
        "Katta ro'yxatlar cursor-based: `?cursor=<opaque>&limit=50`, javobda `meta.nextCursor`.",
        '',
        '## Idempotentlik',
        "`POST` so'rovlarida `Idempotency-Key` sarlavhasi qo'llab-quvvatlanadi.",
      ].join('\n'),
    )
    .setVersion('1.0.0')
    .setContact('QDU LMS', 'https://lms.qdu.uz', 'support@qdu.uz')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .addServer('http://localhost:4000', 'Ishlab chiqish')
    .addServer('https://lms.qdu.uz', 'Ishlab chiqarish')
    .addTag('auth', 'F-01 — autentifikatsiya va profil')
    .addTag('users', 'F-01, F-17 — foydalanuvchilar')
    .addTag('org', 'F-02 — tashkiliy tuzilma')
    .addTag('curriculum', "F-03 — o'quv reja va sillabus")
    .addTag('courses', 'F-04 — kurs konstruktori')
    .addTag('content', 'F-05 — kontent, SCORM, xAPI')
    .addTag('assignments', 'F-06 — topshiriqlar')
    .addTag('quizzes', 'F-07 — test va imtihon')
    .addTag('grading', 'F-08 — baholash va reyting')
    .addTag('attendance', 'F-09 — davomat va jadval')
    .addTag('messaging', 'F-10 — kommunikatsiya')
    .addTag('classroom', 'F-11 — virtual sinf')
    .addTag('certificates', 'F-12 — sertifikatlar')
    .addTag('analytics', 'F-13 — analitika')
    .addTag('documents', 'F-14 — hujjat aylanishi')
    .addTag('gamification', 'F-15 — gamifikatsiya')
    .addTag('admin', 'F-17 — administratsiya')
    .addTag('integrations', 'Tashqi tizimlar')
    .addTag('system', 'Salomatlik va metrikalar')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  // NestJS Swagger 3.0 chiqaradi; 3.1 ga moslashtiramiz
  const spec = { ...document, openapi: '3.1.0' };

  const target = join(process.cwd(), 'openapi.json');
  await writeFile(target, `${JSON.stringify(spec, null, 2)}\n`, 'utf8');

  const pathCount = Object.keys(document.paths ?? {}).length;
  const operationCount = Object.values(document.paths ?? {}).reduce(
    (sum, item) => sum + Object.keys(item as Record<string, unknown>).length,
    0,
  );

  console.log(
    `OpenAPI 3.1 spetsifikatsiyasi yaratildi: ${target}\n` +
      `  Yo'llar: ${pathCount}, operatsiyalar: ${operationCount}`,
  );

  await app.close();
}

generate().catch((error: Error) => {
  console.error('OpenAPI generatsiyasi muvaffaqiyatsiz:', error.message);
  process.exit(1);
});
