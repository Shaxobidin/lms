/**
 * Maqsad: integratsiya provayderlarini `.env` ga qarab tanlash va DI orqali
 * taqdim etish (§10, P4).
 *
 * Domen modullari faqat `SMS_PROVIDER`, `HEMIS_ADAPTER` kabi tokenlarni
 * so'raydi va konkret implementatsiyani bilmaydi.
 */

import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import {
  CLASSROOM_PROVIDER,
  HEMIS_ADAPTER,
  PAYMENT_PROVIDER,
  PLAGIARISM_PROVIDER,
  SIGNATURE_PROVIDER,
  SMS_PROVIDER,
  TELEGRAM_PROVIDER,
} from './contracts';
import { EskizSmsProvider, MockSmsProvider } from './providers/sms.providers';
import { LiveHemisAdapter, MockHemisAdapter } from './providers/hemis.adapter';
import {
  BbbClassroomProvider,
  EimzoSignatureProvider,
  InternalPlagiarismProvider,
  JitsiClassroomProvider,
  MockPaymentProvider,
  MockSignatureProvider,
  PaymePaymentProvider,
  TelegramBotProvider,
} from './providers/misc.providers';
import { CacheService } from '../../common/cache/cache.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { HemisSyncService } from './hemis-sync.service';
import { IntegrationsController } from './integrations.controller';

@Global()
@Module({
  controllers: [IntegrationsController],
  providers: [
    HemisSyncService,

    {
      provide: SMS_PROVIDER,
      inject: [ConfigService, CacheService],
      useFactory: (config: ConfigService<AppConfig, true>, cache: CacheService) =>
        config.get('SMS_PROVIDER', { infer: true }) === 'eskiz'
          ? new EskizSmsProvider(config, cache)
          : new MockSmsProvider(cache),
    },

    {
      provide: HEMIS_ADAPTER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('HEMIS_MODE', { infer: true }) === 'live'
          ? new LiveHemisAdapter(config)
          : new MockHemisAdapter(),
    },

    {
      provide: SIGNATURE_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('SIGNATURE_PROVIDER', { infer: true }) === 'eimzo'
          ? new EimzoSignatureProvider(config)
          : new MockSignatureProvider(),
    },

    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('PAYMENT_PROVIDER', { infer: true }) === 'payme'
          ? new PaymePaymentProvider(config)
          : new MockPaymentProvider(),
    },

    {
      provide: CLASSROOM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) =>
        config.get('CLASSROOM_PROVIDER', { infer: true }) === 'bbb'
          ? new BbbClassroomProvider(config)
          : new JitsiClassroomProvider(config),
    },

    {
      provide: PLAGIARISM_PROVIDER,
      inject: [PrismaService],
      useFactory: (prisma: PrismaService) => new InternalPlagiarismProvider(prisma),
    },

    {
      provide: TELEGRAM_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => new TelegramBotProvider(config),
    },
  ],
  exports: [
    SMS_PROVIDER,
    HEMIS_ADAPTER,
    SIGNATURE_PROVIDER,
    PAYMENT_PROVIDER,
    CLASSROOM_PROVIDER,
    PLAGIARISM_PROVIDER,
    TELEGRAM_PROVIDER,
    HemisSyncService,
  ],
})
export class IntegrationsModule {}
