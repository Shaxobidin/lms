/**
 * Maqsad: infratuzilma servislarini global ravishda taqdim etish.
 * Har bir domen moduli ularni alohida import qilmasligi uchun `@Global()`.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';
import { PrismaService } from './prisma/prisma.service';
import { CacheService, REDIS_CLIENT } from './cache/cache.service';
import { QueueService } from './queue/queue.service';
import { StorageService } from './storage/storage.service';
import { AuditService } from './audit/audit.service';
import { SanitizerService } from './security/sanitizer.service';
import { CryptoService } from './security/crypto.service';
import { ScopeResolverService } from './auth/scope-resolver.service';
import { IdempotencyService } from './http/idempotency.service';
import { RateLimitService } from './http/rate-limit.service';
import { EventsService } from './events/events.service';

@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => ({
        secret: config.get('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: config.get('JWT_ACCESS_TTL', { infer: true }) },
      }),
    }),
    ConfigModule,
  ],
  providers: [
    PrismaService,
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const client = new Redis({
          host: config.get('REDIS_HOST', { infer: true }),
          port: config.get('REDIS_PORT', { infer: true }),
          password: config.get('REDIS_PASSWORD', { infer: true }) || undefined,
          // BullMQ talabi: bloklovchi buyruqlar uchun cheksiz qayta urinish
          maxRetriesPerRequest: null,
          lazyConnect: false,
        });
        client.on('error', (error) => {
          // Redis mavjud bo'lmasa ilova ishlashda davom etadi (graceful degradation),
          // ammo xatolik albatta loglanadi.
          console.error('[redis]', error.message);
        });
        return client;
      },
    },
    CacheService,
    QueueService,
    StorageService,
    AuditService,
    SanitizerService,
    CryptoService,
    ScopeResolverService,
    IdempotencyService,
    RateLimitService,
    EventsService,
  ],
  exports: [
    PrismaService,
    REDIS_CLIENT,
    CacheService,
    QueueService,
    StorageService,
    AuditService,
    SanitizerService,
    CryptoService,
    ScopeResolverService,
    IdempotencyService,
    RateLimitService,
    EventsService,
    JwtModule,
  ],
})
export class CommonModule {}
