/**
 * Maqsad: bildirishnoma matnlari — 4 tilda (F-10, F-18, P7).
 *
 * Backend faqat `templateKey` va parametrlarni saqlaydi; matn shu yerda,
 * yuborish paytida, foydalanuvchining tilida hosil qilinadi.
 * Yangi til qo'shish uchun faqat shu katalogga qator qo'shiladi.
 */

import { Injectable } from '@nestjs/common';
import { DEFAULT_LOCALE, LOCALE_FALLBACK, type Locale } from '@lms/shared';

export interface RenderedMessage {
  subject: string;
  body: string;
}

type TemplateFn = (params: Record<string, unknown>) => RenderedMessage;

/** Har bir kalit uchun 4 ta til — CI testi to'liqlikni tekshiradi. */
const TEMPLATES: Record<string, Partial<Record<Locale, TemplateFn>>> = {
  'email.verify_address': {
    'uz-Latn': (p) => ({
      subject: 'Email manzilingizni tasdiqlang',
      body: `Assalomu alaykum, ${p['firstName'] ?? ''}!\n\nRo'yxatdan o'tishni yakunlash uchun quyidagi havolaga o'ting:\n${p['link']}\n\nHavola 24 soat amal qiladi.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: 'Электрон почта манзилингизни тасдиқланг',
      body: `Ассалому алайкум, ${p['firstName'] ?? ''}!\n\nРўйхатдан ўтишни якунлаш учун қуйидаги ҳаволага ўтинг:\n${p['link']}\n\nҲавола 24 соат амал қилади.`,
    }),
    ru: (p) => ({
      subject: 'Подтвердите адрес электронной почты',
      body: `Здравствуйте, ${p['firstName'] ?? ''}!\n\nДля завершения регистрации перейдите по ссылке:\n${p['link']}\n\nСсылка действительна 24 часа.`,
    }),
    en: (p) => ({
      subject: 'Confirm your email address',
      body: `Hello, ${p['firstName'] ?? ''}!\n\nPlease follow this link to complete registration:\n${p['link']}\n\nThe link is valid for 24 hours.`,
    }),
  },

  'email.reset_password': {
    'uz-Latn': (p) => ({
      subject: 'Parolni tiklash',
      body: `Assalomu alaykum, ${p['firstName'] ?? ''}!\n\nParolni tiklash uchun havola:\n${p['link']}\n\nHavola 1 soat amal qiladi. Agar siz so'ramagan bo'lsangiz, ushbu xatga e'tibor bermang.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: 'Паролни тиклаш',
      body: `Ассалому алайкум, ${p['firstName'] ?? ''}!\n\nПаролни тиклаш учун ҳавола:\n${p['link']}\n\nҲавола 1 соат амал қилади.`,
    }),
    ru: (p) => ({
      subject: 'Восстановление пароля',
      body: `Здравствуйте, ${p['firstName'] ?? ''}!\n\nСсылка для восстановления пароля:\n${p['link']}\n\nСсылка действительна 1 час.`,
    }),
    en: (p) => ({
      subject: 'Password reset',
      body: `Hello, ${p['firstName'] ?? ''}!\n\nUse this link to reset your password:\n${p['link']}\n\nThe link is valid for 1 hour.`,
    }),
  },

  'email.account_created': {
    'uz-Latn': (p) => ({
      subject: 'QDU LMS: hisobingiz yaratildi',
      body: `Assalomu alaykum, ${p['firstName'] ?? ''}!\n\nSiz uchun hisob yaratildi.\nLogin: ${p['email']}\nVaqtinchalik parol: ${p['temporaryPassword']}\n\nBirinchi kirishdan keyin parolni almashtiring.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: 'ҚДУ LMS: ҳисобингиз яратилди',
      body: `Ассалому алайкум, ${p['firstName'] ?? ''}!\n\nСиз учун ҳисоб яратилди.\nЛогин: ${p['email']}\nВақтинчалик парол: ${p['temporaryPassword']}\n\nБиринчи киришдан кейин паролни алмаштиринг.`,
    }),
    ru: (p) => ({
      subject: 'QDU LMS: учётная запись создана',
      body: `Здравствуйте, ${p['firstName'] ?? ''}!\n\nДля вас создана учётная запись.\nЛогин: ${p['email']}\nВременный пароль: ${p['temporaryPassword']}\n\nСмените пароль после первого входа.`,
    }),
    en: (p) => ({
      subject: 'QDU LMS: your account is ready',
      body: `Hello, ${p['firstName'] ?? ''}!\n\nAn account has been created for you.\nLogin: ${p['email']}\nTemporary password: ${p['temporaryPassword']}\n\nPlease change it after your first sign-in.`,
    }),
  },

  'notification.announcement': {
    'uz-Latn': (p) => ({
      subject: "Yangi e'lon",
      body: `${localized(p['title'], 'uz-Latn')}`,
    }),
    'uz-Cyrl': (p) => ({
      subject: 'Янги эълон',
      body: `${localized(p['title'], 'uz-Cyrl')}`,
    }),
    ru: (p) => ({ subject: 'Новое объявление', body: `${localized(p['title'], 'ru')}` }),
    en: (p) => ({ subject: 'New announcement', body: `${localized(p['title'], 'en')}` }),
  },

  'notification.forum_reply': {
    'uz-Latn': () => ({
      subject: 'Forumda yangi javob',
      body: 'Siz ochgan mavzuga yangi javob yozildi.',
    }),
    'uz-Cyrl': () => ({
      subject: 'Форумда янги жавоб',
      body: 'Сиз очган мавзуга янги жавоб ёзилди.',
    }),
    ru: () => ({ subject: 'Новый ответ на форуме', body: 'В вашей теме появился новый ответ.' }),
    en: () => ({ subject: 'New forum reply', body: 'Your thread has a new reply.' }),
  },

  'notification.new_message': {
    'uz-Latn': () => ({ subject: 'Yangi xabar', body: 'Sizga yangi shaxsiy xabar keldi.' }),
    'uz-Cyrl': () => ({ subject: 'Янги хабар', body: 'Сизга янги шахсий хабар келди.' }),
    ru: () => ({ subject: 'Новое сообщение', body: 'Вам пришло новое личное сообщение.' }),
    en: () => ({ subject: 'New message', body: 'You have received a new private message.' }),
  },

  'notification.syllabus_approve': {
    'uz-Latn': (p) => ({
      subject: 'Sillabus tasdiqlandi',
      body: `"${localized(p['subjectName'], 'uz-Latn')}" fani sillabusi tasdiqlandi.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: 'Силлабус тасдиқланди',
      body: `"${localized(p['subjectName'], 'uz-Cyrl')}" фани силлабуси тасдиқланди.`,
    }),
    ru: (p) => ({
      subject: 'Силлабус утверждён',
      body: `Силлабус по предмету "${localized(p['subjectName'], 'ru')}" утверждён.`,
    }),
    en: (p) => ({
      subject: 'Syllabus approved',
      body: `The syllabus for "${localized(p['subjectName'], 'en')}" has been approved.`,
    }),
  },

  'notification.syllabus_reject': {
    'uz-Latn': (p) => ({
      subject: 'Sillabus qaytarildi',
      body: `"${localized(p['subjectName'], 'uz-Latn')}" sillabusi qayta ishlashga qaytarildi.\nIzoh: ${p['comment'] ?? '—'}`,
    }),
    'uz-Cyrl': (p) => ({
      subject: 'Силлабус қайтарилди',
      body: `"${localized(p['subjectName'], 'uz-Cyrl')}" силлабуси қайта ишлашга қайтарилди.\nИзоҳ: ${p['comment'] ?? '—'}`,
    }),
    ru: (p) => ({
      subject: 'Силлабус возвращён',
      body: `Силлабус "${localized(p['subjectName'], 'ru')}" возвращён на доработку.\nКомментарий: ${p['comment'] ?? '—'}`,
    }),
    en: (p) => ({
      subject: 'Syllabus returned',
      body: `The syllabus "${localized(p['subjectName'], 'en')}" was returned for revision.\nComment: ${p['comment'] ?? '—'}`,
    }),
  },

  'notification.syllabus_submit': {
    'uz-Latn': () => ({
      subject: "Sillabus ko'rib chiqishga yuborildi",
      body: 'Sillabus tasdiqlash uchun yuborildi.',
    }),
    'uz-Cyrl': () => ({
      subject: 'Силлабус кўриб чиқишга юборилди',
      body: 'Силлабус тасдиқлаш учун юборилди.',
    }),
    ru: () => ({
      subject: 'Силлабус отправлен на проверку',
      body: 'Силлабус отправлен на утверждение.',
    }),
    en: () => ({ subject: 'Syllabus submitted', body: 'The syllabus was submitted for approval.' }),
  },

  'notification.report_ready': {
    'uz-Latn': () => ({
      subject: 'Hisobot tayyor',
      body: "So'ralgan hisobot yuklab olishga tayyor.",
    }),
    'uz-Cyrl': () => ({ subject: 'Ҳисобот тайёр', body: 'Сўралган ҳисобот юклаб олишга тайёр.' }),
    ru: () => ({ subject: 'Отчёт готов', body: 'Запрошенный отчёт готов к скачиванию.' }),
    en: () => ({ subject: 'Report ready', body: 'Your requested report is ready to download.' }),
  },

  'sms.otp.login': {
    'uz-Latn': (p) => ({
      subject: '',
      body: `QDU LMS: kirish kodi ${p['code']}. Kod ${p['minutes']} daqiqa amal qiladi. Hech kimga bermang.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: '',
      body: `ҚДУ LMS: кириш коди ${p['code']}. Код ${p['minutes']} дақиқа амал қилади.`,
    }),
    ru: (p) => ({
      subject: '',
      body: `QDU LMS: код входа ${p['code']}. Действует ${p['minutes']} мин. Никому не сообщайте.`,
    }),
    en: (p) => ({
      subject: '',
      body: `QDU LMS: your sign-in code is ${p['code']}. Valid for ${p['minutes']} minutes.`,
    }),
  },

  'sms.otp.verify_phone': {
    'uz-Latn': (p) => ({
      subject: '',
      body: `QDU LMS: telefon raqamini tasdiqlash kodi ${p['code']}.`,
    }),
    'uz-Cyrl': (p) => ({
      subject: '',
      body: `ҚДУ LMS: телефон рақамини тасдиқлаш коди ${p['code']}.`,
    }),
    ru: (p) => ({ subject: '', body: `QDU LMS: код подтверждения номера ${p['code']}.` }),
    en: (p) => ({ subject: '', body: `QDU LMS: phone verification code ${p['code']}.` }),
  },

  'sms.otp.reset_password': {
    'uz-Latn': (p) => ({ subject: '', body: `QDU LMS: parolni tiklash kodi ${p['code']}.` }),
    'uz-Cyrl': (p) => ({ subject: '', body: `ҚДУ LMS: паролни тиклаш коди ${p['code']}.` }),
    ru: (p) => ({ subject: '', body: `QDU LMS: код восстановления пароля ${p['code']}.` }),
    en: (p) => ({ subject: '', body: `QDU LMS: password reset code ${p['code']}.` }),
  },
};

@Injectable()
export class NotificationTemplates {
  /**
   * Shablonni foydalanuvchi tilida render qiladi.
   * Til topilmasa fallback zanjiri bo'yicha izlanadi (hech qachon bo'sh qaytmaydi).
   */
  render(templateKey: string, locale: string, params: Record<string, unknown>): RenderedMessage {
    const template = TEMPLATES[templateKey];
    if (!template) {
      // Noma'lum kalit — kalitning o'zi qaytariladi, xatolik tashlanmaydi:
      // bildirishnoma yuborilmay qolgandan ko'ra kalit bilan kelgani yaxshi
      return { subject: templateKey, body: templateKey };
    }

    const requested = (locale as Locale) in LOCALE_FALLBACK ? (locale as Locale) : DEFAULT_LOCALE;
    for (const candidate of LOCALE_FALLBACK[requested]) {
      const fn = template[candidate];
      if (fn) return fn(params);
    }

    return { subject: templateKey, body: templateKey };
  }

  /** CI testi uchun: barcha kalitlar va tillar ro'yxati. */
  static describe(): Record<string, string[]> {
    return Object.fromEntries(
      Object.entries(TEMPLATES).map(([key, value]) => [key, Object.keys(value)]),
    );
  }
}

/** `LocalizedText` yoki oddiy satrni tanlangan tilda qaytaradi. */
function localized(value: unknown, locale: Locale): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, string>;
    for (const candidate of LOCALE_FALLBACK[locale]) {
      if (record[candidate]) return record[candidate];
    }
  }
  return '';
}

export { TEMPLATES };
