/**
 * Maqsad: F-11 — virtual sinf (Jitsi/BBB), yozib olish va avtomatik davomat.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { CreateMeetingInput } from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../common/audit/audit.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { CLASSROOM_PROVIDER, type ClassroomProvider } from '../integrations/contracts';

@Injectable()
export class ClassroomService {
  private readonly logger = new Logger(ClassroomService.name);

  constructor(
    @Inject(CLASSROOM_PROVIDER) private readonly provider: ClassroomProvider,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly events: EventsService,
  ) {}

  async create(input: CreateMeetingInput, actor: RequestUser) {
    const course = await this.prisma.db.course.findUnique({
      where: { id: input.courseId },
      select: { id: true, title: true },
    });
    if (!course) throw AppException.notFound('course', input.courseId);

    const moderatorName = await this.resolveFullName(actor.id);

    const session = await this.provider.createMeeting({
      title: input.title,
      externalId: `${input.courseId}-${Date.now()}`,
      durationMinutes: input.durationMinutes,
      recordingEnabled: input.recordingEnabled,
      moderatorName,
    });

    const meeting = await this.prisma.db.meeting.create({
      data: {
        courseId: input.courseId,
        topicId: input.topicId ?? null,
        classSessionId: input.classSessionId ?? null,
        createdById: actor.id,
        provider: this.provider.name,
        externalMeetingId: session.externalMeetingId,
        title: input.title,
        joinUrl: session.joinUrl,
        moderatorUrl: session.moderatorUrl ?? null,
        startsAt: input.startsAt,
        durationMinutes: input.durationMinutes,
        recordingEnabled: input.recordingEnabled,
        autoAttendance: input.autoAttendance,
      },
      select: { id: true, title: true, joinUrl: true, startsAt: true },
    });

    // Dars sessiyasiga bog'langan bo'lsa — havola jurnalda ham ko'rinadi
    if (input.classSessionId) {
      await this.prisma.db.classSession.update({
        where: { id: input.classSessionId },
        data: { meetingUrl: session.joinUrl },
      });
    }

    await this.events.publish({
      type: EVENT_TYPES.ANNOUNCEMENT,
      courseId: input.courseId,
      payload: { meetingId: meeting.id, titleKey: 'events.meeting_scheduled', title: input.title },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'classroom.meeting_created',
      resource: 'classroom',
      resourceId: meeting.id,
      after: { provider: this.provider.name, courseId: input.courseId },
    });

    return meeting;
  }

  /**
   * Qo'shilish havolasi. Har bir foydalanuvchi uchun alohida generatsiya
   * qilinadi (ism va rol bilan) — umumiy havola ulashilmaydi.
   */
  async join(meetingId: string, actor: RequestUser) {
    const meeting = await this.prisma.db.meeting.findUnique({
      where: { id: meetingId },
      select: {
        id: true,
        courseId: true,
        externalMeetingId: true,
        createdById: true,
        startsAt: true,
        durationMinutes: true,
        endedAt: true,
        autoAttendance: true,
        classSessionId: true,
      },
    });
    if (!meeting) throw AppException.notFound('classroom', meetingId);
    if (meeting.endedAt) throw AppException.businessRule('errors.meeting_ended');

    const enrolled = await this.prisma.db.enrollment.findUnique({
      where: { courseId_userId: { courseId: meeting.courseId, userId: actor.id } },
      select: { id: true },
    });
    const isTeacher = actor.scope.courseIds.includes(meeting.courseId);
    if (!enrolled && !isTeacher) throw AppException.forbidden('classroom:read:own');

    // Talaba dars boshlanishidan 15 daqiqa oldin kira oladi. O'qituvchi
    // (moderator) esa xonani istalgan vaqtda ochadi — materialni tekshirish va
    // dars oldidan tayyorgarlik uchun (Moodle/BBB dagi kabi).
    const opensAt = new Date(meeting.startsAt.getTime() - 15 * 60_000);
    if (!isTeacher && new Date() < opensAt) {
      throw AppException.businessRule('errors.meeting_not_started', {
        opensAt: opensAt.toISOString(),
      });
    }

    const displayName = await this.resolveFullName(actor.id);
    const url = await this.provider.buildJoinUrl({
      externalMeetingId: meeting.externalMeetingId,
      displayName,
      isModerator: isTeacher,
    });

    // Avtomatik davomat (F-11): talaba qo'shilganda PRESENT belgilanadi
    if (meeting.autoAttendance && meeting.classSessionId && !isTeacher) {
      await this.markAutoAttendance(meeting.classSessionId, actor.id);
    }

    return { joinUrl: url, displayName, isModerator: isTeacher };
  }

  private async markAutoAttendance(classSessionId: string, userId: string): Promise<void> {
    const existing = await this.prisma.db.attendance.findUnique({
      where: { classSessionId_userId: { classSessionId, userId } },
      select: { id: true, status: true },
    });

    // Mavjud belgi ustiga yozmaymiz (o'qituvchi qo'lda qo'ygan bo'lishi mumkin)
    if (existing) return;

    await this.prisma.$transaction(async (tx) => {
      const created = await tx.attendance.create({
        data: {
          classSessionId,
          userId,
          status: 'PRESENT',
          method: 'AUTO_VIRTUAL',
          markedById: userId,
        },
        select: { id: true },
      });
      await tx.attendanceHistory.create({
        data: {
          attendanceId: created.id,
          oldStatus: null,
          newStatus: 'PRESENT',
          changedById: userId,
          reason: 'virtual_classroom_join',
        },
      });
    });
  }

  async listForCourse(courseId: string) {
    return this.prisma.db.meeting.findMany({
      where: { courseId },
      orderBy: { startsAt: 'desc' },
      take: 50,
      select: {
        id: true,
        title: true,
        startsAt: true,
        durationMinutes: true,
        recordingEnabled: true,
        recordingUrl: true,
        endedAt: true,
        provider: true,
      },
    });
  }

  /** Uchrashuvni yakunlash va yozuv havolasini saqlash. */
  async end(meetingId: string, actor: RequestUser) {
    const meeting = await this.prisma.db.meeting.findUnique({
      where: { id: meetingId },
      select: { id: true, externalMeetingId: true, recordingEnabled: true, classSessionId: true },
    });
    if (!meeting) throw AppException.notFound('classroom', meetingId);

    let recordingUrl: string | null = null;
    if (meeting.recordingEnabled && this.provider.getRecordingUrl) {
      try {
        recordingUrl = await this.provider.getRecordingUrl(meeting.externalMeetingId);
      } catch (error) {
        // Yozuv hali tayyor bo'lmasligi mumkin — bu xato emas
        this.logger.warn(
          { meetingId, error: (error as Error).message },
          "Yozuv havolasini olib bo'lmadi",
        );
      }
    }

    await this.prisma.db.meeting.update({
      where: { id: meetingId },
      data: { endedAt: new Date(), recordingUrl },
    });

    if (meeting.classSessionId && recordingUrl) {
      await this.prisma.db.classSession.update({
        where: { id: meeting.classSessionId },
        data: { recordingUrl, status: 'FINISHED' },
      });
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'classroom.meeting_ended',
      resource: 'classroom',
      resourceId: meetingId,
      after: { hasRecording: Boolean(recordingUrl) },
    });

    return { ended: true, recordingUrl };
  }

  private async resolveFullName(userId: string): Promise<string> {
    const profile = await this.prisma.db.userProfile.findUnique({
      where: { userId },
      select: { firstName: true, lastName: true },
    });
    return [profile?.lastName, profile?.firstName].filter(Boolean).join(' ') || 'Foydalanuvchi';
  }
}
