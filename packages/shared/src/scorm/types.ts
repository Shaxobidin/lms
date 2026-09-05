/**
 * Maqsad: SCORM 1.2 va SCORM 2004 (4th ed.) Run-Time Environment ma'lumot modeli
 * tiplari va xatolik kodlari (F-05, §12, ADR-008).
 *
 * Ushbu fayl faqat kontrakt: brauzer tomonidagi `API` obyekti `apps/web` da,
 * saqlash esa `apps/api` dagi `ScormTracking` jadvalida amalga oshiriladi.
 */

export type ScormVersion = '1.2' | '2004';

/** SCORM 1.2 `cmi.core.lesson_status` qiymatlari. */
export const SCORM_12_STATUSES = [
  'passed',
  'completed',
  'failed',
  'incomplete',
  'browsed',
  'not attempted',
] as const;

/** SCORM 2004 da holat ikkiga bo'lingan. */
export const SCORM_2004_COMPLETION = [
  'completed',
  'incomplete',
  'not attempted',
  'unknown',
] as const;
export const SCORM_2004_SUCCESS = ['passed', 'failed', 'unknown'] as const;

export type Scorm12Status = (typeof SCORM_12_STATUSES)[number];
export type Scorm2004Completion = (typeof SCORM_2004_COMPLETION)[number];
export type Scorm2004Success = (typeof SCORM_2004_SUCCESS)[number];

/**
 * Ikkala versiya uchun umumlashtirilgan tracking holati.
 * Baza shu shaklda saqlaydi — versiyaga xos kalitlar `raw` ichida qoladi.
 */
export interface ScormTrackingState {
  version: ScormVersion;
  /** `cmi.core.lesson_status` (1.2) yoki `cmi.completion_status` (2004). */
  completionStatus: string;
  /** 2004 uchun alohida; 1.2 da `lesson_status` dan olinadi. */
  successStatus: string;
  /** 0..1 oralig'ida normallashtirilgan ball (2004: `cmi.score.scaled`). */
  scoreScaled: number | null;
  scoreRaw: number | null;
  scoreMin: number | null;
  scoreMax: number | null;
  /** Sarflangan vaqt, soniyada (ISO 8601 duration dan o'girilgan). */
  totalTimeSeconds: number;
  /** `cmi.suspend_data` — paket o'z holatini shu yerda saqlaydi. */
  suspendData: string;
  /** `cmi.core.lesson_location` / `cmi.location`. */
  location: string;
  /** `cmi.core.entry` / `cmi.entry`: ab-initio | resume | "". */
  entry: string;
  /** `cmi.exit`: time-out | suspend | logout | normal | "". */
  exit: string;
  /** Barcha xom `cmi.*` kalitlari — standartga to'liq muvofiqlik uchun. */
  raw: Record<string, string>;
}

export const EMPTY_SCORM_STATE: Omit<ScormTrackingState, 'version'> = {
  completionStatus: 'not attempted',
  successStatus: 'unknown',
  scoreScaled: null,
  scoreRaw: null,
  scoreMin: null,
  scoreMax: null,
  totalTimeSeconds: 0,
  suspendData: '',
  location: '',
  entry: 'ab-initio',
  exit: '',
  raw: {},
};

/** SCORM xatolik kodlari (ikkala versiyada asosan bir xil). */
export const SCORM_ERRORS = {
  NO_ERROR: '0',
  GENERAL_EXCEPTION: '101',
  INVALID_ARGUMENT: '201',
  ELEMENT_CANNOT_HAVE_CHILDREN: '202',
  ELEMENT_NOT_AN_ARRAY: '203',
  NOT_INITIALIZED: '301',
  NOT_IMPLEMENTED: '401',
  INVALID_SET_VALUE: '402',
  ELEMENT_IS_READ_ONLY: '403',
  ELEMENT_IS_WRITE_ONLY: '404',
  INCORRECT_DATA_TYPE: '405',
} as const;

