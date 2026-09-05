/**
 * Maqsad: F-10 endpointlari — e'lon, forum, xabar, bildirishnoma va SSE oqimi.
 */

import { Body, Controller, Get, Param, Patch, Post, Query, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { Observable } from 'rxjs';
import {
  createAnnouncementSchema,
  createForumPostSchema,
  createForumThreadSchema,
  createMessageSchema,
  moderateThreadSchema,
  notificationPreferencesSchema,
  uuidSchema,
  type CreateAnnouncementInput,
  type CreateForumPostInput,
  type CreateForumThreadInput,
  type CreateMessageInput,
} from '@lms/shared';
import { MessagingService } from './messaging.service';
import { zodBody, zodQuery, ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import { SkipEnvelope } from '../../common/interceptors/response.interceptor';
import { EventsService, type DomainEvent } from '../../common/events/events.service';
import type { RequestUser } from '../../common/auth/auth.types';

@ApiTags('messaging')
@Controller()
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly events: EventsService,
  ) {}

  // --- E'lonlar -------------------------------------------------------------

  @Post('announcements')
  @RequirePermission([
    'announcement:create:own_course',
    'announcement:create:own_group',
    'announcement:create:own_department',
    'announcement:create:own_faculty',
    'announcement:create:all',
  ])
  @ApiOperation({ summary: "E'lon yaratish va tarqatish" })
  async createAnnouncement(
    @Body(zodBody(createAnnouncementSchema)) dto: CreateAnnouncementInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.createAnnouncement(dto, actor);
  }

  @Get('announcements')
  @ApiOperation({ summary: "E'lonlar ro'yxati" })
  async listAnnouncements(
    @Query(zodQuery(z.object({ courseId: uuidSchema.optional() }))) query: { courseId?: string },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.listAnnouncements(actor, query.courseId);
  }

  // --- Forum ----------------------------------------------------------------

  @Post('forum/threads')
  @RequirePermission(['forum:create:own', 'forum:manage:own_course'])
  @ApiOperation({ summary: 'Forum mavzusini yaratish' })
  async createThread(
    @Body(zodBody(createForumThreadSchema)) dto: CreateForumThreadInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.createThread(dto, actor);
  }

  @Get('courses/:courseId/forum')
  @RequirePermission(['forum:read:own', 'forum:manage:own_course'], {
    resource: 'course',
    path: 'params.courseId',
  })
  @ApiOperation({ summary: 'Kurs forumi mavzulari' })
  async listThreads(@Param('courseId', new ZodValidationPipe(uuidSchema)) courseId: string) {
    return this.messaging.listThreads(courseId);
  }

  @Get('forum/threads/:id')
  @RequirePermission(['forum:read:own', 'forum:manage:own_course'], {
    resource: 'forum',
    path: 'params.id',
  })
  @ApiOperation({ summary: 'Mavzu va uning postlari' })
  async getThread(@Param('id', new ZodValidationPipe(uuidSchema)) id: string) {
    return this.messaging.getThread(id);
  }

  @Post('forum/posts')
  @RequirePermission(['forum:create:own', 'forum:manage:own_course'])
  @ApiOperation({ summary: 'Forumga javob yozish' })
  async createPost(
    @Body(zodBody(createForumPostSchema)) dto: CreateForumPostInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.createPost(dto, actor);
  }

  @Post('forum/posts/:id/mark-answer')
  @RequirePermission(['forum:create:own', 'forum:manage:own_course'])
  @ApiOperation({ summary: 'Eng yaxshi javobni belgilash' })
  async markAnswer(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.markAsAnswer(id, actor);
  }

  @Patch('forum/threads/:id/moderate')
  @RequirePermission('forum:manage:own_course', { resource: 'forum', path: 'params.id' })
  @ApiOperation({ summary: 'Mavzuni qadash yoki yopish' })
  async moderate(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @Body(zodBody(moderateThreadSchema)) dto: { isPinned?: boolean; isLocked?: boolean },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.moderateThread(id, dto, actor);
  }

  // --- Xabarlar -------------------------------------------------------------

  @Post('messages')
  @RequirePermission('message:create:own')
  @ApiOperation({ summary: 'Shaxsiy xabar yuborish' })
  async sendMessage(
    @Body(zodBody(createMessageSchema)) dto: CreateMessageInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.sendMessage(dto, actor);
  }

  @Get('messages')
  @ApiOperation({ summary: 'Xabarlar (kiruvchi yoki chiquvchi)' })
  async listMessages(
    @Query(zodQuery(z.object({ box: z.enum(['inbox', 'sent']).default('inbox') })))
    query: { box: 'inbox' | 'sent' },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.listMessages(actor, query.box);
  }

  @Patch('messages/:id/read')
  @ApiOperation({ summary: "Xabarni o'qilgan deb belgilash" })
  async markMessageRead(
    @Param('id', new ZodValidationPipe(uuidSchema)) id: string,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.markMessageRead(id, actor);
  }

  // --- Bildirishnomalar -----------------------------------------------------

  @Get('notifications')
  @ApiOperation({ summary: 'Bildirishnomalar' })
  async notifications(
    @Query(zodQuery(z.object({ unreadOnly: z.coerce.boolean().default(false) })))
    query: { unreadOnly: boolean },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.listNotifications(actor, query.unreadOnly);
  }

  @Get('notifications/unread-count')
  @ApiOperation({ summary: "O'qilmagan bildirishnoma va xabarlar soni" })
  async unreadCount(@CurrentUser() actor: RequestUser) {
    return this.messaging.unreadCount(actor);
  }

  @Patch('notifications/read')
  @ApiOperation({ summary: "Bildirishnomalarni o'qilgan deb belgilash" })
  async markRead(
    @Body(zodBody(z.object({ ids: z.array(uuidSchema).max(200).default([]) })))
    dto: { ids: string[] },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.markNotificationsRead(actor, dto.ids);
  }

  @Patch('notifications/preferences')
  @ApiOperation({ summary: 'Bildirishnoma sozlamalari' })
  async updatePreferences(
    @Body(zodBody(notificationPreferencesSchema))
    dto: {
      preferences: Record<string, string[]>;
      quietHours?: { from: string; to: string } | null;
    },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.messaging.updatePreferences(actor, dto.preferences, dto.quietHours);
  }

  /**
   * Real-time hodisalar oqimi (ADR-010).
   * Nginx bu yo'l uchun buferlashni o'chiradi (`infra/nginx/conf.d/lms.conf`).
   */
  @Sse('stream')
  @SkipEnvelope()
  @ApiOperation({ summary: 'Real-time hodisalar oqimi (SSE)' })
  stream(@CurrentUser() actor: RequestUser): Observable<{ data: DomainEvent }> {
    return this.events.streamFor(actor.id, [
      ...actor.scope.enrolledCourseIds,
      ...actor.scope.courseIds,
    ]);
  }
}
