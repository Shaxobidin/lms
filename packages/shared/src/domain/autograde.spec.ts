/**
 * Maqsad: 10 turdagi savolni avtomatik baholash mantig'ining testlari (F-07).
 */

import { describe, expect, it } from 'vitest';
import {
  autograde,
  createSeededRandom,
  resolveAttemptScore,
  selectQuestionsForAttempt,
  shuffle,
} from './autograde';
import type { QuestionPayload, QuestionResponse } from '../schemas/quiz';

const text = { 'uz-Latn': 'matn' };

describe('autograde — SINGLE', () => {
  const payload: QuestionPayload = {
    type: 'SINGLE',
    options: [
      { id: 'a', text, isCorrect: false, weight: 0 },
      { id: 'b', text, isCorrect: true, weight: 0 },
    ],
  };

  it("to'g'ri variantga to'liq ball beradi", () => {
    const result = autograde(payload, { type: 'SINGLE', optionId: 'b' }, 5);
    expect(result.score).toBe(5);
    expect(result.isCorrect).toBe(true);
  });

  it("noto'g'ri variantga 0 beradi", () => {
    expect(autograde(payload, { type: 'SINGLE', optionId: 'a' }, 5).score).toBe(0);
  });

  it("javob bo'lmasa 0 beradi", () => {
    expect(autograde(payload, null, 5).score).toBe(0);
  });
});

describe('autograde — MULTI', () => {
  const payload: QuestionPayload = {
    type: 'MULTI',
    penalizeWrong: true,
    options: [
      { id: 'a', text, isCorrect: true, weight: 0 },
      { id: 'b', text, isCorrect: true, weight: 0 },
      { id: 'c', text, isCorrect: false, weight: 0 },
      { id: 'd', text, isCorrect: false, weight: 0 },
    ],
  };

  it("barcha to'g'ri variantlarga to'liq ball beradi", () => {
    const result = autograde(payload, { type: 'MULTI', optionIds: ['a', 'b'] }, 10);
    expect(result.score).toBe(10);
    expect(result.isCorrect).toBe(true);
  });

  it("yarim to'g'ri javobga qisman ball beradi", () => {
    // 1/2 to'g'ri, 0 noto'g'ri -> 0.5
    expect(autograde(payload, { type: 'MULTI', optionIds: ['a'] }, 10).score).toBe(5);
  });

  it("noto'g'ri tanlov uchun jarima qo'llaydi", () => {
    // 2/2 to'g'ri, 1/2 noto'g'ri -> 1 - 0.5 = 0.5
    expect(autograde(payload, { type: 'MULTI', optionIds: ['a', 'b', 'c'] }, 10).score).toBe(5);
  });

  it("ball hech qachon manfiy bo'lmaydi", () => {
    expect(autograde(payload, { type: 'MULTI', optionIds: ['c', 'd'] }, 10).score).toBe(0);
  });
});

describe('autograde — MATCHING va ORDERING', () => {
  it('juftliklarni qisman baholaydi', () => {
    const payload: QuestionPayload = {
      type: 'MATCHING',
      left: [
        { id: 'l1', text },
        { id: 'l2', text },
      ],
      right: [
        { id: 'r1', text },
        { id: 'r2', text },
      ],
      pairs: [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l2', rightId: 'r2' },
      ],
    };
    const response: QuestionResponse = {
      type: 'MATCHING',
      pairs: [
        { leftId: 'l1', rightId: 'r1' },
        { leftId: 'l2', rightId: 'r1' },
      ],
    };
    const result = autograde(payload, response, 4);
    expect(result.score).toBe(2);
    expect(result.detail?.l1).toBe(true);
    expect(result.detail?.l2).toBe(false);
  });

  it("tartibni pozitsiya bo'yicha baholaydi", () => {
    const payload: QuestionPayload = {
      type: 'ORDERING',
      items: [
        { id: '1', text },
        { id: '2', text },
        { id: '3', text },
      ],
      correctOrder: ['1', '2', '3'],
    };
    expect(autograde(payload, { type: 'ORDERING', order: ['1', '2', '3'] }, 6).score).toBe(6);
    expect(autograde(payload, { type: 'ORDERING', order: ['1', '3', '2'] }, 6).score).toBe(2);
  });
});

describe('autograde — CLOZE', () => {
  const payload: QuestionPayload = {
    type: 'CLOZE',
    template: { 'uz-Latn': 'Poytaxt [[1]] va daryo [[2]]' },
    blanks: [
      { key: '1', accepted: ['Toshkent'], caseSensitive: false, points: 1 },
      { key: '2', accepted: ['Chirchiq', 'Chirchik'], caseSensitive: false, points: 1 },
    ],
  };

  it("registrga bog'liq bo'lmagan holda solishtiradi", () => {
    const result = autograde(
      payload,
      {
        type: 'CLOZE',
        blanks: [
          { key: '1', value: 'toshkent' },
          { key: '2', value: '  CHIRCHIK ' },
        ],
      },
      4,
    );
    expect(result.score).toBe(4);
  });

  it("bir bo'shliq noto'g'ri bo'lsa qisman ball beradi", () => {
    const result = autograde(
      payload,
      {
        type: 'CLOZE',
        blanks: [
          { key: '1', value: 'Toshkent' },
          { key: '2', value: 'Amudaryo' },
        ],
      },
      4,
    );
    expect(result.score).toBe(2);
  });
});

