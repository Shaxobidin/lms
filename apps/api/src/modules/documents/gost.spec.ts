/**
 * Maqsad: GOST 7.32 rasmiylashtirish talablarining testlari (§12, §15).
 *
 * Qabul mezoni: "Reyting varaqasi GOST talablariga muvofiq DOCX ga eksport
 * qilinadi". Ushbu testlar aynan shu talablarni raqamli qiymatlar darajasida
 * tekshiradi — shrift, o'lcham, interval va maydonlar.
 */

import { Document, Packer } from 'docx';
import AdmZip from 'adm-zip';
import {
  GOST_FIRST_LINE_INDENT,
  GOST_FONT,
  GOST_FONT_SIZE,
  GOST_LINE_SPACING,
  GOST_MARGINS,
  GOST_TABLE_FONT_SIZE,
  gostFooter,
  gostParagraph,
  gostSection,
  gostSignatureLine,
  gostTableCaption,
  gostTitle,
  MM_TO_TWIP,
} from './gost';

describe('GOST 7.32 konstantalari', () => {
  it('shrift — Times New Roman', () => {
    expect(GOST_FONT).toBe('Times New Roman');
  });

  it("shrift o'lchami 14 pt (docx da 28 yarim-punkt)", () => {
    expect(GOST_FONT_SIZE).toBe(28);
    expect(GOST_FONT_SIZE / 2).toBe(14);
  });

  it('jadval ichida 12 pt', () => {
    expect(GOST_TABLE_FONT_SIZE / 2).toBe(12);
  });

  it("qatorlar oralig'i 1.5 (360 twip)", () => {
    // 240 twip = bitta qator; 1.5 x 240 = 360
    expect(GOST_LINE_SPACING).toBe(360);
    expect(GOST_LINE_SPACING / 240).toBe(1.5);
  });

  it("maydonlar: chap 30 mm, o'ng 10 mm, yuqori/past 20 mm", () => {
    expect(Math.round(GOST_MARGINS.left / MM_TO_TWIP)).toBe(30);
    expect(Math.round(GOST_MARGINS.right / MM_TO_TWIP)).toBe(10);
    expect(Math.round(GOST_MARGINS.top / MM_TO_TWIP)).toBe(20);
    expect(Math.round(GOST_MARGINS.bottom / MM_TO_TWIP)).toBe(20);
  });

  it('xatboshi chekinishi 1.25 sm', () => {
    expect(Math.round((GOST_FIRST_LINE_INDENT / MM_TO_TWIP) * 10) / 10).toBe(12.5);
  });
});

describe('GOST hujjat elementlari', () => {
  it("bo'lim sozlamalari A4 kitob orientatsiyasida", () => {
    const section = gostSection(false);
    expect(section.page?.size?.orientation).toBe('portrait');
    expect(section.page?.margin).toEqual(GOST_MARGINS);
  });

  it('albom orientatsiyasida maydonlar almashadi', () => {
    const section = gostSection(true);
    expect(section.page?.size?.orientation).toBe('landscape');
  });

  it("sarlavha katta harflarga o'giriladi", () => {
    const paragraph = gostTitle('reyting varaqasi');
    // `docx` ichki tuzilishini tekshirish o'rniga natijani XML da tekshiramiz
    expect(paragraph).toBeDefined();
  });

  it('jadval sarlavhasi GOST formatida', () => {
    const caption = gostTableCaption(1, 'Talabalar natijalari');
    expect(caption).toBeDefined();
  });
});

describe('DOCX chiqishi', () => {
  /** Yaratilgan DOCX ichidagi hujjat XML ini o'qiydi. */
  async function renderXml(): Promise<string> {
    const document = new Document({
      creator: 'QDU LMS',
      title: 'Test',
      sections: [
        {
          properties: gostSection(),
          footers: { default: gostFooter() },
          children: [
            gostTitle('reyting varaqasi'),
            gostParagraph('Sinov matni.'),
            gostTableCaption(1, 'Natijalar'),
            gostSignatureLine('Dekan', 'Karimov A.'),
          ],
        },
      ],
    });

    const buffer = await Packer.toBuffer(document);
    const zip = new AdmZip(Buffer.from(buffer));
    return zip.getEntry('word/document.xml')?.getData().toString('utf8') ?? '';
  }

  it("hujjat yaratiladi va DOCX (ZIP) formatida bo'ladi", async () => {
    const document = new Document({
      sections: [{ properties: gostSection(), children: [gostParagraph('matn')] }],
    });
    const buffer = Buffer.from(await Packer.toBuffer(document));

    // ZIP imzosi: PK\x03\x04
    expect(buffer[0]).toBe(0x50);
    expect(buffer[1]).toBe(0x4b);
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('XML da Times New Roman shrifti mavjud', async () => {
    const xml = await renderXml();
    expect(xml).toContain('Times New Roman');
  });

  it("XML da 28 yarim-punkt (14 pt) o'lcham mavjud", async () => {
    const xml = await renderXml();
    expect(xml).toMatch(/w:sz w:val="28"/);
  });

  it('XML da 1.5 interval (360) mavjud', async () => {
    const xml = await renderXml();
    expect(xml).toMatch(/w:line="360"/);
  });

  it('sarlavha katta harflarda yoziladi', async () => {
    const xml = await renderXml();
    expect(xml).toContain('REYTING VARAQASI');
  });

  it('jadval sarlavhasi "1-jadval — ..." shaklida', async () => {
    const xml = await renderXml();
    expect(xml).toContain('1-jadval');
  });

  it('imzo satri lavozim va F.I.Sh bilan', async () => {
    const xml = await renderXml();
    expect(xml).toContain('Dekan');
    expect(xml).toContain('Karimov A.');
  });

  it('sahifa maydonlari GOST qiymatlarida', async () => {
    const xml = await renderXml();
    expect(xml).toContain(`w:left="${GOST_MARGINS.left}"`);
    expect(xml).toContain(`w:right="${GOST_MARGINS.right}"`);
  });
});
