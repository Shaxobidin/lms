/**
 * Maqsad: F-15 — gamifikatsiya: badge, XP, daraja va reyting.
 *
 * Modul feature flag orqali butunlay o'chirilishi mumkin (`FEATURE_GAMIFICATION`) —
 * ba'zi muassasalar buni ta'lim jarayoniga mos deb hisoblamaydi.
 */

import { Body, Controller, Get, Injectable, Logger, Module, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  createBadgeSchema,
  leaderboardQuerySchema,
  type BadgeRuleType,
  type CreateBadgeInput,
} from '@lms/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventsService, EVENT_TYPES } from '../../common/events/events.service';
import { AuditService } from '../../common/audit/audit.service';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

/** Daraja chegaralari: har bir daraja uchun kerakli umumiy XP. */
const LEVEL_THRESHOLDS = [0, 100, 300, 700, 1500, 3000, 6000, 12_000, 25_000, 50_000];

export function levelForXp(totalXp: number): number {
  let level = 1;
  for (let i = 0; i < LEVEL_THRESHOLDS.length; i += 1) {
    if (totalXp >= (LEVEL_THRESHOLDS[i] ?? 0)) level = i + 1;
  }
  return level;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EventsService,
    private readonly audit: AuditService,
  ) {}

  async createBadge(input: CreateBadgeInput, actor: RequestUser) {
    const badge = await this.prisma.db.badge.create({
      data: {
        code: input.code,
        name: input.name as never,
        description: input.description as never,
        icon: input.icon,
        rule: input.rule as never,
        xpReward: input.xpReward,
        isActive: input.isActive,
      },
      select: { id: true, code: true },
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'badge.create',
      resource: 'badge',
      resourceId: badge.id,
    });
    return badge;
  }

  async listBadges() {
    return this.prisma.db.badge.findMany({
      where: { isActive: true },
      select: {
        id: true,
        code: true,
        name: true,
        description: true,
        icon: true,
        xpReward: true,
        rule: true,
      },
    });
  }

  async myBadges(userId: string) {
    const [awards, xp] = await Promise.all([
      this.prisma.db.userBadge.findMany({
        where: { userId },
        orderBy: { awardedAt: 'desc' },
        select: {
          awardedAt: true,
          badge: {
            select: { code: true, name: true, description: true, icon: true, xpReward: true },
          },
          course: { select: { id: true, code: true, title: true } },
        },
      }),
      this.prisma.db.userXp.findUnique({ where: { userId } }),
    ]);

    const totalXp = xp?.totalXp ?? 0;
    const level = levelForXp(totalXp);
    const nextThreshold = LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[LEVEL_THRESHOLDS.length - 1];

    return {
      badges: awards,
      xp: {
        total: totalXp,
        weekly: xp?.weeklyXp ?? 0,
        level,
        nextLevelAt: nextThreshold,
        progressPercent:
          nextThreshold && nextThreshold > 0
            ? Math.min(100, Math.round((totalXp / nextThreshold) * 100))
            : 100,
      },
    };
  }

  /**
   * XP qo'shish va darajani yangilash.
   * Chaqiruvchilar: topshiriq baholanganda, test topshirilganda, dars tugatilganda.
   */
  async awardXp(
    userId: string,
    amount: number,
    reason: string,
  ): Promise<{ totalXp: number; level: number }> {
    const current = await this.prisma.db.userXp.findUnique({ where: { userId } });
    const totalXp = (current?.totalXp ?? 0) + amount;
    const previousLevel = current?.level ?? 1;
    const level = levelForXp(totalXp);

    await this.prisma.db.userXp.upsert({
      where: { userId },
      create: { userId, totalXp, level, weeklyXp: amount },
      update: { totalXp, level, weeklyXp: { increment: amount } },
    });

    if (level > previousLevel) {
      await this.events.publish({
        type: EVENT_TYPES.BADGE_AWARDED,
        userId,
        payload: { event: 'level_up', level, reason },
      });
    }

    return { totalXp, level };
  }

  /**
   * Badge qoidalarini tekshirish va berish (cron orqali chaqiriladi).
   *
   * Har bir qoida bitta agregat so'rov bilan tekshiriladi — foydalanuvchilar
   * bo'yicha sikl ichida so'rov yuborilmaydi.
   */
  async evaluateBadges(): Promise<{ awarded: number }> {
    const badges = await this.prisma.db.badge.findMany({
      where: { isActive: true },
      select: { id: true, code: true, rule: true, xpReward: true },
    });

    let awarded = 0;

    for (const badge of badges) {
      const rule = badge.rule as {
        type: BadgeRuleType;
        threshold: number;
        courseId?: string | null;
      };
      const eligibleUserIds = await this.findEligibleUsers(rule);
      if (eligibleUserIds.length === 0) continue;

      // Allaqachon berilganlarni chiqarib tashlaymiz
      const existing = await this.prisma.db.userBadge.findMany({
        where: { badgeId: badge.id, userId: { in: eligibleUserIds } },
        select: { userId: true },
      });
      const alreadyAwarded = new Set(existing.map((item) => item.userId));
      const toAward = eligibleUserIds.filter((userId) => !alreadyAwarded.has(userId));

      for (const userId of toAward) {
        await this.prisma.db.userBadge.create({
          data: { userId, badgeId: badge.id, courseId: rule.courseId ?? null },
        });
        await this.awardXp(userId, badge.xpReward, `badge:${badge.code}`);
        await this.events.publish({
          type: EVENT_TYPES.BADGE_AWARDED,
          userId,
          payload: { badgeCode: badge.code, xp: badge.xpReward },
        });
        awarded += 1;
      }
    }

    if (awarded > 0) {
      this.logger.log({ awarded }, 'Yangi badge lar berildi');
    }
    return { awarded };
  }

  /** Qoida turiga mos foydalanuvchilarni topadi. */
  private async findEligibleUsers(rule: {
    type: BadgeRuleType;
    threshold: number;
    courseId?: string | null;
  }): Promise<string[]> {
    switch (rule.type) {
      case 'COURSE_COMPLETED': {
        const rows = await this.prisma.db.enrollment.groupBy({
          by: ['userId'],
          where: {
            status: 'COMPLETED',
            ...(rule.courseId ? { courseId: rule.courseId } : {}),
          },
          _count: { _all: true },
          having: { userId: { _count: { gte: rule.threshold } } },
        });
        return rows.map((row) => row.userId);
      }

      case 'PERFECT_QUIZ': {
        const attempts = await this.prisma.db.quizAttempt.findMany({
          where: { status: 'GRADED' },
          select: { userId: true, score: true, maxScore: true },
          take: 20_000,
        });
        const counts = new Map<string, number>();
        for (const attempt of attempts) {
          if (Number(attempt.maxScore) > 0 && Number(attempt.score) >= Number(attempt.maxScore)) {
            counts.set(attempt.userId, (counts.get(attempt.userId) ?? 0) + 1);
          }
        }
        return Array.from(counts.entries())
          .filter(([, count]) => count >= rule.threshold)
          .map(([userId]) => userId);
      }

      case 'ASSIGNMENTS_ON_TIME': {
        const rows = await this.prisma.db.submission.groupBy({
          by: ['userId'],
          where: { status: { in: ['SUBMITTED', 'GRADED'] } },
          _count: { _all: true },
          having: { userId: { _count: { gte: rule.threshold } } },
        });
        return rows.map((row) => row.userId);
      }

      case 'FIRST_SUBMISSION': {
        const rows = await this.prisma.db.submission.groupBy({
          by: ['userId'],
          where: { status: { in: ['SUBMITTED', 'LATE', 'GRADED'] } },
          _count: { _all: true },
          having: { userId: { _count: { gte: 1 } } },
        });
        return rows.map((row) => row.userId);
      }

      case 'FORUM_HELPER': {
        const rows = await this.prisma.db.forumPost.groupBy({
          by: ['authorId'],
          where: { isAnswer: true },
          _count: { _all: true },
          having: { authorId: { _count: { gte: rule.threshold } } },
        });
        return rows.map((row) => row.authorId);
      }

      case 'ATTENDANCE_RATE': {
        const grouped = await this.prisma.attendance.groupBy({
          by: ['userId', 'status'],
          _count: { _all: true },
        });
        const byUser = new Map<string, { attended: number; total: number }>();
        for (const row of grouped) {
          const entry = byUser.get(row.userId) ?? { attended: 0, total: 0 };
          entry.total += row._count._all;
          if (row.status !== 'ABSENT') entry.attended += row._count._all;
          byUser.set(row.userId, entry);
        }
        return Array.from(byUser.entries())
          .filter(
            ([, value]) =>
              value.total > 0 && (value.attended / value.total) * 100 >= rule.threshold,
          )
          .map(([userId]) => userId);
      }

      case 'STREAK_DAYS': {
        // Ketma-ket faol kunlar: `lastAccessAt` bo'yicha taxminiy baholash
        const rows = await this.prisma.db.enrollment.findMany({
          where: { lastAccessAt: { gte: new Date(Date.now() - rule.threshold * 86_400_000) } },
          select: { userId: true },
          distinct: ['userId'],
        });
        return rows.map((row) => row.userId);
      }

      default:
        return [];
    }
  }

  /** Reyting jadvali (F-15). */
  async leaderboard(query: {
    scope: 'COURSE' | 'GROUP' | 'FACULTY' | 'GLOBAL';
    scopeId?: string;
    period: 'WEEK' | 'MONTH' | 'SEMESTER' | 'ALL_TIME';
    limit: number;
  }) {
    const userFilter: Record<string, unknown> = {};

    if (query.scope === 'COURSE' && query.scopeId) {
      userFilter.enrollments = { some: { courseId: query.scopeId } };
    } else if (query.scope === 'GROUP' && query.scopeId) {
      userFilter.studentGroups = { some: { groupId: query.scopeId, leftAt: null } };
    } else if (query.scope === 'FACULTY' && query.scopeId) {
      userFilter.studentGroups = {
        some: {
          leftAt: null,
          group: { speciality: { department: { facultyId: query.scopeId } } },
        },
      };
    }

    const users = await this.prisma.db.user.findMany({
      where: { status: 'ACTIVE', ...userFilter },
      select: { id: true },
      take: 5000,
    });

    const xpRows = await this.prisma.db.userXp.findMany({
      where: { userId: { in: users.map((user) => user.id) } },
      orderBy: query.period === 'WEEK' ? { weeklyXp: 'desc' } : { totalXp: 'desc' },
      take: query.limit,
      select: {
        userId: true,
        totalXp: true,
        weeklyXp: true,
        level: true,
        user: {
          select: {
            profile: { select: { firstName: true, lastName: true, avatarFileId: true } },
          },
        },
      },
    });

    return xpRows.map((row, index) => ({
      rank: index + 1,
      userId: row.userId,
      fullName: [row.user.profile?.lastName, row.user.profile?.firstName].filter(Boolean).join(' '),
      avatarFileId: row.user.profile?.avatarFileId ?? null,
      xp: query.period === 'WEEK' ? row.weeklyXp : row.totalXp,
      level: row.level,
    }));
  }

  /** Haftalik XP ni nolga tushirish (dushanba kuni, cron). */
  async resetWeeklyXp(): Promise<number> {
    const result = await this.prisma.db.userXp.updateMany({
      data: { weeklyXp: 0, weekStartsAt: new Date() },
    });
    return result.count;
  }
}

