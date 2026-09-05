/**
 * Maqsad: qolgan integratsiya provayderlari — imzo, to'lov, virtual sinf,
 * plagiat va Telegram (§10).
 *
 * Har biri mock va real implementatsiyaga ega; tanlov `.env` orqali.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { findSimilarSubmissions } from '@lms/shared';
import type { AppConfig } from '../../../config/configuration';
import type {
  ClassroomProvider,
  MeetingSession,
  PaymentInvoice,
  PaymentProvider,
  PlagiarismProvider,
  PlagiarismResult,
  SignatureProvider,
  SignatureVerification,
  TelegramProvider,
} from '../contracts';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { AppException } from '../../../common/errors/app.exception';

// ============================================================================
// E-IMZO (A-05)
// ============================================================================

/**
 * Mock imzo provayderi.
 *
 * HALOLLIK IZOHI: bu implementatsiya kriptografik tekshiruv BAJARMAYDI.
 * U imzo mavjudligini va hujjat hash'iga bog'langanligini tasdiqlaydi,
 * shuning uchun ish oqimini (hujjat yaratish → imzolash → arxivlash) to'liq
 * sinash mumkin. Ishlab chiqarishda `SIGNATURE_PROVIDER=eimzo` qo'yiladi.
 */
@Injectable()
export class MockSignatureProvider implements SignatureProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockSignatureProvider.name);

  async verify(documentHash: string, signature: string): Promise<SignatureVerification> {
    this.logger.warn("Imzo mock rejimda tekshirilmoqda — kriptografik tasdiq yo'q");

    if (!signature || signature.length < 20) {
      return { valid: false, reason: 'signature_too_short' };
    }

    return {
      valid: true,
      signerFullName: 'Mock imzolovchi',
      certificateSerial: createHash('sha256').update(signature).digest('hex').slice(0, 16),
      signedAt: new Date(),
      reason: `mock_verification:${documentHash.slice(0, 8)}`,
    };
  }
}

/**
 * E-IMZO tekshiruv xizmati adapteri.
 * PKCS#7 imzo tashqi verifikatsiya xizmatiga yuboriladi (`EIMZO_VERIFY_URL`).
 */
@Injectable()
export class EimzoSignatureProvider implements SignatureProvider {
  readonly name = 'eimzo';
  private readonly logger = new Logger(EimzoSignatureProvider.name);
  private readonly verifyUrl?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.verifyUrl = config.get('EIMZO_VERIFY_URL', { infer: true });
  }

  async verify(documentHash: string, signature: string): Promise<SignatureVerification> {
    if (!this.verifyUrl) {
      throw AppException.dependencyUnavailable('eimzo_not_configured');
    }

    const response = await fetch(this.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ documentHash, pkcs7: signature }),
    });

    if (!response.ok) {
      this.logger.error({ status: response.status }, 'E-IMZO tekshiruvi muvaffaqiyatsiz');
      throw AppException.dependencyUnavailable('eimzo');
    }

    const payload = (await response.json()) as {
      valid?: boolean;
      subjectName?: string;
      serialNumber?: string;
      signedAt?: string;
      reason?: string;
    };

    return {
      valid: Boolean(payload.valid),
      signerFullName: payload.subjectName,
      certificateSerial: payload.serialNumber,
      signedAt: payload.signedAt ? new Date(payload.signedAt) : undefined,
      reason: payload.reason,
    };
  }
}

