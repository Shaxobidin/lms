/**
 * Maqsad: F-10 (kommunikatsiya), F-11 (virtual sinf) va F-15 (gamifikatsiya) kontraktlari.
 */

import { z } from 'zod';
import { richTextSchema, uuidSchema } from './common';
import { localizedRichTextSchema, localizedTextSchema } from '../types/localized';
import { ROLE_CODES } from '../rbac/permissions';

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'TELEGRAM', 'PUSH'] as const;
export const notificationChannelSchema = z.enum(NOTIFICATION_CHANNELS);

export const createAnnouncementSchema = z
  .object({
    courseId: uuidSchema.nullable().optional(),
    title: localizedTextSchema,
    body: localizedRichTextSchema,
    audience: z.enum(['ALL', 'COURSE', 'GROUP', 'ROLE', 'FACULTY']),
    /** `audience` ga mos identifikatorlar. */
    audienceIds: z.array(uuidSchema).max(200).default([]),
    audienceRoles: z.array(z.enum(ROLE_CODES)).max(10).default([]),
    channels: z.array(notificationChannelSchema).min(1).default(['IN_APP']),
    publishAt: z.coerce.date().nullable().optional(),
    isPinned: z.boolean().default(false),
  })
  .refine(
    (value) =>
      value.audience === 'ALL' || value.audienceIds.length > 0 || value.audienceRoles.length > 0,
    { message: 'validation.audience_required', path: ['audienceIds'] },
  );

export const createForumThreadSchema = z.object({
  courseId: uuidSchema,
  title: z.string().trim().min(3).max(300),
  body: richTextSchema,
  /** Savol-javob rejimi: eng yaxshi javob belgilanadi. */
  isQuestion: z.boolean().default(false),
});

export const createForumPostSchema = z.object({
  threadId: uuidSchema,
  parentId: uuidSchema.nullable().optional(),
  contentHtml: richTextSchema,
});

export const moderateThreadSchema = z.object({
  isPinned: z.boolean().optional(),
  isLocked: z.boolean().optional(),
});

export const createMessageSchema = z.object({
  recipientId: uuidSchema,
  subject: z.string().trim().max(200).optional(),
  body: richTextSchema,
  /** Javob bo'lsa — asl xabar. */
  replyToId: uuidSchema.nullable().optional(),
});

export const notificationPreferencesSchema = z.object({
  /** Har bir hodisa turi uchun yoqilgan kanallar. */
  preferences: z.record(z.string().max(64), z.array(notificationChannelSchema).max(5)),
  /** Sokin soatlar — bu oraliqda faqat IN_APP yuboriladi. */
  quietHours: z
    .object({
      from: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
      to: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    })
    .nullable()
    .optional(),
});

export const telegramLinkSchema = z.object({
  /** Botdan olingan bir martalik bog'lash kodi. */
  linkCode: z.string().trim().min(6).max(64),
});

// --- F-11 Virtual sinf ------------------------------------------------------

export const createMeetingSchema = z.object({
  courseId: uuidSchema,
  classSessionId: uuidSchema.nullable().optional(),
  title: z.string().trim().min(3).max(200),
  startsAt: z.coerce.date(),
  durationMinutes: z.coerce.number().int().min(5).max(600),
  /** Yozib olish yoqilsinmi (F-11). */
  recordingEnabled: z.boolean().default(false),
  /** Ishtirokchilar avtomatik davomatga yozilsinmi. */
  autoAttendance: z.boolean().default(true),
  /** Kirish uchun parol talab qilinsinmi. */
  requirePassword: z.boolean().default(false),
});

export const joinMeetingSchema = z.object({
  meetingId: uuidSchema,
});

// --- F-15 Gamifikatsiya -----------------------------------------------------

export const BADGE_RULE_TYPES = [
  'COURSE_COMPLETED',
  'PERFECT_QUIZ',
  'STREAK_DAYS',
  'ASSIGNMENTS_ON_TIME',
  'FORUM_HELPER',
  'FIRST_SUBMISSION',
  'ATTENDANCE_RATE',
] as const;

export const createBadgeSchema = z.object({
  code: z.string().trim().min(2).max(48),
  name: localizedTextSchema,
  description: localizedTextSchema,
  /** Lucide ikonka nomi yoki yuklangan fayl. */
  icon: z.string().trim().max(64),
  rule: z.object({
    type: z.enum(BADGE_RULE_TYPES),
    threshold: z.coerce.number().min(1).max(10_000),
    courseId: uuidSchema.nullable().optional(),
  }),
  xpReward: z.coerce.number().int().min(0).max(10_000).default(50),
  isActive: z.boolean().default(true),
});

export const leaderboardQuerySchema = z.object({
  scope: z.enum(['COURSE', 'GROUP', 'FACULTY', 'GLOBAL']).default('COURSE'),
  scopeId: uuidSchema.optional(),
  period: z.enum(['WEEK', 'MONTH', 'SEMESTER', 'ALL_TIME']).default('SEMESTER'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;
export type CreateForumThreadInput = z.infer<typeof createForumThreadSchema>;
export type CreateForumPostInput = z.infer<typeof createForumPostSchema>;
export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
export type CreateBadgeInput = z.infer<typeof createBadgeSchema>;
export type NotificationChannelCode = (typeof NOTIFICATION_CHANNELS)[number];
export type BadgeRuleType = (typeof BADGE_RULE_TYPES)[number];
