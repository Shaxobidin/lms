/**
 * Maqsad: matnlar o'xshashligini aniqlash — plagiat tekshiruvi uchun ichki
 * implementatsiya (F-06, A-10).
 *
 * Usul: w-shingling + Jaccard koeffitsienti, MinHash eskizlari bilan tezlashtirilgan.
 * Nima uchun: tashqi xizmat kalitisiz ham bazadagi topshiriqlar orasida haqiqiy
 * o'xshashlikni topadi. Tashqi xizmat ulanganda `PlagiarismProvider` almashtiriladi.
 *
 * Cheklov (halollik uchun ochiq aytiladi): bu usul internetdagi manbalar bilan
 * solishtirmaydi — faqat tizim ichidagi ishlar bilan.
 */

/** Normallashtirish: belgilar, ortiqcha bo'shliqlar va registr olib tashlanadi. */
export function normalizeForComparison(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** So'zlar ketma-ketligidan n-gramma (shingle) to'plamini yasaydi. */
export function buildShingles(text: string, size = 5): Set<string> {
  const words = normalizeForComparison(text).split(' ').filter(Boolean);
  const shingles = new Set<string>();
  if (words.length < size) {
    if (words.length > 0) shingles.add(words.join(' '));
    return shingles;
  }
  for (let i = 0; i <= words.length - size; i += 1) {
    shingles.add(words.slice(i, i + size).join(' '));
  }
  return shingles;
}

/** FNV-1a 32-bit — tez va taqsimoti yaxshi hash. */
export function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * MinHash eskizi: har bir hash funksiyasi uchun minimal qiymat.
 * `signatureSize` qancha katta bo'lsa, baho shuncha aniq (128 — amaliy muvozanat).
 */
export function minHashSignature(shingles: ReadonlySet<string>, signatureSize = 128): number[] {
  const signature = new Array<number>(signatureSize).fill(Number.MAX_SAFE_INTEGER);
  if (shingles.size === 0) return signature;

  for (const shingle of shingles) {
    const base = hashString(shingle);
    for (let i = 0; i < signatureSize; i += 1) {
      // Universal hashing oilasi: (a*x + b) mod p
      const hashed = (Math.imul(base, 2654435761 + i * 2) + (i * 40503 + 1)) >>> 0;
      const current = signature[i] as number;
      if (hashed < current) signature[i] = hashed;
    }
  }
  return signature;
}

/** Ikki eskiz orasidagi taxminiy Jaccard o'xshashligi (0..1). */
export function compareSignatures(a: readonly number[], b: readonly number[]): number {
  const length = Math.min(a.length, b.length);
  if (length === 0) return 0;
  let matches = 0;
  for (let i = 0; i < length; i += 1) {
    if (a[i] === b[i]) matches += 1;
  }
  return matches / length;
}

/** Aniq Jaccard — kichik matnlar uchun (eskiz taqribiy bo'lganda foydali). */
export function jaccardSimilarity(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export interface SimilarityMatch {
  /** Solishtirilgan ish identifikatori. */
  targetId: string;
  /** 0..100 foizda. */
  similarityPercent: number;
}

/**
 * Bitta ishni bir nechta ish bilan solishtiradi va chegaradan yuqori
 * mosliklarni qaytaradi (kamayish tartibida).
 */
export function findSimilarSubmissions(
  source: { text: string },
  candidates: ReadonlyArray<{ id: string; text: string }>,
  options: { shingleSize?: number; threshold?: number; maxResults?: number } = {},
): SimilarityMatch[] {
  const shingleSize = options.shingleSize ?? 5;
  const threshold = options.threshold ?? 0.25;
  const maxResults = options.maxResults ?? 10;

  const sourceShingles = buildShingles(source.text, shingleSize);
  if (sourceShingles.size === 0) return [];

  const matches: SimilarityMatch[] = [];
  for (const candidate of candidates) {
    const candidateShingles = buildShingles(candidate.text, shingleSize);
    const similarity = jaccardSimilarity(sourceShingles, candidateShingles);
    if (similarity >= threshold) {
      matches.push({
        targetId: candidate.id,
        similarityPercent: Math.round(similarity * 10000) / 100,
      });
    }
  }

  return matches.sort((a, b) => b.similarityPercent - a.similarityPercent).slice(0, maxResults);
}
