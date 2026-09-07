/**
 * Maqsad: Moodle "Sayt boshqaruvi" (Site administration) uslubidagi sozlamalar
 * daraxti — DEKLARATIV reestr (F-17).
 *
 * Har bir sozlama `Setting` jadvalida `key → value` sifatida saqlanadi; bu
 * reestr esa toifa → bo'lim → maydon tuzilmasini, turini, standart qiymatini,
 * ochiqligini (`isPublic`) va zod tekshiruvini beradi. Backend bo'limni shu
 * sxema bilan tekshiradi, frontend esa formani shu reestrdan chizadi — ikkala
 * tomonda ham qo'lda ro'yxat yo'q.
 *
 * Moodle bandlari bizning platformaga xaritalangan: Moodle'ga xos bo'lganlar
 * (MoodleNet, Jabber, Moodle app obunasi) eng yaqin ekvivalentga almashtirilgan
 * va bo'lim izohida aytilgan.
 */

import { z } from 'zod';
import { LOCALES } from '../constants/locales';
import type { LocalizedText } from '../types/localized';

/** 4 tilda yorliq — reestr qisqa bo'lsin. */
const L = (uzLatn: string, uzCyrl: string, ru: string, en: string): LocalizedText => ({
  'uz-Latn': uzLatn,
  'uz-Cyrl': uzCyrl,
  ru,
  en,
});

export type SiteSettingType =
  'boolean' | 'number' | 'string' | 'text' | 'select' | 'multiselect' | 'color' | 'list' | 'json';

export interface SiteSettingOption {
  value: string;
  label: LocalizedText;
}

export interface SiteSettingField {
  /** `Setting.key` — nuqta bilan ajratilgan nom hududi (`security.ipDenyList`). */
  key: string;
  type: SiteSettingType;
  label: LocalizedText;
  hint?: LocalizedText;
  default: unknown;
  /** Ochiq sozlama — autentifikatsiyasiz `GET /admin/settings/public` da beriladi. */
  isPublic?: boolean;
  options?: SiteSettingOption[];
  min?: number;
  max?: number;
  /** Faqat ko'rsatiladi, tahrirlanmaydi (masalan, vaqt zonasi NF-09 bo'yicha qat'iy). */
  readonly?: boolean;
}

export type SiteSettingWidget = 'stats' | 'badges' | 'feature-flags' | 'language-packs';

export interface SiteSettingLink {
  href: string;
  label: LocalizedText;
}

export interface SiteSettingSection {
  id: string;
  label: LocalizedText;
  description?: LocalizedText;
  fields: SiteSettingField[];
  /** Mavjud sahifalarga havolalar (Moodle'dagi kabi bo'lim ichidan o'tiladi). */
  links?: SiteSettingLink[];
  /** Maxsus ko'rinish: statistika, nishonlar boshqaruvi, feature flag'lar. */
  widget?: SiteSettingWidget;
  /** Moodle bandi bizda qanday xaritalangani haqida izoh. */
  note?: LocalizedText;
}

export interface SiteSettingCategory {
  id: string;
  label: LocalizedText;
  sections: SiteSettingSection[];
}

const localeOptions: SiteSettingOption[] = [
  {
    value: 'uz-Latn',
    label: L("O'zbek (lotin)", 'Ўзбек (лотин)', 'Узбекский (латиница)', 'Uzbek (Latin)'),
  },
  {
    value: 'uz-Cyrl',
    label: L("O'zbek (kirill)", 'Ўзбек (кирилл)', 'Узбекский (кириллица)', 'Uzbek (Cyrillic)'),
  },
  { value: 'ru', label: L('Rus', 'Рус', 'Русский', 'Russian') },
  { value: 'en', label: L('Ingliz', 'Инглиз', 'Английский', 'English') },
];

const yesNoHint = L(
  "Yoqilmasa tegishli bo'lim foydalanuvchilarga ko'rinmaydi",
  'Ёқилмаса тегишли бўлим фойдаланувчиларга кўринмайди',
  'Если выключено, соответствующий раздел скрыт от пользователей',
  'When disabled the corresponding area is hidden from users',
);

