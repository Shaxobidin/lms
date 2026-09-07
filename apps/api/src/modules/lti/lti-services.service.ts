/**
 * Maqsad: LTI Advantage xizmatlari — tool → platforma yo'nalishi (§10).
 *
 *  - AGS (Assignment and Grade Services): baholarni platformaga qaytarish.
 *    Launch'da kelgan `lineitem` manziliga `scores` POST qilinadi; manzil
 *    bo'lmasa `lineitems` da yangi line item yaratiladi.
 *  - NRPS (Names and Role Provisioning): platformadagi kurs a'zolarini olish
 *    va (ixtiyoriy) bizga yozib qo'yish.
 *  - Deep Linking javobi: o'qituvchi tanlagan kursni platformaga imzolangan
 *    JWT (content item) sifatida qaytarish.
 *
 * Platformaga kirish tokeni — OAuth2 `client_credentials` + tool kaliti bilan
 * imzolangan JWT assertion (IMS Security Framework). Token Redis'da keshlanadi.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { LTI_INSTRUCTOR_ROLE_FRAGMENTS, normalizeForSearch } from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CryptoService } from '../../common/security/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { LtiService, type DeepLinkState } from './lti.service';

export const AGS_SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
export const AGS_LINEITEM_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/lineitem';
export const NRPS_SCOPE =
  'https://purl.imsglobal.org/spec/lti-nrps/scope/contextmembership.readonly';

/** Baho yuboriladigan faoliyat — test yoki topshiriq (ikkalasi bo'sh = faqat jamlanma). */
export interface ActivityRef {
  quizId?: string;
  assignmentId?: string;
}

interface PlatformAuth {
  id: string;
  name: string;
  issuer: string;
  clientId: string;
  deploymentId: string;
  authTokenUrl: string;
}

export interface NrpsMember {
  subject: string;
  name: string;
  email: string | null;
  roles: string[];
  isInstructor: boolean;
  /** Bizdagi foydalanuvchi (bog'langan bo'lsa). */
  userId: string | null;
  enrolled: boolean;
}

const platformAuthSelect = {
  id: true,
  name: true,
  issuer: true,
  clientId: true,
  deploymentId: true,
  authTokenUrl: true,
} as const;

