/**
 * Maqsad: matnli savol formatlarini (AIKEN, GIFT, CSV) ichki savol modeliga
 * o'girish (F-07, §12 "QTI 3.0 / CSV import").
 *
 * Tahlilchilar SOF funksiyalar: fayl o'qish, sanitizatsiya va bazaga yozish
 * backend'da. Har bir muammo yutilmaydi — `issues` ro'yxatida qator raqami va
 * i18n kaliti bilan qaytariladi (§16), o'qituvchi faylni tuzatib qayta yuklaydi.
 *
 * QTI (XML) tahlilchisi backend'da — u XML kutubxonasiga bog'liq.
 */

import type { Locale } from '../constants/locales';
import type { LocalizedText } from '../types/localized';
import type { QuestionPayload } from '../schemas/quiz';

export interface ImportedQuestion {
  text: LocalizedText;
  payload: QuestionPayload;
  defaultScore: number;
  tags: string[];
  explanation?: LocalizedText;
  /**
   * HOTSPOT (QTI) — rasm paketdagi fayl; backend uni yuklab `imageFileId` ni
   * to'ldiradi va `areas` ni pikseldan foizga o'giradi (`width`/`height` bo'lmasa
   * rasm sarlavhasidan o'qiydi).
   */
  imageRef?: { path: string; width: number | null; height: number | null };
}

/** HOTSPOT importida rasm yuklanguncha turadigan vaqtinchalik identifikator. */
export const PLACEHOLDER_IMAGE_FILE_ID = '00000000-0000-0000-0000-000000000000';

export interface ImportIssue {
  /** Fayldagi qator (1 dan boshlab) — foydalanuvchi shu joyni tuzatadi. */
  line: number;
  /** i18n kaliti (`import.*`). */
  reason: string;
  /** Qo'shimcha kontekst (masalan, noma'lum tur nomi). */
  detail?: string;
}

export interface ImportParseResult {
  questions: ImportedQuestion[];
  issues: ImportIssue[];
}

/** Bitta importda qabul qilinadigan maksimal savollar soni. */
export const MAX_IMPORT_QUESTIONS = 500;

const optionId = (index: number) => `o${index + 1}`;

function localized(locale: Locale, value: string): LocalizedText {
  return { [locale]: value.trim() } as LocalizedText;
}

function normalizeNewlines(text: string): string {
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

// =============================================================================
// AIKEN
// =============================================================================

/**
 * AIKEN — eng sodda format (Moodle bilan mos):
 *
 *   Savol matni
 *   A. Variant
 *   B. Variant
 *   ANSWER: B
 *
 * Bir nechta to'g'ri javob (`ANSWER: A,C`) — MULTI turiga o'giriladi.
 */
export function parseAiken(source: string, locale: Locale): ImportParseResult {
  const lines = normalizeNewlines(source).split('\n');
  const questions: ImportedQuestion[] = [];
  const issues: ImportIssue[] = [];

  let textLines: string[] = [];
  let options: Array<{ letter: string; text: string }> = [];
  let startLine = 0;

  const reset = () => {
    textLines = [];
    options = [];
    startLine = 0;
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();
    const lineNo = index + 1;
    if (!line) return;

    const optionMatch = /^([A-Z])[.)]\s+(.+)$/.exec(line);
    const answerMatch = /^ANSWER:\s*([A-Z](?:\s*,\s*[A-Z])*)\s*$/i.exec(line);

    if (answerMatch) {
      const letters = (answerMatch[1] ?? '')
        .toUpperCase()
        .split(',')
        .map((item) => item.trim());
      const text = textLines.join(' ').trim();

      if (!text) {
        issues.push({ line: lineNo, reason: 'import.missing_question_text' });
      } else if (options.length < 2) {
        issues.push({ line: lineNo, reason: 'import.too_few_options' });
      } else if (letters.some((letter) => !options.some((option) => option.letter === letter))) {
        issues.push({
          line: lineNo,
          reason: 'import.answer_not_in_options',
          detail: letters.join(','),
        });
      } else {
        const payloadOptions = options.map((option, optionIndex) => ({
          id: optionId(optionIndex),
          text: localized(locale, option.text),
          isCorrect: letters.includes(option.letter),
          weight: letters.includes(option.letter) ? 1 / letters.length : 0,
        }));
        questions.push({
          text: localized(locale, text),
          payload:
            letters.length > 1
              ? { type: 'MULTI', options: payloadOptions, penalizeWrong: true }
              : { type: 'SINGLE', options: payloadOptions },
          defaultScore: 1,
          tags: [],
        });
      }
      reset();
      return;
    }

    if (optionMatch && textLines.length > 0) {
      options.push({ letter: optionMatch[1] ?? '', text: optionMatch[2] ?? '' });
      return;
    }

    if (options.length > 0) {
      // Variantlardan keyin ANSWER kelmadi — oldingi savol tugallanmagan
      issues.push({ line: startLine || lineNo, reason: 'import.missing_answer' });
      reset();
    }
    if (textLines.length === 0) startLine = lineNo;
    textLines.push(line);
  });

  if (textLines.length > 0) {
    issues.push({ line: startLine, reason: 'import.missing_answer' });
  }

  return { questions, issues };
}

