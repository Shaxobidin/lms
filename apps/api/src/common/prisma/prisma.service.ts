/**
 * Maqsad: Prisma mijozi — soft delete kengaytmasi bilan (A-26, ADR-003).
 *
 * Kengaytma barcha `findMany`/`findFirst`/`count`/`aggregate` so'rovlariga
 * avtomatik `deletedAt: null` filtri qo'shadi va `delete`/`deleteMany` ni
 * `update` ga aylantiradi. Shu tufayli domen kodida soft delete haqida
 * o'ylash shart emas va ma'lumot hech qachon yo'qolmaydi (P6).
 *
 * O'chirilgan yozuvlarni ham ko'rish kerak bo'lsa — `prisma.raw` mijozidan
 * (`$bypass`) foydalaniladi; bu faqat administrativ va tiklash amallari uchun.
 */

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

/** `deletedAt` ustuni mavjud bo'lgan modellar. */
const SOFT_DELETE_MODELS = new Set<string>([
  'User',
  'UserProfile',
  'Role',
  'UserRole',
  'Faculty',
  'Department',
  'Speciality',
  'Group',
  'GroupMember',
  'AcademicYear',
  'Semester',
  'Subject',
  'Curriculum',
  'CurriculumSubject',
  'Syllabus',
  'SyllabusVersion',
  'Course',
  'CourseTeacher',
  'Module',
  'Topic',
  'Lesson',
  'Resource',
  'FileObject',
  'Enrollment',
  'ScormPackage',
  'Rubric',
  'RubricCriterion',
  'Assignment',
  'Submission',
  'QuestionBank',
  'Question',
  'Quiz',
  'Grade',
  'Schedule',
  'ClassSession',
  'AttendanceExcuse',
  'Announcement',
  'ForumThread',
  'ForumPost',
  'Message',
  'Meeting',
  'CertificateTemplate',
  'Certificate',
  'GeneratedDocument',
  'Badge',
  'Payment',
]);

const READ_OPERATIONS = new Set([
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
]);

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  /** Soft delete filtrisiz mijoz — faqat administrativ amallar uchun. */
  readonly raw: PrismaClient;

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'warn' },
        { emit: 'event', level: 'error' },
      ],
    });

    this.raw = this as PrismaClient;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Ma'lumotlar bazasiga ulanish o'rnatildi");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Soft delete kengaytmasi. Prisma `$extends` immutable mijoz qaytargani uchun
   * u alohida getter orqali beriladi va modullarda shu ishlatiladi.
   */
  readonly db = this.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SOFT_DELETE_MODELS.has(model)) {
            return query(args);
          }

          // O'qish: `deletedAt: null` ni qo'shamiz, agar chaqiruvchi o'zi
          // aniq belgilamagan bo'lsa (masalan, arxivni ko'rish uchun).
          if (READ_OPERATIONS.has(operation)) {
            const typedArgs = args as { where?: Record<string, unknown> };
            const where = typedArgs.where ?? {};
            if (!('deletedAt' in where)) {
              typedArgs.where = { ...where, deletedAt: null };
            }
            return query(typedArgs as typeof args);
          }

          // Fizik o'chirishga yo'l qo'yilmaydi (P6). Prisma kengaytmasi ichida
          // operatsiya turini almashtirib bo'lmagani uchun, chaqiruv aniq xato
          // bilan to'xtatiladi va dasturchi `softDelete()` ga yo'naltiriladi.
          if (operation === 'delete' || operation === 'deleteMany') {
            throw new Error(
              `${model}.${operation} taqiqlangan: soft delete uchun PrismaService.softDelete() dan foydalaning`,
            );
          }

          return query(args);
        },
      },
    },
  });

  /** Yozuvni mantiqiy o'chiradi (`deletedAt` ni belgilaydi). */
  async softDelete<T extends Prisma.ModelName>(model: T, id: string): Promise<void> {
    const delegate = (
      this as unknown as Record<string, { update: (args: unknown) => Promise<unknown> }>
    )[lowerFirst(model)];
    if (!delegate) throw new Error(`Noma'lum model: ${model}`);
    await delegate.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** Soft delete qilingan yozuvni tiklaydi. */
  async restore<T extends Prisma.ModelName>(model: T, id: string): Promise<void> {
    const delegate = (
      this as unknown as Record<string, { update: (args: unknown) => Promise<unknown> }>
    )[lowerFirst(model)];
    if (!delegate) throw new Error(`Noma'lum model: ${model}`);
    await delegate.update({ where: { id }, data: { deletedAt: null } });
  }

  /** Testlarda bazani tozalash uchun (faqat test muhitida). */
  async truncateAll(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('truncateAll ishlab chiqarish muhitida taqiqlangan');
    }
    const tables = await this.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
    `;
    const list = tables.map((row) => `"public"."${row.tablename}"`).join(', ');
    if (list) {
      await this.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