@Injectable()
export class LtiServicesService {
  private readonly logger = new Logger(LtiServicesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly lti: LtiService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  // --- Kursga bog'langan resurs havolalari ------------------------------------------

  async linksForCourse(courseId: string) {
    return this.prisma.db.ltiResourceLink.findMany({
      where: { courseId, platform: { deletedAt: null, isActive: true } },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        resourceLinkId: true,
        title: true,
        contextTitle: true,
        lineItemUrl: true,
        lineItemsUrl: true,
        membershipsUrl: true,
        scopes: true,
        updatedAt: true,
        platform: { select: { id: true, name: true } },
        lineItems: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, label: true, quizId: true, assignmentId: true, scoreMaximum: true },
        },
      },
    });
  }

  // --- OAuth2 client_credentials ------------------------------------------------------

  /** Platformadan kirish tokeni (keshlangan). Muvaffaqiyatsiz bo'lsa 422 — sabab bilan. */
  private async accessToken(platform: PlatformAuth, scopes: string[]): Promise<string> {
    const cacheKey = `lti:token:${platform.id}:${scopes.slice().sort().join(' ')}`;
    const cached = await this.cache.get<string>(cacheKey);
    if (cached) return cached;

    const now = Math.floor(Date.now() / 1000);
    const assertion = this.lti.signWithToolKey({
      iss: platform.clientId,
      sub: platform.clientId,
      aud: platform.authTokenUrl,
      iat: now,
      exp: now + 300,
      jti: randomBytes(16).toString('hex'),
    });
    const form = new URLSearchParams({
      grant_type: 'client_credentials',
      client_assertion_type: 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
      client_assertion: assertion,
      scope: scopes.join(' '),
    });

    let response: Response;
    try {
      response = await fetch(platform.authTokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(8000),
      });
    } catch (error) {
      throw AppException.businessRule('errors.lti_platform_unreachable', {
        detail: (error as Error).message,
      });
    }
    const body = (await response.json().catch(() => null)) as {
      access_token?: string;
      expires_in?: number;
      error?: string;
    } | null;
    if (!response.ok || !body?.access_token) {
      throw AppException.businessRule('errors.lti_token_request_failed', {
        status: response.status,
        detail: body?.error ?? '',
      });
    }
    const ttl = Math.max(30, Math.min(3600, (body.expires_in ?? 3600) - 60));
    await this.cache.set(cacheKey, body.access_token, ttl);
    return body.access_token;
  }

  // --- AGS -----------------------------------------------------------------------------

  /** Kurs bo'yicha foydalanuvchining joriy jamlanma foizi (0..100). */
  private async courseTotal(
    courseId: string,
    userId: string,
  ): Promise<{ score: number; max: number } | null> {
    const grades = await this.prisma.db.grade.findMany({
      where: { courseId, userId },
      select: { score: true, maxScore: true },
    });
    if (grades.length === 0) return null;
    const score = grades.reduce((sum, grade) => sum + Number(grade.score), 0);
    const max = grades.reduce((sum, grade) => sum + Number(grade.maxScore), 0);
    return { score, max };
  }

  /**
   * Bitta foydalanuvchining kurs bahosini bog'langan barcha platformalarga yuboradi.
   * Navbat ishchisi (baho o'zgarganda) va qo'lda "yuborish" tugmasi shu metodni chaqiradi.
   */
  async pushUserGrade(
    courseId: string,
    userId: string,
    activities: ActivityRef[] = [],
  ): Promise<{ pushed: number; skipped: string[] }> {
    const links = await this.prisma.db.ltiResourceLink.findMany({
      where: {
        courseId,
        platform: { deletedAt: null, isActive: true },
        OR: [{ lineItemUrl: { not: null } }, { lineItemsUrl: { not: null } }],
      },
      select: {
        id: true,
        resourceLinkId: true,
        title: true,
        lineItemUrl: true,
        lineItemsUrl: true,
        scopes: true,
        platform: { select: platformAuthSelect },
      },
    });
    if (links.length === 0) return { pushed: 0, skipped: ['no_resource_link'] };

    const total = await this.courseTotal(courseId, userId);
    if (!total) return { pushed: 0, skipped: ['no_grades'] };

    const userLinks = await this.prisma.db.ltiUserLink.findMany({
      where: { userId, platformId: { in: links.map((link) => link.platform.id) } },
      select: { platformId: true, subject: true },
    });

    let pushed = 0;
    const skipped: string[] = [];
    for (const link of links) {
      const userLink = userLinks.find((item) => item.platformId === link.platform.id);
      if (!userLink) {
        skipped.push(`user_not_linked:${link.platform.name}`);
        continue;
      }
      if (!link.scopes.includes(AGS_SCORE_SCOPE)) {
        skipped.push(`no_score_scope:${link.platform.name}`);
        continue;
      }
      const lineItemUrl = link.lineItemUrl ?? (await this.ensureLineItem(link));
      if (!lineItemUrl) {
        skipped.push(`no_lineitem:${link.platform.name}`);
        continue;
      }
      const token = await this.accessToken(link.platform, [AGS_SCORE_SCOPE]);

      // 1) Kurs jamlanmasi — resurs havolasining o'z line item'iga (foiz)
      const percent = total.max > 0 ? Math.round((total.score / total.max) * 10000) / 100 : 0;
      const totalResult = await this.postScore(lineItemUrl, token, {
        userId: userLink.subject,
        scoreGiven: percent,
        scoreMaximum: 100,
      });
      if (totalResult !== 'ok') {
        skipped.push(`platform_rejected:${totalResult}`);
        continue;
      }
      pushed += 1;

      // 2) Faoliyat bahosi — test/topshiriq uchun alohida line item (Moodle'da alohida ustun)
      for (const activity of activities) {
        if (!activity.quizId && !activity.assignmentId) continue;
        const result = await this.pushActivityGrade(
          link,
          userLink.subject,
          userId,
          token,
          activity,
        );
        if (result === 'ok') pushed += 1;
        else skipped.push(result);
      }
    }
    return { pushed, skipped };
  }

  /** AGS `scores` POST — muvaffaqiyatda `'ok'`, aks holda HTTP holati. */
  private async postScore(
    lineItemUrl: string,
    token: string,
    score: { userId: string; scoreGiven: number; scoreMaximum: number },
  ): Promise<'ok' | string> {
    const scoresUrl = lineItemUrl.includes('?')
      ? lineItemUrl.replace('?', '/scores?')
      : `${lineItemUrl}/scores`;
    const response = await fetch(scoresUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v1.score+json',
      },
      body: JSON.stringify({
        ...score,
        activityProgress: 'Completed',
        gradingProgress: 'FullyGraded',
        timestamp: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(8000),
    }).catch((error: Error) => {
      throw AppException.businessRule('errors.lti_platform_unreachable', {
        detail: error.message,
      });
    });
    if (!response.ok) {
      this.logger.warn(
        { scoresUrl, status: response.status },
        'AGS: platforma bahoni qabul qilmadi',
      );
      return String(response.status);
    }
    return 'ok';
  }

  /**
   * Bitta test/topshiriq bahosini o'z line item'iga yuboradi. Line item yo'q
   * bo'lsa `lineitems` konteynerida yaratiladi (`resourceId` = `quiz:<id>` /
   * `assignment:<id>`) va `LtiLineItem` da saqlanadi — keyingi baholar shu
   * manzilga boradi.
   */
  private async pushActivityGrade(
    link: {
      id: string;
      resourceLinkId: string;
      lineItemsUrl: string | null;
      scopes: string[];
      platform: PlatformAuth;
    },
    subject: string,
    userId: string,
    token: string,
    activity: ActivityRef,
  ): Promise<'ok' | string> {
    const grade = await this.prisma.db.grade.findFirst({
      where: {
        userId,
        ...(activity.quizId
          ? { sourceQuizId: activity.quizId }
          : { sourceAssignmentId: activity.assignmentId }),
      },
      select: { score: true, maxScore: true },
    });
    if (!grade) return 'no_activity_grade';

    const lineItem = await this.ensureActivityLineItem(link, activity, Number(grade.maxScore));
    if (!lineItem) return `no_activity_lineitem:${link.platform.name}`;

    const result = await this.postScore(lineItem.lineItemUrl, token, {
      userId: subject,
      scoreGiven: Number(grade.score),
      scoreMaximum: Number(lineItem.scoreMaximum),
    });
    return result === 'ok' ? 'ok' : `activity_rejected:${result}`;
  }

  private async ensureActivityLineItem(
    link: {
      id: string;
      resourceLinkId: string;
      lineItemsUrl: string | null;
      scopes: string[];
      platform: PlatformAuth;
    },
    activity: ActivityRef,
    scoreMaximum: number,
  ): Promise<{ lineItemUrl: string; scoreMaximum: number } | null> {
    const where = activity.quizId
      ? { resourceLinkId_quizId: { resourceLinkId: link.id, quizId: activity.quizId } }
      : {
          resourceLinkId_assignmentId: {
            resourceLinkId: link.id,
            assignmentId: activity.assignmentId ?? '',
          },
        };
    const existing = await this.prisma.db.ltiLineItem.findUnique({
      where,
      select: { lineItemUrl: true, scoreMaximum: true },
    });
    if (existing) {
      return { lineItemUrl: existing.lineItemUrl, scoreMaximum: Number(existing.scoreMaximum) };
    }
    if (!link.lineItemsUrl || !link.scopes.includes(AGS_LINEITEM_SCOPE)) return null;

    const label = await this.activityLabel(activity);
    if (!label) return null;
    const resourceId = activity.quizId
      ? `quiz:${activity.quizId}`
      : `assignment:${activity.assignmentId}`;
    const token = await this.accessToken(link.platform, [AGS_LINEITEM_SCOPE]);
    const response = await fetch(link.lineItemsUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
      },
      body: JSON.stringify({
        scoreMaximum,
        label,
        resourceId,
        tag: activity.quizId ? 'quiz' : 'assignment',
        resourceLinkId: link.resourceLinkId,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { id?: string } | null;
    if (!response?.ok || !body?.id) return null;

    const created = await this.prisma.db.ltiLineItem.create({
      data: {
        resourceLinkId: link.id,
        quizId: activity.quizId ?? null,
        assignmentId: activity.assignmentId ?? null,
        lineItemUrl: body.id,
        label,
        scoreMaximum,
      },
      select: { lineItemUrl: true, scoreMaximum: true },
    });
    return { lineItemUrl: created.lineItemUrl, scoreMaximum: Number(created.scoreMaximum) };
  }

  /** Line item yorlig'i — test/topshiriq nomi (asosiy til, zaxira: boshqa til). */
  private async activityLabel(activity: ActivityRef): Promise<string | null> {
    const row = activity.quizId
      ? await this.prisma.db.quiz.findUnique({
          where: { id: activity.quizId },
          select: { title: true },
        })
      : await this.prisma.db.assignment.findUnique({
          where: { id: activity.assignmentId ?? '' },
          select: { title: true },
        });
    const title = (row?.title ?? {}) as Record<string, string>;
    const label = title['uz-Latn'] ?? Object.values(title).find(Boolean);
    return label ? label.slice(0, 255) : null;
  }

  /** `lineitem` yo'q, ammo `lineitems` bor — kurs uchun line item yaratiladi va saqlanadi. */
  private async ensureLineItem(link: {
    id: string;
    resourceLinkId: string;
    title: string | null;
    lineItemsUrl: string | null;
    scopes: string[];
    platform: PlatformAuth;
  }): Promise<string | null> {
    if (!link.lineItemsUrl || !link.scopes.includes(AGS_LINEITEM_SCOPE)) return null;
    const token = await this.accessToken(link.platform, [AGS_LINEITEM_SCOPE]);
    const response = await fetch(link.lineItemsUrl, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/vnd.ims.lis.v2.lineitem+json',
      },
      body: JSON.stringify({
        scoreMaximum: 100,
        label: link.title ?? 'QDU LMS',
        resourceLinkId: link.resourceLinkId,
      }),
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    const body = (await response?.json().catch(() => null)) as { id?: string } | null;
    if (!response?.ok || !body?.id) return null;
    await this.prisma.db.ltiResourceLink.update({
      where: { id: link.id },
      data: { lineItemUrl: body.id },
    });
    return body.id;
  }

  /** Kursdagi barcha bog'langan foydalanuvchilar bahosini yuboradi (qo'lda tugma). */
  async pushCourseGrades(courseId: string, actor: RequestUser) {
    const links = await this.prisma.db.ltiResourceLink.findMany({
      where: { courseId, platform: { deletedAt: null, isActive: true } },
      select: { platformId: true },
    });
    if (links.length === 0) throw AppException.businessRule('errors.lti_no_resource_link');

    const users = await this.prisma.db.ltiUserLink.findMany({
      where: {
        platformId: { in: links.map((link) => link.platformId) },
        user: { enrollments: { some: { courseId } } },
      },
      select: { userId: true },
      distinct: ['userId'],
    });

    let pushed = 0;
    const skipped: string[] = [];
    for (const user of users) {
      // Avval jamlanma, so'ng har bir test/topshiriq o'z line item'iga
      const activities = await this.prisma.db.grade.findMany({
        where: {
          courseId,
          userId: user.userId,
          OR: [{ sourceQuizId: { not: null } }, { sourceAssignmentId: { not: null } }],
        },
        select: { sourceQuizId: true, sourceAssignmentId: true },
      });
      const result = await this.pushUserGrade(
        courseId,
        user.userId,
        activities.map((grade) => ({
          quizId: grade.sourceQuizId ?? undefined,
          assignmentId: grade.sourceAssignmentId ?? undefined,
        })),
      );
      pushed += result.pushed;
      skipped.push(...result.skipped);
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'lti.ags.push',
      resource: 'course',
      resourceId: courseId,
      after: { users: users.length, pushed, skipped: skipped.length },
    });
    return { users: users.length, pushed, skipped };
  }

  // --- NRPS ----------------------------------------------------------------------------

  async listMembers(courseId: string): Promise<{ platform: string; members: NrpsMember[] }> {
    const link = await this.prisma.db.ltiResourceLink.findFirst({
      where: {
        courseId,
        membershipsUrl: { not: null },
        platform: { deletedAt: null, isActive: true },
      },
      orderBy: { updatedAt: 'desc' },
      select: { membershipsUrl: true, scopes: true, platform: { select: platformAuthSelect } },
    });
    if (!link?.membershipsUrl) throw AppException.businessRule('errors.lti_no_resource_link');

    const token = await this.accessToken(link.platform, [NRPS_SCOPE]);
    const response = await fetch(link.membershipsUrl, {
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.ims.lti-nrps.v2.membershipcontainer+json',
      },
      signal: AbortSignal.timeout(8000),
    }).catch((error: Error) => {
      throw AppException.businessRule('errors.lti_platform_unreachable', { detail: error.message });
    });
    const body = (await response.json().catch(() => null)) as {
      members?: Array<Record<string, unknown>>;
    } | null;
    if (!response.ok || !Array.isArray(body?.members)) {
      throw AppException.businessRule('errors.lti_token_request_failed', {
        status: response.status,
        detail: 'memberships',
      });
    }

    const subjects = body.members.map((member) => String(member.user_id ?? '')).filter(Boolean);
    const userLinks = await this.prisma.db.ltiUserLink.findMany({
      where: { platformId: link.platform.id, subject: { in: subjects } },
      select: { subject: true, userId: true },
    });
    const enrolled = await this.prisma.db.enrollment.findMany({
      where: { courseId, userId: { in: userLinks.map((item) => item.userId) } },
      select: { userId: true },
    });
    const enrolledIds = new Set(enrolled.map((item) => item.userId));

    const members: NrpsMember[] = body.members.map((member) => {
      const subject = String(member.user_id ?? '');
      const roles = Array.isArray(member.roles)
        ? (member.roles as unknown[]).filter((role): role is string => typeof role === 'string')
        : [];
      const userId = userLinks.find((item) => item.subject === subject)?.userId ?? null;
      const name =
        (typeof member.name === 'string' && member.name) ||
        [member.given_name, member.family_name]
          .filter((part) => typeof part === 'string')
          .join(' ') ||
        subject;
      return {
        subject,
        name,
        email: typeof member.email === 'string' ? member.email.toLowerCase() : null,
        roles,
        isInstructor: roles.some((role) =>
          LTI_INSTRUCTOR_ROLE_FRAGMENTS.some((fragment) => role.includes(fragment)),
        ),
        userId,
        enrolled: userId ? enrolledIds.has(userId) : false,
      };
    });
    return { platform: link.platform.name, members };
  }

  /**
   * NRPS ro'yxatidagi talabalarni bizga yozadi: bog'lanmaganlar uchun hisob
   * ochiladi (email bo'yicha mavjud hisobga bog'lanadi), keyin kursga yoziladi.
   * O'qituvchilar YOZILMAYDI — kursga huquq berish egasining qarori.
   */
  async syncMembers(courseId: string, actor: RequestUser) {
    const link = await this.prisma.db.ltiResourceLink.findFirst({
      where: {
        courseId,
        membershipsUrl: { not: null },
        platform: { deletedAt: null, isActive: true },
      },
      orderBy: { updatedAt: 'desc' },
      select: { platform: { select: { id: true } } },
    });
    if (!link) throw AppException.businessRule('errors.lti_no_resource_link');
    const { members } = await this.listMembers(courseId);

    let created = 0;
    let enrolled = 0;
    for (const member of members) {
      if (member.isInstructor) continue;
      let userId = member.userId;
      if (!userId) {
        userId = await this.provisionStudent(link.platform.id, member);
        created += 1;
      }
      const existing = await this.prisma.db.enrollment.findFirst({
        where: { courseId, userId },
        select: { id: true },
      });
      if (!existing) {
        await this.prisma.db.enrollment.create({ data: { courseId, userId, status: 'ACTIVE' } });
        await this.cache.delByPattern(`auth:ctx:${userId}:*`);
        enrolled += 1;
      }
    }

    await this.audit.record({
      actorId: actor.id,
      action: 'lti.nrps.sync',
      resource: 'course',
      resourceId: courseId,
      after: { members: members.length, created, enrolled },
    });
    return { members: members.length, created, enrolled };
  }

  private async provisionStudent(platformId: string, member: NrpsMember): Promise<string> {
    if (member.email) {
      const existing = await this.prisma.db.user.findUnique({
        where: { email: member.email },
        select: { id: true },
      });
      if (existing) {
        await this.prisma.db.ltiUserLink.create({
          data: { platformId, subject: member.subject, userId: existing.id },
        });
        return existing.id;
      }
    }
    const role = await this.prisma.db.role.findUnique({
      where: { code: 'STUDENT' },
      select: { id: true },
    });
    if (!role) throw AppException.notFound('role', 'STUDENT');
    const [firstName, ...rest] = member.name.trim().split(/\s+/);
    const email =
      member.email ??
      `lti-${platformId.slice(0, 8)}-${member.subject.replace(/[^a-z0-9]/gi, '').slice(0, 24)}@lti.invalid`;
    const passwordHash = await this.crypto.hashPassword(this.crypto.generateToken(24));
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: 'ACTIVE',
          locale: 'uz-Latn',
          externalProvider: 'lti',
          searchText: normalizeForSearch(`${member.name} ${email}`),
          profile: {
            create: {
              firstName: (firstName || 'LTI').slice(0, 64),
              lastName: (rest.join(' ') || member.subject.slice(0, 12)).slice(0, 64),
            },
          },
          roles: { create: { roleId: role.id } },
        },
        select: { id: true },
      });
      await tx.passwordHistory.create({ data: { userId: createdUser.id, passwordHash } });
      await tx.ltiUserLink.create({
        data: { platformId, subject: member.subject, userId: createdUser.id },
      });
      return createdUser;
    });
    return user.id;
  }

  // --- Deep Linking --------------------------------------------------------------------

  /**
   * O'qituvchi tanlagan kursni platformaga qaytaradi: imzolangan
   * `LtiDeepLinkingResponse` JWT va platforma qaytish manzili. Mijoz ularni
   * `form_post` bilan yuboradi.
   */
  async deepLinkRespond(token: string, courseId: string, actor: RequestUser) {
    const state = await this.cache.get<DeepLinkState>(`lti:dl:${token}`);
    if (!state) throw AppException.businessRule('errors.lti_state_invalid');
    if (state.userId !== actor.id) throw AppException.forbidden('integration:read:all');

    const course = await this.prisma.db.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) throw AppException.notFound('course', courseId);
    const canPick =
      actor.scope.courseIds.includes(courseId) ||
      actor.permissions.some(
        (key) => key === 'course:update:own_department' || key === 'course:manage:all',
      );
    if (!canPick) throw AppException.forbidden('course:update:own_course');

    const platform = await this.prisma.db.ltiPlatform.findUnique({
      where: { id: state.platformId },
      select: platformAuthSelect,
    });
    if (!platform) throw AppException.businessRule('errors.lti_platform_unknown');

    const title =
      Object.values((course.title ?? {}) as Record<string, string>).find(Boolean) ?? 'Kurs';
    const now = Math.floor(Date.now() / 1000);
    const jwt = this.lti.signWithToolKey({
      iss: platform.clientId,
      aud: platform.issuer,
      iat: now,
      exp: now + 300,
      nonce: randomBytes(16).toString('hex'),
      'https://purl.imsglobal.org/spec/lti/claim/message_type': 'LtiDeepLinkingResponse',
      'https://purl.imsglobal.org/spec/lti/claim/version': '1.3.0',
      'https://purl.imsglobal.org/spec/lti/claim/deployment_id': platform.deploymentId,
      'https://purl.imsglobal.org/spec/lti-dl/claim/content_items': [
        {
          type: 'ltiResourceLink',
          title,
          url: this.lti.toolEndpoints().launchUrl,
          custom: { course_id: course.id },
        },
      ],
      ...(state.data ? { 'https://purl.imsglobal.org/spec/lti-dl/claim/data': state.data } : {}),
    });
    await this.cache.del(`lti:dl:${token}`);

    await this.audit.record({
      actorId: actor.id,
      action: 'lti.deep_link',
      resource: 'course',
      resourceId: course.id,
      after: { platformId: platform.id },
    });

    return { returnUrl: state.returnUrl, jwt, title };
  }

  /** Deep-link sahifasi uchun: token amal qiladimi, platforma nomi. */
  async deepLinkContext(token: string, actor: RequestUser) {
    const state = await this.cache.get<DeepLinkState>(`lti:dl:${token}`);
    if (!state || state.userId !== actor.id)
      throw AppException.businessRule('errors.lti_state_invalid');
    const platform = await this.prisma.db.ltiPlatform.findUnique({
      where: { id: state.platformId },
      select: { name: true },
    });
    return { platform: platform?.name ?? '', returnUrl: state.returnUrl };
  }
}
