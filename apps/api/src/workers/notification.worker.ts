/**
 * Maqsad: bildirishnomalarni kanallar bo'yicha yetkazish (F-10).
 *
 * Bitta bildirishnoma bir nechta kanalga yuborilishi mumkin. Bitta kanal
 * ishlamasa, qolganlari baribir yuboriladi — xatolik butun yetkazishni
 * to'xtatmaydi, ammo albatta loglanadi (§16).
 */

import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Job } from 'bullmq';
import type Redis from 'ioredis';
import type { AppConfig } from '../config/configuration';
import { BaseWorker } from './worker.base';
import { MailerService } from './mailer.service';
import { NotificationTemplates } from './notification.templates';
import { PrismaService } from '../common/prisma/prisma.service';
import { REDIS_CLIENT } from '../common/cache/cache.service';
import { EventsService, EVENT_TYPES } from '../common/events/events.service';
import { QUEUES, type JobPayloads } from '../common/queue/queue.service';
import {
  SMS_PROVIDER,
  TELEGRAM_PROVIDER,
  type SmsProvider,
  type TelegramProvider,
} from '../modules/integrations/contracts';

@Injectable()
export class NotificationWorker extends BaseWorker {
  constructor(
    @Inject(REDIS_CLIENT) redis: Redis,
    config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly templates: NotificationTemplates,
    private readonly events: EventsService,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
    @Inject(TELEGRAM_PROVIDER) private readonly telegram: TelegramProvider,
  ) {
    super(redis, QUEUES.NOTIFICATION, config.get('APP_ROLE', { infer: true }), 10);
  }

  protected async process(job: Job): Promise<unknown> {
    const { notificationId } = job.data as JobPayloads['notification.dispatch'];

    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
      select: {
        id: true,
        userId: true,
        templateKey: true,
        params: true,
        channels: true,
        linkUrl: true,
        status: true,
        user: {
          select: {
            email: true,
            phone: true,
            locale: true,
            telegramLink: { select: { chatId: true } },
            notificationPrefs: { select: { preferences: true, quietHours: true } },
          },
        },
      },
    });

    if (!notification) return { skipped: 'not_found' };
    if (notification.status === 'SENT') return { skipped: 'already_sent' };

    const locale = notification.user.locale;
    const params = (notification.params ?? {}) as Record<string, unknown>;
    const rendered = this.templates.render(notification.templateKey, locale, params);

    // Foydalanuvchi sozlamalari kanallarni cheklashi mumkin
    const preferences = notification.user.notificationPrefs?.preferences as Record<
      string,
      string[]
    > | null;
    const allowed = preferences?.[notification.templateKey];
    let channels = allowed
      ? notification.channels.filter((c) => allowed.includes(c))
      : notification.channels;

    // Sokin soatlar: bu oraliqda faqat ilova ichida ko'rsatiladi
    if (this.isQuietHour(notification.user.notificationPrefs?.quietHours)) {
      channels = channels.filter((channel) => channel === 'IN_APP');
    }

    const errors: string[] = [];

    for (const channel of channels) {
      try {
        switch (channel) {
          case 'IN_APP':
            // Ilova ichidagi bildirishnoma allaqachon bazada; SSE orqali xabar beramiz
            await this.events.publish({
              type: EVENT_TYPES.NOTIFICATION,
              userId: notification.userId,
              payload: {
                notificationId: notification.id,
                templateKey: notification.templateKey,
                params,
                linkUrl: notification.linkUrl,
              },
            });
            break;

          case 'EMAIL':
            if (notification.user.email) {
              await this.mailer.send({
                to: notification.user.email,
                subject: rendered.subject,
                text: notification.linkUrl
                  ? `${rendered.body}\n\n${notification.linkUrl}`
                  : rendered.body,
              });
            }
            break;

          case 'SMS':
            if (notification.user.phone) {
              await this.sms.send(notification.user.phone, rendered.body);
            }
            break;

          case 'TELEGRAM':
            if (notification.user.telegramLink?.chatId) {
              await this.telegram.sendMessage(
                notification.user.telegramLink.chatId,
                `<b>${rendered.subject}</b>\n${rendered.body}`,
              );
            }
            break;

          case 'PUSH':
            // Push PWA orqali service worker'da amalga oshiriladi (F-16);
            // server tomonida IN_APP hodisasi yetarli
            break;

          default:
            break;
        }
      } catch (error) {
        errors.push(`${channel}: ${(error as Error).message}`);
        this.logger.warn(
          { notificationId, channel, error: (error as Error).message },
          "Kanal orqali yuborib bo'lmadi",
        );
      }
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: {
        status: errors.length === channels.length && channels.length > 0 ? 'FAILED' : 'SENT',
        sentAt: new Date(),
        error: errors.length > 0 ? errors.join('; ').slice(0, 1000) : null,
      },
    });

    return { channels: channels.length, errors: errors.length };
  }

  /** Sokin soatlar oralig'ida ekanini tekshiradi (Toshkent vaqti bo'yicha). */
  private isQuietHour(quietHours: unknown): boolean {
    if (!quietHours || typeof quietHours !== 'object') return false;
    const range = quietHours as { from?: string; to?: string };
    if (!range.from || !range.to) return false;

    const now = new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Tashkent',
    }).format(new Date());

    // Yarim tundan o'tuvchi oraliq ham qo'llab-quvvatlanadi (masalan 22:00–07:00)
    return range.from <= range.to
      ? now >= range.from && now < range.to
      : now >= range.from || now < range.to;
  }
}
