/**
 * Maqsad: HEMIS bilan ma'lumot sinxronizatsiyasi (F-02, A-03, RSK-01).
 *
 * Printsiplar:
 *  - sinxronizatsiya IDEMPOTENT: bir necha marta ishga tushirilsa ham
 *    dublikat yaratmaydi (`externalId` bo'yicha upsert);
 *  - HEMIS ma'lumoti LMS dagi lokal o'zgarishlarni o'chirib yubormaydi
 *    (masalan, qo'lda tuzatilgan email saqlanadi);
 *  - har bir seans `IntegrationSyncLog` ga yoziladi — nima o'zgargani ko'rinadi.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import { normalizeForSearch } from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CryptoService } from '../../common/security/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { HEMIS_ADAPTER, type HemisAdapter } from './contracts';

export interface SyncResult {
  entity: string;
  read: number;
  created: number;
  updated: number;
  skipped: number;
  errors: string[];
}

@Injectable()
export class HemisSyncService {
  private readonly logger = new Logger(HemisSyncService.name);

  constructor(
    @Inject(HEMIS_ADAPTER) private readonly hemis: HemisAdapter,
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
  ) {}

  /** Talabalarni sinxronlash. */
  async syncStudents(since?: Date): Promise<SyncResult> {
    const log = await this.startLog('students', 'INBOUND');
    const result: SyncResult = {
      entity: 'students',
      read: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const students = await this.hemis.fetchStudents({ since });
      result.read = students.length;

      const studentRole = await this.prisma.db.role.findUnique({
        where: { code: 'STUDENT' },
        select: { id: true },
      });
      if (!studentRole) throw new Error('STUDENT roli katalogda topilmadi');

      for (const student of students) {
        try {
          // Chetlashtirilgan talabalar bloklanadi, o'chirilmaydi (P6)
          if (student.status === 'EXPELLED') {
            const existing = await this.prisma.db.user.findFirst({
              where: { externalId: student.externalId },
              select: { id: true },
            });
            if (existing) {
              await this.prisma.db.user.update({
                where: { id: existing.id },
                data: { status: 'BLOCKED' },
              });
              result.updated += 1;
            } else {
              result.skipped += 1;
            }
            continue;
          }

          const group = await this.prisma.db.group.findFirst({
            where: { name: student.groupCode },
            select: { id: true },
          });
          if (!group) {
            result.errors.push(`Guruh topilmadi: ${student.groupCode}`);
            result.skipped += 1;
            continue;
          }

          const existing = await this.prisma.db.user.findFirst({
            where: { externalId: student.externalId },
            select: { id: true },
          });

          if (existing) {
            // Faqat HEMIS "egalik qiladigan" maydonlar yangilanadi;
            // lokal o'zgarishlar (locale, avatar, parol) tegilmaydi
            await this.prisma.db.userProfile.update({
              where: { userId: existing.id },
              data: {
                firstName: student.firstName,
                lastName: student.lastName,
                middleName: student.middleName ?? null,
              },
            });
            await this.ensureGroupMembership(existing.id, group.id);
            result.updated += 1;
          } else {
            const email = student.email ?? `${student.externalId.toLowerCase()}@student.qdu.uz`;
            const created = await this.prisma.db.user.create({
              data: {
                email,
                phone: student.phone ?? null,
                // Parol HEMIS dan kelmaydi — foydalanuvchi tiklash orqali o'rnatadi
                passwordHash: await this.crypto.hashPassword(this.crypto.generateToken(16)),
                status: 'ACTIVE',
                externalId: student.externalId,
                externalProvider: 'hemis',
                searchText: normalizeForSearch(
                  `${student.lastName} ${student.firstName} ${student.middleName ?? ''} ${email}`,
                ),
                profile: {
                  create: {
                    firstName: student.firstName,
                    lastName: student.lastName,
                    middleName: student.middleName ?? null,
                  },
                },
                roles: { create: { roleId: studentRole.id } },
              },
              select: { id: true },
            });
            await this.ensureGroupMembership(created.id, group.id);
            result.created += 1;
          }
        } catch (error) {
          result.errors.push(`${student.externalId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      result.errors.push((error as Error).message);
      this.logger.error(
        { error: (error as Error).message },
        'HEMIS talabalar sinxronizatsiyasi uzildi',
      );
    }

    await this.finishLog(log.id, result);
    return result;
  }

  /** O'qituvchilarni sinxronlash. */
  async syncTeachers(since?: Date): Promise<SyncResult> {
    const log = await this.startLog('teachers', 'INBOUND');
    const result: SyncResult = {
      entity: 'teachers',
      read: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const teachers = await this.hemis.fetchTeachers({ since });
      result.read = teachers.length;

      const teacherRole = await this.prisma.db.role.findUnique({
        where: { code: 'TEACHER' },
        select: { id: true },
      });
      if (!teacherRole) throw new Error('TEACHER roli katalogda topilmadi');

      for (const teacher of teachers) {
        try {
          const department = await this.prisma.db.department.findFirst({
            where: { code: teacher.departmentCode },
            select: { id: true },
          });

          const existing = await this.prisma.db.user.findFirst({
            where: { externalId: teacher.externalId },
            select: { id: true },
          });

          if (existing) {
            await this.prisma.db.userProfile.update({
              where: { userId: existing.id },
              data: {
                firstName: teacher.firstName,
                lastName: teacher.lastName,
                middleName: teacher.middleName ?? null,
                meta: {
                  academicDegree: teacher.academicDegree ?? null,
                  position: teacher.position ?? null,
                } as never,
              },
            });
            result.updated += 1;
          } else {
            const email = teacher.email ?? `${teacher.externalId.toLowerCase()}@qdu.uz`;
            await this.prisma.db.user.create({
              data: {
                email,
                passwordHash: await this.crypto.hashPassword(this.crypto.generateToken(16)),
                status: 'ACTIVE',
                externalId: teacher.externalId,
                externalProvider: 'hemis',
                searchText: normalizeForSearch(`${teacher.lastName} ${teacher.firstName} ${email}`),
                profile: {
                  create: {
                    firstName: teacher.firstName,
                    lastName: teacher.lastName,
                    middleName: teacher.middleName ?? null,
                    meta: {
                      academicDegree: teacher.academicDegree ?? null,
                      position: teacher.position ?? null,
                    } as never,
                  },
                },
                roles: {
                  create: { roleId: teacherRole.id, scopeDepartmentId: department?.id ?? null },
                },
              },
            });
            result.created += 1;
          }
        } catch (error) {
          result.errors.push(`${teacher.externalId}: ${(error as Error).message}`);
        }
      }
    } catch (error) {
      result.errors.push((error as Error).message);
    }

    await this.finishLog(log.id, result);
    return result;
  }

  /** Yakuniy baholarni HEMIS ga qaytarish. */
  async pushGrades(semesterId: string): Promise<SyncResult> {
    const log = await this.startLog('grades', 'OUTBOUND');
    const result: SyncResult = {
      entity: 'grades',
      read: 0,
      created: 0,
      updated: 0,
      skipped: 0,
      errors: [],
    };

    try {
      const transcripts = await this.prisma.db.transcript.findMany({
        where: { semesterId },
        select: {
          entries: true,
          user: { select: { externalId: true } },
        },
      });

      const payload: Array<{
        studentExternalId: string;
        subjectCode: string;
        semesterNumber: number;
        score: number;
        credits: number;
      }> = [];

      const semester = await this.prisma.db.semester.findUnique({
        where: { id: semesterId },
        select: { number: true },
      });

      for (const transcript of transcripts) {
        if (!transcript.user.externalId) {
          result.skipped += 1;
          continue;
        }
        const entries = Array.isArray(transcript.entries)
          ? (transcript.entries as Array<{ courseId: string; score: number; credits: number }>)
          : [];

        for (const entry of entries) {
          const course = await this.prisma.db.course.findUnique({
            where: { id: entry.courseId },
            select: { subject: { select: { code: true } } },
          });
          if (!course?.subject) {
            result.skipped += 1;
            continue;
          }
          payload.push({
            studentExternalId: transcript.user.externalId,
            subjectCode: course.subject.code,
            semesterNumber: semester?.number ?? 1,
            score: entry.score,
            credits: entry.credits,
          });
        }
      }

      result.read = payload.length;
      const response = await this.hemis.pushGrades(payload);
      result.updated = response.accepted;
      result.errors.push(...response.errors);
    } catch (error) {
      result.errors.push((error as Error).message);
    }

    await this.finishLog(log.id, result);
    return result;
  }

  private async ensureGroupMembership(userId: string, groupId: string): Promise<void> {
    const current = await this.prisma.db.groupMember.findFirst({
      where: { userId, leftAt: null },
      select: { id: true, groupId: true },
    });

    if (current?.groupId === groupId) return;

    if (current) {
      await this.prisma.db.groupMember.update({
        where: { id: current.id },
        data: { leftAt: new Date(), reason: 'hemis_sync' },
      });
    }

    await this.prisma.db.groupMember.create({
      data: { groupId, userId, reason: 'hemis_sync' },
    });
  }

  private async startLog(entity: string, direction: string) {
    return this.prisma.integrationSyncLog.create({
      data: { provider: 'hemis', entity, direction, status: 'RUNNING' },
      select: { id: true },
    });
  }

  private async finishLog(id: string, result: SyncResult): Promise<void> {
    await this.prisma.integrationSyncLog.update({
      where: { id },
      data: {
        status: result.errors.length > 0 ? 'PARTIAL' : 'SUCCESS',
        recordsRead: result.read,
        recordsWritten: result.created + result.updated,
        errors: result.errors.slice(0, 100) as never,
        finishedAt: new Date(),
      },
    });

    await this.audit.record({
      action: `integration.hemis.${result.entity}`,
      resource: 'integration',
      resourceId: id,
      after: {
        read: result.read,
        created: result.created,
        updated: result.updated,
        errors: result.errors.length,
      },
    });

    this.logger.log(result, 'HEMIS sinxronizatsiyasi yakunlandi');
  }

  /** Oxirgi sinxronizatsiya jurnallari — administrator paneli uchun. */
  async recentLogs(limit = 20) {
    return this.prisma.integrationSyncLog.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit,
    });
  }
}