// =============================================================================
// GIFT
// =============================================================================

/**
 * GIFT (Moodle) qo'llab-quvvatlanadigan qism:
 *  - `::sarlavha:: matn { =to'g'ri ~noto'g'ri }`  → SINGLE / MULTI (`~%50%` og'irliklar bilan)
 *  - `{T}` / `{F}` / `{TRUE}` / `{FALSE}`            → SINGLE (To'g'ri / Noto'g'ri)
 *  - `{ =javob =javob2 }` (faqat `=`)                → CLOZE (qisqa javob)
 *  - `{#5:0.5}` yoki `{#4..6}`                       → NUMERIC
 *  - `{}`                                            → ESSAY
 *  - `{ =a -> 1 =b -> 2 }`                           → MATCHING
 *  - `#` izoh variant ortida, `####` umumiy izoh (explanation), `//` komment qatorlari.
 */
export function parseGift(source: string, locale: Locale): ImportParseResult {
  const questions: ImportedQuestion[] = [];
  const issues: ImportIssue[] = [];

  // Bloklar bo'sh qator bilan ajratiladi; komment qatorlari olib tashlanadi
  const text = normalizeNewlines(source);
  const lines = text.split('\n');
  const blocks: Array<{ line: number; body: string }> = [];
  let current: string[] = [];
  let currentStart = 0;

  lines.forEach((rawLine, index) => {
    if (rawLine.trim().startsWith('//')) return;
    if (!rawLine.trim()) {
      if (current.length) blocks.push({ line: currentStart, body: current.join('\n') });
      current = [];
      return;
    }
    if (!current.length) currentStart = index + 1;
    current.push(rawLine);
  });
  if (current.length) blocks.push({ line: currentStart, body: current.join('\n') });

  for (const block of blocks) {
    const parsed = parseGiftBlock(block.body, locale);
    if ('reason' in parsed) {
      issues.push({ line: block.line, reason: parsed.reason, detail: parsed.detail });
    } else {
      questions.push(parsed);
    }
  }

  return { questions, issues };
}

const GIFT_ESCAPES: Record<string, string> = {
  '\\{': '\uE001',
  '\\}': '\uE002',
  '\\=': '\uE003',
  '\\~': '\uE004',
  '\\#': '\uE005',
  '\\:': '\uE006',
};