export const SCORM_ERROR_MESSAGES: Record<string, string> = {
  '0': 'No error',
  '101': 'General exception',
  '201': 'Invalid argument error',
  '202': 'Element cannot have children',
  '203': 'Element not an array — cannot have count',
  '301': 'Not initialized',
  '401': 'Not implemented error',
  '402': 'Invalid set value, element is a keyword',
  '403': 'Element is read only',
  '404': 'Element is write only',
  '405': 'Incorrect data type',
};

/** Faqat o'qish uchun mo'ljallangan elementlar — yozishga urinish 403 beradi. */
export const SCORM_READ_ONLY_ELEMENTS: readonly string[] = [
  'cmi.core.student_id',
  'cmi.core.student_name',
  'cmi.core.credit',
  'cmi.core.entry',
  'cmi.core.total_time',
  'cmi.core.lesson_mode',
  'cmi.launch_data',
  'cmi.learner_id',
  'cmi.learner_name',
  'cmi.credit',
  'cmi.entry',
  'cmi.total_time',
  'cmi.mode',
  'cmi.max_time_allowed',
];

/** Faqat yozish uchun elementlar — o'qishga urinish 404 beradi. */
export const SCORM_WRITE_ONLY_ELEMENTS: readonly string[] = ['cmi.exit', 'cmi.core.exit'];

/**
 * `HHHH:MM:SS.SS` (SCORM 1.2) formatini soniyaga o'giradi.
 * Noto'g'ri format 0 qaytaradi — paket buzilgan bo'lsa ham pleyer to'xtamaydi.
 */
export function parseScorm12Time(value: string): number {
  const match = /^(\d{2,4}):(\d{2}):(\d{2})(\.\d{1,2})?$/.exec(value.trim());
  if (!match) return 0;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const fraction = match[4] ? Number(match[4]) : 0;
  return hours * 3600 + minutes * 60 + seconds + fraction;
}

/**
 * ISO 8601 davomiylik (`PT1H30M5S`, SCORM 2004) formatini soniyaga o'giradi.
 */
export function parseIso8601Duration(value: string): number {
  const match =
    /^P(?:(\d+)Y)?(?:(\d+)M)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?)?$/.exec(
      value.trim(),
    );
  if (!match) return 0;
  const [, years, months, days, hours, minutes, seconds] = match;
  return (
    Number(years ?? 0) * 31_536_000 +
    Number(months ?? 0) * 2_592_000 +
    Number(days ?? 0) * 86_400 +
    Number(hours ?? 0) * 3600 +
    Number(minutes ?? 0) * 60 +
    Number(seconds ?? 0)
  );
}

/** Soniyani SCORM 1.2 vaqt formatiga o'giradi. */
export function formatScorm12Time(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = String(Math.floor(safe / 3600)).padStart(4, '0');
  const minutes = String(Math.floor((safe % 3600) / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${hours}:${minutes}:${seconds}.00`;
}

/** Soniyani ISO 8601 davomiylik formatiga o'giradi (SCORM 2004). */
export function formatIso8601Duration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return `PT${hours}H${minutes}M${seconds}S`;
}

/**
 * SCORM holatini LMS baholash tizimiga moslashtirish.
 * `scoreScaled` bo'lsa u ustuvor; aks holda raw/max nisbati olinadi.
 */
export function scormStateToScore(state: ScormTrackingState, maxScore: number): number | null {
  if (state.scoreScaled !== null) {
    return Math.round(state.scoreScaled * maxScore * 100) / 100;
  }
  if (state.scoreRaw !== null && state.scoreMax !== null && state.scoreMax > 0) {
    return Math.round((state.scoreRaw / state.scoreMax) * maxScore * 100) / 100;
  }
  return null;
}

/** Paket tugatilgan deb hisoblanadimi. */
export function isScormCompleted(state: ScormTrackingState): boolean {
  return ['completed', 'passed'].includes(state.completionStatus.toLowerCase());
}
