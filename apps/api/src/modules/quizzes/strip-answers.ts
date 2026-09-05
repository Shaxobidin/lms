/**
 * Maqsad: savol payload'idan TO'G'RI JAVOBLARNI olib tashlash (F-07).
 *
 * Bu fayl xavfsizlik uchun kritik: agar u to'g'ri ishlamasa, talaba brauzer
 * konsolida yoki tarmoq panelida javoblarni ko'ra oladi va imtihon
 * ma'nosini yo'qotadi.
 *
 * Sof funksiya sifatida ajratilgan — shuning uchun har bir savol turi
 * bo'yicha alohida test bilan qoplanadi.
 */

import { shuffle, type QuestionPayload } from '@lms/shared';

export function stripAnswers(
  payload: QuestionPayload,
  shuffleOptions: boolean,
  random: () => number,
): unknown {
  switch (payload.type) {
    case 'SINGLE':
    case 'MULTI': {
      // `isCorrect` va `weight` OLIB TASHLANADI
      const options = payload.options.map((option) => ({ id: option.id, text: option.text }));
      return {
        type: payload.type,
        options: shuffleOptions ? shuffle(options, random) : options,
      };
    }

    case 'MATCHING':
      // `pairs` (to'g'ri juftliklar) yuborilmaydi
      return {
        type: payload.type,
        left: payload.left,
        right: shuffleOptions ? shuffle(payload.right, random) : payload.right,
      };

    case 'ORDERING':
      // `correctOrder` yuborilmaydi; elementlar doim aralashtiriladi
      return { type: payload.type, items: shuffle(payload.items, random) };

    case 'CLOZE':
      // `accepted` (qabul qilinadigan javoblar) yuborilmaydi
      return {
        type: payload.type,
        template: payload.template,
        blanks: payload.blanks.map((blank) => ({ key: blank.key })),
      };

    case 'ESSAY':
      // `gradingHint` faqat o'qituvchi uchun
      return {
        type: payload.type,
        minWords: payload.minWords,
        maxWords: payload.maxWords,
        allowAttachments: payload.allowAttachments,
      };

    case 'NUMERIC':
      // `correctValue` va `tolerance` yuborilmaydi
      return { type: payload.type, unit: payload.unit };

    case 'HOTSPOT':
      // `requiredAreaIds` yuborilmaydi
      return {
        type: payload.type,
        imageFileId: payload.imageFileId,
        areas: payload.areas.map((area) => ({
          id: area.id,
          shape: area.shape,
          x: area.x,
          y: area.y,
          width: area.width,
          height: area.height,
          radius: area.radius,
        })),
      };

    case 'DRAG_DROP':
      // `placements` (to'g'ri joylashuv) yuborilmaydi
      return {
        type: payload.type,
        items: shuffleOptions ? shuffle(payload.items, random) : payload.items,
        zones: payload.zones,
      };

    case 'CODE':
      // `testCases` va `gradingHint` yuborilmaydi
      return {
        type: payload.type,
        language: payload.language,
        starterCode: payload.starterCode,
      };

    default: {
      // Yangi savol turi qo'shilsa TypeScript shu yerda xato beradi —
      // ya'ni javob sizib chiqishi kompilyatsiya bosqichida ushlanadi
      const exhaustive: never = payload;
      void exhaustive;
      return {};
    }
  }
}
