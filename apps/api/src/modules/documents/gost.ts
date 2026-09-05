/**
 * Maqsad: GOST 7.32 va O'zDSt talablariga muvofiq DOCX rasmiylashtirish
 * konstantalari va yordamchilari (promt.md §12, F-14).
 *
 * Talablar:
 *  - shrift: Times New Roman, 14 pt (jadval ichida 12 pt gacha ruxsat);
 *  - qatorlar oralig'i: 1.5;
 *  - maydonlar: chap 30 mm, o'ng 10 mm, yuqori 20 mm, past 20 mm;
 *  - sahifa raqamlari: pastda, markazda, arab raqamlarida;
 *  - sarlavhalar iyerarxiyasi: 1., 1.1., 1.1.1.
 *
 * `docx` kutubxonasi o'lchamlarni "twip" (1/20 pt) va "half-point" larda
 * kutadi, shuning uchun barcha o'girishlar shu faylda markazlashtirilgan.
 */

import {
  AlignmentType,
  Footer,
  HeadingLevel,
  LineRuleType,
  PageNumber,
  Paragraph,
  TabStopPosition,
  TabStopType,
  TextRun,
  type IParagraphOptions,
  type ISectionPropertiesOptions,
} from 'docx';

/** `docx` da `AlignmentType` — obyekt konstanta, shuning uchun tur alohida olinadi. */
export type AlignValue = (typeof AlignmentType)[keyof typeof AlignmentType];

/** 1 mm = 56.7 twip (1440 twip = 1 dyuym = 25.4 mm). */
export const MM_TO_TWIP = 56.7;

export const GOST_FONT = 'Times New Roman';

/** `docx` shrift o'lchamini yarim-punktlarda kutadi: 14 pt = 28. */
export const GOST_FONT_SIZE = 28;
export const GOST_TABLE_FONT_SIZE = 24; // 12 pt

/** 1.5 interval: 240 twip = bitta qator, 1.5 × 240 = 360. */
export const GOST_LINE_SPACING = 360;

/** Xatboshi chekinishi: 1.25 sm = 12.5 mm. */
export const GOST_FIRST_LINE_INDENT = Math.round(12.5 * MM_TO_TWIP);

export const GOST_MARGINS = {
  top: Math.round(20 * MM_TO_TWIP),
  right: Math.round(10 * MM_TO_TWIP),
  bottom: Math.round(20 * MM_TO_TWIP),
  left: Math.round(30 * MM_TO_TWIP),
};

/** Standart hujjat bo'limi sozlamalari (A4, kitob orientatsiyasi). */
export function gostSection(landscape = false): ISectionPropertiesOptions {
  return {
    page: {
      margin: landscape
        ? { ...GOST_MARGINS, left: GOST_MARGINS.top, right: GOST_MARGINS.bottom }
        : GOST_MARGINS,
      size: landscape ? { orientation: 'landscape' } : { orientation: 'portrait' },
    },
  };
}

/** Sahifa raqami — pastda markazda (GOST 7.32 §6.1). */
export function gostFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            children: [PageNumber.CURRENT],
            font: GOST_FONT,
            size: GOST_FONT_SIZE,
          }),
        ],
      }),
    ],
  });
}

/** Oddiy matn xatboshisi. */
export function gostParagraph(
  text: string,
  options: Partial<IParagraphOptions> & {
    bold?: boolean;
    indent?: boolean;
    align?: AlignValue;
  } = {},
): Paragraph {
  const { bold, indent = true, align = AlignmentType.JUSTIFIED, ...rest } = options;

  return new Paragraph({
    alignment: align,
    spacing: { line: GOST_LINE_SPACING, lineRule: LineRuleType.AUTO },
    ...(indent ? { indent: { firstLine: GOST_FIRST_LINE_INDENT } } : {}),
    children: [new TextRun({ text, font: GOST_FONT, size: GOST_FONT_SIZE, bold: bold ?? false })],
    ...rest,
  });
}

/** Hujjat sarlavhasi — markazda, katta harflarda, qalin. */
export function gostTitle(text: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { line: GOST_LINE_SPACING, lineRule: LineRuleType.AUTO, after: 240 },
    children: [
      new TextRun({
        text: text.toUpperCase(),
        font: GOST_FONT,
        size: GOST_FONT_SIZE,
        bold: true,
      }),
    ],
  });
}

/** Bo'lim sarlavhasi (1., 1.1., ...). */
export function gostHeading(text: string, level: 1 | 2 | 3 = 1): Paragraph {
  const headingLevels = {
    1: HeadingLevel.HEADING_1,
    2: HeadingLevel.HEADING_2,
    3: HeadingLevel.HEADING_3,
  } as const;

  return new Paragraph({
    heading: headingLevels[level],
    alignment: AlignmentType.LEFT,
    spacing: { line: GOST_LINE_SPACING, lineRule: LineRuleType.AUTO, before: 240, after: 120 },
    children: [new TextRun({ text, font: GOST_FONT, size: GOST_FONT_SIZE, bold: true })],
  });
}

/**
 * Imzo satri: chapda lavozim, o'ngda F.I.Sh, o'rtada imzo uchun joy.
 * Rasmiy hujjatlarda majburiy element.
 */
export function gostSignatureLine(position: string, fullName: string): Paragraph {
  return new Paragraph({
    spacing: { line: GOST_LINE_SPACING, lineRule: LineRuleType.AUTO, before: 360 },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: position, font: GOST_FONT, size: GOST_FONT_SIZE }),
      new TextRun({ text: '\t', font: GOST_FONT, size: GOST_FONT_SIZE }),
      new TextRun({ text: `_________________ ${fullName}`, font: GOST_FONT, size: GOST_FONT_SIZE }),
    ],
  });
}

/** Jadval katakchasi uchun matn (12 pt, intervalsiz). */
export function gostCellText(
  text: string,
  options: { bold?: boolean; align?: AlignValue } = {},
): Paragraph {
  return new Paragraph({
    alignment: options.align ?? AlignmentType.LEFT,
    spacing: { line: 240, lineRule: LineRuleType.AUTO },
    children: [
      new TextRun({
        text,
        font: GOST_FONT,
        size: GOST_TABLE_FONT_SIZE,
        bold: options.bold ?? false,
      }),
    ],
  });
}

/** Bo'sh qator (bo'limlar orasida). */
export function gostSpacer(): Paragraph {
  return new Paragraph({
    spacing: { line: GOST_LINE_SPACING, lineRule: LineRuleType.AUTO },
    children: [new TextRun({ text: '', font: GOST_FONT, size: GOST_FONT_SIZE })],
  });
}

/**
 * Jadval sarlavhasi: "1-jadval — Sarlavha matni" (GOST 7.32 §6.6).
 * Jadval ustida, chapdan, chekinishsiz joylashtiriladi.
 */
export function gostTableCaption(number: number, title: string): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: GOST_LINE_SPACING, lineRule: LineRuleType.AUTO, before: 240, after: 120 },
    children: [
      new TextRun({
        text: `${number}-jadval — ${title}`,
        font: GOST_FONT,
        size: GOST_FONT_SIZE,
      }),
    ],
  });
}
