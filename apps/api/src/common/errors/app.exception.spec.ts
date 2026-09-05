/**
 * Maqsad: xatolik kontraktining testlari (§8).
 *
 * Har bir xatolik kodi to'g'ri HTTP statusga bog'langan bo'lishi va
 * 4 tilda zaxira matnga ega bo'lishi shart.
 */

import { ERROR_CODES, ERROR_HTTP_STATUS, LOCALES } from '@lms/shared';
import { AppException, DEFAULT_MESSAGES } from './app.exception';

describe('AppException', () => {
  it('har bir kod uchun HTTP status aniqlangan', () => {
    for (const code of ERROR_CODES) {
      expect(ERROR_HTTP_STATUS[code]).toBeGreaterThanOrEqual(400);
      expect(ERROR_HTTP_STATUS[code]).toBeLessThan(600);
    }
  });

  it('har bir kod uchun 4 tilda zaxira matn mavjud', () => {
    for (const code of ERROR_CODES) {
      const message = DEFAULT_MESSAGES[code];
      expect(message).toBeDefined();
      for (const locale of LOCALES) {
        expect(message[locale]).toBeTruthy();
      }
    }
  });

  it('notFound 404 qaytaradi', () => {
    const error = AppException.notFound('course', 'abc');
    expect(error.getStatus()).toBe(404);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.messageKey).toBe('errors.not_found.course');
    expect(error.context).toEqual({ resource: 'course', id: 'abc' });
  });

  it('forbidden 403 qaytaradi', () => {
    const error = AppException.forbidden('course:update:own_course');
    expect(error.getStatus()).toBe(403);
    expect(error.code).toBe('FORBIDDEN');
  });

  it('unauthenticated 401 qaytaradi', () => {
    expect(AppException.unauthenticated().getStatus()).toBe(401);
  });

  it('businessRule 422 qaytaradi', () => {
    const error = AppException.businessRule('errors.quiz_closed', { quizId: 'q1' });
    expect(error.getStatus()).toBe(422);
    expect(error.context).toEqual({ quizId: 'q1' });
  });

  it('validation 400 va maydon tafsilotlari bilan', () => {
    const error = AppException.validation([{ field: 'email', code: 'validation.email' }]);
    expect(error.getStatus()).toBe(400);
    expect(error.details).toHaveLength(1);
    expect(error.details?.[0]?.field).toBe('email');
  });

  it('dependencyUnavailable 503 qaytaradi', () => {
    expect(AppException.dependencyUnavailable('hemis').getStatus()).toBe(503);
  });

  it('rate limit uchun Retry-After qiymati saqlanadi', () => {
    const error = new AppException({
      code: 'RATE_LIMITED',
      messageKey: 'errors.rate_limited',
      retryAfterSeconds: 42,
    });
    expect(error.getStatus()).toBe(429);
    expect(error.retryAfterSeconds).toBe(42);
  });

  it("kontekst mijozga chiqmaydigan qo'shimcha ma'lumot saqlaydi", () => {
    const error = AppException.notFound('user', 'secret-id');
    // `context` faqat loglar uchun — javob konvertiga qo'shilmaydi
    expect(error.context).toBeDefined();
  });
});
