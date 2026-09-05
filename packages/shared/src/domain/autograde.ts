/**
 * Maqsad: test javoblarini avtomatik baholash (F-07).
 *
 * Sof funksiya: kirish — savol payload'i, talaba javobi va maksimal ball;
 * chiqish — olingan ball va to'g'ri/noto'g'ri bayrog'i. Baza yoki I/O yo'q,
 * shuning uchun to'liq test bilan qoplanadi va backend ham, frontend ham
 * (mashq rejimida darhol javob ko'rsatish uchun) bir xil natijaga keladi.
 *
 * Umumiy qoida: ball hech qachon manfiy bo'lmaydi va `maxScore` dan oshmaydi.
 */

import type { QuestionPayload, QuestionResponse, QuestionType } from '../schemas/quiz';
import { MANUAL_GRADING_TYPES } from '../schemas/quiz';
import { clamp, round2 } from './grading';

export interface AutogradeResult {
  score: number;
  isCorrect: boolean;
  /** Qo'lda baholash kerakmi (ESSAY, CODE). */
  needsManualGrading: boolean;
  /** Qisman ball berilgan bo'lsa — qaysi qismlar to'g'ri (UI'da ko'rsatish uchun). */
  detail?: Record<string, boolean>;
}

const manualResult = (): AutogradeResult => ({
  score: 0,
  isCorrect: false,
  needsManualGrading: true,
});

const zeroResult = (): AutogradeResult => ({
  score: 0,
  isCorrect: false,
  needsManualGrading: false,
});

export function requiresManualGrading(type: QuestionType): boolean {
  return MANUAL_GRADING_TYPES.includes(type);
}

/** Matnli javoblarni solishtirish uchun normallashtirish. */
function normalizeAnswerText(value: string, caseSensitive: boolean): string {
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? trimmed : trimmed.toLocaleLowerCase();
}

/**
 * Javobni baholaydi. Payload va response turlari mos kelmasa — 0 ball
 * (bu holat validatsiyada ushlanadi, ammo funksiya xato tashlamaydi).
 */
export function autograde(
  payload: QuestionPayload,
  response: QuestionResponse | null | undefined,
  maxScore: number,
): AutogradeResult {
  if (requiresManualGrading(payload.type)) return manualResult();
  if (!response || response.type !== payload.type) return zeroResult();

  const max = Math.max(0, maxScore);

  switch (payload.type) {
    case 'SINGLE': {
      if (response.type !== 'SINGLE') return zeroResult();
      const correct = payload.options.find((option) => option.isCorrect);
      const isCorrect = Boolean(correct && response.optionId === correct.id);
      return { score: isCorrect ? round2(max) : 0, isCorrect, needsManualGrading: false };
    }

    case 'MULTI': {
      if (response.type !== 'MULTI') return zeroResult();
      const correctIds = new Set(
        payload.options.filter((option) => option.isCorrect).map((option) => option.id),
      );
      if (correctIds.size === 0) return zeroResult();

      const chosen = new Set(response.optionIds);
      let hits = 0;
      let misses = 0;
      for (const id of chosen) {
        if (correctIds.has(id)) hits += 1;
        else misses += 1;
      }

      // Qisman ball: to'g'rilar ulushi minus noto'g'rilar jarimasi
      const positive = hits / correctIds.size;
      const wrongPool = payload.options.length - correctIds.size;
      const negative = payload.penalizeWrong && wrongPool > 0 ? misses / wrongPool : 0;
      const ratio = clamp(positive - negative, 0, 1);

      return {
        score: round2(max * ratio),
        isCorrect: ratio === 1,
        needsManualGrading: false,
        detail: { allCorrect: ratio === 1 },
      };
    }

    case 'MATCHING': {
      if (response.type !== 'MATCHING') return zeroResult();
      const expected = new Map(payload.pairs.map((pair) => [pair.leftId, pair.rightId]));
      if (expected.size === 0) return zeroResult();

      const detail: Record<string, boolean> = {};
      let hits = 0;
      for (const pair of response.pairs) {
        const isHit = expected.get(pair.leftId) === pair.rightId;
        detail[pair.leftId] = isHit;
        if (isHit) hits += 1;
      }
      const ratio = hits / expected.size;
      return {
        score: round2(max * ratio),
        isCorrect: ratio === 1,
        needsManualGrading: false,
        detail,
      };
    }

    case 'ORDERING': {
      if (response.type !== 'ORDERING') return zeroResult();
      const correct = payload.correctOrder;
      if (correct.length === 0) return zeroResult();

      // Qisman ball: to'g'ri pozitsiyadagi elementlar ulushi
      let hits = 0;
      for (let index = 0; index < correct.length; index += 1) {
        if (response.order[index] === correct[index]) hits += 1;
      }
      const ratio = hits / correct.length;
      return { score: round2(max * ratio), isCorrect: ratio === 1, needsManualGrading: false };
    }

    case 'CLOZE': {
      if (response.type !== 'CLOZE') return zeroResult();
      const totalPoints = payload.blanks.reduce((sum, blank) => sum + blank.points, 0);
      if (totalPoints === 0) return zeroResult();

      const given = new Map(response.blanks.map((blank) => [blank.key, blank.value]));
      const detail: Record<string, boolean> = {};
      let earned = 0;

      for (const blank of payload.blanks) {
        const value = given.get(blank.key) ?? '';
        const normalized = normalizeAnswerText(value, blank.caseSensitive);
        const isHit = blank.accepted.some(
          (accepted) => normalizeAnswerText(accepted, blank.caseSensitive) === normalized,
        );
        detail[blank.key] = isHit;
        if (isHit) earned += blank.points;
      }

      const ratio = earned / totalPoints;
      return {
        score: round2(max * ratio),
        isCorrect: ratio === 1,
        needsManualGrading: false,
        detail,
      };
    }

    case 'NUMERIC': {
      if (response.type !== 'NUMERIC') return zeroResult();
      if (response.value === null || Number.isNaN(response.value)) return zeroResult();
      const isCorrect = Math.abs(response.value - payload.correctValue) <= payload.tolerance;
      return { score: isCorrect ? round2(max) : 0, isCorrect, needsManualGrading: false };
    }

    case 'HOTSPOT': {
      if (response.type !== 'HOTSPOT') return zeroResult();
      const required = new Set(payload.requiredAreaIds);
      if (required.size === 0) return zeroResult();

      const chosen = new Set(response.areaIds);
      let hits = 0;
      for (const id of required) if (chosen.has(id)) hits += 1;
      // Ortiqcha bosilgan sohalar jarimasi
      const extra = Array.from(chosen).filter((id) => !required.has(id)).length;
      const ratio = clamp((hits - extra) / required.size, 0, 1);
      return { score: round2(max * ratio), isCorrect: ratio === 1, needsManualGrading: false };
    }

    case 'DRAG_DROP': {
      if (response.type !== 'DRAG_DROP') return zeroResult();
      const expected = new Map(payload.placements.map((p) => [p.itemId, p.zoneId]));
      if (expected.size === 0) return zeroResult();

      const detail: Record<string, boolean> = {};
      let hits = 0;
      for (const placement of response.placements) {
        const isHit = expected.get(placement.itemId) === placement.zoneId;
        detail[placement.itemId] = isHit;
        if (isHit) hits += 1;
      }
      const ratio = hits / expected.size;
      return {
        score: round2(max * ratio),
        isCorrect: ratio === 1,
        needsManualGrading: false,
        detail,
      };
    }

    // ESSAY va CODE yuqorida `requiresManualGrading` orqali ushlangan,
    // ammo TypeScript to'liqlikni talab qiladi.
    case 'ESSAY':
    case 'CODE':
      return manualResult();

    default: {
      // Yangi savol turi qo'shilsa TypeScript shu yerda xato beradi (exhaustiveness)
      const exhaustive: never = payload;
      void exhaustive;
      return zeroResult();
    }
  }
}

