/**
 * Maqsad: o'zbek lotin <-> kirill transliteratsiyasi (F-18, A-16, ADR-015).
 *
 * Nima uchun o'z implementatsiyamiz: mavjud npm paketlari ko'p harflarni
 * (masalan `ng`, `o'`, `g'`, `ye/e` pozitsion qoidasi) noto'g'ri o'giradi.
 * Ushbu modul deterministik va testlar bilan qoplangan.
 *
 * Qo'llanilishi:
 *  1) UI'da "kirillcha ko'rsatish" rejimi;
 *  2) qidiruv indeksini normallashtirish — kirillcha so'rov lotinchaga o'giriladi.
 */

/** Ko'p harfli birikmalar avval keladi — tartib muhim. */
const LATIN_TO_CYRILLIC_DIGRAPHS: ReadonlyArray<readonly [string, string]> = [
  ["o'", 'ў'],
  ['oʻ', 'ў'],
  ['o‘', 'ў'],
  ["g'", 'ғ'],
  ['gʻ', 'ғ'],
  ['g‘', 'ғ'],
  ['sh', 'ш'],
  ['ch', 'ч'],
  ['ng', 'нг'],
  ['yo', 'ё'],
  ['yu', 'ю'],
  ['ya', 'я'],
  ['ye', 'е'],
  ['ts', 'ц'],
];

const LATIN_TO_CYRILLIC_SINGLES: Readonly<Record<string, string>> = {
  a: 'а',
  b: 'б',
  d: 'д',
  e: 'е',
  f: 'ф',
  g: 'г',
  h: 'ҳ',
  i: 'и',
  j: 'ж',
  k: 'к',
  l: 'л',
  m: 'м',
  n: 'н',
  o: 'о',
  p: 'п',
  q: 'қ',
  r: 'р',
  s: 'с',
  t: 'т',
  u: 'у',
  v: 'в',
  x: 'х',
  y: 'й',
  z: 'з',
  "'": 'ъ',
  ʼ: 'ъ',
};

const CYRILLIC_TO_LATIN: Readonly<Record<string, string>> = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  ғ: "g'",
  д: 'd',
  е: 'e',
  ё: 'yo',
  ж: 'j',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  қ: 'q',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  ў: "o'",
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'x',
  ҳ: 'h',
  ц: 'ts',
  ч: 'ch',
  ш: 'sh',
  щ: 'sh',
  ъ: "'",
  ь: '',
  ы: 'i',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

/**
 * Bosh harfni saqlagan holda almashtirish natijasini qaytaradi.
 *
 * Muhim: registri bo'lmagan belgilar (apostrof, tire, raqam) katta harf
 * deb hisoblanmasligi kerak — aks holda "E'lon" -> "ЭЪлон" bo'lib qolardi.
 */
function preserveCase(source: string, converted: string): string {
  if (!source || !converted) return converted;

  const firstChar = source[0] as string;
  const hasCase = firstChar.toLowerCase() !== firstChar.toUpperCase();
  if (!hasCase || firstChar !== firstChar.toUpperCase()) return converted;

  // Butun so'z katta harfda bo'lsa (masalan "QDU") — hammasini kattalashtiramiz
  if (source.length > 1 && source === source.toUpperCase()) return converted.toUpperCase();
  return converted.charAt(0).toUpperCase() + converted.slice(1);
}

/** Harf hisoblanadigan belgilar — so'z chegarasini aniqlash uchun. */
const LETTER_PATTERN = /[a-zA-Z'ʻʼ‘’]/;

/**
 * Lotin yozuvidagi o'zbekcha matnni kirillga o'giradi.
 *
 * `e` qoidasi (o'zbek imlosi): so'z BOSHIDA `e` -> `э`
 * ("etilmagan" -> "этилмаган"), so'z ichida `e` -> `е` ("kelmoq" -> "келмоқ").
 */
export function latinToCyrillic(input: string): string {
  if (!input) return '';
  let result = '';
  let index = 0;
  const lower = input.toLowerCase();

  while (index < input.length) {
    let matched = false;

    for (const [latin, cyr] of LATIN_TO_CYRILLIC_DIGRAPHS) {
      if (lower.startsWith(latin, index)) {
        result += preserveCase(input.slice(index, index + latin.length), cyr);
        index += latin.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    const char = lower[index] as string;
    let mapped = LATIN_TO_CYRILLIC_SINGLES[char];

    if (char === 'e') {
      const previous = index > 0 ? (input[index - 1] as string) : '';
      const atWordStart = index === 0 || !LETTER_PATTERN.test(previous);
      mapped = atWordStart ? 'э' : 'е';
    }

    if (mapped !== undefined) {
      result += preserveCase(input[index] as string, mapped);
    } else {
      result += input[index];
    }
    index += 1;
  }
  return result;
}

/** Kirill yozuvidagi o'zbekcha matnni lotinga o'giradi. */
export function cyrillicToLatin(input: string): string {
  if (!input) return '';
  let result = '';
  for (const char of input) {
    const lower = char.toLowerCase();
    const mapped = CYRILLIC_TO_LATIN[lower];
    if (mapped !== undefined) {
      result += preserveCase(char, mapped);
    } else {
      result += char;
    }
  }
  return result;
}

const CYRILLIC_PATTERN = /[Ѐ-ӿ]/;

export function isCyrillic(input: string): boolean {
  return CYRILLIC_PATTERN.test(input);
}

/**
 * Qidiruv uchun normallashtirish: har qanday yozuvni lotinga o'giradi,
 * apostroflarni olib tashlaydi va kichik harfga keltiradi.
 * Shu tufayli "Математика", "Matematika" va "matematika" bir xil kalitga aylanadi.
 */
export function normalizeForSearch(input: string): string {
  if (!input) return '';
  const latin = isCyrillic(input) ? cyrillicToLatin(input) : input;
  return latin
    .toLowerCase()
    .replace(/[''ʻ‘’ʼ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * FTS indeksiga yoziladigan qatorni tayyorlaydi.
 *
 * Muhim: indeks HAM, so'rov HAM `normalizeForSearch` orqali lotinga keltiriladi,
 * shuning uchun kirillcha variantni alohida saqlash shart emas — bu indeks
 * hajmini ikki baravar oshirgan bo'lardi. Funksiya bir nechta manba matnni
 * (masalan barcha tillardagi sarlavhalarni) bitta normallashgan qatorga birlashtiradi.
 */
export function buildSearchText(...parts: Array<string | null | undefined>): string {
  const seen = new Set<string>();
  for (const part of parts) {
    if (!part) continue;
    for (const token of normalizeForSearch(part).split(' ')) {
      if (token) seen.add(token);
    }
  }
  return Array.from(seen).join(' ');
}
