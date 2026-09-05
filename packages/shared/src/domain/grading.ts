/**
 * Maqsad: baholash domen qoidalari — JN/ON/YN, 100 ballik shkala, GPA, saralash (F-08).
 *
 * Nima uchun alohida modul: bu qoidalar backend (baho hisoblash), frontend
 * (talabaga ko'rsatish) va hisobot generatorida bir xil bo'lishi shart (ADR-012).
 * Sof funksiyalar — baza yoki I/O ga bog'liq emas, shuning uchun 100% test qoplanadi.
 */

import type { Locale } from '../constants/locales';

/** Nazorat turlari — O'zbekiston kredit-modul tizimi (promt.md §12). */
export const CONTROL_TYPES = ['JN', 'ON', 'YN'] as const;
export type ControlTypeCode = (typeof CONTROL_TYPES)[number];

export const CONTROL_TYPE_NAMES: Record<ControlTypeCode, Record<Locale, string>> = {
  JN: {
    'uz-Latn': 'Joriy nazorat',
    'uz-Cyrl': 'Жорий назорат',
    ru: 'Текущий контроль',
    en: 'Current assessment',
  },
  ON: {
    'uz-Latn': 'Oraliq nazorat',
    'uz-Cyrl': 'Оралиқ назорат',
    ru: 'Промежуточный контроль',
    en: 'Midterm assessment',
  },
  YN: {
    'uz-Latn': 'Yakuniy nazorat',
    'uz-Cyrl': 'Якуний назорат',
    ru: 'Итоговый контроль',
    en: 'Final assessment',
  },
};

/**
 * Fan bo'yicha baholash siyosati. Standart qiymatlar A-18 da asoslangan,
 * har bir sillabus versiyasida qayta belgilanishi mumkin.
 */
export interface GradingPolicy {
  /** Nazorat turlarining yakuniy balldagi ulushi (foizda, yig'indisi 100). */
  weights: Record<ControlTypeCode, number>;
  /** Fanni o'zlashtirish uchun minimal yakuniy ball. */
  passingScore: number;
  /** YN ga kiritish uchun JN+ON bo'yicha minimal ball. */
  finalExamThreshold: number;
  /** YN uchun minimal ball (bo'lmasa — 0). */
  finalExamMinScore: number;
  /** Kechikkan topshiriq uchun jarima (foizda, kunlik emas — bir martalik). */
  latePenaltyPercent: number;
}

export const DEFAULT_GRADING_POLICY: GradingPolicy = {
  weights: { JN: 30, ON: 30, YN: 40 },
  passingScore: 60,
  finalExamThreshold: 36,
  finalExamMinScore: 0,
  latePenaltyPercent: 10,
};

/** Bitta nazorat turi bo'yicha to'plangan ball. */
export interface ControlScore {
  controlType: ControlTypeCode;
  /** To'plangan xom ball. */
  earned: number;
  /** Shu nazorat turi bo'yicha maksimal mumkin bo'lgan xom ball. */
  max: number;
}

export interface FinalGradeResult {
  /** 0..100 oralig'idagi yakuniy ball. */
  score: number;
  /** Har bir nazorat turi bo'yicha 100 ballik shkaladagi hissasi. */
  breakdown: Record<ControlTypeCode, { percent: number; weighted: number }>;
  passed: boolean;
  /** YN ga kirish huquqi bor-yo'qligi (JN+ON chegarasi). */
  eligibleForFinal: boolean;
  letter: LetterGrade;
  gpaPoints: number;
  fiveScale: number;
}

export type LetterGrade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C' | 'F';

/**
 * 100 ballik -> harf, GPA (4.0) va 5 ballik shkala (A-17).
 * Chegaralar `GradeScale` jadvali orqali sozlanadi; bu yerda standart qiymat.
 */
export interface GradeScaleBand {
  min: number;
  max: number;
  letter: LetterGrade;
  gpa: number;
  five: number;
  labelKey: string;
}

