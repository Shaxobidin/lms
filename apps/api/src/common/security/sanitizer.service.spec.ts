/**
 * Maqsad: XSS himoyasining testlari (§11, NF-04 — OWASP Top 10).
 *
 * Bu testlar hujum vektorlarini aniq tekshiradi: agar sanitizator
 * buzilsa, o'qituvchi kiritgan kontent orqali talabalar hujumga uchraydi.
 */

import { SanitizerService } from './sanitizer.service';

describe('SanitizerService', () => {
  const service = new SanitizerService();

  describe('XSS vektorlari', () => {
    const attacks: Array<[string, string]> = [
      ['script tegi', '<script>alert(1)</script><p>matn</p>'],
      ['img onerror', '<img src=x onerror="alert(1)">'],
      ['javascript: havola', '<a href="javascript:alert(1)">bosing</a>'],
      ['iframe', '<iframe src="https://evil.example"></iframe>'],
      ['svg onload', '<svg onload="alert(1)"></svg>'],
      ['inline style', '<div style="background:url(javascript:alert(1))">matn</div>'],
      ['form', '<form action="https://evil.example"><input name="password"></form>'],
      ['onclick', '<button onclick="steal()">bosing</button>'],
    ];

    it.each(attacks)('%s zararsizlantiriladi', (_label, payload) => {
      const clean = service.sanitizeHtml(payload);

      expect(clean).not.toMatch(/<script/i);
      expect(clean).not.toMatch(/onerror=/i);
      expect(clean).not.toMatch(/onload=/i);
      expect(clean).not.toMatch(/onclick=/i);
      expect(clean).not.toMatch(/javascript:/i);
      expect(clean).not.toMatch(/<iframe/i);
      expect(clean).not.toMatch(/<form/i);
    });
  });

  describe('ruxsat etilgan kontent', () => {
    it('dars kontentidagi formatlashni saqlaydi', () => {
      const html =
        '<h2>Mavzu</h2><p>Matn <strong>qalin</strong> va <em>kursiv</em></p><ul><li>Band</li></ul>';
      const clean = service.sanitizeHtml(html);

      expect(clean).toContain('<h2>');
      expect(clean).toContain('<strong>');
      expect(clean).toContain('<em>');
      expect(clean).toContain('<li>');
    });

    it('xavfsiz havolalarni saqlaydi', () => {
      const clean = service.sanitizeHtml('<a href="https://qdu.uz">Sayt</a>');
      expect(clean).toContain('href="https://qdu.uz"');
    });

    it('jadvallarni saqlaydi', () => {
      const clean = service.sanitizeHtml('<table><tr><td>1</td></tr></table>');
      expect(clean).toContain('<td>');
    });
  });

  describe('stripHtml', () => {
    it('faqat matnni qaytaradi', () => {
      expect(service.stripHtml('<p>Salom <b>dunyo</b></p>')).toBe('Salom dunyo');
    });

    it("bo'sh qiymatlarda bo'sh satr qaytaradi", () => {
      expect(service.stripHtml(null)).toBe('');
      expect(service.stripHtml(undefined)).toBe('');
    });
  });

  describe('sanitizeLocalized', () => {
    it('har bir tilni alohida tozalaydi', () => {
      const result = service.sanitizeLocalized({
        'uz-Latn': '<p>Salom</p><script>alert(1)</script>',
        ru: '<p>Привет</p>',
      });

      expect(result['uz-Latn']).not.toContain('<script');
      expect(result['uz-Latn']).toContain('<p>');
      expect(result['ru']).toContain('Привет');
    });

    it("bo'sh qiymatlarni tashlab ketadi", () => {
      const result = service.sanitizeLocalized({ 'uz-Latn': 'matn', ru: '   ' });
      expect(Object.keys(result)).toEqual(['uz-Latn']);
    });
  });

  describe("escapeSpreadsheetValue — formula in'yeksiyasi (§11)", () => {
    it.each(['=1+1', '+1', '-1', '@SUM(A1)'])('%s formulasini zararsizlantiradi', (value) => {
      expect(service.escapeSpreadsheetValue(value)).toBe(`'${value}`);
    });

    it('oddiy matnga tegmaydi', () => {
      expect(service.escapeSpreadsheetValue('Karimov Aziz')).toBe('Karimov Aziz');
    });
  });
});
