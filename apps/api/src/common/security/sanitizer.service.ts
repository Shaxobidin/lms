/**
 * Maqsad: foydalanuvchi kiritgan HTML ni XSS dan tozalash (§11).
 *
 * Qoida: kontent BAZAGA TOZALANGAN holda yoziladi (yozishda tozalash), chunki
 * o'qish har doim yozishdan ko'p marta sodir bo'ladi. Frontend ham CSP bilan
 * himoyalangan — ikki qatlamli mudofaa.
 */

import { Injectable } from '@nestjs/common';
import createDomPurify from 'dompurify';
import { JSDOM } from 'jsdom';

/**
 * Server tomonida DOM mavjud emas, shuning uchun DOMPurify uchun bitta
 * JSDOM oynasi yaratiladi va qayta ishlatiladi. Har bir chaqiruvda yangi
 * oyna yaratish qimmat bo'lardi (NF-01).
 *
 * `isomorphic-dompurify` o'rniga to'g'ridan-to'g'ri kutubxonalar ishlatiladi:
 * bu bog'liqlik zanjirini qisqartiradi va test muhitida ham bir xil ishlaydi.
 */
const DOMPurify = createDomPurify(new JSDOM('').window as unknown as Window & typeof globalThis);

/** Dars kontenti va forum postlarida ruxsat etilgan teglar. */
const ALLOWED_TAGS = [
  'p',
  'br',
  'hr',
  'span',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'mark',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'code',
  'table',
  'thead',
  'tbody',
  'tfoot',
  'tr',
  'th',
  'td',
  'caption',
  'a',
  'img',
  'figure',
  'figcaption',
  'video',
  'audio',
  'source',
  'track',
  'details',
  'summary',
];

const ALLOWED_ATTR = [
  'href',
  'target',
  'rel',
  'title',
  'src',
  'alt',
  'width',
  'height',
  'poster',
  'controls',
  'preload',
  'class',
  'colspan',
  'rowspan',
  'start',
  'type',
  'data-lang',
];

@Injectable()
export class SanitizerService {
  /**
   * To'liq HTML tozalash. `javascript:` sxemasi, hodisa atributlari (`onclick`),
   * `<script>`, `<iframe>` va `<style>` olib tashlanadi.
   */
  sanitizeHtml(dirty: string | null | undefined): string {
    if (!dirty) return '';
    return DOMPurify.sanitize(dirty, {
      ALLOWED_TAGS,
      ALLOWED_ATTR,
      ALLOW_DATA_ATTR: false,
      // Havolalar faqat xavfsiz sxemalarda
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|\/|#)/i,
      FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input'],
      FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'style', 'formaction'],
    });
  }

  /** Faqat matn kerak bo'lganda (bildirishnoma, qidiruv indeksi, DOCX eksport). */
  stripHtml(dirty: string | null | undefined): string {
    if (!dirty) return '';
    const text = DOMPurify.sanitize(dirty, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return text.replace(/\s+/g, ' ').trim();
  }

  /** Ko'p tilli obyektning har bir qiymatini tozalaydi. */
  sanitizeLocalized(
    value: Record<string, string | undefined> | null | undefined,
  ): Record<string, string> {
    if (!value) return {};
    const result: Record<string, string> = {};
    for (const [locale, text] of Object.entries(value)) {
      if (typeof text === 'string' && text.trim()) {
        result[locale] = this.sanitizeHtml(text);
      }
    }
    return result;
  }

  /**
   * CSV/XLSX eksportida formula in'yeksiyasini oldini oladi.
   * `=`, `+`, `-`, `@` bilan boshlanadigan qiymat Excel'da formula sifatida
   * bajarilishi mumkin — shuning uchun apostrof qo'shiladi.
   */
  escapeSpreadsheetValue(value: string): string {
    if (!value) return value;
    return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  }
}