export const SITE_ADMIN_TREE: SiteSettingCategory[] = [
  // ---------------------------------------------------------------------------
  {
    id: 'users',
    label: L(
      'Foydalanuvchilar bilan ishlash',
      'Фойдаланувчилар билан ишлаш',
      'Пользователи',
      'Users',
    ),
    sections: [
      {
        id: 'users',
        label: L('Foydalanuvchilar', 'Фойдаланувчилар', 'Пользователи', 'Users'),
        description: L(
          'Hisoblar, rollar va bloklash — foydalanuvchilar sahifasida',
          'Ҳисоблар, роллар ва блоклаш — фойдаланувчилар саҳифасида',
          'Учётные записи, роли и блокировка — на странице пользователей',
          'Accounts, roles and blocking are managed on the users page',
        ),
        fields: [
          {
            key: 'users.defaultRoleOnImport',
            type: 'select',
            label: L(
              'Import qilinganda standart rol',
              'Импорт қилинганда стандарт рол',
              'Роль по умолчанию при импорте',
              'Default role on import',
            ),
            default: 'STUDENT',
            options: [
              { value: 'STUDENT', label: L('Talaba', 'Талаба', 'Студент', 'Student') },
              { value: 'TEACHER', label: L("O'qituvchi", 'Ўқитувчи', 'Преподаватель', 'Teacher') },
              { value: 'GUEST', label: L('Mehmon', 'Меҳмон', 'Гость', 'Guest') },
            ],
          },
          {
            key: 'users.inactiveAfterDays',
            type: 'number',
            label: L(
              'Faol emas deb belgilash (kun)',
              'Фаол эмас деб белгилаш (кун)',
              'Считать неактивным через (дней)',
              'Mark inactive after (days)',
            ),
            hint: L(
              'Shuncha kun kirmagan foydalanuvchi hisobotlarda "faol emas"',
              'Шунча кун кирмаган фойдаланувчи ҳисоботларда "фаол эмас"',
              'Не входивший столько дней пользователь считается неактивным в отчётах',
              'Users who have not signed in for this many days count as inactive in reports',
            ),
            default: 90,
            min: 7,
            max: 365,
          },
        ],
        links: [
          {
            href: '/admin/users',
            label: L(
              'Foydalanuvchilar sahifasi',
              'Фойдаланувчилар саҳифаси',
              'Страница пользователей',
              'Users page',
            ),
          },
        ],
      },
      {
        id: 'admin-announcements',
        label: L(
          "Administratorga e'lon",
          'Администраторга эълон',
          'Уведомления администратору',
          'Notifications to administrator',
        ),
        description: L(
          'Qaysi hodisalar haqida administratorlar e-mail oladi',
          'Қайси ҳодисалар ҳақида администраторлар e-mail олади',
          'О каких событиях администраторы получают письма',
          'Which events are e-mailed to administrators',
        ),
        fields: [
          {
            key: 'notify.adminEmails',
            type: 'list',
            label: L(
              'Administrator e-mail manzillari',
              'Администратор e-mail манзиллари',
              'E-mail адреса администраторов',
              'Administrator e-mail addresses',
            ),
            hint: L(
              "Bo'sh bo'lsa — SUPER_ADMIN rolidagi foydalanuvchilarga",
              'Бўш бўлса — SUPER_ADMIN ролидаги фойдаланувчиларга',
              'Если пусто — пользователям с ролью SUPER_ADMIN',
              'Empty: users with the SUPER_ADMIN role',
            ),
            default: [],
          },
          {
            key: 'notify.adminOnNewUser',
            type: 'boolean',
            label: L(
              "Yangi ro'yxatdan o'tish",
              'Янги рўйхатдан ўтиш',
              'Новая регистрация',
              'New registration',
            ),
            default: true,
          },
          {
            key: 'notify.adminOnFailedLogins',
            type: 'boolean',
            label: L(
              'Ketma-ket muvaffaqiyatsiz kirishlar',
              'Кетма-кет муваффақиятсиз киришлар',
              'Серии неудачных входов',
              'Bursts of failed sign-ins',
            ),
            default: true,
          },
          {
            key: 'notify.adminOnIntegrationError',
            type: 'boolean',
            label: L(
              'Integratsiya xatolari (HEMIS, SMS, LTI)',
              'Интеграция хатолари (HEMIS, SMS, LTI)',
              'Ошибки интеграций (HEMIS, SMS, LTI)',
              'Integration errors (HEMIS, SMS, LTI)',
            ),
            default: true,
          },
          {
            key: 'notify.adminOnBackup',
            type: 'boolean',
            label: L(
              'Zaxira nusxa natijasi',
              'Захира нусха натижаси',
              'Результат резервного копирования',
              'Backup result',
            ),
            default: false,
          },
        ],
      },
      {
        id: 'registration',
        label: L("Ro'yxatdan o'tish", 'Рўйхатдан ўтиш', 'Регистрация', 'Registration'),
        description: L(
          "O'zi ro'yxatdan o'tish (mehmon → talaba/tinglovchi) qoidalari",
          'Ўзи рўйхатдан ўтиш (меҳмон → талаба/тингловчи) қоидалари',
          'Правила самостоятельной регистрации (гость → студент/слушатель)',
          'Self-registration rules (guest → student/learner)',
        ),
        fields: [
          {
            key: 'registration.enabled',
            type: 'boolean',
            label: L(
              "O'zi ro'yxatdan o'tishga ruxsat",
              'Ўзи рўйхатдан ўтишга рухсат',
              'Разрешить самостоятельную регистрацию',
              'Allow self-registration',
            ),
            default: true,
            isPublic: true,
          },
          {
            key: 'registration.allowedEmailDomains',
            type: 'list',
            label: L(
              'Ruxsat etilgan e-mail domenlari',
              'Рухсат этилган e-mail доменлари',
              'Разрешённые домены e-mail',
              'Allowed e-mail domains',
            ),
            hint: L(
              "Bo'sh — har qanday domen. Masalan: qdu.uz, student.qdu.uz",
              'Бўш — ҳар қандай домен. Масалан: qdu.uz, student.qdu.uz',
              'Пусто — любой домен. Например: qdu.uz, student.qdu.uz',
              'Empty: any domain. Example: qdu.uz, student.qdu.uz',
            ),
            default: [],
          },
          {
            key: 'registration.defaultRole',
            type: 'select',
            label: L(
              "Ro'yxatdan o'tganga beriladigan rol",
              'Рўйхатдан ўтганга бериладиган рол',
              'Роль для зарегистрировавшихся',
              'Role granted on registration',
            ),
            default: 'STUDENT',
            options: [
              {
                value: 'STUDENT',
                label: L(
                  'Talaba / Tinglovchi',
                  'Талаба / Тингловчи',
                  'Студент / Слушатель',
                  'Student / Learner',
                ),
              },
              {
                value: 'GUEST',
                label: L(
                  'Mehmon (faqat ochiq katalog)',
                  'Меҳмон (фақат очиқ каталог)',
                  'Гость (только открытый каталог)',
                  'Guest (open catalogue only)',
                ),
              },
            ],
          },
          {
            key: 'registration.requireEmailConfirmation',
            type: 'boolean',
            label: L(
              "E-mail tasdig'i talab qilinsin",
              'E-mail тасдиғи талаб қилинсин',
              'Требовать подтверждение e-mail',
              'Require e-mail confirmation',
            ),
            default: true,
          },
        ],
      },
      {
        id: 'external-services',
        label: L('Tashqi xizmatlar', 'Ташқи хизматлар', 'Внешние сервисы', 'External services'),
        note: L(
          'Moodle "Moodle services" bandi — bizda LTI 1.3, HEMIS va One ID adapterlari',
          'Moodle "Moodle services" банди — бизда LTI 1.3, HEMIS ва One ID адаптерлари',
          'Пункт Moodle "Moodle services" — у нас адаптеры LTI 1.3, HEMIS и One ID',
          'Moodle "Moodle services" maps to our LTI 1.3, HEMIS and One ID adapters',
        ),
        fields: [
          {
            key: 'services.ltiEnabled',
            type: 'boolean',
            label: L(
              'LTI 1.3 Tool Provider',
              'LTI 1.3 Tool Provider',
              'LTI 1.3 Tool Provider',
              'LTI 1.3 Tool Provider',
            ),
            default: true,
            hint: yesNoHint,
          },
          {
            key: 'services.hemisSync',
            type: 'boolean',
            label: L(
              'HEMIS sinxronizatsiyasi',
              'HEMIS синхронизацияси',
              'Синхронизация с HEMIS',
              'HEMIS synchronisation',
            ),
            default: true,
          },
          {
            key: 'services.oneIdLogin',
            type: 'boolean',
            label: L(
              'One ID orqali kirish',
              'One ID орқали кириш',
              'Вход через One ID',
              'Sign in with One ID',
            ),
            default: true,
            isPublic: true,
          },
        ],
        links: [
          {
            href: '/admin/lti',
            label: L('LTI platformalari', 'LTI платформалари', 'Платформы LTI', 'LTI platforms'),
          },
        ],
      },
      {
        id: 'feedback',
        label: L(
          'Fikr-mulohaza sozlamalari',
          'Фикр-мулоҳаза созламалари',
          'Настройки обратной связи',
          'Feedback settings',
        ),
        fields: [
          {
            key: 'feedback.enabled',
            type: 'boolean',
            label: L(
              "Kurs so'rovnomalari yoqilgan",
              'Курс сўровномалари ёқилган',
              'Опросы по курсам включены',
              'Course surveys enabled',
            ),
            default: true,
          },
          {
            key: 'feedback.allowAnonymous',
            type: 'boolean',
            label: L(
              'Anonim javobga ruxsat',
              'Аноним жавобга рухсат',
              'Разрешить анонимные ответы',
              'Allow anonymous responses',
            ),
            default: true,
          },
          {
            key: 'feedback.afterCourseCompletion',
            type: 'boolean',
            label: L(
              "Kurs tugagach so'rovnoma taklif qilinsin",
              'Курс тугагач сўровнома таклиф қилинсин',
              'Предлагать опрос после завершения курса',
              'Offer a survey after course completion',
            ),
            default: true,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'advanced',
    label: L(
      'Kengaytirilgan imkoniyatlar',
      'Кенгайтирилган имкониятлар',
      'Расширенные возможности',
      'Advanced features',
    ),
    sections: [
      {
        id: 'advanced-features',
        label: L(
          'Kengaytirilgan imkoniyatlar',
          'Кенгайтирилган имкониятлар',
          'Расширенные возможности',
          'Advanced features',
        ),
        description: L(
          "Butun sayt uchun modullarni yoqish/o'chirish. Bosqichma-bosqich yoyish — feature flag'larda",
          'Бутун сайт учун модулларни ёқиш/ўчириш. Босқичма-босқич ёйиш — feature flag’ларда',
          'Включение модулей для всего сайта. Постепенное включение — во feature flag',
          'Site-wide module switches. Gradual rollout lives in feature flags',
        ),
        widget: 'feature-flags',
        fields: [
          {
            key: 'advanced.competencies',
            type: 'boolean',
            label: L('Kompetensiyalar', 'Компетенциялар', 'Компетенции', 'Competencies'),
            default: false,
            hint: yesNoHint,
          },
          {
            key: 'advanced.badges',
            type: 'boolean',
            label: L('Nishonlar', 'Нишонлар', 'Значки', 'Badges'),
            default: true,
            isPublic: true,
          },
          {
            key: 'advanced.h5p',
            type: 'boolean',
            label: L(
              'H5P interaktiv kontent',
              'H5P интерактив контент',
              'Интерактивный контент H5P',
              'H5P interactive content',
            ),
            default: true,
          },
          {
            key: 'advanced.analytics',
            type: 'boolean',
            label: L(
              'Analitika va early-warning',
              'Аналитика ва early-warning',
              'Аналитика и раннее предупреждение',
              'Analytics and early warning',
            ),
            default: true,
            isPublic: true,
          },
          {
            key: 'advanced.payments',
            type: 'boolean',
            label: L("To'lovlar", 'Тўловлар', 'Платежи', 'Payments'),
            default: true,
          },
          {
            key: 'advanced.mobile',
            type: 'boolean',
            label: L(
              'Mobil (PWA) qatlam',
              'Мобил (PWA) қатлам',
              'Мобильный слой (PWA)',
              'Mobile (PWA) layer',
            ),
            default: true,
            isPublic: true,
          },
          {
            key: 'advanced.forum',
            type: 'boolean',
            label: L('Forum', 'Форум', 'Форум', 'Forum'),
            default: true,
            isPublic: true,
          },
          {
            key: 'advanced.leaderboard',
            type: 'boolean',
            label: L('Guruh reytingi', 'Гуруҳ рейтинги', 'Рейтинг группы', 'Group leaderboard'),
            default: true,
            isPublic: true,
          },
        ],
        links: [
          {
            href: '/admin/settings',
            label: L(
              "Feature flag'lar va statistika",
              'Feature flag’лар ва статистика',
              'Feature flag и статистика',
              'Feature flags and statistics',
            ),
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'analytics',
    label: L('Analitika', 'Аналитика', 'Аналитика', 'Analytics'),
    sections: [
      {
        id: 'site-information',
        label: L("Sayt ma'lumotlari", 'Сайт маълумотлари', 'Сведения о сайте', 'Site information'),
        widget: 'stats',
        fields: [],
        links: [
          {
            href: '/analytics',
            label: L(
              'Analitika paneli',
              'Аналитика панели',
              'Панель аналитики',
              'Analytics dashboard',
            ),
          },
        ],
      },
      {
        id: 'analytics-settings',
        label: L(
          'Analitika sozlamalari',
          'Аналитика созламалари',
          'Настройки аналитики',
          'Analytics settings',
        ),
        fields: [
          {
            key: 'attendance.warningThreshold',
            type: 'number',
            label: L(
              'Davomat ogohlantirish chegarasi (%)',
              'Давомат огоҳлантириш чегараси (%)',
              'Порог предупреждения по посещаемости (%)',
              'Attendance warning threshold (%)',
            ),
            default: 75,
            min: 0,
            max: 100,
            isPublic: true,
          },
          {
            key: 'analytics.riskScoreThreshold',
            type: 'number',
            label: L(
              'Xavf balli chegarasi',
              'Хавф балли чегараси',
              'Порог балла риска',
              'Risk score threshold',
            ),
            hint: L(
              'Shu balldan yuqori talaba "xavf ostida" (F-13)',
              'Шу баллдан юқори талаба "хавф остида" (F-13)',
              'Студент выше этого балла считается "в зоне риска" (F-13)',
              'Students above this score are flagged at risk (F-13)',
            ),
            default: 60,
            min: 0,
            max: 100,
          },
          {
            key: 'analytics.lowProgressPercent',
            type: 'number',
            label: L(
              "Past o'zlashtirish (%)",
              'Паст ўзлаштириш (%)',
              'Низкая успеваемость (%)',
              'Low progress (%)',
            ),
            default: 40,
            min: 0,
            max: 100,
          },
          {
            key: 'analytics.inactivityDays',
            type: 'number',
            label: L(
              'Faolsizlik (kun)',
              'Фаолсизлик (кун)',
              'Неактивность (дней)',
              'Inactivity (days)',
            ),
            default: 14,
            min: 1,
            max: 120,
          },
          {
            key: 'analytics.retentionMonths',
            type: 'number',
            label: L(
              'Faollik jurnalini saqlash (oy)',
              'Фаоллик журналини сақлаш (ой)',
              'Хранение журнала активности (мес.)',
              'Activity log retention (months)',
            ),
            default: 24,
            min: 1,
            max: 120,
          },
        ],
      },
      {
        id: 'analytics-models',
        label: L(
          'Analitika modellari',
          'Аналитика моделлари',
          'Модели аналитики',
          'Analytics models',
        ),
        description: L(
          'Early-warning uchun ishlatiladigan belgilar',
          'Early-warning учун ишлатиладиган белгилар',
          'Признаки, используемые для раннего предупреждения',
          'Signals used for early warning',
        ),
        fields: [
          {
            key: 'analytics.models',
            type: 'multiselect',
            label: L('Faol modellar', 'Фаол моделлар', 'Активные модели', 'Active models'),
            default: ['attendance_risk', 'low_grades', 'inactivity', 'late_submissions'],
            options: [
              {
                value: 'attendance_risk',
                label: L(
                  'Davomat xavfi',
                  'Давомат хавфи',
                  'Риск по посещаемости',
                  'Attendance risk',
                ),
              },
              {
                value: 'low_grades',
                label: L('Past baholar', 'Паст баҳолар', 'Низкие оценки', 'Low grades'),
              },
              {
                value: 'inactivity',
                label: L('Faolsizlik', 'Фаолсизлик', 'Неактивность', 'Inactivity'),
              },
              {
                value: 'late_submissions',
                label: L('Kech topshirish', 'Кеч топшириш', 'Поздние сдачи', 'Late submissions'),
              },
              {
                value: 'quiz_failures',
                label: L('Testdan yiqilish', 'Тестдан йиқилиш', 'Провалы тестов', 'Quiz failures'),
              },
            ],
          },
        ],
        links: [
          {
            href: '/analytics',
            label: L(
              'Xavf ostidagi talabalar',
              'Хавф остидаги талабалар',
              'Студенты в зоне риска',
              'Students at risk',
            ),
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'competencies',
    label: L('Kompetensiyalar', 'Компетенциялар', 'Компетенции', 'Competencies'),
    sections: [
      {
        id: 'competencies-settings',
        label: L(
          'Kompetensiya sozlamalari',
          'Компетенция созламалари',
          'Настройки компетенций',
          'Competencies settings',
        ),
        note: L(
          "Kompetensiyalar sillabusdagi o'quv natijalari va Bloom darajalariga bog'lanadi (F-03)",
          'Компетенциялар силлабусдаги ўқув натижалари ва Bloom даражаларига боғланади (F-03)',
          'Компетенции привязываются к результатам обучения и уровням Блума в силлабусе (F-03)',
          'Competencies map to syllabus learning outcomes and Bloom levels (F-03)',
        ),
        fields: [
          {
            key: 'competencies.enabled',
            type: 'boolean',
            label: L(
              'Kompetensiyalar yoqilgan',
              'Компетенциялар ёқилган',
              'Компетенции включены',
              'Competencies enabled',
            ),
            default: false,
          },
          {
            key: 'competencies.scale',
            type: 'select',
            label: L('Baholash shkalasi', 'Баҳолаш шкаласи', 'Шкала оценивания', 'Rating scale'),
            default: 'bloom',
            options: [
              {
                value: 'bloom',
                label: L(
                  'Bloom (6 daraja)',
                  'Bloom (6 даража)',
                  'Блум (6 уровней)',
                  'Bloom (6 levels)',
                ),
              },
              {
                value: 'simple',
                label: L(
                  'Erishilgan / erishilmagan',
                  'Эришилган / эришилмаган',
                  'Достигнуто / не достигнуто',
                  'Achieved / not achieved',
                ),
              },
            ],
          },
          {
            key: 'competencies.pushToGradebook',
            type: 'boolean',
            label: L(
              'Jurnalga yozilsin',
              'Журналга ёзилсин',
              'Записывать в журнал',
              'Push to gradebook',
            ),
            default: false,
          },
        ],
      },
      {
        id: 'competency-frameworks',
        label: L(
          'Kompetensiya freymvorklari',
          'Компетенция фреймворклари',
          'Рамки компетенций',
          'Competency frameworks',
        ),
        description: L(
          "Freymvork nomlari ro'yxati; import/eksport — sillabus konstruktorida (F-03)",
          'Фреймворк номлари рўйхати; импорт/экспорт — силлабус конструкторида (F-03)',
          'Список рамок; импорт/экспорт — в конструкторе силлабуса (F-03)',
          'List of frameworks; import/export lives in the syllabus builder (F-03)',
        ),
        fields: [
          {
            key: 'competencies.frameworks',
            type: 'list',
            label: L('Freymvorklar', 'Фреймворклар', 'Рамки', 'Frameworks'),
            default: ["O'zDSt bakalavriat kompetensiyalari"],
          },
        ],
        links: [
          {
            href: '/curriculum',
            label: L(
              "O'quv reja va sillabus",
              'Ўқув режа ва силлабус',
              'Учебный план и силлабус',
              'Curriculum and syllabus',
            ),
          },
        ],
      },
      {
        id: 'learning-plan-templates',
        label: L(
          "O'quv reja shablonlari",
          'Ўқув режа шаблонлари',
          'Шаблоны учебных планов',
          'Learning plan templates',
        ),
        fields: [
          {
            key: 'competencies.planTemplates',
            type: 'list',
            label: L('Shablon nomlari', 'Шаблон номлари', 'Названия шаблонов', 'Template names'),
            default: [],
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'badges',
    label: L('Nishonlar', 'Нишонлар', 'Значки', 'Badges'),
    sections: [
      {
        id: 'badges-settings',
        label: L('Nishon sozlamalari', 'Нишон созламалари', 'Настройки значков', 'Badges settings'),
        fields: [
          {
            key: 'badges.enabled',
            type: 'boolean',
            label: L('Nishonlar yoqilgan', 'Нишонлар ёқилган', 'Значки включены', 'Badges enabled'),
            default: true,
            isPublic: true,
          },
          {
            key: 'badges.issuerName',
            type: 'string',
            label: L(
              'Beruvchi tashkilot nomi',
              'Берувчи ташкилот номи',
              'Название организации-эмитента',
              'Issuer name',
            ),
            default: "Qo'qon Davlat Universiteti",
            isPublic: true,
          },
          {
            key: 'badges.issuerUrl',
            type: 'string',
            label: L(
              'Beruvchi tashkilot manzili (URL)',
              'Берувчи ташкилот манзили (URL)',
              'Адрес организации (URL)',
              'Issuer URL',
            ),
            default: 'https://qdu.uz',
          },
          {
            key: 'badges.defaultExpiryDays',
            type: 'number',
            label: L(
              'Standart amal muddati (kun, 0 — muddatsiz)',
              'Стандарт амал муддати (кун, 0 — муддатсиз)',
              'Срок действия по умолчанию (дней, 0 — бессрочно)',
              'Default expiry (days, 0 = never)',
            ),
            default: 0,
            min: 0,
            max: 3650,
          },
        ],
      },
      {
        id: 'manage-badges',
        label: L(
          'Nishonlarni boshqarish',
          'Нишонларни бошқариш',
          'Управление значками',
          'Manage badges',
        ),
        description: L(
          "Mavjud nishonlar va yangisini qo'shish",
          'Мавжуд нишонлар ва янгисини қўшиш',
          'Существующие значки и добавление нового',
          'Existing badges and adding a new one',
        ),
        widget: 'badges',
        fields: [],
        links: [
          {
            href: '/achievements',
            label: L(
              'Yutuqlar sahifasi',
              'Ютуқлар саҳифаси',
              'Страница достижений',
              'Achievements page',
            ),
          },
        ],
      },
      {
        id: 'backpack',
        label: L(
          'Backpack sozlamalari',
          'Backpack созламалари',
          'Настройки Backpack',
          'Backpack settings',
        ),
        note: L(
          'Open Badges backpack — tashqi nishon omboriga eksport',
          'Open Badges backpack — ташқи нишон омборига экспорт',
          'Open Badges backpack — экспорт во внешнее хранилище значков',
          'Open Badges backpack export',
        ),
        fields: [
          {
            key: 'badges.backpackEnabled',
            type: 'boolean',
            label: L(
              'Backpack ga eksport',
              'Backpack га экспорт',
              'Экспорт в Backpack',
              'Export to backpack',
            ),
            default: false,
          },
          {
            key: 'badges.backpackUrl',
            type: 'string',
            label: L('Backpack manzili', 'Backpack манзили', 'Адрес Backpack', 'Backpack URL'),
            default: 'https://backpack.openbadges.org',
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'h5p',
    label: L('H5P', 'H5P', 'H5P', 'H5P'),
    sections: [
      {
        id: 'h5p-overview',
        label: L('H5P umumiy', 'H5P умумий', 'Обзор H5P', 'H5P overview'),
        note: L(
          'H5P paketlari dars resursi (`H5P` turi) sifatida yuklanadi va joyida ijro etiladi (F-05)',
          'H5P пакетлари дарс ресурси (`H5P` тури) сифатида юкланади ва жойида ижро этилади (F-05)',
          'Пакеты H5P загружаются как ресурс урока (тип `H5P`) и воспроизводятся на месте (F-05)',
          'H5P packages are uploaded as lesson resources (type `H5P`) and played inline (F-05)',
        ),
        fields: [
          {
            key: 'h5p.enabled',
            type: 'boolean',
            label: L('H5P yoqilgan', 'H5P ёқилган', 'H5P включён', 'H5P enabled'),
            default: true,
          },
        ],
      },
      {
        id: 'h5p-content-types',
        label: L(
          'H5P kontent turlari',
          'H5P контент турлари',
          'Типы контента H5P',
          'Manage H5P content types',
        ),
        fields: [
          {
            key: 'h5p.allowedTypes',
            type: 'multiselect',
            label: L(
              'Ruxsat etilgan turlar',
              'Рухсат этилган турлар',
              'Разрешённые типы',
              'Allowed types',
            ),
            default: [
              'InteractiveVideo',
              'CoursePresentation',
              'QuestionSet',
              'DragAndDrop',
              'Flashcards',
              'ImageHotspots',
            ],
            options: [
              {
                value: 'InteractiveVideo',
                label: L(
                  'Interaktiv video',
                  'Интерактив видео',
                  'Интерактивное видео',
                  'Interactive Video',
                ),
              },
              {
                value: 'CoursePresentation',
                label: L(
                  'Kurs taqdimoti',
                  'Курс тақдимоти',
                  'Презентация курса',
                  'Course Presentation',
                ),
              },
              {
                value: 'QuestionSet',
                label: L("Savollar to'plami", 'Саволлар тўплами', 'Набор вопросов', 'Question Set'),
              },
              {
                value: 'DragAndDrop',
                label: L('Sudrab tashlash', 'Судраб ташлаш', 'Перетаскивание', 'Drag and Drop'),
              },
              {
                value: 'Flashcards',
                label: L('Kartochkalar', 'Карточкалар', 'Карточки', 'Flashcards'),
              },
              {
                value: 'ImageHotspots',
                label: L(
                  'Rasm nuqtalari',
                  'Расм нуқталари',
                  'Точки на изображении',
                  'Image Hotspots',
                ),
              },
              {
                value: 'Timeline',
                label: L("Vaqt chizig'i", 'Вақт чизиғи', 'Лента времени', 'Timeline'),
              },
              { value: 'Accordion', label: L('Akkordeon', 'Аккордеон', 'Аккордеон', 'Accordion') },
            ],
          },
        ],
      },
      {
        id: 'h5p-settings',
        label: L('H5P sozlamalari', 'H5P созламалари', 'Настройки H5P', 'H5P settings'),
        fields: [
          {
            key: 'h5p.allowDownload',
            type: 'boolean',
            label: L(
              'Yuklab olishga ruxsat',
              'Юклаб олишга рухсат',
              'Разрешить скачивание',
              'Allow download',
            ),
            default: false,
          },
          {
            key: 'h5p.allowEmbed',
            type: 'boolean',
            label: L(
              'Tashqi saytga joylash (embed)',
              'Ташқи сайтга жойлаш (embed)',
              'Встраивание на внешние сайты',
              'Allow embedding',
            ),
            default: false,
          },
          {
            key: 'h5p.maxSizeMb',
            type: 'number',
            label: L(
              'Paket hajmi chegarasi (MB)',
              'Пакет ҳажми чегараси (MB)',
              'Лимит размера пакета (МБ)',
              'Package size limit (MB)',
            ),
            default: 200,
            min: 10,
            max: 2048,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'licence',
    label: L('Ruxsatnoma', 'Рухсатнома', 'Лицензии', 'Licence'),
    sections: [
      {
        id: 'licence-settings',
        label: L(
          'Ruxsatnoma sozlamalari',
          'Рухсатнома созламалари',
          'Настройки лицензий',
          'Licence settings',
        ),
        fields: [
          {
            key: 'licence.default',
            type: 'select',
            label: L(
              'Yuklangan kontent uchun standart ruxsatnoma',
              'Юкланган контент учун стандарт рухсатнома',
              'Лицензия по умолчанию для загруженного контента',
              'Default licence for uploaded content',
            ),
            default: 'allrightsreserved',
            options: [
              {
                value: 'allrightsreserved',
                label: L(
                  'Barcha huquqlar himoyalangan',
                  'Барча ҳуқуқлар ҳимояланган',
                  'Все права защищены',
                  'All rights reserved',
                ),
              },
              { value: 'cc-by', label: L('CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0') },
              {
                value: 'cc-by-sa',
                label: L('CC BY-SA 4.0', 'CC BY-SA 4.0', 'CC BY-SA 4.0', 'CC BY-SA 4.0'),
              },
              {
                value: 'cc-by-nc',
                label: L('CC BY-NC 4.0', 'CC BY-NC 4.0', 'CC BY-NC 4.0', 'CC BY-NC 4.0'),
              },
              {
                value: 'public',
                label: L(
                  'Ochiq mulk (Public Domain)',
                  'Очиқ мулк (Public Domain)',
                  'Общественное достояние',
                  'Public domain',
                ),
              },
            ],
          },
        ],
      },
      {
        id: 'licence-manager',
        label: L(
          'Ruxsatnomalar menejeri',
          'Рухсатномалар менежери',
          'Менеджер лицензий',
          'Licence manager',
        ),
        fields: [
          {
            key: 'licence.enabled',
            type: 'multiselect',
            label: L(
              'Tanlash uchun ochiq ruxsatnomalar',
              'Танлаш учун очиқ рухсатномалар',
              'Доступные для выбора лицензии',
              'Licences available for selection',
            ),
            default: ['allrightsreserved', 'cc-by', 'cc-by-sa', 'cc-by-nc', 'public'],
            options: [
              {
                value: 'allrightsreserved',
                label: L(
                  'Barcha huquqlar himoyalangan',
                  'Барча ҳуқуқлар ҳимояланган',
                  'Все права защищены',
                  'All rights reserved',
                ),
              },
              { value: 'cc-by', label: L('CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0', 'CC BY 4.0') },
              {
                value: 'cc-by-sa',
                label: L('CC BY-SA 4.0', 'CC BY-SA 4.0', 'CC BY-SA 4.0', 'CC BY-SA 4.0'),
              },
              {
                value: 'cc-by-nc',
                label: L('CC BY-NC 4.0', 'CC BY-NC 4.0', 'CC BY-NC 4.0', 'CC BY-NC 4.0'),
              },
              {
                value: 'cc-by-nd',
                label: L('CC BY-ND 4.0', 'CC BY-ND 4.0', 'CC BY-ND 4.0', 'CC BY-ND 4.0'),
              },
              {
                value: 'public',
                label: L(
                  'Ochiq mulk (Public Domain)',
                  'Очиқ мулк (Public Domain)',
                  'Общественное достояние',
                  'Public domain',
                ),
              },
            ],
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'location',
    label: L('Joylashuv', 'Жойлашув', 'Местоположение', 'Location'),
    sections: [
      {
        id: 'location-settings',
        label: L(
          'Joylashuv sozlamalari',
          'Жойлашув созламалари',
          'Настройки местоположения',
          'Location settings',
        ),
        fields: [
          {
            key: 'location.timezone',
            type: 'string',
            label: L('Vaqt zonasi', 'Вақт зонаси', 'Часовой пояс', 'Time zone'),
            hint: L(
              "NF-09: barcha sana/vaqt Toshkent zonasida — o'zgartirilmaydi",
              'NF-09: барча сана/вақт Тошкент зонасида — ўзгартирилмайди',
              'NF-09: все даты во времени Ташкента — не изменяется',
              'NF-09: all dates use Tashkent time and cannot be changed',
            ),
            default: 'Asia/Tashkent',
            readonly: true,
            isPublic: true,
          },
          {
            key: 'location.country',
            type: 'string',
            label: L(
              'Mamlakat (ISO kodi)',
              'Мамлакат (ISO коди)',
              'Страна (код ISO)',
              'Country (ISO code)',
            ),
            default: 'UZ',
            isPublic: true,
          },
          {
            key: 'location.city',
            type: 'string',
            label: L('Shahar', 'Шаҳар', 'Город', 'City'),
            default: "Qo'qon",
            isPublic: true,
          },
          {
            key: 'institution.address',
            type: 'string',
            label: L('Manzil', 'Манзил', 'Адрес', 'Address'),
            default: "Qo'qon shahri, Turkiston ko'chasi, 23-uy",
            isPublic: true,
          },
          {
            key: 'institution.phone',
            type: 'string',
            label: L('Telefon', 'Телефон', 'Телефон', 'Phone'),
            default: '+998 73 555 12 34',
            isPublic: true,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'language',
    label: L('Til', 'Тил', 'Язык', 'Language'),
    sections: [
      {
        id: 'language-settings',
        label: L('Til sozlamalari', 'Тил созламалари', 'Языковые настройки', 'Language settings'),
        fields: [
          {
            key: 'ui.defaultLocale',
            type: 'select',
            label: L('Standart til', 'Стандарт тил', 'Язык по умолчанию', 'Default language'),
            default: 'uz-Latn',
            options: localeOptions,
            isPublic: true,
          },
          {
            key: 'i18n.enabledLocales',
            type: 'multiselect',
            label: L('Yoqilgan tillar', 'Ёқилган тиллар', 'Включённые языки', 'Enabled languages'),
            hint: L(
              'Kamida standart til qolishi kerak',
              'Камида стандарт тил қолиши керак',
              'Как минимум язык по умолчанию должен остаться',
              'At least the default language must remain',
            ),
            default: [...LOCALES],
            options: localeOptions,
            isPublic: true,
          },
          {
            key: 'i18n.autoDetect',
            type: 'boolean',
            label: L(
              'Brauzer tilini avtomatik aniqlash',
              'Браузер тилини автоматик аниқлаш',
              'Определять язык браузера автоматически',
              'Detect browser language automatically',
            ),
            default: true,
            isPublic: true,
          },
        ],
      },
      {
        id: 'language-customisation',
        label: L(
          'Tilni moslashtirish',
          'Тилни мослаштириш',
          'Настройка языка',
          'Language customisation',
        ),
        description: L(
          'Interfeys matnlarini kalit bo\'yicha qayta yozish. Format: {"uz-Latn": {"nav.courses": "Fanlar"}}',
          'Интерфейс матнларини калит бўйича қайта ёзиш. Формат: {"uz-Latn": {"nav.courses": "Фанлар"}}',
          'Переопределение текстов интерфейса по ключу. Формат: {"ru": {"nav.courses": "Дисциплины"}}',
          'Override interface strings by key. Format: {"en": {"nav.courses": "Subjects"}}',
        ),
        fields: [
          {
            key: 'i18n.overrides',
            type: 'json',
            label: L(
              'Qayta yozilgan matnlar',
              'Қайта ёзилган матнлар',
              'Переопределённые строки',
              'Overridden strings',
            ),
            default: {},
            isPublic: true,
          },
        ],
      },
      {
        id: 'language-packs',
        label: L('Til paketlari', 'Тил пакетлари', 'Языковые пакеты', 'Language packs'),
        widget: 'language-packs',
        fields: [],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'messaging',
    label: L('Xabarlar', 'Хабарлар', 'Сообщения', 'Messaging'),
    sections: [
      {
        id: 'messaging-settings',
        label: L(
          'Xabarlar sozlamalari',
          'Хабарлар созламалари',
          'Настройки сообщений',
          'Messaging settings',
        ),
        fields: [
          {
            key: 'messaging.enabled',
            type: 'boolean',
            label: L(
              'Shaxsiy xabarlar yoqilgan',
              'Шахсий хабарлар ёқилган',
              'Личные сообщения включены',
              'Private messaging enabled',
            ),
            default: true,
            isPublic: true,
          },
          {
            key: 'messaging.studentToStudent',
            type: 'boolean',
            label: L(
              'Talaba talabaga yoza oladi',
              'Талаба талабага ёза олади',
              'Студент может писать студенту',
              'Students may message students',
            ),
            hint: L(
              "O'chirilsa talaba faqat o'qituvchi, kurator va xodimlarga yozadi",
              'Ўчирилса талаба фақат ўқитувчи, куратор ва ходимларга ёзади',
              'Если выключено, студент пишет только преподавателям, кураторам и сотрудникам',
              'When off, students can only message teachers, tutors and staff',
            ),
            default: true,
          },
          {
            key: 'messaging.maxAttachmentMb',
            type: 'number',
            label: L(
              'Biriktirma hajmi (MB)',
              'Бириктирма ҳажми (MB)',
              'Размер вложения (МБ)',
              'Attachment size (MB)',
            ),
            default: 20,
            min: 1,
            max: 200,
          },
          {
            key: 'messaging.retentionDays',
            type: 'number',
            label: L(
              'Xabarlarni saqlash (kun, 0 — cheksiz)',
              'Хабарларни сақлаш (кун, 0 — чексиз)',
              'Хранение сообщений (дней, 0 — бессрочно)',
              'Message retention (days, 0 = forever)',
            ),
            default: 0,
            min: 0,
            max: 3650,
          },
        ],
      },
      {
        id: 'notification-settings',
        label: L(
          'Bildirishnoma sozlamalari',
          'Билдиришнома созламалари',
          'Настройки уведомлений',
          'Notification settings',
        ),
        description: L(
          "Sayt darajasida yoqilgan kanallar; foydalanuvchi o'z profilida shulardan tanlaydi",
          'Сайт даражасида ёқилган каналлар; фойдаланувчи ўз профилида шулардан танлайди',
          'Каналы, включённые на уровне сайта; пользователь выбирает из них в профиле',
          'Site-wide enabled channels; users pick among them in their profile',
        ),
        fields: [
          {
            key: 'notifications.inApp',
            type: 'boolean',
            label: L('Ilova ichida', 'Илова ичида', 'В приложении', 'In-app'),
            default: true,
            isPublic: true,
          },
          {
            key: 'notifications.email',
            type: 'boolean',
            label: L('E-mail', 'E-mail', 'E-mail', 'E-mail'),
            default: true,
            isPublic: true,
          },
          {
            key: 'notifications.sms',
            type: 'boolean',
            label: L('SMS (Eskiz)', 'SMS (Eskiz)', 'SMS (Eskiz)', 'SMS (Eskiz)'),
            default: false,
            isPublic: true,
          },
          {
            key: 'notifications.telegram',
            type: 'boolean',
            label: L('Telegram', 'Telegram', 'Telegram', 'Telegram'),
            default: false,
            isPublic: true,
          },
          {
            key: 'notifications.push',
            type: 'boolean',
            label: L('Push (PWA)', 'Push (PWA)', 'Push (PWA)', 'Push (PWA)'),
            default: true,
            isPublic: true,
          },
          {
            key: 'notifications.quietHoursStart',
            type: 'string',
            label: L(
              'Sokin soatlar boshi (HH:MM)',
              'Сокин соатлар боши (HH:MM)',
              'Начало тихих часов (ЧЧ:ММ)',
              'Quiet hours start (HH:MM)',
            ),
            default: '22:00',
          },
          {
            key: 'notifications.quietHoursEnd',
            type: 'string',
            label: L(
              'Sokin soatlar oxiri (HH:MM)',
              'Сокин соатлар охири (HH:MM)',
              'Конец тихих часов (ЧЧ:ММ)',
              'Quiet hours end (HH:MM)',
            ),
            default: '07:00',
          },
        ],
      },
      {
        id: 'telegram',
        label: L('Telegram bot', 'Telegram бот', 'Telegram-бот', 'Telegram bot'),
        note: L(
          'Moodle "Jabber" bandi — bizda Telegram bot (kanal: in-app + email + SMS + Telegram)',
          'Moodle "Jabber" банди — бизда Telegram бот (канал: in-app + email + SMS + Telegram)',
          'Пункт Moodle "Jabber" — у нас Telegram-бот',
          'Moodle "Jabber" maps to our Telegram bot',
        ),
        fields: [
          {
            key: 'telegram.enabled',
            type: 'boolean',
            label: L(
              'Telegram bot yoqilgan',
              'Telegram бот ёқилган',
              'Telegram-бот включён',
              'Telegram bot enabled',
            ),
            default: false,
          },
          {
            key: 'telegram.botUsername',
            type: 'string',
            label: L(
              'Bot foydalanuvchi nomi',
              'Бот фойдаланувчи номи',
              'Имя пользователя бота',
              'Bot username',
            ),
            hint: L(
              'Token `.env` da (TELEGRAM_BOT_TOKEN) — xavfsizlik uchun bu yerda saqlanmaydi',
              'Токен `.env` да (TELEGRAM_BOT_TOKEN) — хавфсизлик учун бу ерда сақланмайди',
              'Токен хранится в `.env` (TELEGRAM_BOT_TOKEN), не здесь',
              'The token lives in `.env` (TELEGRAM_BOT_TOKEN), not here',
            ),
            default: '@qdu_lms_bot',
            isPublic: true,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'payments',
    label: L("To'lovlar", 'Тўловлар', 'Платежи', 'Payments'),
    sections: [
      {
        id: 'payment-accounts',
        label: L("To'lov hisoblari", 'Тўлов ҳисоблари', 'Платёжные счета', 'Payment accounts'),
        fields: [
          {
            key: 'payments.providers',
            type: 'multiselect',
            label: L(
              'Yoqilgan provayderlar',
              'Ёқилган провайдерлар',
              'Включённые провайдеры',
              'Enabled providers',
            ),
            hint: L(
              'Kalitlar `.env` da (adapter: mock/live)',
              'Калитлар `.env` да (адаптер: mock/live)',
              'Ключи в `.env` (адаптер: mock/live)',
              'Keys live in `.env` (adapter: mock/live)',
            ),
            default: ['payme', 'click'],
            options: [
              { value: 'payme', label: L('Payme', 'Payme', 'Payme', 'Payme') },
              { value: 'click', label: L('Click', 'Click', 'Click', 'Click') },
              { value: 'uzum', label: L('Uzum Bank', 'Uzum Bank', 'Uzum Bank', 'Uzum Bank') },
              {
                value: 'bank',
                label: L(
                  "Bank o'tkazmasi (hisob-faktura)",
                  'Банк ўтказмаси (ҳисоб-фактура)',
                  'Банковский перевод (счёт)',
                  'Bank transfer (invoice)',
                ),
              },
            ],
          },
          {
            key: 'payments.merchantName',
            type: 'string',
            label: L(
              'Qabul qiluvchi nomi',
              'Қабул қилувчи номи',
              'Название получателя',
              'Merchant name',
            ),
            default: "Qo'qon Davlat Universiteti",
          },
        ],
      },
      {
        id: 'payments-settings',
        label: L(
          "To'lov sozlamalari",
          'Тўлов созламалари',
          'Настройки платежей',
          'Payments settings',
        ),
        fields: [
          {
            key: 'payments.enabled',
            type: 'boolean',
            label: L('Pullik kurslar', 'Пуллик курслар', 'Платные курсы', 'Paid courses'),
            default: true,
            isPublic: true,
          },
          {
            key: 'payments.currency',
            type: 'select',
            label: L('Valyuta', 'Валюта', 'Валюта', 'Currency'),
            default: 'UZS',
            options: [
              { value: 'UZS', label: L("So'm (UZS)", 'Сўм (UZS)', 'Сум (UZS)', 'Som (UZS)') },
            ],
            isPublic: true,
          },
          {
            key: 'payments.refundDays',
            type: 'number',
            label: L(
              'Qaytarish muddati (kun)',
              'Қайтариш муддати (кун)',
              'Срок возврата (дней)',
              'Refund window (days)',
            ),
            default: 14,
            min: 0,
            max: 90,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'security',
    label: L('Himoya', 'Ҳимоя', 'Безопасность', 'Security'),
    sections: [
      {
        id: 'ip-blocker',
        label: L('IP bloklovchi', 'IP блокловчи', 'Блокировка IP', 'IP blocker'),
        description: L(
          "Ruxsat ro'yxati bo'sh bo'lsa — hamma kiradi; to'ldirilsa faqat ro'yxatdagilar. Taqiq ro'yxati har doim ustun. Format: 203.0.113.7, 10.0.0.0/8, 192.168.",
          'Рухсат рўйхати бўш бўлса — ҳамма киради; тўлдирилса фақат рўйхатдагилар. Тақиқ рўйхати ҳар доим устун. Формат: 203.0.113.7, 10.0.0.0/8, 192.168.',
          'Если список разрешённых пуст — доступ всем; иначе только из списка. Список запрещённых имеет приоритет. Формат: 203.0.113.7, 10.0.0.0/8, 192.168.',
          'Empty allow list: everyone; otherwise only listed. Deny list always wins. Format: 203.0.113.7, 10.0.0.0/8, 192.168.',
        ),
        fields: [
          {
            key: 'security.ipAllowList',
            type: 'list',
            label: L(
              "Ruxsat etilgan IP ro'yxati",
              'Рухсат этилган IP рўйхати',
              'Список разрешённых IP',
              'Allowed IP list',
            ),
            default: [],
          },
          {
            key: 'security.ipDenyList',
            type: 'list',
            label: L(
              "Taqiqlangan IP ro'yxati",
              'Тақиқланган IP рўйхати',
              'Список запрещённых IP',
              'Blocked IP list',
            ),
            default: [],
          },
        ],
      },
      {
        id: 'site-policies',
        label: L('Sayt siyosatlari', 'Сайт сиёсатлари', 'Политики сайта', 'Site policies'),
        fields: [
          {
            key: 'security.policyUrl',
            type: 'string',
            label: L(
              'Foydalanish shartlari manzili (URL)',
              'Фойдаланиш шартлари манзили (URL)',
              'Адрес пользовательского соглашения (URL)',
              'Site policy URL',
            ),
            default: '',
            isPublic: true,
          },
          {
            key: 'security.requirePolicyAcceptance',
            type: 'boolean',
            label: L(
              "Ro'yxatdan o'tishda shartlarga rozilik talab qilinsin",
              'Рўйхатдан ўтишда шартларга розилик талаб қилинсин',
              'Требовать согласие с условиями при регистрации',
              'Require policy acceptance on registration',
            ),
            default: false,
            isPublic: true,
          },
          {
            key: 'security.passwordMinLength',
            type: 'number',
            label: L(
              'Parol minimal uzunligi',
              'Парол минимал узунлиги',
              'Минимальная длина пароля',
              'Minimum password length',
            ),
            hint: L(
              "`.env` dagi PASSWORD_MIN_LENGTH dan kichik bo'lsa `.env` qiymati amal qiladi",
              '`.env` даги PASSWORD_MIN_LENGTH дан кичик бўлса `.env` қиймати амал қилади',
              'Если меньше PASSWORD_MIN_LENGTH из `.env`, действует значение из `.env`',
              'If lower than PASSWORD_MIN_LENGTH in `.env`, the `.env` value applies',
            ),
            default: 10,
            min: 8,
            max: 64,
          },
          {
            key: 'security.maxUploadMb',
            type: 'number',
            label: L(
              'Yuklash hajmi chegarasi (MB)',
              'Юклаш ҳажми чегараси (MB)',
              'Лимит размера загрузки (МБ)',
              'Upload size limit (MB)',
            ),
            default: 500,
            min: 10,
            max: 5120,
          },
          {
            key: 'security.sessionInactivityMinutes',
            type: 'number',
            label: L(
              'Faolsiz sessiya muddati (daqiqa)',
              'Фаолсиз сессия муддати (дақиқа)',
              'Тайм-аут неактивной сессии (мин.)',
              'Idle session timeout (minutes)',
            ),
            default: 120,
            min: 5,
            max: 1440,
          },
        ],
      },
      {
        id: 'http-security',
        label: L('HTTP himoyasi', 'HTTP ҳимояси', 'Безопасность HTTP', 'HTTP security'),
        note: L(
          "Sarlavhalar Nginx va Next.js (`next.config.mjs`) tomonidan qo'yiladi; bu qiymatlar ishga tushirishda o'qiladi",
          'Сарлавҳалар Nginx ва Next.js (`next.config.mjs`) томонидан қўйилади; бу қийматлар ишга туширишда ўқилади',
          'Заголовки выставляются Nginx и Next.js; эти значения читаются при запуске',
          'Headers are set by Nginx and Next.js; these values are read at startup',
        ),
        fields: [
          {
            key: 'security.forceHttps',
            type: 'boolean',
            label: L('Faqat HTTPS', 'Фақат HTTPS', 'Только HTTPS', 'Force HTTPS'),
            default: true,
          },
          {
            key: 'security.hsts',
            type: 'boolean',
            label: L('HSTS sarlavhasi', 'HSTS сарлавҳаси', 'Заголовок HSTS', 'HSTS header'),
            default: true,
          },
          {
            key: 'security.allowFrameEmbedding',
            type: 'boolean',
            label: L(
              'Tashqi saytda iframe ga ruxsat',
              'Ташқи сайтда iframe га рухсат',
              'Разрешить iframe на внешних сайтах',
              'Allow external iframe embedding',
            ),
            default: false,
          },
          {
            key: 'security.cookieSameSite',
            type: 'select',
            label: L('Cookie SameSite', 'Cookie SameSite', 'Cookie SameSite', 'Cookie SameSite'),
            default: 'lax',
            options: [
              { value: 'lax', label: L('Lax', 'Lax', 'Lax', 'Lax') },
              { value: 'strict', label: L('Strict', 'Strict', 'Strict', 'Strict') },
            ],
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'frontpage',
    label: L(
      "Ma'lumotlar va bosh sahifa",
      'Маълумотлар ва бош саҳифа',
      'Сведения и главная страница',
      'Site information and front page',
    ),
    sections: [
      {
        id: 'site-info',
        label: L('Sayt haqida', 'Сайт ҳақида', 'О сайте', 'About the site'),
        fields: [
          {
            key: 'institution.name',
            type: 'string',
            label: L('Muassasa nomi', 'Муассаса номи', 'Название учреждения', 'Institution name'),
            default: "Qo'qon Davlat Universiteti",
            isPublic: true,
          },
          {
            key: 'institution.shortName',
            type: 'string',
            label: L('Qisqartma', 'Қисқартма', 'Сокращение', 'Short name'),
            default: 'QDU',
            isPublic: true,
          },
          {
            key: 'site.description',
            type: 'text',
            label: L('Sayt tavsifi', 'Сайт тавсифи', 'Описание сайта', 'Site description'),
            default: '',
            isPublic: true,
          },
          {
            key: 'site.supportEmail',
            type: 'string',
            label: L(
              "Qo'llab-quvvatlash e-mail",
              'Қўллаб-қувватлаш e-mail',
              'E-mail поддержки',
              'Support e-mail',
            ),
            default: 'support@qdu.uz',
            isPublic: true,
          },
        ],
      },
      {
        id: 'front-page-settings',
        label: L(
          'Bosh sahifa sozlamalari',
          'Бош саҳифа созламалари',
          'Настройки главной страницы',
          'Front page settings',
        ),
        fields: [
          {
            key: 'frontpage.showCatalog',
            type: 'boolean',
            label: L(
              'Mehmonlarga ochiq kurslar katalogi',
              'Меҳмонларга очиқ курслар каталоги',
              'Открытый каталог курсов для гостей',
              'Open course catalogue for guests',
            ),
            default: true,
            isPublic: true,
          },
          {
            key: 'frontpage.showAnnouncements',
            type: 'boolean',
            label: L("E'lonlar", 'Эълонлар', 'Объявления', 'Announcements'),
            default: true,
            isPublic: true,
          },
          {
            key: 'frontpage.showNews',
            type: 'boolean',
            label: L('Kurs yangiliklari', 'Курс янгиликлари', 'Новости курсов', 'Course news'),
            default: true,
            isPublic: true,
          },
          {
            key: 'frontpage.loggedInDefault',
            type: 'select',
            label: L(
              'Kirgan foydalanuvchi uchun standart sahifa',
              'Кирган фойдаланувчи учун стандарт саҳифа',
              'Страница по умолчанию после входа',
              'Default page after sign-in',
            ),
            default: 'dashboard',
            options: [
              {
                value: 'dashboard',
                label: L('Bosh sahifa (panel)', 'Бош саҳифа (панел)', 'Панель', 'Dashboard'),
              },
              {
                value: 'my-courses',
                label: L('Mening kurslarim', 'Менинг курсларим', 'Мои курсы', 'My courses'),
              },
              {
                value: 'courses',
                label: L(
                  'Kurslar katalogi',
                  'Курслар каталоги',
                  'Каталог курсов',
                  'Course catalogue',
                ),
              },
            ],
            isPublic: true,
          },
          {
            key: 'frontpage.maxCourses',
            type: 'number',
            label: L(
              'Bosh sahifadagi kurslar soni',
              'Бош саҳифадаги курслар сони',
              'Число курсов на главной',
              'Courses on the front page',
            ),
            default: 12,
            min: 0,
            max: 60,
            isPublic: true,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'mobile',
    label: L('Mobil ilova', 'Мобил илова', 'Мобильное приложение', 'Mobile app'),
    sections: [
      {
        id: 'mobile-settings',
        label: L('Mobil sozlamalar', 'Мобил созламалар', 'Мобильные настройки', 'Mobile settings'),
        note: L(
          "Moodle app o'rniga — PWA (offline kesh, background sync, push) (F-16)",
          'Moodle app ўрнига — PWA (offline кеш, background sync, push) (F-16)',
          'Вместо Moodle app — PWA (офлайн-кеш, фоновая синхронизация, push) (F-16)',
          'Instead of the Moodle app: PWA (offline cache, background sync, push) (F-16)',
        ),
        fields: [
          {
            key: 'mobile.pwaEnabled',
            type: 'boolean',
            label: L('PWA yoqilgan', 'PWA ёқилган', 'PWA включено', 'PWA enabled'),
            default: true,
            isPublic: true,
          },
          {
            key: 'mobile.offlineCache',
            type: 'boolean',
            label: L('Offline kesh', 'Offline кеш', 'Офлайн-кеш', 'Offline cache'),
            default: true,
            isPublic: true,
          },
          {
            key: 'mobile.lowBandwidthMode',
            type: 'boolean',
            label: L(
              'Past tezlik rejimi (rasmlar siqiladi)',
              'Паст тезлик режими (расмлар сиқилади)',
              'Режим низкой скорости (сжатие изображений)',
              'Low-bandwidth mode (compressed images)',
            ),
            default: true,
            isPublic: true,
          },
        ],
      },
      {
        id: 'mobile-app-subscription',
        label: L(
          'Ilova obunasi',
          'Илова обунаси',
          'Подписка на приложение',
          'Mobile app subscription',
        ),
        note: L(
          "Moodle app obunasi bizga taalluqli emas — PWA bepul; do'kon havolalari ixtiyoriy",
          'Moodle app обунаси бизга тааллуқли эмас — PWA бепул; дўкон ҳаволалари ихтиёрий',
          'Подписка Moodle app неприменима — PWA бесплатна; ссылки на магазины необязательны',
          'The Moodle app subscription does not apply: the PWA is free; store links are optional',
        ),
        fields: [
          {
            key: 'mobile.appStoreUrl',
            type: 'string',
            label: L(
              'App Store havolasi',
              'App Store ҳаволаси',
              'Ссылка App Store',
              'App Store link',
            ),
            default: '',
            isPublic: true,
          },
          {
            key: 'mobile.playStoreUrl',
            type: 'string',
            label: L(
              'Google Play havolasi',
              'Google Play ҳаволаси',
              'Ссылка Google Play',
              'Google Play link',
            ),
            default: '',
            isPublic: true,
          },
        ],
      },
      {
        id: 'mobile-authentication',
        label: L(
          'Mobil autentifikatsiya',
          'Мобил аутентификация',
          'Мобильная аутентификация',
          'Mobile authentication',
        ),
        fields: [
          {
            key: 'mobile.sessionDays',
            type: 'number',
            label: L(
              '"Eslab qolish" sessiyasi (kun)',
              '"Эслаб қолиш" сессияси (кун)',
              'Сессия "запомнить меня" (дней)',
              '"Remember me" session (days)',
            ),
            default: 30,
            min: 1,
            max: 90,
          },
          {
            key: 'mobile.qrLogin',
            type: 'boolean',
            label: L('QR orqali kirish', 'QR орқали кириш', 'Вход по QR', 'QR sign-in'),
            default: false,
            isPublic: true,
          },
        ],
      },
      {
        id: 'mobile-appearance',
        label: L("Mobil ko'rinish", 'Мобил кўриниш', 'Мобильный внешний вид', 'Mobile appearance'),
        fields: [
          {
            key: 'ui.accentColor',
            type: 'color',
            label: L('Aksent rang', 'Аксент ранг', 'Акцентный цвет', 'Accent colour'),
            default: '#0f4c81',
            isPublic: true,
          },
          {
            key: 'mobile.themeColor',
            type: 'color',
            label: L('PWA mavzu rangi', 'PWA мавзу ранги', 'Цвет темы PWA', 'PWA theme colour'),
            default: '#0f4c81',
            isPublic: true,
          },
          {
            key: 'mobile.appTitle',
            type: 'string',
            label: L(
              'Ilova nomi (bosh ekranda)',
              'Илова номи (бош экранда)',
              'Название приложения (на главном экране)',
              'App title (home screen)',
            ),
            default: 'QDU LMS',
            isPublic: true,
          },
        ],
      },
      {
        id: 'mobile-features',
        label: L('Mobil imkoniyatlar', 'Мобил имкониятлар', 'Мобильные функции', 'Mobile features'),
        fields: [
          {
            key: 'mobile.features',
            type: 'multiselect',
            label: L(
              "Offline mavjud bo'limlar",
              'Offline мавжуд бўлимлар',
              'Разделы, доступные офлайн',
              'Sections available offline',
            ),
            default: ['courses', 'grades', 'schedule'],
            options: [
              {
                value: 'courses',
                label: L(
                  'Kurslar va darslar',
                  'Курслар ва дарслар',
                  'Курсы и уроки',
                  'Courses and lessons',
                ),
              },
              { value: 'quizzes', label: L('Testlar', 'Тестлар', 'Тесты', 'Quizzes') },
              { value: 'grades', label: L('Baholar', 'Баҳолар', 'Оценки', 'Grades') },
              {
                value: 'schedule',
                label: L('Dars jadvali', 'Дарс жадвали', 'Расписание', 'Schedule'),
              },
              { value: 'messages', label: L('Xabarlar', 'Хабарлар', 'Сообщения', 'Messages') },
              { value: 'attendance', label: L('Davomat', 'Давомат', 'Посещаемость', 'Attendance') },
            ],
            isPublic: true,
          },
        ],
      },
    ],
  },
  // ---------------------------------------------------------------------------
  {
    id: 'exchange',
    label: L('Kontent almashinuvi', 'Контент алмашинуви', 'Обмен контентом', 'Content exchange'),
    sections: [
      {
        id: 'content-exchange',
        label: L(
          'Almashinuv sozlamalari',
          'Алмашинув созламалари',
          'Настройки обмена',
          'Exchange settings',
        ),
        note: L(
          'Moodle "MoodleNet" bandi — bizda IMS Common Cartridge / QTI import-eksport (F-05, F-07)',
          'Moodle "MoodleNet" банди — бизда IMS Common Cartridge / QTI импорт-экспорт (F-05, F-07)',
          'Пункт Moodle "MoodleNet" — у нас импорт/экспорт IMS Common Cartridge и QTI (F-05, F-07)',
          'Moodle "MoodleNet" maps to our IMS Common Cartridge / QTI import and export (F-05, F-07)',
        ),
        fields: [
          {
            key: 'exchange.ccImport',
            type: 'boolean',
            label: L('IMS CC import', 'IMS CC импорт', 'Импорт IMS CC', 'IMS CC import'),
            default: true,
          },
          {
            key: 'exchange.ccExport',
            type: 'boolean',
            label: L('IMS CC eksport', 'IMS CC экспорт', 'Экспорт IMS CC', 'IMS CC export'),
            default: true,
          },
          {
            key: 'exchange.qti',
            type: 'boolean',
            label: L(
              'QTI / AIKEN / GIFT import-eksport',
              'QTI / AIKEN / GIFT импорт-экспорт',
              'Импорт/экспорт QTI / AIKEN / GIFT',
              'QTI / AIKEN / GIFT import and export',
            ),
            default: true,
          },
          {
            key: 'exchange.scorm',
            type: 'boolean',
            label: L(
              'SCORM 1.2 / 2004',
              'SCORM 1.2 / 2004',
              'SCORM 1.2 / 2004',
              'SCORM 1.2 / 2004',
            ),
            default: true,
          },
        ],
      },
    ],
  },
];

/** Barcha maydonlar (tekis ro'yxat). */
export const SITE_SETTING_FIELDS: SiteSettingField[] = SITE_ADMIN_TREE.flatMap((category) =>
  category.sections.flatMap((section) => section.fields),
);

/** `key → standart qiymat`. */
export const SITE_SETTING_DEFAULTS: Record<string, unknown> = Object.fromEntries(
  SITE_SETTING_FIELDS.map((field) => [field.key, field.default]),
);

export function findSiteSection(sectionId: string): SiteSettingSection | undefined {
  for (const category of SITE_ADMIN_TREE) {
    const section = category.sections.find((item) => item.id === sectionId);
    if (section) return section;
  }
  return undefined;
}

export function findSiteField(key: string): SiteSettingField | undefined {
  return SITE_SETTING_FIELDS.find((field) => field.key === key);
}

const HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Bitta maydon uchun zod sxemasi — tur va chegaralardan. */
export function siteFieldSchema(field: SiteSettingField): z.ZodTypeAny {
  switch (field.type) {
    case 'boolean':
      return z.boolean();
    case 'number': {
      let schema = z.coerce.number();
      if (field.min !== undefined) schema = schema.min(field.min);
      if (field.max !== undefined) schema = schema.max(field.max);
      return schema;
    }
    case 'string':
      return field.key.startsWith('notifications.quietHours')
        ? z.string().regex(HH_MM, { message: 'validation.time_hh_mm' })
        : z.string().trim().max(500);
    case 'text':
      return z.string().max(5000);
    case 'color':
      return z.string().regex(/^#[0-9a-fA-F]{6}$/, { message: 'validation.color_hex' });
    case 'select':
      return z.enum((field.options ?? []).map((option) => option.value) as [string, ...string[]]);
    case 'multiselect':
      return z
        .array(z.enum((field.options ?? []).map((option) => option.value) as [string, ...string[]]))
        .max(50);
    case 'list':
      return z.array(z.string().trim().min(1).max(200)).max(200);
    case 'json':
      return z.record(z.unknown());
  }
}

/** Bo'lim formasi uchun zod obyekti: barcha maydonlar ixtiyoriy (qisman yangilash). */
export function siteSectionSchema(section: SiteSettingSection) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of section.fields) {
    if (field.readonly) continue;
    shape[field.key] = siteFieldSchema(field).optional();
  }
  return z.object(shape).strict();
}

/**
 * IP manzil ro'yxatga mos keladimi: aniq IP, prefiks (`192.168.`) yoki IPv4 CIDR.
 * Sof funksiya — API guard va testlar uchun.
 */
export function ipMatches(ip: string, entries: string[]): boolean {
  const normalized = ip.replace(/^::ffff:/, '').trim();
  for (const raw of entries) {
    const entry = raw.trim();
    if (!entry) continue;
    if (entry === normalized) return true;
    if (entry.endsWith('.') && normalized.startsWith(entry)) return true;
    const cidr = entry.match(/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/);
    if (cidr && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) {
      const bits = Number(cidr[2]);
      const toInt = (value: string) =>
        value.split('.').reduce((acc, part) => ((acc << 8) + Number(part)) >>> 0, 0);
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((toInt(normalized) & mask) === (toInt(cidr[1]!) & mask)) return true;
    }
  }
  return false;
}

/** IP ga kirish mumkinmi: taqiq ro'yxati ustun, ruxsat ro'yxati bo'sh bo'lsa — hamma. */
export function isIpAllowed(ip: string, allowList: string[], denyList: string[]): boolean {
  if (ipMatches(ip, denyList)) return false;
  if (allowList.length === 0) return true;
  return ipMatches(ip, allowList);
}
