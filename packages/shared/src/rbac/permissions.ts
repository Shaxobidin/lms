/**
 * Maqsad: ruxsatlar katalogi va rol-ruxsat matritsasi — DEKLARATIV ko'rinishda (promt.md §3).
 *
 * Muhim qoida (ADR / P3): kodda hech qachon `if (user.role === 'admin')` yozilmaydi.
 * Har qanday tekshiruv `@RequirePermission('resource:action:scope')` orqali PolicyGuard'ga
 * topshiriladi. Ushbu fayl — yagona haqiqat manbai; `apps/api/prisma/permissions.seed.ts`
 * uni bazaga yozadi, frontend esa UI elementlarini yashirish uchun o'qiydi.
 */

// --- Asosiy o'lchamlar ------------------------------------------------------

export const RESOURCES = [
  'system',
  'user',
  'role',
  'auditlog',
  'faculty',
  'department',
  'speciality',
  'group',
  'academicyear',
  'curriculum',
  'subject',
  'syllabus',
  'course',
  /**
   * `module` va `topic` alohida ruxsat kalitlariga ega EMAS — ular
   * `lesson:manage:*` bilan boshqariladi. Bu yerda turishining sababi:
   * ABAC scope resolver ularni identifikator bo'yicha kursga bog'lay olishi
   * kerak (`@RequirePermission(..., { resource: 'module' })`).
   */
  'module',
  'topic',
  'lesson',
  'resource',
  'file',
  'enrollment',
  'assignment',
  'submission',
  'rubric',
  'questionbank',
  'quiz',
  'quizattempt',
  'grade',
  'transcript',
  'attendance',
  'schedule',
  'announcement',
  'forum',
  'message',
  'classroom',
  'certificate',
  'analytics',
  'document',
  'badge',
  'payment',
  'integration',
  /** HEMIS "Talaba xizmatlari" arizalari va so'rovnomalar (Talaba bo'limi). */
  'studentrequest',
  'survey',
] as const;

export const ACTIONS = [
  'create',
  'read',
  'update',
  'delete',
  'approve',
  'publish',
  'grade',
  'export',
  'import',
  'manage',
] as const;

/**
 * Scope — ABAC o'lchami. Kengroq scope torroq scope'ni qamrab oladi
 * (`all` > `own_faculty` > `own_department` > `own_course` > `own_group` > `own`).
 */
export const SCOPES = [
  'all',
  'own_faculty',
  'own_department',
  'own_course',
  'own_group',
  'own',
] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];
export type Scope = (typeof SCOPES)[number];
export type PermissionKey = `${Resource}:${Action}:${Scope}`;

/** Scope kengligi: raqam qancha kichik bo'lsa, ruxsat shuncha keng. */
export const SCOPE_RANK: Record<Scope, number> = {
  all: 0,
  own_faculty: 1,
  own_department: 2,
  own_course: 3,
  own_group: 3,
  own: 4,
};

/**
 * `granted` ruxsati `required` ni qamrab oladimi?
 * Masalan `course:read:all` → `course:read:own_course` ni qamrab oladi.
 * `own_group` va `own_course` bir darajada, ammo bir-birini qamramaydi.
 */
export function permissionCovers(granted: PermissionKey, required: PermissionKey): boolean {
  const g = parsePermission(granted);
  const r = parsePermission(required);
  if (!g || !r) return false;
  if (g.resource !== r.resource || g.action !== r.action) return false;
  if (g.scope === r.scope) return true;
  if (SCOPE_RANK[g.scope] >= SCOPE_RANK[r.scope]) return false;
  // own_course va own_group teng darajada — kengaytirish faqat yuqoridan pastga
  if (SCOPE_RANK[g.scope] === SCOPE_RANK[r.scope]) return false;
  return true;
}

export function parsePermission(
  key: string,
): { resource: Resource; action: Action; scope: Scope } | null {
  const parts = key.split(':');
  if (parts.length !== 3) return null;
  const [resource, action, scope] = parts as [string, string, string];
  if (!(RESOURCES as readonly string[]).includes(resource)) return null;
  if (!(ACTIONS as readonly string[]).includes(action)) return null;
  if (!(SCOPES as readonly string[]).includes(scope)) return null;
  return { resource: resource as Resource, action: action as Action, scope: scope as Scope };
}

export function permission(resource: Resource, action: Action, scope: Scope): PermissionKey {
  return `${resource}:${action}:${scope}`;
}

// --- Rollar -----------------------------------------------------------------

