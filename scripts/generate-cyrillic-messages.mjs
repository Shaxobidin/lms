/**
 * Maqsad: `uz-Cyrl` katalogini `uz-Latn` dan transliteratsiya orqali hosil qilish (F-18, A-16).
 *
 * Nima uchun bu to'g'ri yondashuv: o'zbek kirill va lotin yozuvlari bir tilning
 * ikki alifbosi — ular orasidagi moslik deterministik. Shu sababli tarjimon
 * ishini takrorlash o'rniga translit qilinadi va natija ODDIY JSON fayl
 * sifatida saqlanadi (uni qo'lda tahrirlash mumkin).
 *
 * Himoyalanadigan qismlar:
 *  - ICU o'rinbosarlari: `{name}`, `{count}`;
 *  - texnik atamalar va qisqartmalar (GPA, QR, HTML, ...);
 *  - format namunalari (YYYY-MM-DD, HH:mm).
 *
 * Ishga tushirish: node scripts/generate-cyrillic-messages.mjs
 */

import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { latinToCyrillic } from '../packages/shared/dist/utils/translit.js';

const MESSAGES_DIR = join(process.cwd(), 'apps', 'web', 'messages');

/**
 * Marker belgilari: U+27E6 va U+27E7 (matematik qavslar).
 * Ular translit jadvalida yo'q, matnlarda uchramaydi va bo'shliq talab
 * qilmaydi — shuning uchun so'zlar orasidagi oraliqni buzmaydi.
 */
const MARKER_OPEN = String.fromCharCode(0x27e6);
const MARKER_CLOSE = String.fromCharCode(0x27e7);
const MARKER_PATTERN = new RegExp(`${MARKER_OPEN}(\\d+)${MARKER_CLOSE}`, 'g');

/**
 * Transliteratsiya qilinmaydigan atamalar: kirillga o'girilsa ma'nosini
 * yo'qotadi yoki xato bo'ladi.
 */
const PROTECTED_TERMS = [
  'QDU LMS',
  'LMS',
  'GPA',
  'QR',
  'IP',
  'SMS',
  'HTML',
  'PDF',
  'DOCX',
  'XLSX',
  'CSV',
  'SCORM',
  'xAPI',
  'LTI',
  'QTI',
  'H5P',
  'GOST',
  'ISO',
  'HEMIS',
  'One ID',
  'E-IMZO',
  'Telegram',
  'Payme',
  'Click',
  'Jitsi',
  'BigBlueButton',
  'Ctrl+K',
  'XP',
  '2FA',
  'JN',
  'ON',
  'YN',
  'API',
  'URL',
  'UUID',
  'TOTP',
  'YYYY-MM-DD',
  'HH:mm',
  'Bloom',
  'Prometheus',
  'Redis',
  'Push',
];

/** O'rinbosar va himoyalangan atamalarni vaqtincha markerlar bilan almashtiradi. */
function protectSegments(text) {
  const stash = [];
  const mark = (match) => {
    stash.push(match);
    return `${MARKER_OPEN}${stash.length - 1}${MARKER_CLOSE}`;
  };

  let result = text.replace(/\{[^}]*\}/g, mark);

  for (const term of PROTECTED_TERMS) {
    result = result.replace(new RegExp(escapeRegExp(term), 'g'), mark);
  }

  return { result, stash };
}

function restoreSegments(text, stash) {
  return text.replace(MARKER_PATTERN, (_match, index) => stash[Number(index)] ?? '');
}

function convert(value) {
  if (typeof value === 'string') {
    const { result, stash } = protectSegments(value);
    return restoreSegments(latinToCyrillic(result), stash);
  }

  if (Array.isArray(value)) return value.map(convert);

  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, convert(item)]));
  }

  return value;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const source = JSON.parse(await readFile(join(MESSAGES_DIR, 'uz-Latn.json'), 'utf8'));

// Enum kalitlarining (SUPER_ADMIN, PRESENT, ...) o'zi o'zgarmaydi — faqat qiymatlar
const converted = convert(source);

await writeFile(
  join(MESSAGES_DIR, 'uz-Cyrl.json'),
  `${JSON.stringify(converted, null, 2)}\n`,
  'utf8',
);

console.log('uz-Cyrl.json uz-Latn.json dan transliteratsiya qilindi.');
console.log("Eslatma: natija tarjimon tomonidan ko'rib chiqilishi tavsiya etiladi.");
