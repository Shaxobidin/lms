/**
 * Maqsad: realistik demo ma'lumotlar (promt.md §14).
 *
 * Talab: kamida 3 fakultet, 20 o'qituvchi, 200 talaba, 15 kurs.
 * Bu seed shundan ko'proq beradi va HAR BIR ROL uchun kirish mumkin bo'lgan
 * hisob yaratadi (§15 qabul mezoni).
 *
 * Ishga tushirish: `npm run db:seed`
 * Idempotent: qayta ishga tushirilsa mavjud yozuvlarni yangilaydi.
 */

import { PrismaClient, type Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import {
  CONTROL_TYPES,
  CONTROL_TYPE_NAMES,
  DEFAULT_GRADE_SCALE,
  DEFAULT_GRADING_POLICY,
  normalizeForSearch,
  type LocalizedText,
} from '@lms/shared';
import { seedPermissions } from './permissions.seed';

const prisma = new PrismaClient();

/** Demo hisoblar uchun yagona parol — faqat dev muhitida ishlatiladi. */
const DEMO_PASSWORD = 'Demo!2026';

/** Deterministik tasodifiy — seed har safar bir xil natija beradi. */
let randomState = 20260904;
function random(): number {
  randomState = (randomState * 1664525 + 1013904223) % 4294967296;
  return randomState / 4294967296;
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(random() * items.length)] as T;
}

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

const UZBEK_FIRST_NAMES_MALE = [
  'Aziz',
  'Jasur',
  'Bekzod',
  'Sardor',
  'Otabek',
  'Shohruh',
  'Javohir',
  'Diyor',
  'Ulugbek',
  'Farrux',
  'Sanjar',
  'Temur',
  'Nodir',
  'Alisher',
  'Rustam',
];
const UZBEK_FIRST_NAMES_FEMALE = [
  'Dilnoza',
  'Nilufar',
  'Zilola',
  'Malika',
  'Sevara',
  'Gulnora',
  'Kamola',
  'Shahnoza',
  'Feruza',
  'Madina',
  'Nigora',
  'Zarina',
  'Hulkar',
  'Mohira',
];
const UZBEK_LAST_NAMES = [
  'Karimov',
  'Rahimov',
  'Toshmatov',
  'Yusupov',
  'Ergashev',
  'Sobirov',
  'Nazarov',
  'Umarov',
  'Xolmatov',
  'Qodirov',
  'Ismoilov',
  'Salimov',
  "Jo'rayev",
  'Mirzayev',
  'Abdullayev',
  'Tursunov',
  'Sharipov',
  'Bekmurodov',
  "Yo'ldoshev",
  'Xasanov',
];

function makeName(index: number): { firstName: string; lastName: string; middleName: string } {
  const isFemale = index % 2 === 0;
  const first = isFemale
    ? (UZBEK_FIRST_NAMES_FEMALE[index % UZBEK_FIRST_NAMES_FEMALE.length] as string)
    : (UZBEK_FIRST_NAMES_MALE[index % UZBEK_FIRST_NAMES_MALE.length] as string);
  const last = UZBEK_LAST_NAMES[index % UZBEK_LAST_NAMES.length] as string;
  const patronymicBase = UZBEK_FIRST_NAMES_MALE[
    (index * 3) % UZBEK_FIRST_NAMES_MALE.length
  ] as string;

  return {
    firstName: first,
    lastName: isFemale ? `${last}a` : last,
    middleName: isFemale ? `${patronymicBase}ovna` : `${patronymicBase}ovich`,
  };
}

function localized(uz: string, cyr: string, ru: string, en: string): LocalizedText {
  return { 'uz-Latn': uz, 'uz-Cyrl': cyr, ru, en };
}