export const DEFAULT_GRADE_SCALE: readonly GradeScaleBand[] = [
  { min: 96, max: 100, letter: 'A+', gpa: 4.0, five: 5, labelKey: 'grade.excellent' },
  { min: 86, max: 95.99, letter: 'A', gpa: 4.0, five: 5, labelKey: 'grade.excellent' },
  { min: 81, max: 85.99, letter: 'B+', gpa: 3.5, five: 4, labelKey: 'grade.good' },
  { min: 71, max: 80.99, letter: 'B', gpa: 3.0, five: 4, labelKey: 'grade.good' },
  { min: 66, max: 70.99, letter: 'C+', gpa: 2.5, five: 3, labelKey: 'grade.satisfactory' },
  { min: 60, max: 65.99, letter: 'C', gpa: 2.0, five: 3, labelKey: 'grade.satisfactory' },
  { min: 0, max: 59.99, letter: 'F', gpa: 0, five: 2, labelKey: 'grade.failed' },
];

export function resolveBand(
  score: number,
  scale: readonly GradeScaleBand[] = DEFAULT_GRADE_SCALE,
): GradeScaleBand {
  const clamped = clamp(score, 0, 100);
  const band = scale.find((item) => clamped >= item.min && clamped <= item.max);
  // Shkala noto'g'ri sozlangan bo'lsa ham funksiya xato tashlamaydi — eng past band qaytadi
  return band ?? (scale[scale.length - 1] as GradeScaleBand);
}

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(Math.max(value, min), max);
}

