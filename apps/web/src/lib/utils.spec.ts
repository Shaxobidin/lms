/**
 * Maqsad: UI yordamchilarining sof mantig'ini tekshirish.
 *
 * Bu funksiyalar butun interfeys bo'ylab ishlatiladi (sana formati, taymer,
 * ball ranglari), shuning uchun ularning xatosi ko'p sahifada bir vaqtda
 * ko'rinadi — unit test bilan qoplanadi.
 */

import { describe, expect, it } from 'vitest';
import {
  cn,
  deadlineColorClass,
  formatDate,
  formatDateTime,
  formatDuration,
  initials,
  localize,
  scoreColorClass,
} from './utils';

describe('cn', () => {
  it('ziddiyatli Tailwind sinflarida oxirgisini qoldiradi', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('shartli sinflarni qo`shadi va bo`shlarini tashlab ketadi', () => {
    const isHidden = [].length > 0;
    expect(cn('flex', isHidden && 'hidden', undefined, 'gap-2')).toBe('flex gap-2');
  });
});

describe('localize', () => {
  it('oddiy satrni o`zgarishsiz qaytaradi', () => {
    expect(localize('Matematika', 'uz-Latn')).toBe('Matematika');
  });

  it('ko`p tilli obyektdan joriy tilni tanlaydi', () => {
    const value = { 'uz-Latn': 'Fizika', ru: 'Физика', en: 'Physics' };
    expect(localize(value, 'ru')).toBe('Физика');
    expect(localize(value, 'en')).toBe('Physics');
  });

  it('qiymat bo`lmasa fallback qaytaradi', () => {
    expect(localize(null, 'uz-Latn')).toBe('—');
    expect(localize(undefined, 'uz-Latn', 'yo`q')).toBe('yo`q');
    expect(localize('', 'uz-Latn')).toBe('—');
  });
});

describe('formatDate / formatDateTime', () => {
  it('qiymat bo`lmasa chiziqcha qaytaradi', () => {
    expect(formatDate(null, 'uz-Latn')).toBe('—');
    expect(formatDateTime(undefined, 'ru')).toBe('—');
  });

  it('Toshkent vaqt mintaqasida formatlaydi (NF-08)', () => {
    // 2026-09-04T20:30:00Z = Toshkentda 5-sentyabr 01:30 (UTC+5)
    const formatted = formatDateTime('2026-09-04T20:30:00.000Z', 'en');
    expect(formatted).toContain('5');
    expect(formatted).toContain('01:30');
  });

  it('sana tilga qarab o`zgaradi', () => {
    const iso = '2026-03-15T09:00:00.000Z';
    expect(formatDate(iso, 'en')).not.toBe(formatDate(iso, 'ru'));
  });
});

describe('formatDuration', () => {
  it('bir soatdan kam vaqtni MM:SS ko`rinishida beradi', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(65)).toBe('01:05');
    expect(formatDuration(3599)).toBe('59:59');
  });

  it('bir soatdan ko`p vaqtni HH:MM:SS ko`rinishida beradi', () => {
    expect(formatDuration(3600)).toBe('01:00:00');
    expect(formatDuration(7325)).toBe('02:02:05');
  });

  it('manfiy qiymatni nolga tenglashtiradi (taymer tugagan holat)', () => {
    expect(formatDuration(-42)).toBe('00:00');
  });

  it('kasr sekundlarni pastga yaxlitlaydi', () => {
    expect(formatDuration(59.9)).toBe('00:59');
  });
});

describe('initials', () => {
  it('familiya va ismdan ikki harf oladi', () => {
    expect(initials('Aliyev Sardor')).toBe('AS');
  });

  it('uchinchi so`zni hisobga olmaydi', () => {
    expect(initials('Aliyev Sardor Baxtiyorovich')).toBe('AS');
  });

  it('ortiqcha bo`shliqlarga chidamli', () => {
    expect(initials('  Karimova   Nilufar ')).toBe('KN');
  });

  it('bo`sh satrda bo`sh natija beradi', () => {
    expect(initials('')).toBe('');
  });
});

describe('scoreColorClass', () => {
  it('a`lo, qoniqarli va qoniqarsiz chegaralarini ajratadi', () => {
    expect(scoreColorClass(86)).toBe('text-success');
    expect(scoreColorClass(100)).toBe('text-success');
    expect(scoreColorClass(85)).toBe('text-foreground');
    expect(scoreColorClass(60)).toBe('text-foreground');
    expect(scoreColorClass(59)).toBe('text-destructive');
  });
});

describe('deadlineColorClass', () => {
  it('muddat yo`q bo`lsa neytral rang', () => {
    expect(deadlineColorClass(null)).toBe('text-muted-foreground');
  });

  it('o`tib ketgan muddat qizil', () => {
    expect(deadlineColorClass(new Date(Date.now() - 60_000))).toBe('text-destructive');
  });

  it('bir kundan kam qolgan muddat sariq', () => {
    expect(deadlineColorClass(new Date(Date.now() + 3_600_000))).toBe('text-warning');
  });

  it('uzoq muddat neytral', () => {
    expect(deadlineColorClass(new Date(Date.now() + 5 * 86_400_000))).toBe('text-muted-foreground');
  });
});