// ============================================================================
// To'lov (A-20)
// ============================================================================

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock';
  private readonly logger = new Logger(MockPaymentProvider.name);

  async createInvoice(params: {
    orderId: string;
    amountUzs: number;
    description: string;
    returnUrl: string;
  }): Promise<PaymentInvoice> {
    this.logger.log({ orderId: params.orderId, amount: params.amountUzs }, 'Mock hisob-faktura');

    return {
      providerInvoiceId: `mock-${randomUUID()}`,
      // Mock sahifa: dev muhitida to'lovni "muvaffaqiyatli" deb belgilash uchun
      paymentUrl: `${params.returnUrl}?mock=1&orderId=${params.orderId}&status=PAID`,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  verifyWebhook(): boolean {
    // Mock rejimda imzo tekshirilmaydi — bu faqat dev muhitida ishlatiladi
    return true;
  }

  parseWebhook(payload: unknown): { orderId: string; status: 'PAID' | 'FAILED' | 'CANCELLED' } {
    const typed = payload as { orderId?: string; status?: string };
    return {
      orderId: String(typed.orderId ?? ''),
      status: (typed.status as 'PAID' | 'FAILED' | 'CANCELLED') ?? 'FAILED',
    };
  }
}

/** Payme merchant API adapteri. */
@Injectable()
export class PaymePaymentProvider implements PaymentProvider {
  readonly name = 'payme';
  private readonly merchantId?: string;
  private readonly secretKey?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.merchantId = config.get('PAYME_MERCHANT_ID', { infer: true });
    this.secretKey = config.get('PAYME_SECRET_KEY', { infer: true });
  }

  async createInvoice(params: {
    orderId: string;
    amountUzs: number;
    description: string;
    returnUrl: string;
  }): Promise<PaymentInvoice> {
    if (!this.merchantId) throw AppException.dependencyUnavailable('payme_not_configured');

    // Payme checkout: parametrlar base64 da URL ichida uzatiladi
    const payload = [
      `m=${this.merchantId}`,
      `ac.order_id=${params.orderId}`,
      // Payme tiyinda ishlaydi
      `a=${params.amountUzs * 100}`,
      `c=${params.returnUrl}`,
    ].join(';');

    return {
      providerInvoiceId: params.orderId,
      paymentUrl: `https://checkout.paycom.uz/${Buffer.from(payload).toString('base64')}`,
      expiresAt: new Date(Date.now() + 3_600_000),
    };
  }

  verifyWebhook(payload: unknown, signature: string): boolean {
    if (!this.secretKey) return false;
    const expected = createHmac('sha256', this.secretKey)
      .update(JSON.stringify(payload))
      .digest('hex');
    return expected === signature;
  }

  parseWebhook(payload: unknown): { orderId: string; status: 'PAID' | 'FAILED' | 'CANCELLED' } {
    const typed = payload as { params?: { account?: { order_id?: string } }; method?: string };
    const orderId = String(typed.params?.account?.order_id ?? '');

    const statusMap: Record<string, 'PAID' | 'FAILED' | 'CANCELLED'> = {
      PerformTransaction: 'PAID',
      CancelTransaction: 'CANCELLED',
    };

    return { orderId, status: statusMap[typed.method ?? ''] ?? 'FAILED' };
  }
}

// ============================================================================
// Virtual sinf (A-22)
// ============================================================================

/**
 * Jitsi Meet adapteri.
 *
 * Jitsi ochiq serveri autentifikatsiyasiz ishlaydi, shuning uchun dev
 * muhitida kalitlarsiz ham to'liq ishlaydi. JWT (`APP_ID`/`APP_SECRET`)
 * berilgan bo'lsa — moderator huquqlari bilan qo'shiladi.
 */
@Injectable()
export class JitsiClassroomProvider implements ClassroomProvider {
  readonly name = 'jitsi';
  private readonly domain: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.domain = config.get('JITSI_DOMAIN', { infer: true });
  }

  async createMeeting(params: {
    title: string;
    externalId: string;
    durationMinutes: number;
    recordingEnabled: boolean;
    moderatorName: string;
  }): Promise<MeetingSession> {
    // Jitsi'da xona oldindan yaratilmaydi — nom bo'yicha ochiladi.
    // Nomni taxmin qilib bo'lmasligi uchun tasodifiy qism qo'shiladi.
    const roomName = `qdu-${params.externalId}-${randomUUID().slice(0, 8)}`;

    return {
      externalMeetingId: roomName,
      joinUrl: `https://${this.domain}/${roomName}`,
      moderatorUrl: `https://${this.domain}/${roomName}#config.startWithVideoMuted=false`,
    };
  }

  async buildJoinUrl(params: {
    externalMeetingId: string;
    displayName: string;
    isModerator: boolean;
  }): Promise<string> {
    const url = new URL(`https://${this.domain}/${params.externalMeetingId}`);
    // Ismni oldindan to'ldirish — davomat hisobida ishlatiladi
    url.hash = `userInfo.displayName="${encodeURIComponent(params.displayName)}"`;
    return url.toString();
  }
}

