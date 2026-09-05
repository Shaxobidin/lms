/**
 * Maqsad: F-09 — dars jadvali, dars sessiyalari va davomat.
 *
 * Davomat uch usulda belgilanadi: qo'lda (o'qituvchi), QR kod (talaba),
 * geo-belgilash. Har bir o'zgarish `AttendanceHistory` ga yoziladi (§7).
 */

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { combineDateAndTime, toTashkentDateKey } from '@lms/shared';
import type {
  CheckInInput,
  CreateClassSessionInput,
  CreateScheduleInput,
  MarkAttendanceInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { CryptoService } from '../../common/security/crypto.service';
import { QueueService } from '../../common/queue/queue.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';

/** Davomat foizi shu qiymatdan pastga tushsa — avtomatik ogohlantirish (F-09). */
const ATTENDANCE_WARNING_THRESHOLD = 75;

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
    private readonly queue: QueueService,
    private readonly events: EventsService,
  ) {}

  // --- Dars jadvali ---------------------------------------------------------

  async createSchedule(input: CreateScheduleInput, actor: RequestUser) {
    // Xona va o'qituvchi bandligini tekshiramiz — jadvalda ziddiyat bo'lmasin
    const conflict = await this.prisma.db.schedule.findFirst({
      where: {
        weekday: input.weekday,
        validFrom: { lte: input.validUntil },
        validUntil: { gte: input.validFrom },
        OR: [
          { teacherId: input.teacherId },
          { groupId: input.groupId },
          ...(input.room ? [{ room: input.room }] : []),
        ],
        AND: [{ startsAt: { lt: input.endsAt } }, { endsAt: { gt: input.startsAt } }],
      },
      select: { id: true, room: true, teacherId: true, groupId: true },
    });

    if (conflict) {
      throw AppException.conflict('errors.schedule_conflict', {
        conflictId: conflict.id,
        room: conflict.room,
      });
    }

    const schedule = await this.prisma.db.schedule.create({
      data: {
        courseId: input.courseId,
        groupId: input.groupId,
        teacherId: input.teacherId,
        weekday: input.weekday,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        room: input.room ?? null,
        lessonType: input.lessonType,
        weekParity: input.weekParity,
        validFrom: input.validFrom,
        validUntil: input.validUntil,
      },
      select: { id: true, weekday: true, startsAt: true, endsAt: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'schedule.create',
      resource: 'schedule',
      resourceId: schedule.id,
    });
    return schedule;
  }

  /** Guruh yoki o'qituvchi jadvali (haftalik ko'rinish). */
  async getSchedule(filters: { groupId?: string; teacherId?: string; courseId?: string }) {
    const where: Prisma.ScheduleWhereInput = {
      validFrom: { lte: new Date() },
      validUntil: { gte: new Date() },
    };
    if (filters.groupId) where.groupId = filters.groupId;
    if (filters.teacherId) where.teacherId = filters.teacherId;
    if (filters.courseId) where.courseId = filters.courseId;

    return this.prisma.db.schedule.findMany({
      where,
      orderBy: [{ weekday: 'asc' }, { startsAt: 'asc' }],
      select: {
        id: true,
        weekday: true,
        startsAt: true,
        endsAt: true,
        room: true,
        lessonType: true,
        weekParity: true,
        course: { select: { id: true, code: true, title: true } },
        group: { select: { id: true, name: true } },
        teacherId: true,
      },
    });
  }

  /**
   * Jadval asosida dars sessiyalarini generatsiya qilish.
   * Semestr davomidagi barcha darslar oldindan yaratiladi — jurnal to'ldirish
   * uchun tayyor bo'ladi.
   */
  async generateSessions(scheduleId: string, actor: RequestUser) {
    const schedule = await this.prisma.db.schedule.findUnique({
      where: { id: scheduleId },
      select: {
        id: true,
        courseId: true,
        groupId: true,
        teacherId: true,
        weekday: true,
        startsAt: true,
        endsAt: true,
        room: true,
        lessonType: true,
        weekParity: true,
        validFrom: true,
        validUntil: true,
      },
    });
    if (!schedule) throw AppException.notFound('schedule', scheduleId);

    const sessions: Prisma.ClassSessionCreateManyInput[] = [];
    const cursor = new Date(schedule.validFrom);
    let weekIndex = 0;

    // Birinchi mos hafta kunini topamiz (ISO: 1 = dushanba)
    while (isoWeekday(cursor) !== schedule.weekday && cursor <= schedule.validUntil) {
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    while (cursor <= schedule.validUntil) {
      const parityMatches =
        schedule.weekParity === 0 ||
        (schedule.weekParity === 1 && weekIndex % 2 === 0) ||
        (schedule.weekParity === 2 && weekIndex % 2 === 1);

      if (parityMatches) {
        sessions.push({
          scheduleId: schedule.id,
          courseId: schedule.courseId,
          groupId: schedule.groupId,
          teacherId: schedule.teacherId,
          date: new Date(cursor),
          startsAt: schedule.startsAt,
          endsAt: schedule.endsAt,
          room: schedule.room,
          lessonType: schedule.lessonType,
          status: 'PLANNED',
        });
      }

      cursor.setUTCDate(cursor.getUTCDate() + 7);
      weekIndex += 1;
    }

    const created = await this.prisma.db.classSession.createMany({
      data: sessions,
      skipDuplicates: true,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'schedule.sessions_generated',
      resource: 'schedule',
      resourceId: scheduleId,
      after: { count: created.count },
    });

    return { created: created.count };
  }

  async createSession(input: CreateClassSessionInput, actor: RequestUser) {
    const session = await this.prisma.db.classSession.create({
      data: {
        scheduleId: input.scheduleId ?? null,
        courseId: input.courseId,
        groupId: input.groupId,
        teacherId: input.teacherId,
        date: input.date,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        room: input.room ?? null,
        lessonType: input.lessonType,
        topic: input.topic ?? null,
      },
      select: { id: true, date: true, startsAt: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'class_session.create',
      resource: 'schedule',
      resourceId: session.id,
    });
    return session;
  }

  async listSessions(filters: { courseId?: string; groupId?: string; from?: Date; to?: Date }) {
    return this.prisma.db.classSession.findMany({
      where: {
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.groupId ? { groupId: filters.groupId } : {}),
        ...(filters.from || filters.to
          ? {
              date: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ date: 'asc' }, { startsAt: 'asc' }],
      take: 500,
      select: {
        id: true,
        date: true,
        startsAt: true,
        endsAt: true,
        room: true,
        lessonType: true,
        status: true,
        topic: true,
        meetingUrl: true,
        course: { select: { id: true, code: true, title: true } },
        group: { select: { id: true, name: true } },
        _count: { select: { attendances: true } },
      },
    });
  }

  // --- QR belgilash ---------------------------------------------------------

  /**
   * QR kod uchun qisqa muddatli token generatsiya qiladi.
   *
   * Token 5 daqiqa amal qiladi — talaba ekran suratini olib boshqalarga
   * yuborsa ham, dars tugaguncha ishlamay qoladi.
   */
  async generateQrToken(
    classSessionId: string,
    ttlSeconds: number,
    geoFence: { latitude: number; longitude: number; radiusMeters: number } | null | undefined,
    actor: RequestUser,
  ) {
    const session = await this.prisma.db.classSession.findUnique({
      where: { id: classSessionId },
      select: { id: true, teacherId: true, date: true },
    });
    if (!session) throw AppException.notFound('schedule', classSessionId);

    const token = this.crypto.generateToken(24);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    await this.prisma.db.classSession.update({
      where: { id: classSessionId },
      data: {
        qrToken: token,
        qrExpiresAt: expiresAt,
        geoFence: (geoFence ?? null) as never,
        status: 'ONGOING',
      },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'attendance.qr_generated',
      resource: 'attendance',
      resourceId: classSessionId,
    });

    return { token, expiresAt, ttlSeconds };
  }

  /**
   * Talaba QR orqali o'zini belgilaydi.
   * Geo-cheklov yoqilgan bo'lsa — masofani tekshiramiz.
   */
  async checkIn(input: CheckInInput, actor: RequestUser) {
    const session = await this.prisma.db.classSession.findFirst({
      where: { qrToken: input.token },
      select: {
        id: true,
        groupId: true,
        courseId: true,
        qrExpiresAt: true,
        geoFence: true,
        startsAt: true,
        date: true,
      },
    });

    if (!session) throw AppException.businessRule('errors.qr_token_invalid');
    if (!session.qrExpiresAt || session.qrExpiresAt < new Date()) {
      throw AppException.businessRule('errors.qr_token_expired');
    }

    // Talaba shu guruhda yoki kursga yozilgan bo'lishi kerak
    const enrolled = await this.prisma.db.enrollment.findUnique({
      where: { courseId_userId: { courseId: session.courseId, userId: actor.id } },
      select: { id: true },
    });
    if (!enrolled) throw AppException.forbidden('attendance:update:own');

    const fence = session.geoFence as {
      latitude: number;
      longitude: number;
      radiusMeters: number;
    } | null;

    if (fence) {
      if (input.latitude === undefined || input.longitude === undefined) {
        throw AppException.validation([{ field: 'latitude', code: 'validation.geo_required' }]);
      }
      const distance = haversineMeters(
        fence.latitude,
        fence.longitude,
        input.latitude,
        input.longitude,
      );
      if (distance > fence.radiusMeters) {
        throw AppException.businessRule('errors.geo_out_of_range', {
          distance: Math.round(distance),
          allowed: fence.radiusMeters,
        });
      }
    }

    // Kechikish: dars boshlanganidan 15 daqiqa o'tgan bo'lsa LATE
    const sessionStart = combineDateAndTime(toTashkentDateKey(session.date), session.startsAt);
    const status = Date.now() - sessionStart.getTime() > 15 * 60_000 ? 'LATE' : 'PRESENT';

    await this.upsertAttendance(
      session.id,
      actor.id,
      status,
      'QR',
      actor.id,
      undefined,
      input.latitude,
      input.longitude,
    );

    return { status, sessionId: session.id };
  }

  /** O'qituvchi jurnalni ommaviy to'ldiradi. */
  async markAttendance(input: MarkAttendanceInput, actor: RequestUser) {
    const session = await this.prisma.db.classSession.findUnique({
      where: { id: input.classSessionId },
      select: { id: true, courseId: true, groupId: true },
    });
    if (!session) throw AppException.notFound('schedule', input.classSessionId);

    for (const record of input.records) {
      await this.upsertAttendance(
        session.id,
        record.userId,
        record.status,
        'MANUAL',
        actor.id,
        record.comment,
      );
    }

    await this.prisma.db.classSession.update({
      where: { id: session.id },
      data: { status: 'FINISHED' },
    });

    // Davomat past bo'lgan talabalarni tekshirish — navbatda
    await this.queue.enqueue('grading.recalculate', { courseId: session.courseId });

    await this.audit.record({
      actorId: actor.id,
      action: 'attendance.marked',
      resource: 'attendance',
      resourceId: session.id,
      after: { count: input.records.length },
    });

    await this.events.publish({
      type: EVENT_TYPES.ATTENDANCE_MARKED,
      courseId: session.courseId,
      payload: { sessionId: session.id, count: input.records.length },
    });

    return { marked: input.records.length };
  }

  /**
   * Davomat yozuvini yaratadi yoki yangilaydi va o'zgarishni tarixga yozadi.
   * Tarix append-only — baza triggeri ham buni kafolatlaydi.
   */
  private async upsertAttendance(
    classSessionId: string,
    userId: string,
    status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED',
    method: string,
    actorId: string,
    comment?: string,
    latitude?: number,
    longitude?: number,
  ): Promise<void> {
    const existing = await this.prisma.db.attendance.findUnique({
      where: { classSessionId_userId: { classSessionId, userId } },
      select: { id: true, status: true },
    });

    await this.prisma.$transaction(async (tx) => {
      if (existing) {
        if (existing.status === status) return;
        await tx.attendance.update({
          where: { id: existing.id },
          data: {
            status,
            method,
            markedById: actorId,
            markedAt: new Date(),
            comment: comment ?? null,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
          },
        });
        await tx.attendanceHistory.create({
          data: {
            attendanceId: existing.id,
            oldStatus: existing.status,
            newStatus: status,
            changedById: actorId,
            reason: comment ?? method,
          },
        });
      } else {
        const created = await tx.attendance.create({
          data: {
            classSessionId,
            userId,
            status,
            method,
            markedById: actorId,
            comment: comment ?? null,
            latitude: latitude ?? null,
            longitude: longitude ?? null,
          },
          select: { id: true },
        });
        await tx.attendanceHistory.create({
          data: {
            attendanceId: created.id,
            oldStatus: null,
            newStatus: status,
            changedById: actorId,
            reason: method,
          },
        });
      }
    });
  }

  // --- Sabab hujjatlari -----------------------------------------------------

  async submitExcuse(
    input: { classSessionIds: string[]; fileObjectId: string; reason: string },
    actor: RequestUser,
  ) {
    const excuse = await this.prisma.db.attendanceExcuse.create({
      data: {
        userId: actor.id,
        fileObjectId: input.fileObjectId,
        classSessionIds: input.classSessionIds,
        reason: input.reason,
      },
      select: { id: true },
    });

    return { id: excuse.id, status: 'PENDING' };
  }

  async reviewExcuse(
    excuseId: string,
    approved: boolean,
    comment: string | undefined,
    actor: RequestUser,
  ) {
    const excuse = await this.prisma.db.attendanceExcuse.findUnique({
      where: { id: excuseId },
      select: { id: true, userId: true, classSessionIds: true, approved: true },
    });
    if (!excuse) throw AppException.notFound('attendance', excuseId);
    if (excuse.approved !== null) throw AppException.conflict('errors.excuse_already_reviewed');

    await this.prisma.db.attendanceExcuse.update({
      where: { id: excuseId },
      data: {
        approved,
        reviewedById: actor.id,
        reviewedAt: new Date(),
        reviewComment: comment ?? null,
      },
    });

    // Tasdiqlansa — barcha tegishli darslar EXCUSED ga o'tadi
    if (approved) {
      for (const sessionId of excuse.classSessionIds) {
        await this.upsertAttendance(
          sessionId,
          excuse.userId,
          'EXCUSED',
          'MANUAL',
          actor.id,
          `excuse:${excuseId}`,
        );
      }
    }

    await this.audit.record({
      actorId: actor.id,
      action: approved ? 'attendance.excuse_approved' : 'attendance.excuse_rejected',
      resource: 'attendance',
      resourceId: excuseId,
      after: { approved, sessions: excuse.classSessionIds.length },
    });

    return { approved };
  }

  // --- Hisobot --------------------------------------------------------------

  /**
   * Davomat hisoboti. Bitta agregat so'rov bilan olinadi —
   * har bir talaba uchun alohida so'rov yuborilmaydi (N+1 yo'q).
   */
  async report(filters: {
    courseId?: string;
    groupId?: string;
    userId?: string;
    from?: Date;
    to?: Date;
  }) {
    const where: Prisma.AttendanceWhereInput = {
      classSession: {
        ...(filters.courseId ? { courseId: filters.courseId } : {}),
        ...(filters.groupId ? { groupId: filters.groupId } : {}),
        ...(filters.from || filters.to
          ? {
              date: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      ...(filters.userId ? { userId: filters.userId } : {}),
    };

    const grouped = await this.prisma.attendance.groupBy({
      by: ['userId', 'status'],
      where,
      _count: { _all: true },
    });

    const byUser = new Map<string, Record<string, number>>();
    for (const row of grouped) {
      const entry = byUser.get(row.userId) ?? {
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
        EXCUSED: 0,
      };
      entry[row.status] = row._count._all;
      byUser.set(row.userId, entry);
    }

    const users = await this.prisma.db.user.findMany({
      where: { id: { in: Array.from(byUser.keys()) } },
      select: { id: true, profile: { select: { firstName: true, lastName: true } } },
    });

    return users
      .map((user) => {
        const counts = byUser.get(user.id) ?? { PRESENT: 0, ABSENT: 0, LATE: 0, EXCUSED: 0 };
        const total =
          (counts.PRESENT ?? 0) + (counts.ABSENT ?? 0) + (counts.LATE ?? 0) + (counts.EXCUSED ?? 0);
        const attended = (counts.PRESENT ?? 0) + (counts.LATE ?? 0) + (counts.EXCUSED ?? 0);
        const percent = total === 0 ? 0 : Math.round((attended / total) * 10000) / 100;

        return {
          userId: user.id,
          fullName: [user.profile?.lastName, user.profile?.firstName].filter(Boolean).join(' '),
          ...counts,
          total,
          percent,
          atRisk: percent < ATTENDANCE_WARNING_THRESHOLD,
        };
      })
      .sort((a, b) => a.percent - b.percent);
  }

  /** Talabaning shaxsiy davomat tarixi. */
  async myAttendance(userId: string, courseId?: string) {
    return this.prisma.db.attendance.findMany({
      where: {
        userId,
        ...(courseId ? { classSession: { courseId } } : {}),
      },
      orderBy: { classSession: { date: 'desc' } },
      take: 200,
      select: {
        id: true,
        status: true,
        method: true,
        markedAt: true,
        comment: true,
        classSession: {
          select: {
            id: true,
            date: true,
            startsAt: true,
            lessonType: true,
            topic: true,
            course: { select: { id: true, code: true, title: true } },
          },
        },
      },
    });
  }
}

/** ISO hafta kuni: 1 = dushanba ... 7 = yakshanba. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}

/**
 * Ikki koordinata orasidagi masofa (metrda) — Haversine formulasi.
 * Geo-belgilashda auditoriya radiusini tekshirish uchun.
 */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const earthRadius = 6_371_000;
  const toRadians = (value: number) => (value * Math.PI) / 180;

  const deltaLat = toRadians(lat2 - lat1);
  const deltaLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(deltaLon / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export { haversineMeters };
