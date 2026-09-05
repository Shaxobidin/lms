/**
 * Maqsad: to'g'ridan-to'g'ri kanal orqali yuboriladigan xabarlar (F-10).
 *
 * `notification.dispatch` dan farqi: bu ishlar bazadagi `Notification` yozuviga
 * BOG'LANMAGAN. Ular tizim xabarlari uchun kerak — parolni tiklash havolasi,
 * emailni tasdiqlash, kirish uchun bir martalik kod (OTP). Bunday xabarlarni
 * bildirishnomalar tarixiga yozish ham, foydalanuvchi sozlamalari bilan
 * cheklash ham noto'g'ri bo'lardi: ular xavfsizlik xabarlari.
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import { BaseWorker } from './worker.base';
import { MailerService } from './mailer.service';
import { NotificationTemplates } from './notification.templates';
import { REDIS_CLIENT } from '../common/cache/cache.service';
import type { AppConfig } from '../config/configuration';
import { QUEUES, type JobPayloads } from '../common/queue/queue.service';
import {
  SMS_PROVIDER,
  TELEGRAM_PROVIDER,
  type SmsProvider,
  type TelegramProvider,
} from '../modules/integrations/contracts';
import type { Locale } from '@lms/shared';

@Injectable()
export class EmailWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppConfig, true>,
    private readonly mailer: MailerService,
    private readonly templates: NotificationTemplates,
  ) {
    super(redis, QUEUES.EMAIL, config.get('APP_ROLE', { infer: true }), 5);
  }

  protected async process(job: Job): Promise<unknown> {
    const payload = job.data as JobPayloads['email.send'];
    const rendered = this.templates.render(
      payload.templateKey,
      payload.locale as Locale,
      payload.params,
    );

    // Havola shablon parametrlarida keladi (masalan, parolni tiklash havolasi)
    const link = typeof payload.params['link'] === 'string' ? payload.params['link'] : null;

    await this.mailer.send({
      to: payload.to,
      subject: rendered.subject,
      text: link ? `${rendered.body}\n\n${link}` : rendered.body,
    });

    return { to: payload.to, template: payload.templateKey };
  }
}

@Injectable()
export class SmsWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppConfig, true>,
    private readonly templates: NotificationTemplates,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    super(redis, QUEUES.SMS, config.get('APP_ROLE', { infer: true }), 5);
  }

  protected async process(job: Job): Promise<unknown> {
    const payload = job.data as JobPayloads['sms.send'];
    const rendered = this.templates.render(
      payload.templateKey,
      payload.locale as Locale,
      payload.params,
    );

    const result = await this.sms.send(payload.phone, rendered.body);
    return {
      phone: payload.phone,
      providerMessageId: result.providerMessageId,
      status: result.status,
    };
  }
}

@Injectable()
export class TelegramWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppConfig, true>,
    private readonly templates: NotificationTemplates,
    @Inject(TELEGRAM_PROVIDER) private readonly telegram: TelegramProvider,
  ) {
    super(redis, QUEUES.TELEGRAM, config.get('APP_ROLE', { infer: true }), 5);
  }

  protected async process(job: Job): Promise<unknown> {
    const payload = job.data as JobPayloads['telegram.send'];
    const rendered = this.templates.render(
      payload.templateKey,
      payload.locale as Locale,
      payload.params,
    );

    await this.telegram.sendMessage(payload.chatId, `<b>${rendered.subject}</b>\n${rendered.body}`);
    return { chatId: payload.chatId, template: payload.templateKey };
  }
}
