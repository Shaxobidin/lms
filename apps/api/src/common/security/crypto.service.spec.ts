/**
 * Maqsad: kriptografik xizmatning testlari (§11).
 *
 * Bu qism xavfsizlikning poydevori: parol xeshi, shifrlash va tokenlar.
 */

import { ConfigService } from '@nestjs/config';
import { CryptoService } from './crypto.service';

function buildService(): CryptoService {
  const config = {
    get: (key: string) => {
      if (key === 'CRYPTO_SECRET_KEY') {
        return '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
      }
      return undefined;
    },
  } as unknown as ConfigService;

  return new CryptoService(config as never);
}

describe('CryptoService', () => {
  const service = buildService();

  describe('parol xeshlash', () => {
    it("to'g'ri parolni tasdiqlaydi", async () => {
      const hash = await service.hashPassword('Parol!2026');
      expect(hash).toMatch(/^\$argon2id\$/);
      expect(await service.verifyPassword(hash, 'Parol!2026')).toBe(true);
    });

    it("noto'g'ri parolni rad etadi", async () => {
      const hash = await service.hashPassword('Parol!2026');
      expect(await service.verifyPassword(hash, 'Parol!2027')).toBe(false);
    });

    it('bir xil parol uchun har safar boshqa xesh beradi (tuz)', async () => {
      const first = await service.hashPassword('Parol!2026');
      const second = await service.hashPassword('Parol!2026');
      expect(first).not.toBe(second);
    });

    it('buzuq xesh bilan istisno tashlamaydi', async () => {
      expect(await service.verifyPassword('buzuq-xesh', 'Parol!2026')).toBe(false);
    });
  });

  describe('shifrlash', () => {
    it('shifrlaydi va qayta ochadi', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const encrypted = service.encrypt(secret);

      expect(encrypted).not.toContain(secret);
      expect(encrypted.split(':')).toHaveLength(3);
      expect(service.decrypt(encrypted)).toBe(secret);
    });

    it('har safar boshqa shifrmatn beradi (IV tasodifiy)', () => {
      const first = service.encrypt('bir xil matn');
      const second = service.encrypt('bir xil matn');
      expect(first).not.toBe(second);
      expect(service.decrypt(first)).toBe(service.decrypt(second));
    });

    it("o'zgartirilgan shifrmatnni rad etadi (GCM autentifikatsiyasi)", () => {
      const encrypted = service.encrypt('maxfiy');
      const parts = encrypted.split(':');
      // Shifrmatnning oxirgi baytini buzamiz
      const corrupted = Buffer.from(parts[2] as string, 'base64');
      corrupted[0] = (corrupted[0] ?? 0) ^ 0xff;
      const tampered = `${parts[0]}:${parts[1]}:${corrupted.toString('base64')}`;

      expect(() => service.decrypt(tampered)).toThrow();
    });

    it("noto'g'ri formatni aniq xatolik bilan rad etadi", () => {
      expect(() => service.decrypt('formatsiz')).toThrow(/format/i);
    });
  });

  describe('tokenlar va kodlar', () => {
    it('token har safar noyob', () => {
      const tokens = new Set(Array.from({ length: 100 }, () => service.generateToken()));
      expect(tokens.size).toBe(100);
    });

    it('OTP 6 xonali raqam', () => {
      for (let i = 0; i < 50; i += 1) {
        expect(service.generateOtp()).toMatch(/^\d{6}$/);
      }
    });

    it('seriya raqami chalkashadigan belgilarsiz (0, O, 1, I)', () => {
      for (let i = 0; i < 30; i += 1) {
        const serial = service.generateSerialNumber('QDU', 2026);
        expect(serial).toMatch(/^QDU-2026-[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/);
      }
    });

    it('token xeshi deterministik', () => {
      expect(service.hashToken('abc')).toBe(service.hashToken('abc'));
      expect(service.hashToken('abc')).not.toBe(service.hashToken('abd'));
    });
  });

  describe('safeCompare', () => {
    it('bir xil qatorlarni tasdiqlaydi', () => {
      expect(service.safeCompare('token', 'token')).toBe(true);
    });

    it('turli uzunlikdagi qatorlarni rad etadi', () => {
      expect(service.safeCompare('token', 'token-uzun')).toBe(false);
    });

    it('bir xil uzunlikdagi turli qatorlarni rad etadi', () => {
      expect(service.safeCompare('token', 'nekot')).toBe(false);
    });
  });

  describe('deterministicSeed', () => {
    it("bir xil kirish uchun bir xil urug' beradi", () => {
      expect(service.deterministicSeed('a', 'b')).toBe(service.deterministicSeed('a', 'b'));
    });

    it("PostgreSQL INT4 chegarasiga sig'adi", () => {
      // Bu chegara buzilganda urinish yaratib bo'lmaydi (real xatolik bo'lgan)
      for (let i = 0; i < 200; i += 1) {
        const seed = service.deterministicSeed('quiz', String(i), 'attempt');
        expect(seed).toBeGreaterThanOrEqual(0);
        expect(seed).toBeLessThanOrEqual(2_147_483_647);
      }
    });
  });
});