function giftEscape(value: string): string {
  return value.replace(/\\[{}=~#:]/g, (match) => GIFT_ESCAPES[match] ?? match);
}

function giftUnescape(value: string): string {
  return value
    .replace(/\uE001/g, '{')
    .replace(/\uE002/g, '}')
    .replace(/\uE003/g, '=')
    .replace(/\uE004/g, '~')
    .replace(/\uE005/g, '#')
    .replace(/\uE006/g, ':')
    .trim();
}

function parseGiftBlock(
  rawBlock: string,
  locale: Locale,
): ImportedQuestion | { reason: string; detail?: string } {
  let block = giftEscape(rawBlock.trim());
  const tags: string[] = [];

  // `::sarlavha::` — teg sifatida saqlanadi
  const titleMatch = /^::(.*?)::/s.exec(block);
  if (titleMatch) {
    const title = giftUnescape(titleMatch[1] ?? '').slice(0, 48);
    if (title) tags.push(title);
    block = block.slice(titleMatch[0].length);
  }
  // `[html]`, `[markdown]` format belgilari — matn shunday qoladi
  block = block.replace(/^\s*\[(html|markdown|plain|moodle)\]/i, '');

  const braceStart = block.indexOf('{');
  const braceEnd = block.lastIndexOf('}');
  if (braceStart === -1 || braceEnd === -1 || braceEnd < braceStart) {
    return { reason: 'import.gift_braces_missing' };
  }

  const before = giftUnescape(block.slice(0, braceStart));
  const after = giftUnescape(block.slice(braceEnd + 1));
  const inner = block.slice(braceStart + 1, braceEnd);

  // `####` umumiy izoh
  let answerPart = inner;
  let explanation: string | undefined;
  const generalIndex = inner.indexOf('####');
  if (generalIndex !== -1) {
    explanation = giftUnescape(inner.slice(generalIndex + 4));
    answerPart = inner.slice(0, generalIndex);
  }
  answerPart = answerPart.trim();

  const questionText = [before, after].filter(Boolean).join(' ').trim();
  if (!questionText) return { reason: 'import.missing_question_text' };
  const explanationText = explanation ? localized(locale, explanation) : undefined;

  const base = { defaultScore: 1, tags, explanation: explanationText };

  // ESSAY
  if (!answerPart) {
    return {
      ...base,
      text: localized(locale, questionText),
      payload: { type: 'ESSAY', minWords: 0, maxWords: 0, allowAttachments: false },
    };
  }

  // TRUE / FALSE
  const tf = /^(T|F|TRUE|FALSE)\s*(#.*)?$/is.exec(answerPart);
  if (tf) {
    const isTrue = (tf[1] ?? '').toUpperCase().startsWith('T');
    return {
      ...base,
      text: localized(locale, questionText),
      payload: {
        type: 'SINGLE',
        options: [
          { id: 'o1', text: localized(locale, 'True'), isCorrect: isTrue, weight: isTrue ? 1 : 0 },
          {
            id: 'o2',
            text: localized(locale, 'False'),
            isCorrect: !isTrue,
            weight: isTrue ? 0 : 1,
          },
        ],
      },
    };
  }

  // NUMERIC: `#5:0.5` yoki `#4..6`
  if (answerPart.startsWith('#')) {
    const numeric = answerPart.slice(1).trim().split(/\s+/)[0] ?? '';
    const range = /^(-?[\d.]+)\.\.(-?[\d.]+)$/.exec(numeric);
    const withTolerance = /^(-?[\d.]+)(?::([\d.]+))?$/.exec(numeric);
    let correctValue: number;
    let tolerance: number;
    if (range) {
      const low = Number(range[1] ?? '');
      const high = Number(range[2] ?? '');
      correctValue = (low + high) / 2;
      tolerance = Math.abs(high - low) / 2;
    } else if (withTolerance) {
      correctValue = Number(withTolerance[1] ?? '');
      tolerance = Number(withTolerance[2] ?? 0);
    } else {
      return { reason: 'import.numeric_invalid', detail: numeric };
    }
    if (!Number.isFinite(correctValue) || !Number.isFinite(tolerance)) {
      return { reason: 'import.numeric_invalid', detail: numeric };
    }
    return {
      ...base,
      text: localized(locale, questionText),
      payload: { type: 'NUMERIC', correctValue, tolerance },
    };
  }

  // Variantlar: `=` yoki `~` bilan boshlanadi
  const tokens = answerPart
    .split(/(?=[=~])/)
    .map((token) => token.trim())
    .filter(Boolean);
  if (tokens.some((token) => !/^[=~]/.test(token))) {
    return { reason: 'import.gift_answer_invalid', detail: answerPart.slice(0, 40) };
  }

  const parsedTokens = tokens.map((token) => {
    const correct = token.startsWith('=');
    let body = token.slice(1).trim();
    let weight: number | null = null;
    const weightMatch = /^%(-?\d+(?:\.\d+)?)%/.exec(body);
    if (weightMatch) {
      weight = Number(weightMatch[1] ?? '0') / 100;
      body = body.slice(weightMatch[0].length).trim();
    }
    let feedback: string | undefined;
    const feedbackIndex = body.indexOf('#');
    if (feedbackIndex !== -1) {
      feedback = giftUnescape(body.slice(feedbackIndex + 1));
      body = body.slice(0, feedbackIndex);
    }
    return { correct, weight, text: giftUnescape(body), feedback };
  });

  // MATCHING: `=a -> 1`
  if (parsedTokens.every((token) => token.correct && token.text.includes('->'))) {
    if (parsedTokens.length < 2) return { reason: 'import.too_few_options' };
    const left = parsedTokens.map((token, index) => ({
      id: `l${index + 1}`,
      text: localized(locale, token.text.split('->')[0] ?? ''),
    }));
    const right = parsedTokens.map((token, index) => ({
      id: `r${index + 1}`,
      text: localized(locale, token.text.split('->').slice(1).join('->')),
    }));
    return {
      ...base,
      text: localized(locale, questionText),
      payload: {
        type: 'MATCHING',
        left,
        right,
        pairs: left.map((item, index) => ({ leftId: item.id, rightId: right[index]?.id ?? '' })),
      },
    };
  }

  // Qisqa javob (CLOZE): faqat `=` lar, `~` yo'q
  if (parsedTokens.every((token) => token.correct)) {
    return {
      ...base,
      text: localized(locale, questionText),
      payload: {
        type: 'CLOZE',
        template: localized(locale, `${questionText} [[1]]`),
        blanks: [
          {
            key: '1',
            accepted: parsedTokens
              .map((token) => token.text)
              .filter(Boolean)
              .slice(0, 10),
            caseSensitive: false,
            points: 1,
          },
        ],
      },
    };
  }

  if (parsedTokens.length < 2) return { reason: 'import.too_few_options' };

  const correctCount = parsedTokens.filter(
    (token) => token.correct || (token.weight ?? 0) > 0,
  ).length;
  if (correctCount === 0) return { reason: 'import.no_correct_option' };

  const isMulti = correctCount > 1 || parsedTokens.some((token) => token.weight !== null);
  const options = parsedTokens.map((token, index) => {
    const isCorrect = token.correct || (token.weight ?? 0) > 0;
    const weight =
      token.weight !== null
        ? Math.max(-1, Math.min(1, token.weight))
        : isCorrect
          ? 1 / correctCount
          : 0;
    return {
      id: optionId(index),
      text: localized(locale, token.text),
      isCorrect,
      weight: isMulti ? weight : isCorrect ? 1 : 0,
      ...(token.feedback ? { feedback: localized(locale, token.feedback) } : {}),
    };
  });

  return {
    ...base,
    text: localized(locale, questionText),
    payload: isMulti
      ? { type: 'MULTI', options, penalizeWrong: true }
      : { type: 'SINGLE', options },
  };
}

// =============================================================================
// CSV
// =============================================================================

/**
 * CSV formati (sarlavha qatori majburiy, ustunlar tartibi erkin):
 *
 *   type,text,options,correct,score,tags,explanation
 *
 *  - `type`: SINGLE | MULTI | CLOZE | NUMERIC | ESSAY
 *  - `options`: `|` bilan ajratilgan variantlar (SINGLE/MULTI)
 *  - `correct`: SINGLE/MULTI — 1 dan boshlanadigan variant raqamlari (`1|3`);
 *               CLOZE — qabul qilinadigan javoblar (`Toshkent|Tashkent`);
 *               NUMERIC — `qiymat` yoki `qiymat:xatolik`
 *  - `tags`: `|` bilan ajratilgan
 *
 * Ajratuvchi avtomatik aniqlanadi (`,` yoki `;`), qo'shtirnoqli maydonlar qo'llanadi.
 */
export function parseCsv(source: string, locale: Locale): ImportParseResult {
  const text = normalizeNewlines(source);
  const rows = parseCsvRows(text);
  const questions: ImportedQuestion[] = [];
  const issues: ImportIssue[] = [];

  if (rows.length === 0)
    return { questions, issues: [{ line: 1, reason: 'import.csv_header_missing' }] };

  const header = (rows[0]?.cells ?? []).map((cell) => cell.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  if (col('type') === -1 || col('text') === -1) {
    return { questions, issues: [{ line: 1, reason: 'import.csv_header_missing' }] };
  }

  for (const row of rows.slice(1)) {
    if (row.cells.every((cell) => !cell.trim())) continue;
    const cell = (name: string) => (col(name) === -1 ? '' : (row.cells[col(name)] ?? '').trim());

    const type = cell('type').toUpperCase();
    const questionText = cell('text');
    const options = cell('options')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    const correct = cell('correct')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean);
    const score = Number(cell('score') || 1);
    const tags = cell('tags')
      .split('|')
      .map((item) => item.trim())
      .filter(Boolean)
      .slice(0, 20);
    const explanation = cell('explanation');

    if (!questionText) {
      issues.push({ line: row.line, reason: 'import.missing_question_text' });
      continue;
    }
    if (!Number.isFinite(score) || score <= 0) {
      issues.push({ line: row.line, reason: 'import.score_invalid', detail: cell('score') });
      continue;
    }

    const base = {
      text: localized(locale, questionText),
      defaultScore: score,
      tags,
      ...(explanation ? { explanation: localized(locale, explanation) } : {}),
    };

    let payload: QuestionPayload | null = null;

    if (type === 'SINGLE' || type === 'MULTI') {
      if (options.length < 2) {
        issues.push({ line: row.line, reason: 'import.too_few_options' });
        continue;
      }
      const indexes = correct.map((value) => Number(value));
      if (
        indexes.length === 0 ||
        indexes.some((value) => !Number.isInteger(value) || value < 1 || value > options.length)
      ) {
        issues.push({
          line: row.line,
          reason: 'import.answer_not_in_options',
          detail: cell('correct'),
        });
        continue;
      }
      const payloadOptions = options.map((option, index) => ({
        id: optionId(index),
        text: localized(locale, option),
        isCorrect: indexes.includes(index + 1),
        weight: indexes.includes(index + 1) ? 1 / indexes.length : 0,
      }));
      payload =
        type === 'MULTI'
          ? { type: 'MULTI', options: payloadOptions, penalizeWrong: true }
          : { type: 'SINGLE', options: payloadOptions };
    } else if (type === 'CLOZE') {
      if (correct.length === 0) {
        issues.push({ line: row.line, reason: 'import.missing_answer' });
        continue;
      }
      const template = questionText.includes('[[1]]') ? questionText : `${questionText} [[1]]`;
      payload = {
        type: 'CLOZE',
        template: localized(locale, template),
        blanks: [{ key: '1', accepted: correct.slice(0, 10), caseSensitive: false, points: score }],
      };
    } else if (type === 'NUMERIC') {
      const [valueRaw, toleranceRaw] = (correct[0] ?? '').split(':');
      const correctValue = Number(valueRaw);
      const tolerance = Number(toleranceRaw ?? 0);
      if (!valueRaw || !Number.isFinite(correctValue) || !Number.isFinite(tolerance)) {
        issues.push({ line: row.line, reason: 'import.numeric_invalid', detail: cell('correct') });
        continue;
      }
      payload = { type: 'NUMERIC', correctValue, tolerance };
    } else if (type === 'ESSAY') {
      payload = { type: 'ESSAY', minWords: 0, maxWords: 0, allowAttachments: false };
    } else {
      issues.push({ line: row.line, reason: 'import.unsupported_type', detail: type });
      continue;
    }

    questions.push({ ...base, payload });
  }

  return { questions, issues };
}

/** RFC 4180 ga yaqin CSV o'quvchi: qo'shtirnoq, ichki `""`, ko'p qatorli maydonlar. */
function parseCsvRows(text: string): Array<{ line: number; cells: string[] }> {
  const firstLine = text.split('\n')[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: Array<{ line: number; cells: string[] }> = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowStart = 1;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line += 1;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(field);
      field = '';
    } else if (char === '\n') {
      cells.push(field);
      rows.push({ line: rowStart, cells });
      cells = [];
      field = '';
      line += 1;
      rowStart = line;
    } else {
      field += char;
    }
  }
  if (field || cells.length) {
    cells.push(field);
    rows.push({ line: rowStart, cells });
  }
  return rows;
}

/** Formatga qarab tegishli tahlilchini tanlaydi (QTI backend'da alohida). */
export function parseTextQuestions(
  format: 'AIKEN' | 'GIFT' | 'CSV',
  source: string,
  locale: Locale,
): ImportParseResult {
  if (format === 'AIKEN') return parseAiken(source, locale);
  if (format === 'GIFT') return parseGift(source, locale);
  return parseCsv(source, locale);
}