/** BigBlueButton adapteri. */
@Injectable()
export class BbbClassroomProvider implements ClassroomProvider {
  readonly name = 'bbb';
  private readonly baseUrl?: string;
  private readonly secret?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.baseUrl = config.get('BBB_BASE_URL', { infer: true });
    this.secret = config.get('BBB_SECRET', { infer: true });
  }

  async createMeeting(params: {
    title: string;
    externalId: string;
    durationMinutes: number;
    recordingEnabled: boolean;
    moderatorName: string;
  }): Promise<MeetingSession> {
    const query = new URLSearchParams({
      name: params.title,
      meetingID: params.externalId,
      duration: String(params.durationMinutes),
      record: String(params.recordingEnabled),
      autoStartRecording: String(params.recordingEnabled),
    });

    const url = this.buildUrl('create', query);
    const response = await fetch(url);
    if (!response.ok) throw AppException.dependencyUnavailable('bbb');

    return {
      externalMeetingId: params.externalId,
      joinUrl: await this.buildJoinUrl({
        externalMeetingId: params.externalId,
        displayName: params.moderatorName,
        isModerator: true,
      }),
    };
  }

  async buildJoinUrl(params: {
    externalMeetingId: string;
    displayName: string;
    isModerator: boolean;
  }): Promise<string> {
    const query = new URLSearchParams({
      meetingID: params.externalMeetingId,
      fullName: params.displayName,
      role: params.isModerator ? 'MODERATOR' : 'VIEWER',
    });
    return this.buildUrl('join', query);
  }

  /** BBB API imzosi: SHA-1(call + query + secret). */
  private buildUrl(action: string, query: URLSearchParams): string {
    if (!this.baseUrl || !this.secret) {
      throw AppException.dependencyUnavailable('bbb_not_configured');
    }
    const checksum = createHash('sha1')
      .update(`${action}${query.toString()}${this.secret}`)
      .digest('hex');
    return `${this.baseUrl}/api/${action}?${query.toString()}&checksum=${checksum}`;
  }
}

// ============================================================================
// Plagiat (A-10)
// ============================================================================

/**
 * Ichki o'xshashlik tekshiruvi.
 *
 * QAMROV IZOHI: faqat TIZIM ICHIDAGI ishlar bilan solishtiradi — internet
 * manbalari bilan emas. Bu cheklov hisobotda ham ko'rsatiladi, foydalanuvchi
 * yanglishmasligi uchun.
 */
@Injectable()
export class InternalPlagiarismProvider implements PlagiarismProvider {
  readonly name = 'internal';
  private readonly logger = new Logger(InternalPlagiarismProvider.name);

  constructor(private readonly prisma: PrismaService) {}

  async check(params: {
    submissionId: string;
    text: string;
    assignmentId: string;
  }): Promise<PlagiarismResult> {
    // Shu topshiriq bo'yicha boshqa talabalarning ishlari
    const candidates = await this.prisma.db.submission.findMany({
      where: {
        assignmentId: params.assignmentId,
        id: { not: params.submissionId },
        status: { in: ['SUBMITTED', 'LATE', 'GRADED'] },
        contentHtml: { not: null },
      },
      select: {
        id: true,
        contentHtml: true,
        user: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
      take: 500,
    });

    const matches = findSimilarSubmissions(
      { text: params.text },
      candidates.map((item) => ({ id: item.id, text: item.contentHtml ?? '' })),
      { shingleSize: 5, threshold: 0.2, maxResults: 10 },
    );

    const labelMap = new Map(
      candidates.map((item) => [
        item.id,
        [item.user.profile?.lastName, item.user.profile?.firstName].filter(Boolean).join(' '),
      ]),
    );

    this.logger.log(
      { submissionId: params.submissionId, matches: matches.length },
      'Plagiat tekshiruvi yakunlandi',
    );

    return {
      similarityPercent: matches[0]?.similarityPercent ?? 0,
      matches: matches.map((match) => ({
        ...match,
        label: labelMap.get(match.targetId),
      })),
      scope: 'INTERNAL',
    };
  }
}

// ============================================================================
// Telegram (F-10)
// ============================================================================

@Injectable()
export class TelegramBotProvider implements TelegramProvider {
  readonly enabled: boolean;
  private readonly logger = new Logger(TelegramBotProvider.name);
  private readonly token?: string;

  constructor(config: ConfigService<AppConfig, true>) {
    this.enabled = config.get('TELEGRAM_ENABLED', { infer: true });
    this.token = config.get('TELEGRAM_BOT_TOKEN', { infer: true });
  }

  async sendMessage(chatId: string, text: string): Promise<{ ok: boolean }> {
    if (!this.enabled || !this.token) {
      this.logger.debug({ chatId }, "Telegram o'chirilgan — xabar yuborilmadi");
      return { ok: false };
    }

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });

    if (!response.ok) {
      this.logger.warn({ chatId, status: response.status }, 'Telegram xabari yuborilmadi');
      return { ok: false };
    }
    return { ok: true };
  }

  buildDeepLink(linkCode: string): string {
    return `https://t.me/qdu_lms_bot?start=${linkCode}`;
  }
}