@ApiTags('gamification')
@Controller('gamification')
export class GamificationController {
  constructor(private readonly gamification: GamificationService) {}

  @Get('badges')
  @ApiOperation({ summary: "Mavjud badge lar ro'yxati" })
  async listBadges() {
    return this.gamification.listBadges();
  }

  @Get('me')
  @RequirePermission('badge:read:own')
  @ApiOperation({ summary: 'Mening badge larim, XP va darajam' })
  async me(@CurrentUser() actor: RequestUser) {
    return this.gamification.myBadges(actor.id);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: 'Reyting jadvali' })
  async leaderboard(
    @Query(zodQuery(leaderboardQuerySchema))
    query: {
      scope: 'COURSE' | 'GROUP' | 'FACULTY' | 'GLOBAL';
      scopeId?: string;
      period: 'WEEK' | 'MONTH' | 'SEMESTER' | 'ALL_TIME';
      limit: number;
    },
  ) {
    return this.gamification.leaderboard(query);
  }

  @Post('badges')
  @RequirePermission('badge:manage:all')
  @ApiOperation({ summary: 'Badge yaratish' })
  async createBadge(
    @Body(zodBody(createBadgeSchema)) dto: CreateBadgeInput,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.gamification.createBadge(dto, actor);
  }
}

@Module({
  controllers: [GamificationController],
  providers: [GamificationService],
  exports: [GamificationService],
})
export class GamificationModule {}