/** Ikki xonagacha yaxlitlash (moliyaviy emas, ta'lim balli — yarim yuqoriga). */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Yakuniy ballni hisoblaydi.
 *
 * Algoritm:
 *  1) har bir nazorat turi bo'yicha foiz = earned / max * 100;
 *  2) foiz siyosat og'irligiga ko'paytiriladi;
 *  3) yig'indi 0..100 ga cheklanadi;
 *  4) YN ga kirish huquqi JN+ON og'irlangan ballari bo'yicha tekshiriladi.
 *
 * Agar biror nazorat turi bo'yicha `max = 0` bo'lsa (masalan, ON hali o'tkazilmagan),
 * uning og'irligi hisobga olinmaydi va qolgan turlar og'irliklari qayta normallashtiriladi —
 * shu tufayli semestr o'rtasida ham ko'rsatiladigan ball haqqoniy bo'ladi.
 */
export function calculateFinalGrade(
  scores: readonly ControlScore[],
  policy: GradingPolicy = DEFAULT_GRADING_POLICY,
  scale: readonly GradeScaleBand[] = DEFAULT_GRADE_SCALE,
): FinalGradeResult {
  const breakdown = {} as Record<ControlTypeCode, { percent: number; weighted: number }>;
  let activeWeightSum = 0;
  let weightedSum = 0;

  for (const controlType of CONTROL_TYPES) {
    const entry = scores.find((item) => item.controlType === controlType);
    const weight = policy.weights[controlType] ?? 0;

    if (!entry || entry.max <= 0) {
      breakdown[controlType] = { percent: 0, weighted: 0 };
      continue;
    }

    const percent = clamp((entry.earned / entry.max) * 100, 0, 100);
    const weighted = (percent * weight) / 100;
    breakdown[controlType] = { percent: round2(percent), weighted: round2(weighted) };
    activeWeightSum += weight;
    weightedSum += weighted;
  }

  // Og'irliklarni qayta normallashtirish (hali o'tkazilmagan nazoratlarni hisobga olmaslik)
  const score =
    activeWeightSum > 0 ? round2(clamp((weightedSum / activeWeightSum) * 100, 0, 100)) : 0;

  const currentAndMidterm = (breakdown.JN?.weighted ?? 0) + (breakdown.ON?.weighted ?? 0);
  const finalEntry = scores.find((item) => item.controlType === 'YN');
  const finalPercent =
    finalEntry && finalEntry.max > 0 ? (finalEntry.earned / finalEntry.max) * 100 : 0;

  const band = resolveBand(score, scale);
  const passed = score >= policy.passingScore && finalPercent >= policy.finalExamMinScore;

  return {
    score,
    breakdown,
    passed,
    eligibleForFinal: currentAndMidterm >= policy.finalExamThreshold,
    letter: band.letter,
    gpaPoints: band.gpa,
    fiveScale: band.five,
  };
}

export interface GpaEntry {
  credits: number;
  score: number;
}

/**
 * GPA = sum(kredit * gpaPoints) / sum(kredit).
 * Kreditlari nol bo'lgan fanlar hisobga olinmaydi (fakultativ).
 */
export function calculateGpa(
  entries: readonly GpaEntry[],
  scale: readonly GradeScaleBand[] = DEFAULT_GRADE_SCALE,
): number {
  let totalCredits = 0;
  let totalPoints = 0;
  for (const entry of entries) {
    if (entry.credits <= 0) continue;
    totalCredits += entry.credits;
    totalPoints += entry.credits * resolveBand(entry.score, scale).gpa;
  }
  if (totalCredits === 0) return 0;
  return Math.round((totalPoints / totalCredits) * 100) / 100;
}

/**
 * Kechikkan topshiriq uchun jarima qo'llash.
 * `lateUntil` dan keyin yuborilgan ish qabul qilinmaydi (null qaytadi).
 */
export function applyLatePenalty(
  score: number,
  submittedAt: Date,
  dueAt: Date,
  lateUntil: Date | null,
  penaltyPercent: number,
): number | null {
  if (submittedAt <= dueAt) return round2(score);
  if (lateUntil && submittedAt > lateUntil) return null;
  const penalty = clamp(penaltyPercent, 0, 100);
  return round2(score * (1 - penalty / 100));
}

/**
 * Test savolining sifat ko'rsatkichlari (item analysis, F-07).
 *
 * facilityIndex (p) — qiyinlik: to'g'ri javob bergan talabalar ulushi (0..1).
 *   0.3 dan past — juda qiyin, 0.9 dan yuqori — juda oson.
 * discriminationIndex (D) — ajratish qobiliyati: yuqori 27% va quyi 27%
 *   guruhlar orasidagi farq. 0.3 dan yuqori — yaxshi savol, 0 dan past — nuqsonli.
 */
export interface ItemAnalysisInput {
  /** Har bir urinish: umumiy natija foizi va shu savolga to'g'ri javob berilganmi. */
  attempts: ReadonlyArray<{ totalPercent: number; correct: boolean }>;
}

export interface ItemAnalysisResult {
  facilityIndex: number;
  discriminationIndex: number;
  sampleSize: number;
  /** Savolni qayta ko'rib chiqish tavsiya etiladimi. */
  needsReview: boolean;
}

export function analyzeItem({ attempts }: ItemAnalysisInput): ItemAnalysisResult {
  const sampleSize = attempts.length;
  if (sampleSize === 0) {
    return { facilityIndex: 0, discriminationIndex: 0, sampleSize: 0, needsReview: false };
  }

  const correctCount = attempts.filter((a) => a.correct).length;
  const facilityIndex = round2(correctCount / sampleSize);

  // Statistik ma'noga ega bo'lishi uchun kamida 10 urinish kerak
  if (sampleSize < 10) {
    return { facilityIndex, discriminationIndex: 0, sampleSize, needsReview: false };
  }

  const sorted = [...attempts].sort((a, b) => b.totalPercent - a.totalPercent);
  const groupSize = Math.max(1, Math.round(sampleSize * 0.27));
  const upper = sorted.slice(0, groupSize);
  const lower = sorted.slice(-groupSize);

  const upperCorrect = upper.filter((a) => a.correct).length / groupSize;
  const lowerCorrect = lower.filter((a) => a.correct).length / groupSize;
  const discriminationIndex = round2(upperCorrect - lowerCorrect);

  return {
    facilityIndex,
    discriminationIndex,
    sampleSize,
    needsReview: discriminationIndex < 0.2 || facilityIndex < 0.2 || facilityIndex > 0.95,
  };
}
