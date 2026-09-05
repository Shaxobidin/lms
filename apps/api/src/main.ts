/**
 * Maqsad: API ilovasining kirish nuqtasi.
 *
 * `APP_ROLE` orqali bitta image ikki rejimda ishlaydi (ADR-004):
 *  - `api`    — HTTP server;
 *  - `worker` — faqat BullMQ ishlovchilari (HTTP porti ochilmaydi);
 *  - `all`    — ikkalasi (dev uchun qulay).
 */

import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import type { AppConfig } from './config/configuration';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, {
    bufferLogs: false,
    // Tanani o'zimiz o'qiymiz — katta fayllar S3 ga to'g'ridan-to'g'ri boradi
    bodyParser: true,
  });

  const config = app.get(ConfigService<AppConfig, true>);
  const appRole = config.get('APP_ROLE', { infer: true });

  // --- Xavfsizlik sarlavhalari (§11) ---------------------------------------
  app.use(
    helmet({
      // API JSON qaytaradi; CSP frontend (Nginx) darajasida qo'llaniladi
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      hsts: config.get('NODE_ENV', { infer: true }) === 'production',
    }),
  );
  app.use(cookieParser());

  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Idempotency-Key',
      'X-Trace-Id',
      'Accept-Language',
    ],
    exposedHeaders: ['X-Trace-Id', 'Retry-After'],
    maxAge: 86_400,
  });

  app.setGlobalPrefix('api/v1', {
    // Metrikalar prefikssiz — Prometheus standarti
    exclude: ['metrics'],
  });

  // Global `ValidationPipe` ATAYLAB o'rnatilmagan: barcha validatsiya zod
  // sxemalari orqali `ZodValidationPipe` bilan bajariladi (ADR-011).
  // Ikkita validatsiya tizimi bo'lishi xatolik formatini chalkashtirardi.
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

  app.enableShutdownHooks();

  // --- OpenAPI 3.1 spetsifikatsiyasi (§8) -----------------------------------
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const documentConfig = new DocumentBuilder()
      .setTitle(`${config.get('TENANT_SHORT_NAME', { infer: true })} LMS API`)
      .setDescription(
        "O'quv jarayonini boshqarish tizimining REST API si. " +
          'Barcha javoblar `{ success, data, meta, error }` konvertida qaytadi.',
      )
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
      .addServer(config.get('API_PUBLIC_URL', { infer: true }))
      .build();

    const document = SwaggerModule.createDocument(app, documentConfig);
    SwaggerModule.setup('api/v1/docs', app, document, {
      swaggerOptions: { persistAuthorization: true },
    });
    logger.log('OpenAPI hujjati: /api/v1/docs');
  }

  if (appRole === 'worker') {
    // Worker rejimida HTTP porti ochilmaydi — faqat navbat ishlovchilari
    await app.init();
    logger.log("Worker rejimida ishga tushdi (HTTP server yo'q)");
    return;
  }

  const port = config.get('API_PORT', { infer: true });
  await app.listen(port, '0.0.0.0');
  logger.log(`API ${port}-portda ishga tushdi (rol: ${appRole})`);
}

bootstrap().catch((error: Error) => {
  // Ishga tushishdagi xatolik jimgina yutilmasligi kerak (§16)
  console.error("Ilovani ishga tushirib bo'lmadi:", error.message, error.stack);
  process.exit(1);
});
