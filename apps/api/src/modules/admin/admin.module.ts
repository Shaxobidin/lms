/**
 * Maqsad: F-17 — administratsiya: audit log, sozlamalar, feature flags,
 * tizim salomatligi va zaxira nusxa qo'llanmasi.
 */

import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Param,
  Patch,
  Put,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  SITE_ADMIN_TREE,
  SITE_SETTING_DEFAULTS,
  SITE_SETTING_FIELDS,
  cursorPaginationSchema,
  decodeCursor,
  encodeCursor,
  findSiteSection,
  siteSectionSchema,
  uuidSchema,
} from '@lms/shared';
import { AppException } from '../../common/errors/app.exception';
import { SiteSettingsService } from '../../common/settings/site-settings.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { AuditService } from '../../common/audit/audit.service';
import { zodBody, zodQuery } from '../../common/pipes/zod-validation.pipe';
import { CurrentUser, Public, RequirePermission } from '../../common/auth/decorators';
import type { RequestUser } from '../../common/auth/auth.types';

const FEATURE_FLAG_TTL = 30;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly audit: AuditService,
    private readonly siteSettings: SiteSettingsService,
  ) {}

  // --- Sayt boshqaruvi (Moodle "Site administration" daraxti) ---------------

  /** Daraxt + joriy qiymatlar (bazada bo'lmasa reestr standarti). */
  async siteTree() {
    const rows = await this.prisma.setting.findMany({
      where: { key: { in: SITE_SETTING_FIELDS.map((field) => field.key) } },
      select: { key: true, value: true, updatedAt: true },
    });
    const stored = new Map(rows.map((row) => [row.key, row]));
    const values: Record<string, unknown> = {};
    const updatedAt: Record<string, string> = {};
    for (const field of SITE_SETTING_FIELDS) {
      const row = stored.get(field.key);
      values[field.key] = row ? row.value : SITE_SETTING_DEFAULTS[field.key];
      if (row) updatedAt[field.key] = row.updatedAt.toISOString();
    }
    return { tree: SITE_ADMIN_TREE, values, updatedAt };
  }

  /** Bitta bo'lim: maydonlar va qiymatlar. */
  async siteSection(sectionId: string) {
    const section = findSiteSection(sectionId);
    if (!section) throw AppException.notFound('site_section', sectionId);
    const { values } = await this.siteTree();
    const own: Record<string, unknown> = {};
    for (const field of section.fields) own[field.key] = values[field.key];
    return { section, values: own };
  }

  /**
   * Bo'limni yangilash: faqat reestrdagi kalitlar, reestr sxemasi bilan
   * tekshiriladi; `isPublic` va tavsif reestrdan olinadi (qo'lda kiritilmaydi).
   */
  async updateSiteSection(sectionId: string, input: Record<string, unknown>, actor: RequestUser) {
    const section = findSiteSection(sectionId);
    if (!section) throw AppException.notFound('site_section', sectionId);
    const parsed = siteSectionSchema(section).safeParse(input);
    if (!parsed.success) {
      throw AppException.validation(
        parsed.error.issues.map((issue) => ({
          field: issue.path.join('.'),
          code: issue.message.startsWith('validation.') ? issue.message : 'validation.invalid',
        })),
      );
    }
    const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
    if (entries.length === 0) return this.siteSection(sectionId);

    // Til sozlamalari: standart til yoqilgan tillar ichida bo'lishi shart
    if (sectionId === 'language-settings') {
      const current = await this.siteSection(sectionId);
      const merged = { ...current.values, ...parsed.data } as Record<string, unknown>;
      const enabled = merged['i18n.enabledLocales'] as string[];
      if (Array.isArray(enabled) && !enabled.includes(String(merged['ui.defaultLocale']))) {
        throw AppException.businessRule('errors.default_locale_not_enabled');
      }
    }

    const before = await this.prisma.setting.findMany({
      where: { key: { in: entries.map(([key]) => key) } },
      select: { key: true, value: true },
    });
    const beforeMap = Object.fromEntries(before.map((row) => [row.key, row.value]));

    await this.prisma.$transaction(
      entries.map(([key, value]) => {
        const field = section.fields.find((item) => item.key === key)!;
        return this.prisma.setting.upsert({
          where: { key },
          create: {
            key,
            value: value as never,
            description: field.label['uz-Latn'] ?? key,
            isPublic: Boolean(field.isPublic),
          },
          update: { value: value as never, isPublic: Boolean(field.isPublic) },
        });
      }),
    );

    await this.cache.del('settings:public');
    await this.siteSettings.invalidate(entries.map(([key]) => key));
    await this.audit.record({
      actorId: actor.id,
      action: 'site.settings.update',
      resource: 'system',
      resourceId: sectionId,
      before: beforeMap,
      after: Object.fromEntries(entries),
    });
    return this.siteSection(sectionId);
  }

  /** Audit jurnali — cursor pagination bilan (jurnal juda katta bo'lishi mumkin). */
  async auditLog(
    filters: { actorId?: string; resource?: string; action?: string; from?: Date; to?: Date },
    pagination: { cursor?: string; limit: number },
  ) {
    const cursor = pagination.cursor ? decodeCursor<{ id: string }>(pagination.cursor) : null;

    const rows = await this.prisma.auditLog.findMany({
      where: {
        ...(filters.actorId ? { actorId: filters.actorId } : {}),
        ...(filters.resource ? { resource: filters.resource } : {}),
        ...(filters.action ? { action: { contains: filters.action } } : {}),
        ...(filters.from || filters.to
          ? {
              createdAt: {
                ...(filters.from ? { gte: filters.from } : {}),
                ...(filters.to ? { lte: filters.to } : {}),
              },
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: pagination.limit + 1,
      ...(cursor ? { cursor: { id: cursor.id }, skip: 1 } : {}),
      select: {
        id: true,
        action: true,
        resource: true,
        resourceId: true,
        before: true,
        after: true,
        ip: true,
        traceId: true,
        createdAt: true,
        actor: {
          select: {
            id: true,
            email: true,
            profile: { select: { firstName: true, lastName: true } },
          },
        },
      },
    });

    const hasMore = rows.length > pagination.limit;
    const page = hasMore ? rows.slice(0, pagination.limit) : rows;
    const last = page[page.length - 1];

    return {
      data: page,
      meta: { nextCursor: hasMore && last ? encodeCursor({ id: last.id }) : null, hasMore },
    };
  }

  /** Ochiq sozlamalar — brendlash uchun autentifikatsiyasiz beriladi. */
  async publicSettings() {
    return this.cache.remember('settings:public', 300, async () => {
      const rows = await this.prisma.setting.findMany({
        where: { isPublic: true },
        select: { key: true, value: true },
      });
      return Object.fromEntries(rows.map((row) => [row.key, row.value]));
    });
  }

  async allSettings() {
    return this.prisma.setting.findMany({
      orderBy: { key: 'asc' },
      select: { key: true, value: true, description: true, isPublic: true, updatedAt: true },
    });
  }

  async updateSetting(key: string, value: unknown, actor: RequestUser) {
    const before = await this.prisma.setting.findUnique({
      where: { key },
      select: { value: true },
    });

    await this.prisma.setting.upsert({
      where: { key },
      create: { key, value: value as never },
      update: { value: value as never },
    });

    await this.cache.del('settings:public');
    await this.audit.record({
      actorId: actor.id,
      action: 'setting.update',
      resource: 'system',
      resourceId: key,
      before: { value: before?.value },
      after: { value },
    });

    return { key, value };
  }

  /**
   * Feature flag holati. Redis'da 30 s keshlanadi (A-29) — bayroq
   * o'chirilganda ta'sir deyarli darhol sezilishi uchun.
   */
  async isFeatureEnabled(key: string, actor?: RequestUser): Promise<boolean> {
    const flag = await this.cache.remember(`flag:${key}`, FEATURE_FLAG_TTL, async () =>
      this.prisma.featureFlag.findUnique({
        where: { key },
        select: { enabled: true, rolloutRules: true },
      }),
    );

    if (!flag) return false;
    if (!flag.enabled) return false;

    const rules = flag.rolloutRules as { roles?: string[]; percentage?: number } | null;
    if (!rules || (!rules.roles?.length && !rules.percentage)) return true;

    if (rules.roles?.length && actor) {
      if (actor.roles.some((role) => rules.roles?.includes(role))) return true;
    }

    if (rules.percentage && actor) {
      // Foydalanuvchi id si bo'yicha barqaror taqsimot
      const bucket = hashToPercent(actor.id);
      return bucket < rules.percentage;
    }

    return false;
  }

  async listFeatureFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: 'asc' } });
  }

  async setFeatureFlag(
    key: string,
    enabled: boolean,
    rolloutRules: Record<string, unknown> | undefined,
    actor: RequestUser,
  ) {
    await this.prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled, rolloutRules: (rolloutRules ?? {}) as never },
      update: { enabled, ...(rolloutRules ? { rolloutRules: rolloutRules as never } : {}) },
    });

    await this.cache.del(`flag:${key}`);
    await this.audit.record({
      actorId: actor.id,
      action: 'feature_flag.update',
      resource: 'system',
      resourceId: key,
      after: { enabled, rolloutRules },
    });

    return { key, enabled };
  }

  /** Tizim statistikasi — administrator paneli uchun. */
  async systemStats() {
    const [users, courses, submissions, attempts, files, auditEntries] = await Promise.all([
      this.prisma.db.user.count(),
      this.prisma.db.course.count(),
      this.prisma.db.submission.count(),
      this.prisma.db.quizAttempt.count(),
      this.prisma.db.fileObject.aggregate({ _count: { _all: true }, _sum: { sizeBytes: true } }),
      this.prisma.auditLog.count(),
    ]);

    return {
      users,
      courses,
      submissions,
      quizAttempts: attempts,
      files: {
        count: files._count._all,
        totalBytes: files._sum.sizeBytes ? files._sum.sizeBytes.toString() : '0',
      },
      auditEntries,
    };
  }
}

