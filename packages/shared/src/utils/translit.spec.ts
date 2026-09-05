/**
 * Maqsad: transliteratsiya va qidiruv normalizatsiyasi testlari (F-18, ADR-015).
 */

import { describe, expect, it } from 'vitest';
import {
  buildSearchText,
  cyrillicToLatin,
  isCyrillic,
  latinToCyrillic,
  normalizeForSearch,
} from './translit';

describe('latinToCyrillic', () => {
  it("asosiy so'zlarni o'giradi", () => {
    expect(latinToCyrillic('matematika')).toBe('математика');
    expect(latinToCyrillic('kimyo')).toBe('кимё');
  });

  it("ko'p harfli birikmalarni to'g'ri ishlaydi", () => {
    expect(latinToCyrillic('shahar')).toBe('шаҳар');
    expect(latinToCyrillic('chiroq')).toBe('чироқ');
    expect(latinToCyrillic("o'zbek")).toBe('ўзбек');
    expect(latinToCyrillic("g'alaba")).toBe('ғалаба');
  });

  it('bosh harfni saqlaydi', () => {
    expect(latinToCyrillic('Toshkent')).toBe('Тошкент');
    expect(latinToCyrillic('Shahar')).toBe('Шаҳар');
  });

  it("to'liq katta harfli qisqartmani saqlaydi", () => {
    expect(latinToCyrillic('QDU')).toBe('ҚДУ');
  });

  it('raqam va tinish belgilariga tegmaydi', () => {
    expect(latinToCyrillic('2026-yil')).toBe('2026-йил');
  });

  it("so'z boshidagi `e` ni `э` ga, ichidagisini `е` ga o'giradi", () => {
    // O'zbek imlosi qoidasi
    expect(latinToCyrillic('etilmagan')).toBe('этилмаган');
    expect(latinToCyrillic('kelmoq')).toBe('келмоқ');
    expect(latinToCyrillic('nashr etilmagan')).toBe('нашр этилмаган');
    expect(latinToCyrillic('Eslatma')).toBe('Эслатма');
  });

  it('apostrofni katta harf deb hisoblamaydi', () => {
    // "E'lon" -> "ЭЪлон" bo'lib qolmasligi kerak
    expect(latinToCyrillic("E'lonlar")).toBe('Эълонлар');
    expect(latinToCyrillic("ma'lumot")).toBe('маълумот');
  });
});

describe('cyrillicToLatin', () => {
  it("asosiy so'zlarni o'giradi", () => {
    expect(cyrillicToLatin('математика')).toBe('matematika');
    expect(cyrillicToLatin('Тошкент')).toBe('Toshkent');
  });

  it("maxsus harflarni o'giradi", () => {
    expect(cyrillicToLatin('ўзбек')).toBe("o'zbek");
    expect(cyrillicToLatin('ғалаба')).toBe("g'alaba");
    expect(cyrillicToLatin('чироқ')).toBe('chiroq');
  });
});

describe('isCyrillic', () => {
  it("yozuvni to'g'ri aniqlaydi", () => {
    expect(isCyrillic('математика')).toBe(true);
    expect(isCyrillic('matematika')).toBe(false);
    expect(isCyrillic('2026')).toBe(false);
  });
});

describe('normalizeForSearch', () => {
  it('kirill va lotin variantlarini bir xil kalitga keltiradi', () => {
    expect(normalizeForSearch('Математика')).toBe(normalizeForSearch('Matematika'));
  });

  it('apostroflarni olib tashlaydi', () => {
    expect(normalizeForSearch("O'zbek tili")).toBe('ozbek tili');
    expect(normalizeForSearch('Ўзбек тили')).toBe('ozbek tili');
  });

  it("ortiqcha bo'shliqlarni tozalaydi", () => {
    expect(normalizeForSearch('  Oliy    matematika  ')).toBe('oliy matematika');
  });
});

describe('buildSearchText', () => {
  it('bir nechta manbani takrorlanmas tokenlarga birlashtiradi', () => {
    const result = buildSearchText('Oliy matematika', 'Олий математика', 'Higher mathematics');
    expect(result).toContain('oliy');
    expect(result).toContain('matematika');
    expect(result).toContain('higher');
    // "oliy" ikki manbadan kelgan, ammo bir marta kiritiladi
    expect(result.split(' ').filter((t) => t === 'oliy')).toHaveLength(1);
  });

  it("bo'sh qiymatlarni e'tiborsiz qoldiradi", () => {
    expect(buildSearchText(null, undefined, '')).toBe('');
  });
});