/**
 * Urinish bo'yicha yakuniy ball. `gradingMethod` testda belgilanadi.
 */
export function resolveAttemptScore(
  attemptScores: readonly number[],
  method: 'HIGHEST' | 'LAST' | 'AVERAGE' | 'FIRST',
): number {
  if (attemptScores.length === 0) return 0;
  switch (method) {
    case 'HIGHEST':
      return round2(Math.max(...attemptScores));
    case 'LAST':
      return round2(attemptScores[attemptScores.length - 1] as number);
    case 'FIRST':
      return round2(attemptScores[0] as number);
    case 'AVERAGE':
      return round2(attemptScores.reduce((sum, value) => sum + value, 0) / attemptScores.length);
    default:
      return 0;
  }
}

/**
 * Variant generatsiyasi: pool'lardan tasodifiy savollarni tanlaydi.
 * `seed` berilsa natija takrorlanadigan bo'ladi (testlar va apellyatsiya uchun muhim —
 * talaba qaysi variantni olgani qayta tiklanadi).
 */
export function selectQuestionsForAttempt<T extends { questionId: string; poolTag?: string }>(
  pool: readonly T[],
  poolSelection: ReadonlyArray<{ poolTag: string; take: number }>,
  questionsPerAttempt: number,
  seed: number,
): T[] {
  const random = createSeededRandom(seed);

  if (poolSelection.length > 0) {
    const result: T[] = [];
    for (const selection of poolSelection) {
      const candidates = pool.filter((item) => item.poolTag === selection.poolTag);
      result.push(...shuffle(candidates, random).slice(0, selection.take));
    }
    // Pool'ga kirmagan savollar doim qo'shiladi (majburiy savollar)
    const taggedTags = new Set(poolSelection.map((s) => s.poolTag));
    result.push(...pool.filter((item) => !item.poolTag || !taggedTags.has(item.poolTag)));
    return shuffle(result, random);
  }

  const shuffled = shuffle([...pool], random);
  return questionsPerAttempt > 0 ? shuffled.slice(0, questionsPerAttempt) : shuffled;
}

/** Mulberry32 — kichik, tez va deterministik PRNG. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates aralashtirish (deterministik PRNG bilan). */
export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = result[i] as T;
    const b = result[j] as T;
    result[i] = b;
    result[j] = a;
  }
  return result;
}