async function main(): Promise<void> {
  console.log("QDU LMS — demo ma'lumotlarni yuklash boshlandi\n");

  const passwordHash = await argon2.hash(DEMO_PASSWORD, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  // --- 1. Rollar va ruxsatlar ---------------------------------------------
  const rbac = await seedPermissions(prisma);
  console.log(
    `  Ruxsatlar: ${rbac.permissions}, rollar: ${rbac.roles}, biriktirishlar: ${rbac.assignments}`,
  );

  const roles = await prisma.role.findMany({ select: { id: true, code: true } });
  const roleId = (code: string): string => {
    const role = roles.find((item) => item.code === code);
    if (!role) throw new Error(`Rol topilmadi: ${code}`);
    return role.id;
  };

  // --- 2. Nazorat turlari va baholash shkalasi ----------------------------
  for (const [index, code] of CONTROL_TYPES.entries()) {
    await prisma.controlType.upsert({
      where: { code },
      create: {
        code,
        name: CONTROL_TYPE_NAMES[code],
        defaultWeight: DEFAULT_GRADING_POLICY.weights[code],
        position: index,
      },
      update: { name: CONTROL_TYPE_NAMES[code] },
    });
  }

  for (const band of DEFAULT_GRADE_SCALE) {
    await prisma.gradeScale.upsert({
      where: { code: band.letter },
      create: {
        code: band.letter,
        minScore: band.min,
        maxScore: band.max,
        letter: band.letter,
        gpaPoints: band.gpa,
        fiveScale: band.five,
        labelKey: band.labelKey,
      },
      update: { minScore: band.min, maxScore: band.max, gpaPoints: band.gpa },
    });
  }
  console.log(
    `  Nazorat turlari: ${CONTROL_TYPES.length}, baho shkalasi: ${DEFAULT_GRADE_SCALE.length}`,
  );

  // --- 3. Sozlamalar va feature flags -------------------------------------
  const settings: Array<[string, unknown, string, boolean]> = [
    ['institution.name', "Qo'qon Davlat Universiteti", 'Muassasa nomi', true],
    ['institution.shortName', 'QDU', 'Qisqartma', true],
    ['institution.address', "Qo'qon shahri, Turkiston ko'chasi, 23-uy", 'Manzil', true],
    ['institution.phone', '+998 73 555 12 34', 'Telefon', true],
    ['grading.passingScore', 60, "O'zlashtirish uchun minimal ball", true],
    ['grading.finalExamThreshold', 36, 'YN ga kirish chegarasi', true],
    ['attendance.warningThreshold', 75, 'Davomat ogohlantirish chegarasi', true],
    ['ui.defaultLocale', 'uz-Latn', 'Standart til', true],
    ['ui.accentColor', '#0f4c81', 'Aksent rang', true],
  ];

  for (const [key, value, description, isPublic] of settings) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never, description, isPublic },
      update: { value: value as never, description, isPublic },
    });
  }

  const flags: Array<[string, boolean, string]> = [
    ['gamification', true, 'Badge, XP va reyting'],
    ['payments', true, 'Pullik kurslar'],
    ['proctoring', false, 'Imtihon nazorati hooklari'],
    ['telegram', false, 'Telegram bildirishnomalari'],
    ['peer_review', true, "Talabalarning o'zaro baholashi"],
  ];

  for (const [key, enabled, description] of flags) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, description, rolloutRules: {} },
      update: { description },
    });
  }
  console.log(`  Sozlamalar: ${settings.length}, feature flags: ${flags.length}`);

  // --- 4. Akademik kalendar ------------------------------------------------
  const academicYear = await prisma.academicYear.upsert({
    where: { name: '2026-2027' },
    create: {
      name: '2026-2027',
      startsAt: new Date('2026-09-01'),
      endsAt: new Date('2027-06-30'),
      isCurrent: true,
    },
    update: { isCurrent: true },
    select: { id: true },
  });

  const existingSemester = await prisma.semester.findFirst({
    where: { academicYearId: academicYear.id, number: 1 },
    select: { id: true },
  });

  const semester =
    existingSemester ??
    (await prisma.semester.create({
      data: {
        academicYearId: academicYear.id,
        number: 1,
        startsAt: new Date('2026-09-01'),
        endsAt: new Date('2027-01-25'),
        isCurrent: true,
        gradingClosesAt: new Date('2027-02-05'),
      },
      select: { id: true },
    }));

  console.log("  O'quv yili 2026-2027, 1-semestr yaratildi");

  // --- 5. Tashkiliy tuzilma ------------------------------------------------
  const facultyData = [
    {
      code: 'FAK-PED',
      name: localized('Pedagogika', 'Педагогика', 'Педагогика', 'Pedagogy'),
      departments: [
        {
          code: 'KAF-PED',
          name: localized(
            'Pedagogika va psixologiya',
            'Педагогика ва психология',
            'Педагогика и психология',
            'Pedagogy and psychology',
          ),
        },
        {
          code: 'KAF-BOSH',
          name: localized(
            "Boshlang'ich ta'lim",
            'Бошланғич таълим',
            'Начальное образование',
            'Primary education',
          ),
        },
      ],
    },
    {
      code: 'FAK-ANIQ',
      name: localized('Aniq fanlar', 'Аниқ фанлар', 'Точные науки', 'Exact sciences'),
      departments: [
        {
          code: 'KAF-MAT',
          name: localized('Matematika', 'Математика', 'Математика', 'Mathematics'),
        },
        {
          code: 'KAF-INF',
          name: localized(
            'Axborot texnologiyalari',
            'Ахборот технологиялари',
            'Информационные технологии',
            'Information technologies',
          ),
        },
        { code: 'KAF-FIZ', name: localized('Fizika', 'Физика', 'Физика', 'Physics') },
      ],
    },
    {
      code: 'FAK-FIL',
      name: localized('Filologiya', 'Филология', 'Филология', 'Philology'),
      departments: [
        {
          code: 'KAF-UZB',
          name: localized(
            "O'zbek tili va adabiyoti",
            'Ўзбек тили ва адабиёти',
            'Узбекский язык и литература',
            'Uzbek language and literature',
          ),
        },
        {
          code: 'KAF-ING',
          name: localized('Ingliz tili', 'Инглиз тили', 'Английский язык', 'English language'),
        },
      ],
    },
  ];

  const departmentIds = new Map<string, string>();
  const facultyIds = new Map<string, string>();

  for (const [index, faculty] of facultyData.entries()) {
    const created = await prisma.faculty.upsert({
      where: { code: faculty.code },
      create: { code: faculty.code, name: faculty.name as never, position: index },
      update: { name: faculty.name as never },
      select: { id: true },
    });
    facultyIds.set(faculty.code, created.id);

    for (const department of faculty.departments) {
      const dep = await prisma.department.upsert({
        where: { code: department.code },
        create: {
          code: department.code,
          name: department.name as never,
          facultyId: created.id,
        },
        update: { name: department.name as never },
        select: { id: true },
      });
      departmentIds.set(department.code, dep.id);
    }
  }
  console.log(`  Fakultetlar: ${facultyData.length}, kafedralar: ${departmentIds.size}`);

  // --- 6. Yo'nalishlar va guruhlar ----------------------------------------
  const specialityData = [
    {
      code: '60110100',
      dep: 'KAF-PED',
      name: localized('Pedagogika', 'Педагогика', 'Педагогика', 'Pedagogy'),
      level: 'BACHELOR' as const,
    },
    {
      code: '60110200',
      dep: 'KAF-BOSH',
      name: localized(
        "Boshlang'ich ta'lim",
        'Бошланғич таълим',
        'Начальное образование',
        'Primary education',
      ),
      level: 'BACHELOR' as const,
    },
    {
      code: '60540100',
      dep: 'KAF-MAT',
      name: localized('Matematika', 'Математика', 'Математика', 'Mathematics'),
      level: 'BACHELOR' as const,
    },
    {
      code: '60610100',
      dep: 'KAF-INF',
      name: localized(
        'Kompyuter injiniringi',
        'Компьютер инжиниринги',
        'Компьютерный инжиниринг',
        'Computer engineering',
      ),
      level: 'BACHELOR' as const,
    },
    {
      code: '60530100',
      dep: 'KAF-FIZ',
      name: localized('Fizika', 'Физика', 'Физика', 'Physics'),
      level: 'BACHELOR' as const,
    },
    {
      code: '60230100',
      dep: 'KAF-UZB',
      name: localized(
        "Filologiya (o'zbek tili)",
        'Филология (ўзбек тили)',
        'Филология (узбекский язык)',
        'Philology (Uzbek)',
      ),
      level: 'BACHELOR' as const,
    },
    {
      code: '60230101',
      dep: 'KAF-ING',
      name: localized(
        'Filologiya (ingliz tili)',
        'Филология (инглиз тили)',
        'Филология (английский язык)',
        'Philology (English)',
      ),
      level: 'BACHELOR' as const,
    },
    {
      code: '70610101',
      dep: 'KAF-INF',
      name: localized(
        "Sun'iy intellekt (magistratura)",
        'Сунъий интеллект',
        'Искусственный интеллект',
        'Artificial intelligence',
      ),
      level: 'MASTER' as const,
    },
  ];

  const specialityIds = new Map<string, string>();
  for (const speciality of specialityData) {
    const created = await prisma.speciality.upsert({
      where: { code: speciality.code },
      create: {
        code: speciality.code,
        name: speciality.name as never,
        level: speciality.level,
        durationYears: speciality.level === 'MASTER' ? 2 : 4,
        departmentId: departmentIds.get(speciality.dep) as string,
      },
      update: { name: speciality.name as never },
      select: { id: true },
    });
    specialityIds.set(speciality.code, created.id);
  }

  const groupNames: Array<{ name: string; speciality: string; year: number }> = [];
  const groupPrefixes: Record<string, string> = {
    '60110100': 'PED',
    '60110200': 'BOT',
    '60540100': 'MAT',
    '60610100': 'KI',
    '60530100': 'FIZ',
    '60230100': 'FIL',
    '60230101': 'ING',
    '70610101': 'SI',
  };

  for (const speciality of specialityData) {
    const prefix = groupPrefixes[speciality.code] ?? 'GR';
    const years = speciality.level === 'MASTER' ? [2026] : [2024, 2025, 2026];
    for (const year of years) {
      for (let n = 1; n <= 2; n += 1) {
        groupNames.push({
          name: `${prefix}-${String(year).slice(2)}-${String(n).padStart(2, '0')}`,
          speciality: speciality.code,
          year,
        });
      }
    }
  }

  const groupIds = new Map<string, string>();
  for (const group of groupNames) {
    const created = await prisma.group.upsert({
      where: { name: group.name },
      create: {
        name: group.name,
        specialityId: specialityIds.get(group.speciality) as string,
        admissionYear: group.year,
        educationForm: 'DAYTIME',
        languageOfInstruction: 'uz-Latn',
      },
      update: {},
      select: { id: true },
    });
    groupIds.set(group.name, created.id);
  }
  console.log(`  Yo'nalishlar: ${specialityData.length}, guruhlar: ${groupIds.size}`);

  // --- 7. Fanlar -----------------------------------------------------------
  const subjectData = [
    {
      code: 'MAT101',
      dep: 'KAF-MAT',
      name: localized(
        'Oliy matematika',
        'Олий математика',
        'Высшая математика',
        'Higher mathematics',
      ),
      credits: 6,
    },
    {
      code: 'MAT201',
      dep: 'KAF-MAT',
      name: localized(
        'Diskret matematika',
        'Дискрет математика',
        'Дискретная математика',
        'Discrete mathematics',
      ),
      credits: 5,
    },
    {
      code: 'MAT301',
      dep: 'KAF-MAT',
      name: localized(
        'Ehtimollar nazariyasi',
        'Эҳтимоллар назарияси',
        'Теория вероятностей',
        'Probability theory',
      ),
      credits: 4,
    },
    {
      code: 'INF101',
      dep: 'KAF-INF',
      name: localized(
        'Axborot texnologiyalari',
        'Ахборот технологиялари',
        'Информационные технологии',
        'Information technologies',
      ),
      credits: 5,
    },
    {
      code: 'INF201',
      dep: 'KAF-INF',
      name: localized(
        'Dasturlash asoslari',
        'Дастурлаш асослари',
        'Основы программирования',
        'Programming fundamentals',
      ),
      credits: 6,
    },
    {
      code: 'INF202',
      dep: 'KAF-INF',
      name: localized("Ma'lumotlar bazasi", 'Маълумотлар базаси', 'Базы данных', 'Databases'),
      credits: 5,
    },
    {
      code: 'INF301',
      dep: 'KAF-INF',
      name: localized('Web dasturlash', 'Веб дастурлаш', 'Веб-программирование', 'Web development'),
      credits: 5,
    },
    {
      code: 'INF401',
      dep: 'KAF-INF',
      name: localized(
        "Sun'iy intellekt asoslari",
        'Сунъий интеллект асослари',
        'Основы искусственного интеллекта',
        'AI fundamentals',
      ),
      credits: 6,
    },
    {
      code: 'FIZ101',
      dep: 'KAF-FIZ',
      name: localized('Umumiy fizika', 'Умумий физика', 'Общая физика', 'General physics'),
      credits: 5,
    },
    {
      code: 'PED101',
      dep: 'KAF-PED',
      name: localized(
        'Pedagogika nazariyasi',
        'Педагогика назарияси',
        'Теория педагогики',
        'Pedagogy theory',
      ),
      credits: 4,
    },
    {
      code: 'PED201',
      dep: 'KAF-PED',
      name: localized(
        'Yosh psixologiyasi',
        'Ёш психологияси',
        'Возрастная психология',
        'Developmental psychology',
      ),
      credits: 4,
    },
    {
      code: 'BOT101',
      dep: 'KAF-BOSH',
      name: localized(
        "Boshlang'ich ta'lim metodikasi",
        'Бошланғич таълим методикаси',
        'Методика начального образования',
        'Primary education methods',
      ),
      credits: 5,
    },
    {
      code: 'UZB101',
      dep: 'KAF-UZB',
      name: localized("O'zbek tili", 'Ўзбек тили', 'Узбекский язык', 'Uzbek language'),
      credits: 4,
    },
    {
      code: 'UZB201',
      dep: 'KAF-UZB',
      name: localized(
        "O'zbek adabiyoti",
        'Ўзбек адабиёти',
        'Узбекская литература',
        'Uzbek literature',
      ),
      credits: 4,
    },
    {
      code: 'ING101',
      dep: 'KAF-ING',
      name: localized(
        'Ingliz tili (B1)',
        'Инглиз тили (B1)',
        'Английский язык (B1)',
        'English (B1)',
      ),
      credits: 6,
    },
    {
      code: 'ING201',
      dep: 'KAF-ING',
      name: localized(
        'Ingliz tili (B2)',
        'Инглиз тили (B2)',
        'Английский язык (B2)',
        'English (B2)',
      ),
      credits: 6,
    },
  ];

  const subjectIds = new Map<string, string>();
  for (const subject of subjectData) {
    const created = await prisma.subject.upsert({
      where: { code: subject.code },
      create: {
        code: subject.code,
        name: subject.name as never,
        credits: subject.credits,
        controlForm: 'EXAM',
        departmentId: departmentIds.get(subject.dep) as string,
        prerequisiteIds: [],
        searchText: normalizeForSearch(`${Object.values(subject.name).join(' ')} ${subject.code}`),
      },
      update: { name: subject.name as never },
      select: { id: true },
    });
    subjectIds.set(subject.code, created.id);
  }
  console.log(`  Fanlar: ${subjectData.length}`);

  // --- 8. Foydalanuvchilar -------------------------------------------------
  // Har bir rol uchun demo hisob (§15 qabul mezoni)
  const demoAccounts: Array<{
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    facultyCode?: string;
    departmentCode?: string;
  }> = [
    { email: 'admin@qdu.uz', role: 'SUPER_ADMIN', firstName: 'Bosh', lastName: 'Administrator' },
    {
      email: 'rector@qdu.uz',
      role: 'INSTITUTION_ADMIN',
      firstName: 'Muassasa',
      lastName: 'Administratori',
    },
    {
      email: 'dekan@qdu.uz',
      role: 'DEANERY',
      firstName: 'Anvar',
      lastName: 'Rahimov',
      facultyCode: 'FAK-ANIQ',
    },
    {
      email: 'mudir@qdu.uz',
      role: 'DEPARTMENT_HEAD',
      firstName: 'Sanjar',
      lastName: 'Qodirov',
      departmentCode: 'KAF-INF',
    },
    {
      email: 'metodist@qdu.uz',
      role: 'METHODIST',
      firstName: 'Nilufar',
      lastName: 'Sobirova',
      facultyCode: 'FAK-ANIQ',
    },
    {
      email: 'oqituvchi@qdu.uz',
      role: 'TEACHER',
      firstName: 'Aziz',
      lastName: 'Karimov',
      departmentCode: 'KAF-INF',
    },
    {
      email: 'tyutor@qdu.uz',
      role: 'TUTOR',
      firstName: 'Kamola',
      lastName: 'Yusupova',
      facultyCode: 'FAK-ANIQ',
    },
    { email: 'talaba@qdu.uz', role: 'STUDENT', firstName: 'Dilnoza', lastName: 'Rahimova' },
    { email: 'ekspert@qdu.uz', role: 'EXTERNAL_EXPERT', firstName: 'Tashqi', lastName: 'Ekspert' },
  ];

  const demoUserIds = new Map<string, string>();

  for (const account of demoAccounts) {
    const user = await prisma.user.upsert({
      where: { email: account.email },
      create: {
        email: account.email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        locale: 'uz-Latn',
        searchText: normalizeForSearch(`${account.lastName} ${account.firstName} ${account.email}`),
        profile: {
          create: { firstName: account.firstName, lastName: account.lastName },
        },
      },
      update: { passwordHash, status: 'ACTIVE' },
      select: { id: true },
    });

    demoUserIds.set(account.email, user.id);

    const existingRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: roleId(account.role) },
      select: { id: true },
    });

    if (!existingRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: roleId(account.role),
          scopeFacultyId: account.facultyCode ? facultyIds.get(account.facultyCode) : null,
          scopeDepartmentId: account.departmentCode
            ? departmentIds.get(account.departmentCode)
            : null,
          expiresAt:
            account.role === 'EXTERNAL_EXPERT' ? new Date(Date.now() + 90 * 86_400_000) : null,
        },
      });
    }
  }

  // Qo'shimcha o'qituvchilar (jami 20+)
  const teacherIds: string[] = [demoUserIds.get('oqituvchi@qdu.uz') as string];
  const departmentCodes = Array.from(departmentIds.keys());

  for (let i = 0; i < 22; i += 1) {
    const name = makeName(i + 100);
    const email = `teacher${i + 1}@qdu.uz`;
    const departmentCode = departmentCodes[i % departmentCodes.length] as string;

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        searchText: normalizeForSearch(`${name.lastName} ${name.firstName} ${email}`),
        profile: {
          create: {
            firstName: name.firstName,
            lastName: name.lastName,
            middleName: name.middleName,
          },
        },
      },
      update: {},
      select: { id: true },
    });

    const hasRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: roleId('TEACHER') },
      select: { id: true },
    });
    if (!hasRole) {
      await prisma.userRole.create({
        data: {
          userId: user.id,
          roleId: roleId('TEACHER'),
          scopeDepartmentId: departmentIds.get(departmentCode) as string,
        },
      });
    }

    teacherIds.push(user.id);
  }
  console.log(`  O'qituvchilar: ${teacherIds.length}`);

  // Talabalar (200+)
  const groupList = Array.from(groupIds.entries());
  const studentIds: string[] = [];

  // Demo talabani birinchi guruhga joylaymiz
  const demoStudentId = demoUserIds.get('talaba@qdu.uz') as string;
  const firstGroupId = groupList[0]?.[1] as string;
  const demoMembership = await prisma.groupMember.findFirst({
    where: { userId: demoStudentId, leftAt: null },
    select: { id: true },
  });
  if (!demoMembership) {
    await prisma.groupMember.create({ data: { userId: demoStudentId, groupId: firstGroupId } });
  }
  studentIds.push(demoStudentId);

  for (let i = 0; i < 220; i += 1) {
    const name = makeName(i);
    const email = `student${i + 1}@student.qdu.uz`;
    const group = groupList[i % groupList.length];
    if (!group) continue;

    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        status: 'ACTIVE',
        emailVerifiedAt: new Date(),
        phone: `+9989${String(randomInt(10_000_000, 99_999_999))}`,
        searchText: normalizeForSearch(`${name.lastName} ${name.firstName} ${email}`),
        profile: {
          create: {
            firstName: name.firstName,
            lastName: name.lastName,
            middleName: name.middleName,
            birthDate: new Date(`${randomInt(2003, 2008)}-0${randomInt(1, 9)}-1${randomInt(0, 8)}`),
          },
        },
      },
      update: {},
      select: { id: true },
    });

    const hasRole = await prisma.userRole.findFirst({
      where: { userId: user.id, roleId: roleId('STUDENT') },
      select: { id: true },
    });
    if (!hasRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: roleId('STUDENT') } });
    }

    const membership = await prisma.groupMember.findFirst({
      where: { userId: user.id, leftAt: null },
      select: { id: true },
    });
    if (!membership) {
      await prisma.groupMember.create({ data: { userId: user.id, groupId: group[1] } });
    }

    studentIds.push(user.id);
  }
  console.log(`  Talabalar: ${studentIds.length}`);

  // Tyutorni guruhlarga kurator qilib biriktiramiz
  const tutorId = demoUserIds.get('tyutor@qdu.uz') as string;
  await prisma.group.updateMany({
    where: { name: { in: [groupList[0]?.[0] ?? '', groupList[1]?.[0] ?? ''] } },
    data: { curatorId: tutorId },
  });

  // Dekan va kafedra mudirini biriktirish
  await prisma.faculty.update({
    where: { code: 'FAK-ANIQ' },
    data: { deanId: demoUserIds.get('dekan@qdu.uz') },
  });
  await prisma.department.update({
    where: { code: 'KAF-INF' },
    data: { headId: demoUserIds.get('mudir@qdu.uz') },
  });

  // --- 9. Sillabuslar ------------------------------------------------------
  let syllabusCount = 0;
  for (const subject of subjectData.slice(0, 10)) {
    const subjectId = subjectIds.get(subject.code) as string;
    const existing = await prisma.syllabus.findFirst({
      where: { subjectId },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.syllabus.create({
      data: {
        subjectId,
        departmentId: departmentIds.get(subject.dep) as string,
        status: 'APPROVED',
        currentVersion: 1,
        versions: {
          create: {
            version: 1,
            status: 'APPROVED',
            approvedAt: new Date(),
            authorId: demoUserIds.get('metodist@qdu.uz') as string,
            approvedById: demoUserIds.get('mudir@qdu.uz') as string,
            gradingPolicy: DEFAULT_GRADING_POLICY as never,
            content: {
              goal: localized(
                `${subject.name['uz-Latn']} fani bo'yicha nazariy bilim va amaliy ko'nikmalarni shakllantirish`,
                `${subject.name['uz-Cyrl']} фани бўйича назарий билим ва амалий кўникмаларни шакллантириш`,
                `Формирование теоретических знаний и практических навыков по дисциплине "${subject.name.ru}"`,
                `Building theoretical knowledge and practical skills in ${subject.name.en}`,
              ),
              objectives: [
                localized(
                  "Asosiy tushunchalarni o'zlashtirish",
                  'Асосий тушунчаларни ўзлаштириш',
                  'Освоение основных понятий',
                  'Mastering core concepts',
                ),
                localized(
                  "Amaliy masalalarni yechish ko'nikmasi",
                  'Амалий масалаларни ечиш кўникмаси',
                  'Навык решения практических задач',
                  'Practical problem-solving skills',
                ),
              ],
              learningOutcomes: [
                {
                  text: localized(
                    'Fanning asosiy tamoyillarini tushuntira oladi',
                    'Фаннинг асосий тамойилларини тушунтира олади',
                    'Может объяснить основные принципы дисциплины',
                    'Can explain the core principles of the subject',
                  ),
                  bloomLevel: 'UNDERSTAND',
                },
                {
                  text: localized(
                    "Olingan bilimlarni amaliyotda qo'llaydi",
                    'Олинган билимларни амалиётда қўллайди',
                    'Применяет полученные знания на практике',
                    'Applies the acquired knowledge in practice',
                  ),
                  bloomLevel: 'APPLY',
                },
              ],
              topics: Array.from({ length: 8 }, (_, index) => ({
                title: localized(
                  `${index + 1}-mavzu`,
                  `${index + 1}-мавзу`,
                  `Тема ${index + 1}`,
                  `Topic ${index + 1}`,
                ),
                lectureHours: 2,
                practiceHours: 2,
                labHours: 0,
                independentHours: 4,
                week: index + 1,
              })),
              literature: [
                {
                  type: 'MAIN',
                  citation: `${subject.name['uz-Latn']}: darslik. — Toshkent: Fan, 2025. — 320 b.`,
                },
              ],
            } as never,
          },
        },
      },
    });
    syllabusCount += 1;
  }
  console.log(`  Sillabuslar: ${syllabusCount}`);

  // --- 10. Kurslar ---------------------------------------------------------
  const courseSubjects = subjectData.slice(0, 16);
  const courseIds: string[] = [];

  for (const [index, subject] of courseSubjects.entries()) {
    const code = `${subject.code}-2026-1`;
    const existing = await prisma.course.findUnique({ where: { code }, select: { id: true } });

    const courseId =
      existing?.id ??
      (
        await prisma.course.create({
          data: {
            code,
            subjectId: subjectIds.get(subject.code) as string,
            semesterId: semester.id,
            departmentId: departmentIds.get(subject.dep) as string,
            title: subject.name as never,
            description: localized(
              `${subject.name['uz-Latn']} fani bo'yicha 1-semestr kursi.`,
              `${subject.name['uz-Cyrl']} фани бўйича 1-семестр курси.`,
              `Курс 1-го семестра по дисциплине "${subject.name.ru}".`,
              `First-semester course in ${subject.name.en}.`,
            ) as never,
            type: 'ACADEMIC',
            status: 'PUBLISHED',
            deliveryMode: 'BLENDED',
            academicHours: subject.credits * 30,
            gradingPolicy: DEFAULT_GRADING_POLICY as never,
            searchText: normalizeForSearch(`${Object.values(subject.name).join(' ')} ${code}`),
          },
          select: { id: true },
        })
      ).id;

    courseIds.push(courseId);

    // O'qituvchini biriktirish
    const teacherId = teacherIds[index % teacherIds.length] as string;
    const hasTeacher = await prisma.courseTeacher.findFirst({
      where: { courseId, userId: teacherId },
      select: { id: true },
    });
    if (!hasTeacher) {
      await prisma.courseTeacher.create({
        data: { courseId, userId: teacherId, role: 'LEAD', workloadHours: subject.credits * 30 },
      });
    }

    // Demo o'qituvchini birinchi 3 kursga biriktiramiz
    if (index < 3) {
      const demoTeacherId = demoUserIds.get('oqituvchi@qdu.uz') as string;
      const exists = await prisma.courseTeacher.findFirst({
        where: { courseId, userId: demoTeacherId },
        select: { id: true },
      });
      if (!exists) {
        await prisma.courseTeacher.create({
          data: { courseId, userId: demoTeacherId, role: 'LEAD', workloadHours: 90 },
        });
      }
    }
  }

  // Malaka oshirish kursi (F-12 sertifikat oqimi uchun)
  const cpdCourseCode = 'CPD-DIGITAL-2026';
  const cpdCourse =
    (await prisma.course.findUnique({ where: { code: cpdCourseCode }, select: { id: true } })) ??
    (await prisma.course.create({
      data: {
        code: cpdCourseCode,
        departmentId: departmentIds.get('KAF-INF') as string,
        title: localized(
          'Pedagogning raqamli kompetensiyasi',
          'Педагогнинг рақамли компетенцияси',
          'Цифровая компетенция педагога',
          'Digital competence for educators',
        ) as never,
        description: localized(
          '144 soatlik malaka oshirish kursi. Yakunida sertifikat beriladi.',
          '144 соатлик малака ошириш курси. Якунида сертификат берилади.',
          'Курс повышения квалификации на 144 часа с выдачей сертификата.',
          'A 144-hour professional development course with a certificate.',
        ) as never,
        type: 'PROFESSIONAL_DEV',
        status: 'PUBLISHED',
        deliveryMode: 'ONLINE',
        academicHours: 144,
        isPaid: true,
        priceUzs: 1_200_000,
        gradingPolicy: DEFAULT_GRADING_POLICY as never,
        searchText: normalizeForSearch('pedagogning raqamli kompetensiyasi malaka oshirish'),
      },
      select: { id: true },
    }));

  courseIds.push(cpdCourse.id);
  console.log(`  Kurslar: ${courseIds.length}`);

  // --- 11. Kurs tuzilishi (birinchi 4 kurs uchun to'liq) -------------------
  let lessonCount = 0;
  for (const courseId of courseIds.slice(0, 4)) {
    const existingModules = await prisma.module.count({ where: { courseId } });
    if (existingModules > 0) continue;

    for (let m = 1; m <= 3; m += 1) {
      const module = await prisma.module.create({
        data: {
          courseId,
          title: localized(`${m}-modul`, `${m}-модул`, `Модуль ${m}`, `Module ${m}`) as never,
          position: m - 1,
          isPublished: true,
        },
        select: { id: true },
      });

      for (let t = 1; t <= 2; t += 1) {
        const topic = await prisma.topic.create({
          data: {
            moduleId: module.id,
            title: localized(
              `${m}.${t}-mavzu`,
              `${m}.${t}-мавзу`,
              `Тема ${m}.${t}`,
              `Topic ${m}.${t}`,
            ) as never,
            position: t - 1,
            bloomLevel: pick(['REMEMBER', 'UNDERSTAND', 'APPLY', 'ANALYZE'] as const),
          },
          select: { id: true },
        });

        for (let l = 1; l <= 3; l += 1) {
          await prisma.lesson.create({
            data: {
              topicId: topic.id,
              title: localized(
                `${m}.${t}.${l} — Dars`,
                `${m}.${t}.${l} — Дарс`,
                `${m}.${t}.${l} — Занятие`,
                `${m}.${t}.${l} — Lesson`,
              ) as never,
              contentHtml: localized(
                `<h2>Dars mazmuni</h2><p>Ushbu darsda mavzuning asosiy tushunchalari ko'rib chiqiladi. Talaba dars oxirida asosiy atamalarni tushuntira olishi kerak.</p><ul><li>Nazariy qism</li><li>Amaliy misollar</li><li>Mustaqil ish topshirig'i</li></ul>`,
                `<h2>Дарс мазмуни</h2><p>Ушбу дарсда мавзунинг асосий тушунчалари кўриб чиқилади.</p>`,
                `<h2>Содержание занятия</h2><p>На этом занятии рассматриваются основные понятия темы.</p>`,
                `<h2>Lesson content</h2><p>This lesson covers the core concepts of the topic.</p>`,
              ) as never,
              position: l - 1,
              durationMinutes: 80,
              isPublished: true,
            },
          });
          lessonCount += 1;
        }
      }
    }
  }
  console.log(`  Darslar: ${lessonCount}`);

  // --- 12. Yozilishlar -----------------------------------------------------
  // Har bir kursga bir nechta guruh yoziladi — demo ma'lumot realistik
  // bo'lishi uchun (bitta oqimga bir necha guruh biriktiriladi).
  const GROUPS_PER_COURSE = 5;
  let enrollmentCount = 0;

  for (const [index, courseId] of courseIds.slice(0, 10).entries()) {
    for (let offset = 0; offset < GROUPS_PER_COURSE; offset += 1) {
      const group = groupList[(index * GROUPS_PER_COURSE + offset) % groupList.length];
      if (!group) continue;

      const members = await prisma.groupMember.findMany({
        where: { groupId: group[1], leftAt: null },
        select: { userId: true },
      });
      if (members.length === 0) continue;

      const result = await prisma.enrollment.createMany({
        data: members.map((member) => ({
          courseId,
          userId: member.userId,
          groupId: group[1],
          status: 'ACTIVE' as const,
        })),
        skipDuplicates: true,
      });
      enrollmentCount += result.count;
    }
  }

  // Demo talabani birinchi 5 kursga yozamiz
  const demoEnrollments = await prisma.enrollment.createMany({
    data: courseIds.slice(0, 5).map((courseId) => ({
      courseId,
      userId: demoStudentId,
      groupId: firstGroupId,
      status: 'ACTIVE' as const,
    })),
    skipDuplicates: true,
  });
  enrollmentCount += demoEnrollments.count;
  console.log(`  Yozilishlar: ${enrollmentCount}`);

  // --- 13. Topshiriq, savollar banki va test ------------------------------
  const primaryCourseId = courseIds[0] as string;
  const teacherId = demoUserIds.get('oqituvchi@qdu.uz') as string;

  let assignment = await prisma.assignment.findFirst({
    where: { courseId: primaryCourseId },
    select: { id: true },
  });

  if (!assignment) {
    const rubric = await prisma.rubric.create({
      data: {
        courseId: primaryCourseId,
        title: localized(
          'Amaliy ish rubrikasi',
          'Амалий иш рубрикаси',
          'Рубрика практической работы',
          'Practical work rubric',
        ) as never,
        totalPoints: 30,
        criteria: {
          create: [
            {
              title: localized(
                "Mazmun to'liqligi",
                'Мазмун тўлиқлиги',
                'Полнота содержания',
                'Content completeness',
              ) as never,
              maxPoints: 10,
              position: 0,
              levels: [
                { label: localized('Past', 'Паст', 'Низкий', 'Low'), points: 3 },
                { label: localized("O'rta", 'Ўрта', 'Средний', 'Medium'), points: 6 },
                { label: localized('Yuqori', 'Юқори', 'Высокий', 'High'), points: 10 },
              ] as never,
            },
            {
              title: localized(
                'Tahlil chuqurligi',
                'Таҳлил чуқурлиги',
                'Глубина анализа',
                'Depth of analysis',
              ) as never,
              maxPoints: 10,
              position: 1,
              levels: [
                { label: localized('Past', 'Паст', 'Низкий', 'Low'), points: 3 },
                { label: localized("O'rta", 'Ўрта', 'Средний', 'Medium'), points: 6 },
                { label: localized('Yuqori', 'Юқори', 'Высокий', 'High'), points: 10 },
              ] as never,
            },
            {
              title: localized(
                'Rasmiylashtirish',
                'Расмийлаштириш',
                'Оформление',
                'Formatting',
              ) as never,
              maxPoints: 10,
              position: 2,
              levels: [
                { label: localized('Past', 'Паст', 'Низкий', 'Low'), points: 3 },
                { label: localized("O'rta", 'Ўрта', 'Средний', 'Medium'), points: 6 },
                { label: localized('Yuqori', 'Юқори', 'Высокий', 'High'), points: 10 },
              ] as never,
            },
          ],
        },
      },
      select: { id: true },
    });

    assignment = await prisma.assignment.create({
      data: {
        courseId: primaryCourseId,
        rubricId: rubric.id,
        title: localized(
          '1-amaliy ish: Mavzu tahlili',
          '1-амалий иш: Мавзу таҳлили',
          'Практическая работа 1: Анализ темы',
          'Practical work 1: Topic analysis',
        ) as never,
        description: localized(
          "<p>Tanlangan mavzu bo'yicha 1500 so'zdan kam bo'lmagan tahliliy matn tayyorlang. Kamida 3 ta manbaga havola bering.</p>",
          '<p>Танланган мавзу бўйича таҳлилий матн тайёрланг.</p>',
          '<p>Подготовьте аналитический текст по выбранной теме.</p>',
          '<p>Prepare an analytical text on the selected topic.</p>',
        ) as never,
        controlType: 'JN',
        maxScore: 30,
        dueAt: new Date(Date.now() + 14 * 86_400_000),
        lateUntil: new Date(Date.now() + 17 * 86_400_000),
        latePenaltyPercent: 10,
        plagiarismCheck: true,
        peerReviewEnabled: true,
        peerReviewCount: 2,
        allowedMimeTypes: [
          'application/pdf',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ],
        maxFiles: 3,
        isPublished: true,
      },
      select: { id: true },
    });
  }

  // Savollar banki
  let bank = await prisma.questionBank.findFirst({
    where: { courseId: primaryCourseId },
    select: { id: true },
  });

  if (!bank) {
    bank = await prisma.questionBank.create({
      data: {
        courseId: primaryCourseId,
        ownerId: teacherId,
        title: localized(
          'Asosiy savollar banki',
          'Асосий саволлар банки',
          'Основной банк вопросов',
          'Main question bank',
        ) as never,
        isShared: true,
      },
      select: { id: true },
    });

    // 10 turdagi savollardan namunalar
    const questions: Prisma.QuestionCreateManyInput[] = [
      {
        bankId: bank.id,
        type: 'SINGLE',
        text: localized(
          'Ikki nuqta orasidagi eng qisqa masofa qanday chiziq bilan ifodalanadi?',
          'Икки нуқта орасидаги энг қисқа масофа қандай чизиқ билан ифодаланади?',
          'Какой линией выражается кратчайшее расстояние между двумя точками?',
          'Which line represents the shortest distance between two points?',
        ) as never,
        payload: {
          type: 'SINGLE',
          options: [
            {
              id: 'a',
              text: localized("To'g'ri chiziq", 'Тўғри чизиқ', 'Прямая', 'Straight line'),
              isCorrect: true,
              weight: 1,
            },
            {
              id: 'b',
              text: localized('Egri chiziq', 'Эгри чизиқ', 'Кривая', 'Curve'),
              isCorrect: false,
              weight: 0,
            },
            {
              id: 'c',
              text: localized('Siniq chiziq', 'Синиқ чизиқ', 'Ломаная', 'Broken line'),
              isCorrect: false,
              weight: 0,
            },
          ],
        } as never,
        defaultScore: 2,
        difficulty: 'EASY',
        bloomLevel: 'REMEMBER',
        tags: ['geometriya'],
        searchText: normalizeForSearch('ikki nuqta orasidagi eng qisqa masofa'),
      },
      {
        bankId: bank.id,
        type: 'MULTI',
        text: localized(
          'Quyidagilardan qaysilari dasturlash tillari?',
          'Қуйидагилардан қайсилари дастурлаш тиллари?',
          'Какие из перечисленных являются языками программирования?',
          'Which of the following are programming languages?',
        ) as never,
        payload: {
          type: 'MULTI',
          penalizeWrong: true,
          options: [
            {
              id: 'a',
              text: localized('Python', 'Python', 'Python', 'Python'),
              isCorrect: true,
              weight: 1,
            },
            {
              id: 'b',
              text: localized('HTML', 'HTML', 'HTML', 'HTML'),
              isCorrect: false,
              weight: 0,
            },
            {
              id: 'c',
              text: localized('TypeScript', 'TypeScript', 'TypeScript', 'TypeScript'),
              isCorrect: true,
              weight: 1,
            },
            { id: 'd', text: localized('CSS', 'CSS', 'CSS', 'CSS'), isCorrect: false, weight: 0 },
          ],
        } as never,
        defaultScore: 3,
        difficulty: 'MEDIUM',
        bloomLevel: 'UNDERSTAND',
        tags: ['dasturlash'],
        searchText: normalizeForSearch('dasturlash tillari'),
      },
      {
        bankId: bank.id,
        type: 'NUMERIC',
        text: localized(
          "Doiraning radiusi 5 sm bo'lsa, uning yuzini toping (pi = 3.14).",
          'Доиранинг радиуси 5 см бўлса, унинг юзини топинг.',
          'Найдите площадь круга радиусом 5 см.',
          'Find the area of a circle with radius 5 cm.',
        ) as never,
        payload: { type: 'NUMERIC', correctValue: 78.5, tolerance: 0.5, unit: 'sm²' } as never,
        defaultScore: 3,
        difficulty: 'MEDIUM',
        bloomLevel: 'APPLY',
        tags: ['geometriya'],
        searchText: normalizeForSearch('doira yuzi radius'),
      },
      {
        bankId: bank.id,
        type: 'MATCHING',
        text: localized(
          "Atamalarni ta'riflari bilan moslashtiring.",
          'Атамаларни таърифлари билан мослаштиринг.',
          'Сопоставьте термины с определениями.',
          'Match the terms with their definitions.',
        ) as never,
        payload: {
          type: 'MATCHING',
          left: [
            { id: 'l1', text: localized('Massiv', 'Массив', 'Массив', 'Array') },
            { id: 'l2', text: localized('Funksiya', 'Функция', 'Функция', 'Function') },
          ],
          right: [
            {
              id: 'r1',
              text: localized(
                "Elementlar to'plami",
                'Элементлар тўплами',
                'Набор элементов',
                'A set of elements',
              ),
            },
            {
              id: 'r2',
              text: localized(
                'Qayta ishlatiladigan kod bloki',
                'Қайта ишлатиладиган код блоки',
                'Переиспользуемый блок кода',
                'A reusable block of code',
              ),
            },
          ],
          pairs: [
            { leftId: 'l1', rightId: 'r1' },
            { leftId: 'l2', rightId: 'r2' },
          ],
        } as never,
        defaultScore: 4,
        difficulty: 'MEDIUM',
        bloomLevel: 'UNDERSTAND',
        tags: ['dasturlash'],
        searchText: normalizeForSearch('massiv funksiya atamalar'),
      },
      {
        bankId: bank.id,
        type: 'ORDERING',
        text: localized(
          "Dasturiy ta'minot ishlab chiqish bosqichlarini to'g'ri tartibda joylashtiring.",
          'Дастурий таъминот ишлаб чиқиш босқичларини тўғри тартибда жойлаштиринг.',
          'Расположите этапы разработки ПО в правильном порядке.',
          'Arrange the software development stages in the correct order.',
        ) as never,
        payload: {
          type: 'ORDERING',
          items: [
            {
              id: '1',
              text: localized(
                "Talablarni yig'ish",
                'Талабларни йиғиш',
                'Сбор требований',
                'Requirements gathering',
              ),
            },
            { id: '2', text: localized('Loyihalash', 'Лойиҳалаш', 'Проектирование', 'Design') },
            {
              id: '3',
              text: localized('Ishlab chiqish', 'Ишлаб чиқиш', 'Разработка', 'Development'),
            },
            { id: '4', text: localized('Testlash', 'Тестлаш', 'Тестирование', 'Testing') },
          ],
          correctOrder: ['1', '2', '3', '4'],
        } as never,
        defaultScore: 4,
        difficulty: 'MEDIUM',
        bloomLevel: 'ANALYZE',
        tags: ['metodologiya'],
        searchText: normalizeForSearch('dasturiy taminot bosqichlari'),
      },
      {
        bankId: bank.id,
        type: 'CLOZE',
        text: localized(
          "Bo'sh joylarni to'ldiring.",
          'Бўш жойларни тўлдиринг.',
          'Заполните пропуски.',
          'Fill in the blanks.',
        ) as never,
        payload: {
          type: 'CLOZE',
          template: localized(
            "O'zbekiston poytaxti — [[1]], eng katta daryosi — [[2]].",
            'Ўзбекистон пойтахти — [[1]], энг катта дарёси — [[2]].',
            'Столица Узбекистана — [[1]], крупнейшая река — [[2]].',
            'The capital of Uzbekistan is [[1]], its largest river is [[2]].',
          ),
          blanks: [
            {
              key: '1',
              accepted: ['Toshkent', 'Тошкент', 'Ташкент', 'Tashkent'],
              caseSensitive: false,
              points: 1,
            },
            {
              key: '2',
              accepted: ['Amudaryo', 'Амударё', 'Амударья', 'Amu Darya'],
              caseSensitive: false,
              points: 1,
            },
          ],
        } as never,
        defaultScore: 2,
        difficulty: 'EASY',
        bloomLevel: 'REMEMBER',
        tags: ['geografiya'],
        searchText: normalizeForSearch('ozbekiston poytaxti daryo'),
      },
      {
        bankId: bank.id,
        type: 'ESSAY',
        text: localized(
          "Raqamli ta'limning afzalliklari va cheklovlarini tahlil qiling (300-500 so'z).",
          'Рақамли таълимнинг афзалликлари ва чекловларини таҳлил қилинг.',
          'Проанализируйте преимущества и ограничения цифрового образования.',
          'Analyse the benefits and limitations of digital education.',
        ) as never,
        payload: {
          type: 'ESSAY',
          minWords: 300,
          maxWords: 500,
          allowAttachments: false,
          gradingHint: localized(
            "Argumentlar asosliligi va misollar mavjudligiga e'tibor bering.",
            'Аргументлар асослилиги ва мисоллар мавжудлигига эътибор беринг.',
            'Обратите внимание на обоснованность аргументов и наличие примеров.',
            'Focus on the strength of arguments and presence of examples.',
          ),
        } as never,
        defaultScore: 10,
        difficulty: 'HARD',
        bloomLevel: 'EVALUATE',
        tags: ['esse'],
        searchText: normalizeForSearch('raqamli talim afzalliklari'),
      },
      {
        bankId: bank.id,
        type: 'CODE',
        text: localized(
          "Berilgan ro'yxatdagi juft sonlar yig'indisini qaytaruvchi funksiya yozing.",
          'Берилган рўйхатдаги жуфт сонлар йиғиндисини қайтарувчи функция ёзинг.',
          'Напишите функцию, возвращающую сумму чётных чисел списка.',
          'Write a function that returns the sum of even numbers in a list.',
        ) as never,
        payload: {
          type: 'CODE',
          language: 'python',
          starterCode: 'def sum_even(numbers):\n    # kodni shu yerga yozing\n    pass',
          testCases: [
            { input: '[1, 2, 3, 4]', expected: '6' },
            { input: '[]', expected: '0' },
          ],
        } as never,
        defaultScore: 8,
        difficulty: 'HARD',
        bloomLevel: 'CREATE',
        tags: ['dasturlash'],
        searchText: normalizeForSearch('juft sonlar yigindisi funksiya'),
      },
      {
        bankId: bank.id,
        type: 'DRAG_DROP',
        text: localized(
          'Texnologiyalarni tegishli qatlamga joylashtiring.',
          'Технологияларни тегишли қатламга жойлаштиринг.',
          'Распределите технологии по соответствующим слоям.',
          'Place the technologies into the correct layers.',
        ) as never,
        payload: {
          type: 'DRAG_DROP',
          items: [
            { id: 'i1', text: localized('React', 'React', 'React', 'React') },
            { id: 'i2', text: localized('PostgreSQL', 'PostgreSQL', 'PostgreSQL', 'PostgreSQL') },
          ],
          zones: [
            { id: 'z1', label: localized('Frontend', 'Frontend', 'Frontend', 'Frontend') },
            {
              id: 'z2',
              label: localized(
                "Ma'lumotlar bazasi",
                'Маълумотлар базаси',
                'База данных',
                'Database',
              ),
            },
          ],
          placements: [
            { itemId: 'i1', zoneId: 'z1' },
            { itemId: 'i2', zoneId: 'z2' },
          ],
        } as never,
        defaultScore: 4,
        difficulty: 'MEDIUM',
        bloomLevel: 'APPLY',
        tags: ['texnologiya'],
        searchText: normalizeForSearch('react postgresql qatlam'),
      },
    ];

    await prisma.question.createMany({ data: questions });
  }

  // Test
  const existingQuiz = await prisma.quiz.findFirst({
    where: { courseId: primaryCourseId },
    select: { id: true },
  });

  // Test oynasi tizim sanasiga NISBATAN belgilanadi: demo qachon ishga
  // tushirilishidan qat'i nazar test darhol ochiq bo'ladi.
  const quizOpensAt = new Date(Date.now() - 86_400_000);
  const quizClosesAt = new Date(Date.now() + 180 * 86_400_000);

  if (existingQuiz) {
    await prisma.quiz.update({
      where: { id: existingQuiz.id },
      data: {
        opensAt: quizOpensAt,
        closesAt: quizClosesAt,
        isPublished: true,
        maxAttempts: 10,
      },
    });
  } else {
    const quiz = await prisma.quiz.create({
      data: {
        courseId: primaryCourseId,
        title: localized(
          '1-oraliq nazorat testi',
          '1-оралиқ назорат тести',
          'Промежуточный тест 1',
          'Midterm test 1',
        ) as never,
        controlType: 'ON',
        durationMinutes: 45,
        // Demo muhitida test bir necha marta ko'rsatiladi, shuning uchun
        // urinishlar soni kengroq
        maxAttempts: 10,
        gradingMethod: 'HIGHEST',
        shuffleQuestions: true,
        shuffleOptions: true,
        questionsPerAttempt: 0,
        passScore: 60,
        showAnswers: 'AFTER_CLOSE',
        isPublished: true,
        opensAt: quizOpensAt,
        closesAt: quizClosesAt,
      },
      select: { id: true },
    });

    const bankQuestions = await prisma.question.findMany({
      where: { bankId: bank.id },
      select: { id: true, defaultScore: true },
    });

    await prisma.quizQuestion.createMany({
      data: bankQuestions.map((question, index) => ({
        quizId: quiz.id,
        questionId: question.id,
        score: question.defaultScore,
        position: index,
      })),
    });
  }
  console.log('  Topshiriq, savollar banki (9 tur) va test yaratildi');

  // Demo takrorlanadigan bo'lishi uchun demo TALABANING tugallanmagan va
  // eski urinishlari tozalanadi. Boshqa foydalanuvchilar ma'lumotiga tegilmaydi.
  const demoAttempts = await prisma.quizAttempt.findMany({
    where: { userId: demoStudentId },
    select: { id: true },
  });
  if (demoAttempts.length > 0) {
    await prisma.quizAnswer.deleteMany({
      where: { attemptId: { in: demoAttempts.map((item) => item.id) } },
    });
    await prisma.quizAttempt.deleteMany({ where: { id: { in: demoAttempts.map((i) => i.id) } } });
    console.log(`  Demo talabaning ${demoAttempts.length} ta eski urinishi tozalandi`);
  }

  // --- 14. Jadval va dars sessiyalari -------------------------------------
  const scheduleExists = await prisma.schedule.count({ where: { courseId: primaryCourseId } });
  if (scheduleExists === 0 && firstGroupId) {
    const schedule = await prisma.schedule.create({
      data: {
        courseId: primaryCourseId,
        groupId: firstGroupId,
        teacherId,
        weekday: 1,
        startsAt: '09:00',
        endsAt: '10:20',
        room: '204-xona',
        lessonType: 'LECTURE',
        weekParity: 0,
        validFrom: new Date('2026-09-01'),
        validUntil: new Date('2027-01-25'),
      },
      select: { id: true },
    });

    // Dastlabki 12 hafta uchun sessiyalar
    const sessions: Prisma.ClassSessionCreateManyInput[] = [];
    const cursor = new Date('2026-09-07T00:00:00Z'); // dushanba
    for (let week = 0; week < 12; week += 1) {
      sessions.push({
        scheduleId: schedule.id,
        courseId: primaryCourseId,
        groupId: firstGroupId,
        teacherId,
        date: new Date(cursor),
        startsAt: '09:00',
        endsAt: '10:20',
        room: '204-xona',
        lessonType: 'LECTURE',
        status: week < 4 ? 'FINISHED' : 'PLANNED',
        topic: `${week + 1}-hafta mavzusi`,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 7);
    }
    await prisma.classSession.createMany({ data: sessions, skipDuplicates: true });
  }

  // --- 15. Davomat va baholar (realistik namuna) --------------------------
  const finishedSessions = await prisma.classSession.findMany({
    where: { courseId: primaryCourseId, status: 'FINISHED' },
    select: { id: true },
  });

  const primaryEnrollments = await prisma.enrollment.findMany({
    where: { courseId: primaryCourseId },
    select: { userId: true },
    take: 40,
  });

  const attendanceRows: Prisma.AttendanceCreateManyInput[] = [];
  for (const session of finishedSessions) {
    for (const enrollment of primaryEnrollments) {
      const roll = random();
      attendanceRows.push({
        classSessionId: session.id,
        userId: enrollment.userId,
        status: roll > 0.15 ? 'PRESENT' : roll > 0.08 ? 'LATE' : 'ABSENT',
        method: 'MANUAL',
        markedById: teacherId,
      });
    }
  }
  if (attendanceRows.length > 0) {
    await prisma.attendance.createMany({ data: attendanceRows, skipDuplicates: true });
  }

  const controlTypes = await prisma.controlType.findMany({ select: { id: true, code: true } });
  const jnId = controlTypes.find((item) => item.code === 'JN')?.id;

  if (jnId) {
    const gradeRows: Prisma.GradeCreateManyInput[] = primaryEnrollments.map((enrollment) => ({
      courseId: primaryCourseId,
      userId: enrollment.userId,
      controlTypeId: jnId,
      score: randomInt(12, 30),
      maxScore: 30,
      origin: 'MANUAL',
      gradedById: teacherId,
    }));
    await prisma.grade.createMany({ data: gradeRows, skipDuplicates: true });
  }
  console.log(
    `  Davomat yozuvlari: ${attendanceRows.length}, baholar: ${primaryEnrollments.length}`,
  );

  // --- 16. Sertifikat shabloni va badge lar -------------------------------
  const templateExists = await prisma.certificateTemplate.findFirst({ select: { id: true } });
  if (!templateExists) {
    await prisma.certificateTemplate.create({
      data: {
        name: localized(
          'Standart sertifikat',
          'Стандарт сертификат',
          'Стандартный сертификат',
          'Default certificate',
        ) as never,
        htmlTemplate: '<div class="certificate">{{fullName}} — {{courseTitle}}</div>',
        cssTemplate: '.certificate { text-align: center; font-size: 24px; }',
        orientation: 'LANDSCAPE',
        fields: ['fullName', 'courseTitle', 'academicHours', 'issuedAt', 'serialNumber'],
        isActive: true,
      },
    });
  }

  const badges = [
    {
      code: 'FIRST_STEPS',
      name: localized('Birinchi qadam', 'Биринчи қадам', 'Первый шаг', 'First steps'),
      description: localized(
        'Birinchi topshiriqni yubordingiz',
        'Биринчи топшириқни юбордингиз',
        'Вы отправили первое задание',
        'You submitted your first assignment',
      ),
      icon: 'Footprints',
      rule: { type: 'FIRST_SUBMISSION', threshold: 1 },
      xpReward: 50,
    },
    {
      code: 'PERFECTIONIST',
      name: localized('Mukammallik', 'Мукаммаллик', 'Перфекционист', 'Perfectionist'),
      description: localized(
        '3 ta testni maksimal ballga topshirdingiz',
        '3 та тестни максимал баллга топширдингиз',
        'Вы сдали 3 теста на максимальный балл',
        'You aced three quizzes',
      ),
      icon: 'Sparkles',
      rule: { type: 'PERFECT_QUIZ', threshold: 3 },
      xpReward: 200,
    },
    {
      code: 'RELIABLE',
      name: localized('Ishonchli', 'Ишончли', 'Надёжный', 'Reliable'),
      description: localized(
        'Davomat 90% dan yuqori',
        'Давомат 90% дан юқори',
        'Посещаемость выше 90%',
        'Attendance above 90%',
      ),
      icon: 'ShieldCheck',
      rule: { type: 'ATTENDANCE_RATE', threshold: 90 },
      xpReward: 150,
    },
    {
      code: 'HELPER',
      name: localized('Yordamchi', 'Ёрдамчи', 'Помощник', 'Helper'),
      description: localized(
        'Forumda 5 ta eng yaxshi javob',
        'Форумда 5 та энг яхши жавоб',
        '5 лучших ответов на форуме',
        'Five best answers on the forum',
      ),
      icon: 'HeartHandshake',
      rule: { type: 'FORUM_HELPER', threshold: 5 },
      xpReward: 250,
    },
    {
      code: 'GRADUATE',
      name: localized('Bitiruvchi', 'Битирувчи', 'Выпускник', 'Graduate'),
      description: localized(
        "Kursni to'liq tamomladingiz",
        'Курсни тўлиқ тамомладингиз',
        'Вы полностью завершили курс',
        'You completed a course',
      ),
      icon: 'GraduationCap',
      rule: { type: 'COURSE_COMPLETED', threshold: 1 },
      xpReward: 300,
    },
  ];

  for (const badge of badges) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      create: {
        code: badge.code,
        name: badge.name as never,
        description: badge.description as never,
        icon: badge.icon,
        rule: badge.rule as never,
        xpReward: badge.xpReward,
      },
      update: { name: badge.name as never, description: badge.description as never },
    });
  }

  // Bildirishnoma kanallari
  const channels = [
    { code: 'IN_APP', name: localized('Ilova ichida', 'Илова ичида', 'В приложении', 'In-app') },
    { code: 'EMAIL', name: localized('Elektron pochta', 'Электрон почта', 'Эл. почта', 'Email') },
    { code: 'SMS', name: localized('SMS', 'СМС', 'СМС', 'SMS') },
    { code: 'TELEGRAM', name: localized('Telegram', 'Телеграм', 'Телеграм', 'Telegram') },
    { code: 'PUSH', name: localized('Push', 'Push', 'Push', 'Push') },
  ];

  for (const channel of channels) {
    await prisma.notificationChannel.upsert({
      where: { code: channel.code },
      create: { code: channel.code, name: channel.name as never, enabled: true },
      update: { name: channel.name as never },
    });
  }
  console.log(`  Badge lar: ${badges.length}, bildirishnoma kanallari: ${channels.length}`);

  // --- 17. E'lon va forum --------------------------------------------------
  const announcementExists = await prisma.announcement.count();
  if (announcementExists === 0) {
    await prisma.announcement.create({
      data: {
        authorId: demoUserIds.get('rector@qdu.uz') as string,
        title: localized(
          "2026-2027 o'quv yili boshlandi",
          '2026-2027 ўқув йили бошланди',
          'Начался 2026-2027 учебный год',
          'The 2026-2027 academic year has started',
        ) as never,
        body: localized(
          "<p>Barcha talabalarni yangi o'quv yili bilan tabriklaymiz! Dars jadvali tizimda mavjud.</p>",
          '<p>Барча талабаларни янги ўқув йили билан табриклаймиз!</p>',
          '<p>Поздравляем всех студентов с новым учебным годом!</p>',
          '<p>Congratulations to all students on the new academic year!</p>',
        ) as never,
        audience: 'ALL',
        audienceIds: [],
        audienceRoles: [],
        channels: ['IN_APP'],
        isPinned: true,
        publishAt: new Date(),
      },
    });

    const thread = await prisma.forumThread.create({
      data: {
        courseId: primaryCourseId,
        authorId: demoStudentId,
        title: "Amaliy ish bo'yicha savol",
        isQuestion: true,
        postCount: 2,
        lastPostAt: new Date(),
      },
      select: { id: true },
    });

    await prisma.forumPost.createMany({
      data: [
        {
          threadId: thread.id,
          authorId: demoStudentId,
          contentHtml: "<p>Amaliy ishni PDF formatda yuborsak bo'ladimi?</p>",
          depth: 0,
        },
        {
          threadId: thread.id,
          authorId: teacherId,
          contentHtml: '<p>Ha, PDF va DOCX formatlari qabul qilinadi.</p>',
          depth: 1,
          isAnswer: true,
        },
      ],
    });
  }

  // --- Yakuniy hisobot -----------------------------------------------------
  const counts = await Promise.all([
    prisma.user.count(),
    prisma.faculty.count(),
    prisma.department.count(),
    prisma.group.count(),
    prisma.subject.count(),
    prisma.course.count(),
    prisma.lesson.count(),
    prisma.enrollment.count(),
    prisma.question.count(),
  ]);

  console.log("\nDemo ma'lumotlar yuklandi:");
  console.log(`  Foydalanuvchilar: ${counts[0]}`);
  console.log(`  Fakultetlar: ${counts[1]}, kafedralar: ${counts[2]}, guruhlar: ${counts[3]}`);
  console.log(`  Fanlar: ${counts[4]}, kurslar: ${counts[5]}, darslar: ${counts[6]}`);
  console.log(`  Yozilishlar: ${counts[7]}, savollar: ${counts[8]}`);

  console.log('\nDemo hisoblar (parol barchasida bir xil):');
  console.log(`  Parol: ${DEMO_PASSWORD}\n`);
  for (const account of demoAccounts) {
    console.log(`  ${account.role.padEnd(20)} ${account.email}`);
  }
  console.log('');
}

main()
  .catch((error: Error) => {
    console.error('\nSeed bajarilmadi:', error.message);
    console.error(error.stack);
    process.exit(1);
  })
  .finally(() => {
    void prisma.$disconnect();
  });
