/**
 * Maqsad: SMS orqali bir martalik kod (OTP) — F-01.
 *
 * Xavfsizlik qoidalari (§11):
 *  - kod bazada faqat xesh ko'rinishida saqlanadi;
 *  - 5 daqiqa amal qiladi va faqat bir marta ishlatiladi;
 *  - 3 marta noto'g'ri kiritilsa bekor qilinadi;
 *  - so'rov chastotasi cheklanadi (SMS xarajati va spam).
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/security/crypto.service';
import { RateLimitService } from '../../common/http/rate-limit.service';
import { QueueService } from '../../common/queue/queue.service';
import { AppException } from '../../common/errors/app.exception';

const OTP_TTL_SECONDS = 300;
const MAX_ATTEMPTS = 3;

export type OtpPurpose = 'LOGIN' | 'VERIFY_PHONE' | 'RESET_PASSWORD';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly rateLimit: RateLimitService,
    private readonly queue: QueueService,
  ) {}

  async request(
    phone: string,
    purpose: OtpPurpose,
    locale = 'uz-Latn',
  ): Promise<{ expiresIn: number }> {
    this.rateLimit.assert(await this.rateLimit.checkOtp(phone));

    const user = await this.prisma.db.user.findFirst({
      where: { phone },
      select: { id: true, locale: true },
    });

    // LOGIN va RESET_PASSWORD uchun raqam ro'yxatdan o'tgan bo'lishi kerak,
    // ammo bu haqda xabar berilmaydi — raqamlarni sanab chiqishning oldini oladi.
    const code = this.crypto.generateOtp();

    await this.prisma.db.otpCode.create({
      data: {
        userId: user?.id ?? null,
        phone,
        codeHash: this.crypto.hashToken(code),
        purpose,
        expiresAt: new Date(Date.now() + OTP_TTL_SECONDS * 1000),
      },
    });

    if (user || purpose === 'VERIFY_PHONE') {
      await this.queue.enqueue('sms.send', {
        phone,
        templateKey: `sms.otp.${purpose.toLowerCase()}`,
        locale: user?.locale ?? locale,
        params: { code, minutes: OTP_TTL_SECONDS / 60 },
      });
    }

    return { expiresIn: OTP_TTL_SECONDS };
  }

  /**
   * Kodni tekshiradi va ishlatilgan deb belgilaydi.
   * Muvaffaqiyatli bo'lsa foydalanuvchi id sini (bo'lsa) qaytaradi.
   */
  async verify(
    phone: string,
    code: string,
    purpose: OtpPurpose,
  ): Promise<{ userId: string | null }> {
    const record = await this.prisma.db.otpCode.findFirst({
      where: { phone, purpose, usedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, codeHash: true, attempts: true, userId: true },
    });

    if (!record) throw AppException.businessRule('errors.otp_not_found_or_expired');

    if (record.attempts >= MAX_ATTEMPTS) {
      await this.prisma.db.otpCode.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      throw AppException.businessRule('errors.otp_attempts_exceeded');
    }

    if (!this.crypto.safeCompare(record.codeHash, this.crypto.hashToken(code))) {
      await this.prisma.db.otpCode.update({
        where: { id: record.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AppException({ code: 'INVALID_CREDENTIALS', messageKey: 'errors.otp_invalid' });
    }

    await this.prisma.db.otpCode.update({
      where: { id: record.id },
      data: { usedAt: new Date() },
    });

    if (purpose === 'VERIFY_PHONE' && record.userId) {
      await this.prisma.db.user.update({
        where: { id: record.userId },
        data: { phoneVerifiedAt: new Date() },
      });
    }

    return { userId: record.userId };
  }
}
