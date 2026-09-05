/**
 * Maqsad: parol xeshlash, maxfiy ma'lumotlarni shifrlash va token generatsiyasi (§11).
 *
 * - Parollar: Argon2id (ADR-006, OWASP 2021 tavsiyasi)
 * - Sirlar (TOTP kaliti kabi): AES-256-GCM, kalit `CRYPTO_SECRET_KEY` dan
 * - Tokenlar: `crypto.randomBytes` — Math.random() HECH QACHON ishlatilmaydi
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import type { AppConfig } from '../../config/configuration';

/** OWASP 2021 tavsiyasi (Argon2id, m=19 MiB, t=2, p=1). */
const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

@Injectable()
export class CryptoService {
  private readonly encryptionKey: Buffer;

  constructor(config: ConfigService<AppConfig, true>) {
    const hexKey: string = config.get('CRYPTO_SECRET_KEY', { infer: true });
    this.encryptionKey = Buffer.from(hexKey, 'hex');
  }

  async hashPassword(password: string): Promise<string> {
    return argon2.hash(password, ARGON2_OPTIONS);
  }

  /**
   * Parolni tekshiradi. Xesh buzilgan bo'lsa ham `false` qaytaradi
   * (istisno tashlamaydi) — bu xatolik orqali ma'lumot sizib chiqishini oldini oladi.
   */
  async verifyPassword(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Tokenlarni bazada ochiq saqlamaslik uchun (sessiya, parolni tiklash). */
  hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Kriptografik xavfsiz tasodifiy token (base64url). */
  generateToken(bytes = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /** 6 xonali OTP — `randomInt` bir tekis taqsimotni kafolatlaydi. */
  generateOtp(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  /**
   * Sertifikat seriya raqami: QDU-2026-XXXXXX.
   * Chalkashmaydigan alifbo (0/O, 1/I yo'q) — qo'lda kiritish uchun qulay.
   */
  generateSerialNumber(prefix: string, year: number): string {
    const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
    let suffix = '';
    for (let i = 0; i < 8; i += 1) {
      suffix += alphabet[randomInt(0, alphabet.length)];
    }
    return `${prefix}-${year}-${suffix}`;
  }

  /** Vaqt bo'yicha xavfsiz solishtirish — timing attack ga qarshi. */
  safeCompare(a: string, b: string): boolean {
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    if (bufferA.length !== bufferB.length) return false;
    return timingSafeEqual(bufferA, bufferB);
  }

  /**
   * AES-256-GCM bilan shifrlash. Natija: `iv:authTag:ciphertext` (base64).
   * GCM autentifikatsiyalangan shifrlash — o'zgartirilgan matn aniqlanadi.
   */
  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [iv.toString('base64'), authTag.toString('base64'), encrypted.toString('base64')].join(
      ':',
    );
  }

  decrypt(payload: string): string {
    const [ivPart, tagPart, dataPart] = payload.split(':');
    if (!ivPart || !tagPart || !dataPart) {
      throw new Error("Shifrlangan qiymat formati noto'g'ri");
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.encryptionKey,
      Buffer.from(ivPart, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  /**
   * Deterministik son — test varianti urug'i uchun (apellyatsiyada qayta tiklanadi).
   *
   * Natija 31 bitgacha qisqartiriladi: baza ustuni `INT4` (musbat maksimum
   * 2 147 483 647), to'liq UInt32 esa unga sig'maydi.
   */
  deterministicSeed(...parts: string[]): number {
    const digest = createHash('sha256').update(parts.join(':')).digest();
    return digest.readUInt32BE(0) & 0x7fffffff;
  }
}
