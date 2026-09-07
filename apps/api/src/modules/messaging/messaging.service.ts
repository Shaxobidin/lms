/**
 * Maqsad: F-10 — e'lonlar, forum, shaxsiy xabarlar va bildirishnomalar.
 *
 * Bildirishnoma matni backendda HOSIL QILINMAYDI (P7): faqat `templateKey`
 * va parametrlar saqlanadi, matn frontend yoki worker'dagi i18n katalogidan olinadi.
 */

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CreateAnnouncementInput,
  CreateForumPostInput,
  CreateForumThreadInput,
  CreateMessageInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SiteSettingsService } from '../../common/settings/site-settings.service';
import { AuditService } from '../../common/audit/audit.service';
import { SanitizerService } from '../../common/security/sanitizer.service';
import { QueueService } from '../../common/queue/queue.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';

/** Forum javoblarining maksimal ichma-ichligi — cheksiz zanjirni oldini oladi. */
const MAX_THREAD_DEPTH = 5;

@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sanitizer: SanitizerService,
    private readonly queue: QueueService,
    private readonly events: EventsService,
    private readonly siteSettings: SiteSettingsService,
  ) {}

  // --- E'lonlar -------------------------------------------------------------

  /**
   * E'lon yaratadi va qabul qiluvchilarni aniqlab bildirishnoma yaratadi.
   * Yuborish navbatda bajariladi — 2000 talabaga email API ni bloklamaydi.
   */
  async createAnnouncement(input: CreateAnnouncementInput, actor: RequestUser) {
    const announcement = await this.prisma.db.announcement.create({
      data: {
        courseId: input.courseId ?? null,
        authorId: actor.id,
        title: this.sanitizer.sanitizeLocalized(input.title) as never,
        body: this.sanitizer.sanitizeLocalized(input.body) as never,
        audience: input.audience,
        audienceIds: input.audienceIds,
        audienceRoles: input.audienceRoles,
        channels: input.channels,
        isPinned: input.isPinned,
        publishAt: input.publishAt ?? new Date(),
      },
      select: { id: true, title: true, publishAt: true },
    });

    const recipientIds = await this.resolveAudience(input);

    if (recipientIds.length > 0) {
      // `createManyAndReturn` — PostgreSQL da yaratilgan yozuvlar id sini qaytaradi,
      // shuning uchun keyin qayta qidirish (va boshqa e'lonlarni ilib olish) shart emas.
      const created = await this.prisma.notification.createManyAndReturn({
        data: recipientIds.map((userId) => ({
          userId,
          templateKey: 'notification.announcement',
          params: {
            announcementId: announcement.id,
            title: input.title,
          } as never,
          channels: input.channels,
          linkUrl: input.courseId
            ? `/courses/${input.courseId}/announcements/${announcement.id}`
            : `/announcements/${announcement.id}`,
        })),
        select: { id: true },
      });

      // Har bir bildirishnoma uchun alohida job — bitta kanaldagi xatolik
      // boshqa foydalanuvchilarga ta'sir qilmaydi
      for (const notification of created) {
        await this.queue.enqueue('notification.dispatch', { notificationId: notification.id });
      }
    }

    await this.events.publish({
      type: EVENT_TYPES.ANNOUNCEMENT,
      ...(input.courseId ? { courseId: input.courseId } : {}),
      payload: { announcementId: announcement.id, title: input.title },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'announcement.create',
      resource: 'announcement',
      resourceId: announcement.id,
      after: { recipients: recipientIds.length, audience: input.audience },
    });

    return { ...announcement, recipients: recipientIds.length };
  }

  /**
   * Auditoriyani foydalanuvchi id lariga yoyadi.
   * Har bir tur uchun bitta so'rov — sikl ichida so'rov yuborilmaydi.
   */
  private async resolveAudience(input: CreateAnnouncementInput): Promise<string[]> {
    const where: Prisma.UserWhereInput = { status: 'ACTIVE' };

    switch (input.audience) {
      case 'ALL':
        break;
      case 'COURSE':
        where.enrollments = {
          some: { courseId: { in: input.audienceIds }, status: { in: ['ACTIVE', 'COMPLETED'] } },
        };
        break;
      case 'GROUP':
        where.studentGroups = { some: { groupId: { in: input.audienceIds }, leftAt: null } };
        break;
      case 'FACULTY':
        where.studentGroups = {
          some: {
            leftAt: null,
            group: { speciality: { department: { facultyId: { in: input.audienceIds } } } },
          },
        };
        break;
      case 'ROLE':
        where.roles = { some: { role: { code: { in: input.audienceRoles } } } };
        break;
      default:
        return [];
    }

    const users = await this.prisma.db.user.findMany({ where, select: { id: true }, take: 20_000 });
    return users.map((user) => user.id);
  }

  async listAnnouncements(actor: RequestUser, courseId?: string) {
    return this.prisma.db.announcement.findMany({
      where: {
        publishAt: { lte: new Date() },
        ...(courseId
          ? { courseId }
          : {
              OR: [
                { courseId: null },
                { courseId: { in: [...actor.scope.enrolledCourseIds, ...actor.scope.courseIds] } },
              ],
            }),
      },
      orderBy: [{ isPinned: 'desc' }, { publishAt: 'desc' }],
      take: 50,
      select: {
        id: true,
        title: true,
        body: true,
        isPinned: true,
        publishAt: true,
        course: { select: { id: true, code: true, title: true } },
        author: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  // --- Forum ----------------------------------------------------------------

  async createThread(input: CreateForumThreadInput, actor: RequestUser) {
    const thread = await this.prisma.$transaction(async (tx) => {
      const created = await tx.forumThread.create({
        data: {
          courseId: input.courseId,
          authorId: actor.id,
          title: this.sanitizer.stripHtml(input.title).slice(0, 300),
          isQuestion: input.isQuestion,
          postCount: 1,
          lastPostAt: new Date(),
        },
        select: { id: true, title: true },
      });

      await tx.forumPost.create({
        data: {
          threadId: created.id,
          authorId: actor.id,
          contentHtml: this.sanitizer.sanitizeHtml(input.body),
          depth: 0,
        },
      });

      return created;
    });

    await this.events.publish({
      type: EVENT_TYPES.FORUM_REPLY,
      courseId: input.courseId,
      payload: { threadId: thread.id, title: thread.title },
    });

    return thread;
  }

  async listThreads(courseId: string) {
    return this.prisma.db.forumThread.findMany({
      where: { courseId },
      orderBy: [{ isPinned: 'desc' }, { lastPostAt: 'desc' }],
      take: 100,
      select: {
        id: true,
        title: true,
        isQuestion: true,
        isPinned: true,
        isLocked: true,
        postCount: true,
        viewCount: true,
        lastPostAt: true,
        createdAt: true,
        author: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
      },
    });
  }

  /**
   * Mavzuni postlari bilan qaytaradi.
   * Postlar tekis (flat) ro'yxatda `parentId` bilan qaytadi — daraxtni
   * frontend quradi. Bu rekursiv SQL so'rovidan tezroq.
   */
  async getThread(threadId: string) {
    const thread = await this.prisma.db.forumThread.findUnique({
      where: { id: threadId },
      select: {
        id: true,
        title: true,
        courseId: true,
        isQuestion: true,
        isLocked: true,
        createdAt: true,
        author: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        posts: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            parentId: true,
            contentHtml: true,
            depth: true,
            isAnswer: true,
            likeCount: true,
            createdAt: true,
            author: {
              select: {
                id: true,
                profile: { select: { firstName: true, lastName: true, avatarFileId: true } },
              },
            },
          },
        },
      },
    });

    if (!thread) throw AppException.notFound('forum', threadId);

    // Ko'rishlar sonini oshiramiz (statistika uchun, kritik emas)
    await this.prisma.db.forumThread.update({
      where: { id: threadId },
      data: { viewCount: { increment: 1 } },
    });

    return thread;
  }

  async createPost(input: CreateForumPostInput, actor: RequestUser) {
    const thread = await this.prisma.db.forumThread.findUnique({
      where: { id: input.threadId },
      select: { id: true, courseId: true, isLocked: true, authorId: true },
    });
    if (!thread) throw AppException.notFound('forum', input.threadId);
    if (thread.isLocked) throw AppException.businessRule('errors.thread_locked');

    let depth = 0;
    if (input.parentId) {
      const parent = await this.prisma.db.forumPost.findUnique({
        where: { id: input.parentId },
        select: { depth: true, threadId: true },
      });
      if (!parent || parent.threadId !== input.threadId) {
        throw AppException.validation([{ field: 'parentId', code: 'validation.invalid_parent' }]);
      }
      depth = Math.min(parent.depth + 1, MAX_THREAD_DEPTH);
    }

    const post = await this.prisma.$transaction(async (tx) => {
      const created = await tx.forumPost.create({
        data: {
          threadId: input.threadId,
          parentId: input.parentId ?? null,
          authorId: actor.id,
          contentHtml: this.sanitizer.sanitizeHtml(input.contentHtml),
          depth,
        },
        select: { id: true, createdAt: true, depth: true },
      });

      await tx.forumThread.update({
        where: { id: input.threadId },
        data: { postCount: { increment: 1 }, lastPostAt: new Date() },
      });

      return created;
    });

    // Mavzu muallifiga bildirishnoma (o'ziga emas)
    if (thread.authorId !== actor.id) {
      const notification = await this.prisma.notification.create({
        data: {
          userId: thread.authorId,
          templateKey: 'notification.forum_reply',
          params: { threadId: thread.id, postId: post.id } as never,
          channels: ['IN_APP'],
          linkUrl: `/courses/${thread.courseId}/forum/${thread.id}`,
        },
        select: { id: true },
      });
      await this.queue.enqueue('notification.dispatch', { notificationId: notification.id });
    }

    await this.events.publish({
      type: EVENT_TYPES.FORUM_REPLY,
      courseId: thread.courseId,
      payload: { threadId: thread.id, postId: post.id },
    });

    return post;
  }

  /** Eng yaxshi javobni belgilash (savol-javob rejimi). */
  async markAsAnswer(postId: string, actor: RequestUser) {
    const post = await this.prisma.db.forumPost.findUnique({
      where: { id: postId },
      select: {
        id: true,
        threadId: true,
        thread: { select: { authorId: true, isQuestion: true } },
      },
    });
    if (!post) throw AppException.notFound('forum', postId);
    if (!post.thread.isQuestion) throw AppException.businessRule('errors.thread_not_question');

    const canMark =
      post.thread.authorId === actor.id || actor.permissions.includes('forum:manage:own_course');
    if (!canMark) throw AppException.forbidden('forum:manage:own_course');

    await this.prisma.$transaction(async (tx) => {
      await tx.forumPost.updateMany({
        where: { threadId: post.threadId },
        data: { isAnswer: false },
      });
      await tx.forumPost.update({ where: { id: postId }, data: { isAnswer: true } });
    });

    return { marked: true };
  }

  async moderateThread(
    threadId: string,
    input: { isPinned?: boolean; isLocked?: boolean },
    actor: RequestUser,
  ) {
    const updated = await this.prisma.db.forumThread.update({
      where: { id: threadId },
      data: {
        ...(input.isPinned !== undefined ? { isPinned: input.isPinned } : {}),
        ...(input.isLocked !== undefined ? { isLocked: input.isLocked } : {}),
      },
      select: { id: true, isPinned: true, isLocked: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'forum.moderate',
      resource: 'forum',
      resourceId: threadId,
      after: input,
    });

    return updated;
  }

  // --- Shaxsiy xabarlar -----------------------------------------------------

  async sendMessage(input: CreateMessageInput, actor: RequestUser) {
    if (input.recipientId === actor.id) {
      throw AppException.businessRule('errors.cannot_message_self');
    }
    // Sayt boshqaruvi → Xabarlar sozlamalari (F-17)
    if (!(await this.siteSettings.getBoolean('messaging.enabled'))) {
      throw AppException.businessRule('errors.messaging_disabled');
    }

    const recipient = await this.prisma.db.user.findFirst({
      where: { id: input.recipientId, status: 'ACTIVE' },
      select: { id: true, locale: true, roles: { select: { role: { select: { code: true } } } } },
    });
    if (!recipient) throw AppException.notFound('user', input.recipientId);

    // Talaba → talaba yozishmasi o'chirilgan bo'lsa (Moodle "student-to-student messaging")
    const onlyStudent = (codes: string[]) =>
      codes.length > 0 && codes.every((c) => c === 'STUDENT');
    if (
      onlyStudent(actor.roles) &&
      onlyStudent(recipient.roles.map((entry) => entry.role.code)) &&
      !(await this.siteSettings.getBoolean('messaging.studentToStudent'))
    ) {
      throw AppException.businessRule('errors.student_messaging_restricted');
    }

    const message = await this.prisma.db.message.create({
      data: {
        senderId: actor.id,
        recipientId: input.recipientId,
        replyToId: input.replyToId ?? null,
        subject: input.subject ? this.sanitizer.stripHtml(input.subject).slice(0, 200) : null,
        body: this.sanitizer.sanitizeHtml(input.body),
      },
      select: { id: true, createdAt: true },
    });

    const notification = await this.prisma.notification.create({
      data: {
        userId: input.recipientId,
        templateKey: 'notification.new_message',
        params: { messageId: message.id, senderId: actor.id } as never,
        channels: ['IN_APP'],
        linkUrl: `/messages/${message.id}`,
      },
      select: { id: true },
    });
    await this.queue.enqueue('notification.dispatch', { notificationId: notification.id });

    return message;
  }

  /**
   * Kimga xabar yozish mumkin (F-10).
   *
   * Global foydalanuvchilar ro'yxati ATAYLAB ochilmaydi: §11 bo'yicha shaxsga
   * doir ma'lumot faqat zarur doirada ko'rinishi kerak, aks holda har qanday
   * talaba butun universitet ro'yxatini yig'ib olardi.
   *
   * Doira umumiy kursdan kelib chiqadi:
   *  - talaba → o'zi yozilgan kurslarning o'qituvchilari va guruhi kuratori;
   *  - o'qituvchi/tyutor → o'z kurslariga yozilgan talabalar va hamkasblar.
   */
  async messageContacts(actor: RequestUser, search?: string) {
    const teachingCourseIds = actor.scope.courseIds;
    const enrolledCourseIds = actor.scope.enrolledCourseIds;

    const conditions: Prisma.UserWhereInput[] = [];

    // Yozilgan kurslarning o'qituvchilari
    if (enrolledCourseIds.length > 0) {
      conditions.push({ taughtCourses: { some: { courseId: { in: enrolledCourseIds } } } });
    }

    // O'z kurslariga yozilgan talabalar va o'sha kurslardagi hamkasblar
    if (teachingCourseIds.length > 0) {
      conditions.push({
        enrollments: {
          some: { courseId: { in: teachingCourseIds }, status: { in: ['ACTIVE', 'COMPLETED'] } },
        },
      });
      conditions.push({ taughtCourses: { some: { courseId: { in: teachingCourseIds } } } });
    }

    // Tyutor kurator bo'lgan guruh a'zolari
    if (actor.scope.groupIds.length > 0) {
      conditions.push({
        studentGroups: { some: { groupId: { in: actor.scope.groupIds }, leftAt: null } },
      });
    }

    if (conditions.length === 0) return [];

    const normalized = search?.trim();

    const users = await this.prisma.db.user.findMany({
      where: {
        status: 'ACTIVE',
        // O'ziga xabar yozib bo'lmaydi (`sendMessage` ham buni rad etadi)
        id: { not: actor.id },
        OR: conditions,
        ...(normalized
          ? {
              profile: {
                OR: [
                  { firstName: { contains: normalized, mode: 'insensitive' } },
                  { lastName: { contains: normalized, mode: 'insensitive' } },
                ],
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: {
        id: true,
        profile: { select: { firstName: true, lastName: true } },
        roles: { select: { role: { select: { code: true } } } },
      },
    });

    return users
      .map((user) => ({
        id: user.id,
        firstName: user.profile?.firstName ?? '',
        lastName: user.profile?.lastName ?? '',
        roles: user.roles.map((row) => row.role.code),
      }))
      .sort((a, b) => a.lastName.localeCompare(b.lastName, 'uz'));
  }

  async listMessages(actor: RequestUser, box: 'inbox' | 'sent') {
    return this.prisma.db.message.findMany({
      where: box === 'inbox' ? { recipientId: actor.id } : { senderId: actor.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        subject: true,
        body: true,
        readAt: true,
        createdAt: true,
        sender: { select: { id: true, profile: { select: { firstName: true, lastName: true } } } },
        recipient: {
          select: { id: true, profile: { select: { firstName: true, lastName: true } } },
        },
      },
    });
  }

  async markMessageRead(messageId: string, actor: RequestUser) {
    const result = await this.prisma.db.message.updateMany({
      where: { id: messageId, recipientId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: result.count };
  }

  // --- Bildirishnomalar -----------------------------------------------------

  async listNotifications(actor: RequestUser, unreadOnly: boolean) {
    return this.prisma.notification.findMany({
      where: { userId: actor.id, ...(unreadOnly ? { readAt: null } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        templateKey: true,
        params: true,
        linkUrl: true,
        readAt: true,
        createdAt: true,
      },
    });
  }

  async markNotificationsRead(actor: RequestUser, ids: string[]) {
    const result = await this.prisma.notification.updateMany({
      where: { userId: actor.id, ...(ids.length > 0 ? { id: { in: ids } } : {}), readAt: null },
      data: { readAt: new Date(), status: 'READ' },
    });
    return { updated: result.count };
  }

  async unreadCount(actor: RequestUser) {
    const [notifications, messages] = await Promise.all([
      this.prisma.notification.count({ where: { userId: actor.id, readAt: null } }),
      this.prisma.db.message.count({ where: { recipientId: actor.id, readAt: null } }),
    ]);
    return { notifications, messages, total: notifications + messages };
  }

  /** Bildirishnoma sozlamalari (kanal tanlovi, sokin soatlar). */
  async updatePreferences(
    actor: RequestUser,
    preferences: Record<string, string[]>,
    quietHours: { from: string; to: string } | null | undefined,
  ) {
    await this.prisma.notificationPreference.upsert({
      where: { userId: actor.id },
      create: {
        userId: actor.id,
        preferences: preferences as never,
        quietHours: (quietHours ?? null) as never,
      },
      update: {
        preferences: preferences as never,
        quietHours: (quietHours ?? null) as never,
      },
    });
    return { saved: true };
  }
}
