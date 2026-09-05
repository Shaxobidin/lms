/**
 * Maqsad: SMTP orqali email yuborish (F-10).
 *
 * Dev muhitida MailHog ishlatiladi (A-28) — kalitlarsiz ham xatlar ko'rinadi
 * (http://localhost:8025), shuning uchun e2e testlar to'liq bajariladi.
 */

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import nodemailer, { type Transporter } from 'nodemailer';
import type { AppConfig } from '../config/configuration';

@Injectable()
export class MailerService implements OnModuleDestroy {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: ConfigService<AppConfig, true>) {
    const user = config.get('SMTP_USER', { infer: true });
    const password = config.get('SMTP_PASSWORD', { infer: true });

    this.from = config.get('SMTP_FROM', { infer: true });
    this.transporter = nodemailer.createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port: config.get('SMTP_PORT', { infer: true }),
      secure: config.get('SMTP_SECURE', { infer: true }),
      // MailHog autentifikatsiya talab qilmaydi
      ...(user && password ? { auth: { user, pass: password } } : {}),
      // Ommaviy yuborishda ulanishni qayta ishlatamiz
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
    });
  }

  async send(params: { to: string; subject: string; text: string; html?: string }): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      text: params.text,
      html: params.html ?? this.toHtml(params.text),
    });

    this.logger.debug({ to: params.to, subject: params.subject }, 'Email yuborildi');
  }

  /** Oddiy matnni minimal HTML ga o'raydi (mijozlarda o'qilishi yaxshiroq). */
  private toHtml(text: string): string {
    const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const withLinks = escaped.replace(
      /(https?:\/\/[^\s]+)/g,
      '<a href="$1" style="color:#0f4c81">$1</a>',
    );

    return `<!doctype html><html><body style="font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">
<div style="max-width:560px;margin:0 auto;padding:24px">
${withLinks.replace(/\n/g, '<br>')}
<hr style="margin-top:32px;border:none;border-top:1px solid #e5e7eb">
<p style="font-size:12px;color:#6b7280">Ushbu xat avtomatik yuborilgan, javob yozmang.</p>
</div></body></html>`;
  }

  /** Sog'liq tekshiruvi uchun. */
  async verify(): Promise<boolean> {
    try {
      await this.transporter.verify();
      return true;
    } catch (error) {
      this.logger.warn({ error: (error as Error).message }, "SMTP ulanishini tekshirib bo'lmadi");
      return false;
    }
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