/** Foydalanuvchi id sidan 0..99 oralig'ida barqaror qiymat. */
function hashToPercent(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
}

const auditFilters = z.object({
  actorId: uuidSchema.optional(),
  resource: z.string().max(64).optional(),
  action: z.string().max(64).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('audit-log')
  @RequirePermission(['auditlog:read:all', 'auditlog:read:own_faculty'])
  @ApiOperation({ summary: 'Audit jurnali (kim, nima, qachon, qaysi IP)' })
  async auditLog(
    @Query(zodQuery(auditFilters.merge(cursorPaginationSchema)))
    query: {
      actorId?: string;
      resource?: string;
      action?: string;
      from?: Date;
      to?: Date;
      cursor?: string;
      limit: number;
    },
  ) {
    return this.admin.auditLog(query, query);
  }

  @Public()
  @Get('settings/public')
  @ApiOperation({ summary: 'Ochiq sozlamalar (brendlash, til, muassasa nomi)' })
  async publicSettings() {
    return this.admin.publicSettings();
  }

  @Get('settings')
  @RequirePermission(['system:read:all', 'system:manage:all'])
  @ApiOperation({ summary: 'Barcha sozlamalar' })
  async settings() {
    return this.admin.allSettings();
  }

  @Patch('settings/:key')
  @RequirePermission(['system:update:all', 'system:manage:all'])
  @ApiOperation({ summary: 'Sozlamani yangilash' })
  async updateSetting(
    @Param('key') key: string,
    @Body(zodBody(z.object({ value: z.unknown() }))) dto: { value: unknown },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.admin.updateSetting(key, dto.value, actor);
  }

  @Get('site')
  @RequirePermission(['system:read:all', 'system:manage:all'])
  @ApiOperation({ summary: 'Sayt boshqaruvi daraxti va joriy qiymatlar (Moodle uslubi)' })
  async siteTree() {
    return this.admin.siteTree();
  }

  @Get('site/:section')
  @RequirePermission(['system:read:all', 'system:manage:all'])
  @ApiOperation({ summary: "Sayt boshqaruvi bo'limi" })
  async siteSection(@Param('section') section: string) {
    return this.admin.siteSection(section);
  }

  @Put('site/:section')
  @RequirePermission('system:manage:all')
  @ApiOperation({ summary: "Sayt boshqaruvi bo'limini yangilash (reestr sxemasi bilan)" })
  async updateSiteSection(
    @Param('section') section: string,
    @Body(zodBody(z.record(z.unknown()))) dto: Record<string, unknown>,
    @CurrentUser() actor: RequestUser,
  ) {
    return this.admin.updateSiteSection(section, dto, actor);
  }

  @Get('feature-flags')
  @RequirePermission(['system:read:all', 'system:manage:all'])
  @ApiOperation({ summary: 'Feature flag lar' })
  async featureFlags() {
    return this.admin.listFeatureFlags();
  }

  @Patch('feature-flags/:key')
  @RequirePermission('system:manage:all')
  @ApiOperation({ summary: "Feature flag ni yoqish yoki o'chirish" })
  async setFeatureFlag(
    @Param('key') key: string,
    @Body(
      zodBody(z.object({ enabled: z.boolean(), rolloutRules: z.record(z.unknown()).optional() })),
    )
    dto: { enabled: boolean; rolloutRules?: Record<string, unknown> },
    @CurrentUser() actor: RequestUser,
  ) {
    return this.admin.setFeatureFlag(key, dto.enabled, dto.rolloutRules, actor);
  }

  @Get('stats')
  @RequirePermission(['system:read:all', 'system:manage:all', 'analytics:read:all'])
  @ApiOperation({ summary: 'Tizim statistikasi' })
  async stats() {
    return this.admin.systemStats();
  }
}

@Module({
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