describe('autograde — NUMERIC, HOTSPOT, DRAG_DROP', () => {
  it('raqamli javobni tolerantlik bilan tekshiradi', () => {
    const payload: QuestionPayload = { type: 'NUMERIC', correctValue: 3.14, tolerance: 0.01 };
    expect(autograde(payload, { type: 'NUMERIC', value: 3.145 }, 2).score).toBe(2);
    expect(autograde(payload, { type: 'NUMERIC', value: 3.2 }, 2).score).toBe(0);
    expect(autograde(payload, { type: 'NUMERIC', value: null }, 2).score).toBe(0);
  });

  it('hotspotda ortiqcha bosishni jarimalaydi', () => {
    const payload: QuestionPayload = {
      type: 'HOTSPOT',
      imageFileId: '00000000-0000-4000-8000-000000000001',
      areas: [
        { id: 'z1', shape: 'RECT', x: 0, y: 0, width: 10, height: 10 },
        { id: 'z2', shape: 'RECT', x: 20, y: 20, width: 10, height: 10 },
      ],
      requiredAreaIds: ['z1'],
    };
    expect(autograde(payload, { type: 'HOTSPOT', areaIds: ['z1'] }, 3).score).toBe(3);
    expect(autograde(payload, { type: 'HOTSPOT', areaIds: ['z1', 'z2'] }, 3).score).toBe(0);
  });

  it('drag-drop joylashuvini baholaydi', () => {
    const payload: QuestionPayload = {
      type: 'DRAG_DROP',
      items: [
        { id: 'i1', text },
        { id: 'i2', text },
      ],
      zones: [
        { id: 'z1', label: text },
        { id: 'z2', label: text },
      ],
      placements: [
        { itemId: 'i1', zoneId: 'z1' },
        { itemId: 'i2', zoneId: 'z2' },
      ],
    };
    const result = autograde(
      payload,
      {
        type: 'DRAG_DROP',
        placements: [
          { itemId: 'i1', zoneId: 'z1' },
          { itemId: 'i2', zoneId: null },
        ],
      },
      4,
    );
    expect(result.score).toBe(2);
  });
});

describe("autograde — qo'lda baholanadigan turlar", () => {
  it("ESSAY uchun qo'lda baholash bayrog'ini qo'yadi", () => {
    const payload: QuestionPayload = {
      type: 'ESSAY',
      minWords: 100,
      maxWords: 500,
      allowAttachments: false,
    };
    const result = autograde(payload, { type: 'ESSAY', text: 'javob', fileIds: [] }, 10);
    expect(result.needsManualGrading).toBe(true);
    expect(result.score).toBe(0);
  });

  it("CODE uchun ham qo'lda baholash talab qiladi", () => {
    const payload: QuestionPayload = {
      type: 'CODE',
      language: 'python',
      starterCode: '',
      testCases: [],
    };
    expect(autograde(payload, { type: 'CODE', code: 'print(1)' }, 10).needsManualGrading).toBe(
      true,
    );
  });
});

describe('resolveAttemptScore', () => {
  it("har bir usul bo'yicha to'g'ri natija beradi", () => {
    const scores = [40, 90, 70];
    expect(resolveAttemptScore(scores, 'HIGHEST')).toBe(90);
    expect(resolveAttemptScore(scores, 'FIRST')).toBe(40);
    expect(resolveAttemptScore(scores, 'LAST')).toBe(70);
    expect(resolveAttemptScore(scores, 'AVERAGE')).toBe(66.67);
    expect(resolveAttemptScore([], 'HIGHEST')).toBe(0);
  });
});

describe('variant generatsiyasi', () => {
  it('bir xil seed bir xil tartibni beradi (apellyatsiya uchun muhim)', () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ questionId: String(i) }));
    const first = selectQuestionsForAttempt(items, [], 5, 42);
    const second = selectQuestionsForAttempt(items, [], 5, 42);
    expect(first.map((q) => q.questionId)).toEqual(second.map((q) => q.questionId));
    expect(first).toHaveLength(5);
  });

  it('turli seed turli tartib beradi', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ questionId: String(i) }));
    const a = selectQuestionsForAttempt(items, [], 10, 1).map((q) => q.questionId);
    const b = selectQuestionsForAttempt(items, [], 10, 2).map((q) => q.questionId);
    expect(a).not.toEqual(b);
  });

  it("pool bo'yicha belgilangan miqdorda savol tanlaydi", () => {
    const items = [
      { questionId: 'a1', poolTag: 'easy' },
      { questionId: 'a2', poolTag: 'easy' },
      { questionId: 'a3', poolTag: 'easy' },
      { questionId: 'b1', poolTag: 'hard' },
      { questionId: 'b2', poolTag: 'hard' },
      { questionId: 'm1' },
    ];
    const selected = selectQuestionsForAttempt(
      items,
      [
        { poolTag: 'easy', take: 2 },
        { poolTag: 'hard', take: 1 },
      ],
      0,
      7,
    );
    expect(selected.filter((q) => q.poolTag === 'easy')).toHaveLength(2);
    expect(selected.filter((q) => q.poolTag === 'hard')).toHaveLength(1);
    // Pool'siz majburiy savol doim qo'shiladi
    expect(selected.some((q) => q.questionId === 'm1')).toBe(true);
  });

  it('shuffle barcha elementlarni saqlaydi', () => {
    const random = createSeededRandom(123);
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input, random);
    expect(result.sort()).toEqual(input);
  });
});
