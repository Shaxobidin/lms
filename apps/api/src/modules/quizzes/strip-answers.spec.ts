/**
 * Maqsad: to'g'ri javoblar mijozga sizib chiqmasligini kafolatlash (F-07, §11).
 *
 * Har bir savol turi uchun natija JSON i "taqiqlangan kalitlar" bo'yicha
 * tekshiriladi. Bu testlar buzilsa — imtihon tizimi ishonchsiz bo'ladi.
 */

import { createSeededRandom, type QuestionPayload } from '@lms/shared';
import { stripAnswers } from './strip-answers';

const text = { 'uz-Latn': 'matn' };
const random = createSeededRandom(42);

/** Natija ichida bu kalitlar HECH QACHON bo'lmasligi kerak. */
const FORBIDDEN_KEYS = [
  'isCorrect',
  'correctValue',
  'correctOrder',
  'accepted',
  'pairs',
  'placements',
  'requiredAreaIds',
  'testCases',
  'gradingHint',
  'tolerance',
  'weight',
];

function assertNoLeak(result: unknown): void {
  const json = JSON.stringify(result);
  for (const key of FORBIDDEN_KEYS) {
    expect(json).not.toContain(`"${key}"`);
  }
}

describe('stripAnswers — javob sizib chiqishiga qarshi himoya', () => {
  it('SINGLE: isCorrect olib tashlanadi', () => {
    const payload: QuestionPayload = {
      type: 'SINGLE',
      options: [
        { id: 'a', text, isCorrect: true, weight: 1 },
        { id: 'b', text, isCorrect: false, weight: 0 },
      ],
    };

    const result = stripAnswers(payload, false, random) as { options: unknown[] };
    assertNoLeak(result);
    expect(result.options).toHaveLength(2);
  });

  it("MULTI: barcha variantlar qoladi, javoblar yo'q", () => {
    const payload: QuestionPayload = {
      type: 'MULTI',
      penalizeWrong: true,
      options: [
        { id: 'a', text, isCorrect: true, weight: 1 },
        { id: 'b', text, isCorrect: true, weight: 1 },
        { id: 'c', text, isCorrect: false, weight: 0 },
      ],
    };

    const result = stripAnswers(payload, false, random) as { options: unknown[] };
    assertNoLeak(result);
    expect(result.options).toHaveLength(3);
  });

  it("MATCHING: to'g'ri juftliklar yuborilmaydi", () => {
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

    const result = stripAnswers(payload, true, random) as { left: unknown[]; right: unknown[] };
    assertNoLeak(result);
    expect(result.left).toHaveLength(2);
    expect(result.right).toHaveLength(2);
  });

  it("ORDERING: to'g'ri tartib yuborilmaydi va elementlar aralashtiriladi", () => {
    const payload: QuestionPayload = {
      type: 'ORDERING',
      items: [
        { id: '1', text },
        { id: '2', text },
        { id: '3', text },
        { id: '4', text },
        { id: '5', text },
      ],
      correctOrder: ['1', '2', '3', '4', '5'],
    };

    const result = stripAnswers(payload, true, createSeededRandom(7)) as {
      items: Array<{ id: string }>;
    };
    assertNoLeak(result);
    expect(result.items).toHaveLength(5);
    // Aralashtirilgan tartib asl tartibdan farq qilishi kerak
    expect(result.items.map((item) => item.id)).not.toEqual(['1', '2', '3', '4', '5']);
  });

  it('CLOZE: qabul qilinadigan javoblar yuborilmaydi', () => {
    const payload: QuestionPayload = {
      type: 'CLOZE',
      template: { 'uz-Latn': 'Poytaxt [[1]]' },
      blanks: [{ key: '1', accepted: ['Toshkent'], caseSensitive: false, points: 1 }],
    };

    const result = stripAnswers(payload, false, random) as { blanks: Array<{ key: string }> };
    assertNoLeak(result);
    expect(result.blanks).toEqual([{ key: '1' }]);
    expect(JSON.stringify(result)).not.toContain('Toshkent');
  });

  it("NUMERIC: to'g'ri qiymat va tolerantlik yuborilmaydi", () => {
    const payload: QuestionPayload = {
      type: 'NUMERIC',
      correctValue: 78.5,
      tolerance: 0.5,
      unit: 'sm²',
    };

    const result = stripAnswers(payload, false, random);
    assertNoLeak(result);
    expect(JSON.stringify(result)).not.toContain('78.5');
    expect(JSON.stringify(result)).toContain('sm²');
  });

  it("HOTSPOT: to'g'ri sohalar ro'yxati yuborilmaydi", () => {
    const payload: QuestionPayload = {
      type: 'HOTSPOT',
      imageFileId: '00000000-0000-4000-8000-000000000001',
      areas: [
        { id: 'z1', shape: 'RECT', x: 0, y: 0, width: 10, height: 10 },
        { id: 'z2', shape: 'CIRCLE', x: 50, y: 50, radius: 5 },
      ],
      requiredAreaIds: ['z1'],
    };

    const result = stripAnswers(payload, false, random) as { areas: unknown[] };
    assertNoLeak(result);
    expect(result.areas).toHaveLength(2);
  });

  it("DRAG_DROP: to'g'ri joylashuv yuborilmaydi", () => {
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

    const result = stripAnswers(payload, false, random) as { items: unknown[]; zones: unknown[] };
    assertNoLeak(result);
    expect(result.items).toHaveLength(2);
    expect(result.zones).toHaveLength(2);
  });

  it("ESSAY: baholash ko'rsatmasi yuborilmaydi", () => {
    const payload: QuestionPayload = {
      type: 'ESSAY',
      minWords: 300,
      maxWords: 500,
      allowAttachments: false,
      gradingHint: { 'uz-Latn': "Argumentlarga e'tibor bering" },
    };

    const result = stripAnswers(payload, false, random) as { minWords: number };
    assertNoLeak(result);
    expect(result.minWords).toBe(300);
    expect(JSON.stringify(result)).not.toContain('Argumentlarga');
  });

  it('CODE: test holatlari yuborilmaydi', () => {
    const payload: QuestionPayload = {
      type: 'CODE',
      language: 'python',
      starterCode: 'def f():\n    pass',
      testCases: [{ input: '[1,2]', expected: '3' }],
    };

    const result = stripAnswers(payload, false, random) as { starterCode: string };
    assertNoLeak(result);
    expect(result.starterCode).toContain('def f()');
    expect(JSON.stringify(result)).not.toContain('expected');
  });

  it("aralashtirish urug' bo'yicha takrorlanadi (apellyatsiya uchun)", () => {
    const payload: QuestionPayload = {
      type: 'SINGLE',
      options: Array.from({ length: 6 }, (_, index) => ({
        id: `o${index}`,
        text,
        isCorrect: index === 0,
        weight: 0,
      })),
    };

    const first = stripAnswers(payload, true, createSeededRandom(99)) as {
      options: Array<{ id: string }>;
    };
    const second = stripAnswers(payload, true, createSeededRandom(99)) as {
      options: Array<{ id: string }>;
    };

    expect(first.options.map((o) => o.id)).toEqual(second.options.map((o) => o.id));
  });
});
