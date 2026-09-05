/**
 * Maqsad: SMS provayderlari (A-21) — mock va Eskiz.
 *
 * Mock rejim dev va test uchun: xabar loglanadi va Redis'ga yoziladi,
 * shuning uchun e2e testda OTP kodni olish mumkin.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../../config/configuration';
import type { SmsProvider, SmsSendResult } from '../contracts';
import { CacheService } from '../../../common/cache/cache.service';
import { AppException } from '../../../common/errors/app.exception';

@Injectable()
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockSmsProvider.name);

  constructor(private readonly cache: CacheService) {}

  async send(phone: string, text: string): Promise<SmsSendResult> {
    const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.logger.log({ phone, text }, 'SMS (mock rejim) — haqiqiy yuborish amalga oshirilmadi');
    // Testlar oxirgi xabarni shu kalitdan o'qishi mumkin
    await this.cache.set(`sms:last:${phone}`, { text, sentAt: new Date().toISOString() }, 600);

    return { providerMessageId: id, status: 'SENT' };
  }
}

/**
 * Eskiz.uz REST API adapteri.
 *
 * Token 30 kun amal qiladi va Redis'da keshlanadi — har bir SMS uchun
 * qayta autentifikatsiya qilinmaydi.
 */
@Injectable()
export class EskizSmsProvider implements SmsProvider {
  readonly name = 'eskiz';
  private readonly logger = new Logger(EskizSmsProvider.name);
  private readonly baseUrl: string;
  private readonly email?: string;
  private readonly password?: string;
  private readonly sender: string;

  constructor(
    config: ConfigService<AppConfig, true>,
    private readonly cache: CacheService,
  ) {
    this.baseUrl = config.get('ESKIZ_BASE_URL', { infer: true });
    this.email = config.get('ESKIZ_EMAIL', { infer: true });
    this.password = config.get('ESKIZ_PASSWORD', { infer: true });
    this.sender = config.get('ESKIZ_SENDER', { infer: true });
  }

  async send(phone: string, text: string): Promise<SmsSendResult> {
    const token = await this.getToken();

    const response = await fetch(`${this.baseUrl}/message/sms/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // Eskiz raqamni `998XXXXXXXXX` formatida kutadi
        mobile_phone: phone.replace('+', ''),
        message: text,
        from: this.sender,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      this.logger.error({ status: response.status, body }, 'Eskiz SMS yuborishda xatolik');
      throw AppException.dependencyUnavailable('eskiz');
    }

    const payload = (await response.json()) as { id?: string; status?: string };
    return {
      providerMessageId: String(payload.id ?? ''),
      status: payload.status === 'waiting' ? 'QUEUED' : 'SENT',
    };
  }

  private async getToken(): Promise<string> {
    const cached = await this.cache.get<string>('sms:eskiz:token');
    if (cached) return cached;

    if (!this.email || !this.password) {
      throw AppException.dependencyUnavailable('eskiz_credentials_missing');
    }

    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password }),
    });

    if (!response.ok) throw AppException.dependencyUnavailable('eskiz_auth');

    const payload = (await response.json()) as { data?: { token?: string } };
    const token = payload.data?.token;
    if (!token) throw AppException.dependencyUnavailable('eskiz_auth');

    // Token 30 kun amal qiladi; ehtiyot uchun 25 kun keshlaymiz
    await this.cache.set('sms:eskiz:token', token, 25 * 86_400);
    return token;
  }
}
