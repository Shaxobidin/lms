/**
 * Maqsad: baholash domen qoidalarining testlari (F-08).
 * Bu qoidalar diplom va reyting varaqasiga ta'sir qiladi — xatoga yo'l qo'yib bo'lmaydi.
 */

import { describe, expect, it } from 'vitest';
import {
  analyzeItem,
  applyLatePenalty,
  calculateFinalGrade,
  calculateGpa,
  DEFAULT_GRADING_POLICY,
  resolveBand,
  round2,
} from './grading';

describe('resolveBand', () => {
  it('100 ballni A+ sifatida baholaydi', () => {
    expect(resolveBand(100).letter).toBe('A+');
    expect(resolveBand(100).gpa).toBe(4);
  });

  it("saralash chegarasidagi qiymatlarni to'g'ri ajratadi", () => {
    expect(resolveBand(60).letter).toBe('C');
    expect(resolveBand(59.99).letter).toBe('F');
    expect(resolveBand(59.99).gpa).toBe(0);
  });

  it('diapazondan tashqaridagi qiymatni cheklaydi', () => {
    expect(resolveBand(-10).letter).toBe('F');
    expect(resolveBand(140).letter).toBe('A+');
  });
});

describe('calculateFinalGrade', () => {
  it("JN/ON/YN og'irliklari bo'yicha yakuniy ballni hisoblaydi", () => {
    const result = calculateFinalGrade([
      { controlType: 'JN', earned: 27, max: 30 }, // 90%
      { controlType: 'ON', earned: 24, max: 30 }, // 80%
      { controlType: 'YN', earned: 35, max: 50 }, // 70%
    ]);

    // 90*0.3 + 80*0.3 + 70*0.4 = 27 + 24 + 28 = 79
    expect(result.score).toBe(79);
    expect(result.letter).toBe('B');
    expect(result.passed).toBe(true);
  });

  it("o'tkazilmagan nazorat turlarini hisobga olmaydi va og'irliklarni qayta normallashtiradi", () => {
    // Faqat JN topshirilgan: 90% -> yakuniy ball ham 90 bo'lishi kerak
    const result = calculateFinalGrade([{ controlType: 'JN', earned: 9, max: 10 }]);
    expect(result.score).toBe(90);
  });

  it("YN ga kirish huquqini JN+ON chegarasi bo'yicha aniqlaydi", () => {
    const low = calculateFinalGrade([
      { controlType: 'JN', earned: 5, max: 30 },
      { controlType: 'ON', earned: 5, max: 30 },
    ]);
    expect(low.eligibleForFinal).toBe(false);

    const high = calculateFinalGrade([
      { controlType: 'JN', earned: 24, max: 30 },
      { controlType: 'ON', earned: 24, max: 30 },
    ]);
    expect(high.eligibleForFinal).toBe(true);
  });

  it("hech qanday baho bo'lmasa 0 qaytaradi va yiqilgan deb belgilaydi", () => {
    const result = calculateFinalGrade([]);
    expect(result.score).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.letter).toBe('F');
  });

  it("max = 0 bo'lgan yozuvda nolga bo'linishga yo'l qo'ymaydi", () => {
    const result = calculateFinalGrade([{ controlType: 'JN', earned: 10, max: 0 }]);
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBe(0);
  });

  it("YN uchun minimal ball talabi bajarilmasa o'zlashtirmagan deb belgilaydi", () => {
    const policy = { ...DEFAULT_GRADING_POLICY, finalExamMinScore: 55 };
    const result = calculateFinalGrade(
      [
        { controlType: 'JN', earned: 30, max: 30 },
        { controlType: 'ON', earned: 30, max: 30 },
        { controlType: 'YN', earned: 20, max: 40 }, // 50% < 55%
      ],
      policy,
    );
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(result.passed).toBe(false);
  });
});

describe('calculateGpa', () => {
  it("kreditlar bo'yicha og'irlangan o'rtachani hisoblaydi", () => {
    // 6 kredit A (4.0) + 3 kredit C (2.0) = (24 + 6) / 9 = 3.33
    expect(
      calculateGpa([
        { credits: 6, score: 90 },
        { credits: 3, score: 62 },
      ]),
    ).toBe(3.33);
  });

  it('kreditsiz fanlarni hisobga olmaydi', () => {
    expect(
      calculateGpa([
        { credits: 0, score: 100 },
        { credits: 4, score: 75 },
      ]),
    ).toBe(3);
  });

  it("bo'sh ro'yxatda 0 qaytaradi", () => {
    expect(calculateGpa([])).toBe(0);
  });
});

describe('applyLatePenalty', () => {
  const due = new Date('2026-09-10T12:00:00Z');
  const lateUntil = new Date('2026-09-12T12:00:00Z');

  it("muddatida topshirilgan ishga jarima qo'llamaydi", () => {
    expect(applyLatePenalty(90, new Date('2026-09-10T11:00:00Z'), due, lateUntil, 10)).toBe(90);
  });

  it("kechikkan ishga jarima qo'llaydi", () => {
    expect(applyLatePenalty(90, new Date('2026-09-11T11:00:00Z'), due, lateUntil, 10)).toBe(81);
  });

  it("kechikish muddati o'tgan ishni qabul qilmaydi", () => {
    expect(applyLatePenalty(90, new Date('2026-09-13T11:00:00Z'), due, lateUntil, 10)).toBeNull();
  });

  it("lateUntil null bo'lsa kechikkan ishni jarima bilan qabul qiladi", () => {
    expect(applyLatePenalty(100, new Date('2026-10-01T00:00:00Z'), due, null, 50)).toBe(50);
  });
});

describe('analyzeItem', () => {
  it('kichik namunada diskriminatsiyani hisoblamaydi', () => {
    const result = analyzeItem({
      attempts: [
        { totalPercent: 90, correct: true },
        { totalPercent: 40, correct: false },
      ],
    });
    expect(result.sampleSize).toBe(2);
    expect(result.discriminationIndex).toBe(0);
    expect(result.facilityIndex).toBe(0.5);
  });

  it('yaxshi savolda musbat diskriminatsiya beradi', () => {
    const attempts = [
      ...Array.from({ length: 10 }, (_, i) => ({ totalPercent: 90 - i, correct: true })),
      ...Array.from({ length: 10 }, (_, i) => ({ totalPercent: 40 - i, correct: false })),
    ];
    const result = analyzeItem({ attempts });
    expect(result.facilityIndex).toBe(0.5);
    expect(result.discriminationIndex).toBeGreaterThan(0.5);
    expect(result.needsReview).toBe(false);
  });

  it("hamma to'g'ri javob bergan savolni qayta ko'rib chiqishga belgilaydi", () => {
    const attempts = Array.from({ length: 20 }, (_, i) => ({
      totalPercent: 100 - i,
      correct: true,
    }));
    const result = analyzeItem({ attempts });
    expect(result.facilityIndex).toBe(1);
    expect(result.needsReview).toBe(true);
  });
});

describe('round2', () => {
  it("suzuvchi nuqta xatoliklarini yo'qotadi", () => {
    expect(round2(1.005)).toBe(1.01);
    expect(round2(0.1 + 0.2)).toBe(0.3);
  });
});