export const ROLE_CODES = [
  'SUPER_ADMIN', // R1
  'INSTITUTION_ADMIN', // R2
  'DEANERY', // R3
  'DEPARTMENT_HEAD', // R4
  'METHODIST', // R5
  'TEACHER', // R6
  'TUTOR', // R7
  'STUDENT', // R8
  'EXTERNAL_EXPERT', // R9
  'GUEST', // R10
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export interface RoleDefinition {
  code: RoleCode;
  /** promt.md dagi raqam (R1..R10) — hujjatlar bilan bog'lash uchun. */
  ordinal: string;
  name: Record<'uz-Latn' | 'uz-Cyrl' | 'ru' | 'en', string>;
  /** ABAC uchun: bu rol qaysi atributga bog'lanadi. */
  scopeAttribute: 'none' | 'faculty' | 'department' | 'course' | 'group' | 'self';
  /** Vaqtinchalik rol (muddati tugaydi) — R9. */
  temporary: boolean;
}

export const ROLE_DEFINITIONS: readonly RoleDefinition[] = [
  {
    code: 'SUPER_ADMIN',
    ordinal: 'R1',
    name: {
      'uz-Latn': 'Super administrator',
      'uz-Cyrl': 'Супер администратор',
      ru: 'Супер администратор',
      en: 'Super administrator',
    },
    scopeAttribute: 'none',
    temporary: false,
  },
  {
    code: 'INSTITUTION_ADMIN',
    ordinal: 'R2',
    name: {
      'uz-Latn': 'Muassasa administratori',
      'uz-Cyrl': 'Муассаса администратори',
      ru: 'Администратор учреждения',
      en: 'Institution administrator',
    },
    scopeAttribute: 'none',
    temporary: false,
  },
  {
    code: 'DEANERY',
    ordinal: 'R3',
    name: {
      'uz-Latn': 'Rektorat / Dekanat',
      'uz-Cyrl': 'Ректорат / Деканат',
      ru: 'Ректорат / Деканат',
      en: 'Rectorate / Deanery',
    },
    scopeAttribute: 'faculty',
    temporary: false,
  },
  {
    code: 'DEPARTMENT_HEAD',
    ordinal: 'R4',
    name: {
      'uz-Latn': 'Kafedra mudiri',
      'uz-Cyrl': 'Кафедра мудири',
      ru: 'Заведующий кафедрой',
      en: 'Head of department',
    },
    scopeAttribute: 'department',
    temporary: false,
  },
  {
    code: 'METHODIST',
    ordinal: 'R5',
    name: {
      'uz-Latn': 'Metodist',
      'uz-Cyrl': 'Методист',
      ru: 'Методист',
      en: 'Methodologist',
    },
    scopeAttribute: 'faculty',
    temporary: false,
  },
  {
    code: 'TEACHER',
    ordinal: 'R6',
    name: {
      'uz-Latn': "Professor-o'qituvchi",
      'uz-Cyrl': 'Профессор-ўқитувчи',
      ru: 'Преподаватель',
      en: 'Teacher',
    },
    scopeAttribute: 'course',
    temporary: false,
  },
  {
    code: 'TUTOR',
    ordinal: 'R7',
    name: {
      'uz-Latn': 'Tyutor / Kurator',
      'uz-Cyrl': 'Тьютор / Куратор',
      ru: 'Тьютор / Куратор',
      en: 'Tutor / Curator',
    },
    scopeAttribute: 'group',
    temporary: false,
  },
  {
    code: 'STUDENT',
    ordinal: 'R8',
    name: {
      'uz-Latn': 'Talaba / Tinglovchi',
      'uz-Cyrl': 'Талаба / Тингловчи',
      ru: 'Студент / Слушатель',
      en: 'Student / Learner',
    },
    scopeAttribute: 'self',
    temporary: false,
  },
  {
    code: 'EXTERNAL_EXPERT',
    ordinal: 'R9',
    name: {
      'uz-Latn': 'Tashqi ekspert',
      'uz-Cyrl': 'Ташқи эксперт',
      ru: 'Внешний эксперт',
      en: 'External expert',
    },
    scopeAttribute: 'course',
    temporary: true,
  },
  {
    code: 'GUEST',
    ordinal: 'R10',
    name: { 'uz-Latn': 'Mehmon', 'uz-Cyrl': 'Меҳмон', ru: 'Гость', en: 'Guest' },
    scopeAttribute: 'none',
    temporary: false,
  },
];

// --- Rol -> ruxsat matritsasi (DEKLARATIV) ----------------------------------

/**
 * Matritsa. Har bir qator — rol, har bir element — `resource:action:scope`.
 * Yangi ruxsat qo'shish uchun faqat shu ro'yxat tahrirlanadi, kod o'zgarmaydi.
 */
export const ROLE_PERMISSION_MATRIX: Record<RoleCode, readonly PermissionKey[]> = {
  // R1 — tizim konfiguratsiyasi, rollar, audit, backup
  SUPER_ADMIN: [
    'system:manage:all',
    'role:manage:all',
    'auditlog:read:all',
    'user:manage:all',
    'integration:manage:all',
    'file:manage:all',
    // Super admin barcha o'qish huquqlariga ham ega
    'faculty:read:all',
    'department:read:all',
    'course:read:all',
    'grade:read:all',
    'analytics:read:all',
    'studentrequest:manage:all',
    'survey:manage:all',
  ],

  // R2 — tashkiliy tuzilma, o'quv yili, global sozlamalar
  INSTITUTION_ADMIN: [
    'system:read:all',
    'system:update:all',
    'user:create:all',
    'user:read:all',
    'user:update:all',
    'user:import:all',
    'role:read:all',
    'faculty:manage:all',
    'department:manage:all',
    'speciality:manage:all',
    'group:manage:all',
    'academicyear:manage:all',
    'curriculum:read:all',
    'subject:manage:all',
    'course:read:all',
    'schedule:manage:all',
    'analytics:read:all',
    'document:create:all',
    'document:export:all',
    'certificate:read:all',
    'auditlog:read:all',
    'integration:read:all',
    'payment:read:all',
    'badge:manage:all',
    'announcement:create:all',
    'studentrequest:manage:all',
    'survey:manage:all',
  ],

  // R3 — fakultet bo'yicha analitika, tasdiqlash, buyruq
  DEANERY: [
    'user:read:own_faculty',
    'faculty:read:own_faculty',
    'department:read:own_faculty',
    'speciality:read:own_faculty',
    'group:read:own_faculty',
    'group:update:own_faculty',
    'curriculum:read:own_faculty',
    'curriculum:approve:own_faculty',
    'syllabus:read:own_faculty',
    'syllabus:approve:own_faculty',
    // Sillabusga interfeys orqali fanlar ro'yxatidan boriladi — tasdiqlovchi ro'yxatni ko'rishi shart
    'subject:read:own_faculty',
    'course:read:own_faculty',
    'course:publish:own_faculty',
    'enrollment:read:own_faculty',
    'enrollment:update:own_faculty',
    'grade:read:own_faculty',
    'grade:update:own_faculty',
    'transcript:read:own_faculty',
    'transcript:export:own_faculty',
    'attendance:read:own_faculty',
    'schedule:read:own_faculty',
    'analytics:read:own_faculty',
    'document:create:own_faculty',
    'document:export:own_faculty',
    'certificate:read:own_faculty',
    'certificate:approve:own_faculty',
    'announcement:create:own_faculty',
    'auditlog:read:own_faculty',
    'studentrequest:manage:own_faculty',
    'survey:manage:own_faculty',
  ],

  // R4 — kafedra kurslari, yuklama, sillabus tasdig'i
  DEPARTMENT_HEAD: [
    'user:read:own_department',
    'department:read:own_department',
    'department:update:own_department',
    'subject:read:own_department',
    'subject:update:own_department',
    'curriculum:read:own_department',
    'syllabus:read:own_department',
    'syllabus:update:own_department',
    'syllabus:approve:own_department',
    'course:create:own_department',
    'course:read:own_department',
    'course:update:own_department',
    'course:publish:own_department',
    'questionbank:read:own_department',
    'grade:read:own_department',
    'attendance:read:own_department',
    'schedule:read:own_department',
    'schedule:update:own_department',
    'analytics:read:own_department',
    'document:export:own_department',
    'announcement:create:own_department',
  ],

  // R5 — O'UM, sillabus, ishchi dastur konstruktori; sifat monitoringi
  METHODIST: [
    'curriculum:create:own_faculty',
    'curriculum:read:own_faculty',
    'curriculum:update:own_faculty',
    'subject:read:own_faculty',
    'subject:create:own_faculty',
    'subject:update:own_faculty',
    'syllabus:create:own_faculty',
    'syllabus:read:own_faculty',
    'syllabus:update:own_faculty',
    'course:read:own_faculty',
    'lesson:read:own_faculty',
    'resource:read:own_faculty',
    'questionbank:read:own_faculty',
    'analytics:read:own_faculty',
    'document:create:own_faculty',
    'document:export:own_faculty',
    'survey:manage:own_faculty',
  ],

  // R6 — kurs yaratish, kontent, topshiriq, baholash, davomat
  TEACHER: [
    'course:create:own',
    'course:read:own_course',
    'course:update:own_course',
    'course:publish:own_course',
    'lesson:manage:own_course',
    'resource:manage:own_course',
    'file:create:own',
    'file:read:own_course',
    'enrollment:read:own_course',
    'enrollment:create:own_course',
    'assignment:manage:own_course',
    'submission:read:own_course',
    'submission:grade:own_course',
    'rubric:manage:own_course',
    'questionbank:manage:own_course',
    'quiz:manage:own_course',
    'quizattempt:read:own_course',
    'quizattempt:grade:own_course',
    'grade:create:own_course',
    'grade:read:own_course',
    'grade:update:own_course',
    'grade:export:own_course',
    'attendance:manage:own_course',
    'schedule:read:own_course',
    'announcement:create:own_course',
    'forum:manage:own_course',
    'message:create:own',
    'classroom:manage:own_course',
    'analytics:read:own_course',
    'document:export:own_course',
    'syllabus:read:own_course',
    'certificate:create:own_course',
  ],

  // R7 — guruh monitoringi, davomat, ota-ona bilan aloqa
  TUTOR: [
    'user:read:own_group',
    'group:read:own_group',
    'enrollment:read:own_group',
    'grade:read:own_group',
    'transcript:read:own_group',
    'attendance:read:own_group',
    'attendance:update:own_group',
    'schedule:read:own_group',
    'analytics:read:own_group',
    'announcement:create:own_group',
    'message:create:own',
    'document:export:own_group',
    'studentrequest:read:own_group',
  ],

  // R8 — kurslar, topshiriq, test, reyting, sertifikat
  STUDENT: [
    'course:read:own',
    'lesson:read:own',
    'resource:read:own',
    'file:create:own',
    'enrollment:create:own',
    'enrollment:read:own',
    'assignment:read:own',
    'submission:create:own',
    'submission:read:own',
    'submission:update:own',
    'quiz:read:own',
    'quizattempt:create:own',
    'quizattempt:read:own',
    'grade:read:own',
    'transcript:read:own',
    'transcript:export:own',
    'attendance:read:own',
    'schedule:read:own',
    'forum:create:own',
    'forum:read:own',
    'message:create:own',
    'classroom:read:own',
    'certificate:read:own',
    'badge:read:own',
    'payment:create:own',
    'payment:read:own',
    'analytics:read:own',
    'curriculum:read:own',
    'studentrequest:create:own',
    'studentrequest:read:own',
    'survey:read:own',
  ],

  // R9 — faqat o'qish + baholash (vaqtinchalik token bilan)
  EXTERNAL_EXPERT: [
    'course:read:own_course',
    'lesson:read:own_course',
    'resource:read:own_course',
    'submission:read:own_course',
    'submission:grade:own_course',
    'quizattempt:read:own_course',
    'syllabus:read:own_course',
  ],

  // R10 — ochiq kurslar katalogi
  GUEST: ['course:read:all'],
};

/** Katalogdagi barcha noyob ruxsatlar (bazaga `Permission` sifatida yoziladi). */
export const ALL_PERMISSIONS: readonly PermissionKey[] = Array.from(
  new Set(Object.values(ROLE_PERMISSION_MATRIX).flat()),
).sort() as PermissionKey[];

/**
 * `manage` — barcha CRUD amallarini qamrab oluvchi maxsus amal.
 * PolicyGuard tekshiruvda buni hisobga oladi.
 */
export const MANAGE_IMPLIES: readonly Action[] = [
  'create',
  'read',
  'update',
  'delete',
  'publish',
  'approve',
  'grade',
  'export',
  'import',
];

/**
 * Berilgan ruxsatlar to'plami talab qilingan ruxsatni qoplaydimi.
 * Bu yagona joyda amalga oshiriladi — backend PolicyGuard va frontend UI bir xil ishlaydi.
 */
export function hasPermission(
  granted: readonly PermissionKey[] | ReadonlySet<PermissionKey>,
  required: PermissionKey,
): boolean {
  const grantedList = granted instanceof Set ? Array.from(granted) : (granted as PermissionKey[]);
  const req = parsePermission(required);
  if (!req) return false;

  for (const key of grantedList) {
    const g = parsePermission(key);
    if (!g) continue;
    if (g.resource !== req.resource) continue;

    const actionMatches =
      g.action === req.action || (g.action === 'manage' && MANAGE_IMPLIES.includes(req.action));
    if (!actionMatches) continue;

    if (g.scope === req.scope) return true;
    if (SCOPE_RANK[g.scope] < SCOPE_RANK[req.scope]) return true;
  }
  return false;
}

/** Rolga tegishli ruxsatlarni yig'ish (bir nechta rol bo'lishi mumkin). */
export function permissionsForRoles(roles: readonly RoleCode[]): PermissionKey[] {
  const set = new Set<PermissionKey>();
  for (const role of roles) {
    for (const key of ROLE_PERMISSION_MATRIX[role] ?? []) set.add(key);
  }
  return Array.from(set).sort();
}
