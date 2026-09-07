/**
 * Maqsad: LTI 1.3 Tool Provider (§10) — OIDC login initiation, launch
 * tekshiruvi, foydalanuvchini bog'lash va sessiya ochish.
 *
 * Oqim (IMS LTI 1.3 Core, "Third-party initiated login" + "Resource link launch"):
 *  1. Platforma → `GET/POST /lti/login` (iss, login_hint, target_link_uri). Biz `state`
 *     va `nonce` yaratib (Redis, bir martalik), platformaning auth endpointiga yo'naltiramiz.
 *  2. Platforma → `POST /lti/launch` (id_token, state) form-post. Biz `state` ni
 *     yo'q qilamiz (replay himoyasi), tokenni platforma JWKS kaliti bilan tekshiramiz,
 *     `nonce`, `iss`, `aud`, `exp`, `deployment_id` va xabar turini tasdiqlaymiz.
 *  3. `sub` bo'yicha bog'langan foydalanuvchi topiladi (yoki email bo'yicha
 *     bog'lanadi, yoki yangi foydalanuvchi yaratiladi), sessiya ochiladi va
 *     brauzer kursga yo'naltiriladi.
 *
 * Qamrov chegarasi (ochiq aytilgan): Deep Linking, AGS (baho qaytarish) va NRPS
 * hali yo'q — tool JWKS va `authTokenUrl` ular uchun tayyor turadi.
 */

import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  type KeyObject,
} from 'node:crypto';
import { Prisma } from '@prisma/client';
import {
  LTI_INSTRUCTOR_ROLE_FRAGMENTS,
  jwksSchema,
  normalizeForSearch,
  type CreateLtiPlatformInput,
  type LtiLaunchInput,
  type LtiLoginInitiationInput,
  type UpdateLtiPlatformInput,
} from '@lms/shared';
import type { AppConfig } from '../../config/configuration';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CacheService } from '../../common/cache/cache.service';
import { CryptoService } from '../../common/security/crypto.service';
import { AuditService } from '../../common/audit/audit.service';
import { AppException } from '../../common/errors/app.exception';
import type { RequestUser } from '../../common/auth/auth.types';
import { AuthService, type LoginContext, type LoginResult } from '../auth/auth.service';
import {
  decodeJwt,
  jwkThumbprint,
  publicJwkFromKey,
  selectJwk,
  signRs256,
  verifyRs256,
  type RsaJwk,
} from './lti-jwt';

const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim';
const MESSAGE_TYPE_RESOURCE_LINK = 'LtiResourceLinkRequest';
const MESSAGE_TYPE_DEEP_LINKING = 'LtiDeepLinkingRequest';
/** Platforma bilan soat farqi uchun ruxsat (soniya). */
const CLOCK_SKEW_SECONDS = 300;
const JWKS_CACHE_SECONDS = 3600;

interface StoredState {
  platformId: string;
  nonce: string;
  targetLinkUri: string;
}

interface LaunchClaims {
  iss: string;
  sub: string;
  aud: string[];
  exp: number;
  iat: number;
  nonce: string;
  email?: string;
  givenName?: string;
  familyName?: string;
  name?: string;
  messageType?: string;
  version?: string;
  deploymentId?: string;
  targetLinkUri?: string;
  roles: string[];
  custom: Record<string, string>;
  locale?: string;
  resourceLink?: { id: string; title?: string };
  context?: { id: string; title?: string };
  ags?: { lineitem?: string; lineitems?: string; scope: string[] };
  nrps?: { membershipsUrl: string };
  deepLinking?: { returnUrl: string; data?: string };
}

/** Deep Linking so'rovi holati — o'qituvchi kursni tanlaguncha Redis'da. */
export interface DeepLinkState {
  platformId: string;
  userId: string;
  returnUrl: string;
  data?: string;
}

export interface LaunchOutcome {
  login: LoginResult;
  redirectUrl: string;
}

/** Claim obyekti bo'lsa o'qiydi, aks holda `undefined`. */
function readObject<T>(value: unknown, read: (node: Record<string, unknown>) => T): T | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return read(value as Record<string, unknown>);
}

const platformSelect = {
  id: true,
  name: true,
  issuer: true,
  clientId: true,
  deploymentId: true,
  authLoginUrl: true,
  authTokenUrl: true,
  jwksUrl: true,
  publicJwks: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { userLinks: true } },
} satisfies Prisma.LtiPlatformSelect;

@Injectable()
export class LtiService implements OnModuleInit {
  private readonly logger = new Logger(LtiService.name);
  private privateKey!: KeyObject;
  private publicJwk!: RsaJwk;
  private kid!: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Tool kaliti: env dan (PEM) yoki vaqtinchalik. Vaqtinchalik kalit faqat
   * ishlab chiqish uchun — qayta ishga tushganda JWKS o'zgaradi va platformada
   * saqlangan kalit yaroqsiz bo'ladi; shuning uchun aniq ogohlantiramiz.
   */
  onModuleInit(): void {
    const pem = this.config.get('LTI_TOOL_PRIVATE_KEY', { infer: true });
    if (pem) {
      this.privateKey = createPrivateKey(pem.replace(/\\n/g, '\n'));
    } else {
      this.privateKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
      this.logger.warn(
        'LTI_TOOL_PRIVATE_KEY berilmagan — vaqtinchalik tool kaliti yaratildi (faqat ishlab chiqish uchun)',
      );
    }
    this.publicJwk = publicJwkFromKey(this.privateKey);
    this.kid = jwkThumbprint(this.publicJwk);
  }

  // --- Tool ma'lumotlari --------------------------------------------------------

  jwks() {
    return { keys: [{ ...this.publicJwk, kid: this.kid, alg: 'RS256', use: 'sig' }] };
  }

  /** Platformada ro'yxatga olishda kerak bo'ladigan manzillar. */
  toolEndpoints() {
    const base = `${this.config.get('API_PUBLIC_URL', { infer: true })}/api/v1/lti`;
    return {
      loginUrl: `${base}/login`,
      launchUrl: `${base}/launch`,
      jwksUrl: `${base}/jwks`,
      keyId: this.kid,
      /** Platformadan kutiladigan custom parametr — qaysi kursga yo'naltirish. */
      customParameters: { course_id: '<LMS kurs identifikatori (UUID)>' },
    };
  }

  // --- Platformalar CRUD --------------------------------------------------------

  async listPlatforms() {
    return this.prisma.db.ltiPlatform.findMany({
      orderBy: { name: 'asc' },
      select: platformSelect,
    });
  }

  async createPlatform(input: CreateLtiPlatformInput, actor: RequestUser) {
    const exists = await this.prisma.db.ltiPlatform.findFirst({
      where: { issuer: input.issuer, clientId: input.clientId },
      select: { id: true },
    });
    if (exists) throw AppException.conflict('errors.lti_platform_exists');

    const platform = await this.prisma.db.ltiPlatform.create({
      data: {
        name: input.name,
        issuer: input.issuer,
        clientId: input.clientId,
        deploymentId: input.deploymentId,
        authLoginUrl: input.authLoginUrl,
        authTokenUrl: input.authTokenUrl,
        jwksUrl: input.jwksUrl ?? null,
        publicJwks: (input.publicJwks ?? Prisma.JsonNull) as never,
        isActive: input.isActive,
        createdById: actor.id,
      },
      select: platformSelect,
    });

    await this.audit.record({
      actorId: actor.id,
      action: 'lti.platform.create',
      resource: 'integration',
      resourceId: platform.id,
      after: { issuer: input.issuer, clientId: input.clientId },
    });
    return platform;
  }

  async updatePlatform(id: string, input: UpdateLtiPlatformInput, actor: RequestUser) {
    const before = await this.prisma.db.ltiPlatform.findUnique({
      where: { id },
      select: { id: true, jwksUrl: true, publicJwks: true, issuer: true, clientId: true },
    });
    if (!before) throw AppException.notFound('integration', id);

    const jwksUrl = input.jwksUrl !== undefined ? input.jwksUrl : before.jwksUrl;
    const publicJwks = input.publicJwks !== undefined ? input.publicJwks : before.publicJwks;
    if (!jwksUrl && !publicJwks) {
      throw AppException.validation([
        { field: 'jwksUrl', code: 'validation.lti_key_source_required' },
      ]);
    }

    const platform = await this.prisma.db.ltiPlatform.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.issuer !== undefined ? { issuer: input.issuer } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        ...(input.deploymentId !== undefined ? { deploymentId: input.deploymentId } : {}),
        ...(input.authLoginUrl !== undefined ? { authLoginUrl: input.authLoginUrl } : {}),
        ...(input.authTokenUrl !== undefined ? { authTokenUrl: input.authTokenUrl } : {}),
        ...(input.jwksUrl !== undefined ? { jwksUrl: input.jwksUrl } : {}),
        ...(input.publicJwks !== undefined
          ? { publicJwks: (input.publicJwks ?? Prisma.JsonNull) as never }
          : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
      },
      select: platformSelect,
    });

    // Kalit manbasi o'zgargan bo'lsa — keshdagi eski JWKS ishlatilmasin
    await this.cache.del(`lti:jwks:${id}`);
    await this.audit.record({
      actorId: actor.id,
      action: 'lti.platform.update',
      resource: 'integration',
      resourceId: id,
      after: input as Record<string, unknown>,
    });
    return platform;
  }

  async deletePlatform(id: string, actor: RequestUser): Promise<void> {
    const platform = await this.prisma.db.ltiPlatform.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!platform) throw AppException.notFound('integration', id);
    await this.prisma.softDelete('LtiPlatform', id);
    await this.cache.del(`lti:jwks:${id}`);
    await this.audit.record({
      actorId: actor.id,
      action: 'lti.platform.delete',
      resource: 'integration',
      resourceId: id,
    });
  }

  // --- 1. OIDC login initiation --------------------------------------------------

  async initiateLogin(
    input: LtiLoginInitiationInput,
  ): Promise<{ redirectUrl: string; state: string }> {
    const platform = await this.prisma.db.ltiPlatform.findFirst({
      where: {
        issuer: input.iss,
        isActive: true,
        ...(input.client_id ? { clientId: input.client_id } : {}),
      },
      select: { id: true, clientId: true, authLoginUrl: true, deploymentId: true },
    });
    if (!platform)
      throw AppException.businessRule('errors.lti_platform_unknown', { issuer: input.iss });
    if (input.lti_deployment_id && input.lti_deployment_id !== platform.deploymentId) {
      throw AppException.businessRule('errors.lti_deployment_mismatch');
    }

    const state = randomBytes(24).toString('base64url');
    const nonce = randomBytes(24).toString('base64url');
    const stored: StoredState = {
      platformId: platform.id,
      nonce,
      targetLinkUri: input.target_link_uri,
    };
    await this.cache.set(
      `lti:state:${state}`,
      stored,
      this.config.get('LTI_STATE_TTL_SECONDS', { infer: true }),
    );

    const url = new URL(platform.authLoginUrl);
    url.searchParams.set('scope', 'openid');
    url.searchParams.set('response_type', 'id_token');
    url.searchParams.set('response_mode', 'form_post');
    url.searchParams.set('prompt', 'none');
    url.searchParams.set('client_id', platform.clientId);
    url.searchParams.set('redirect_uri', this.toolEndpoints().launchUrl);
    url.searchParams.set('login_hint', input.login_hint);
    url.searchParams.set('state', state);
    url.searchParams.set('nonce', nonce);
    if (input.lti_message_hint) url.searchParams.set('lti_message_hint', input.lti_message_hint);

    return { redirectUrl: url.toString(), state };
  }

  // --- 2. Launch ---------------------------------------------------------------------

  async handleLaunch(
    input: LtiLaunchInput,
    cookieState: string | undefined,
    context: LoginContext,
  ): Promise<LaunchOutcome> {
    // Cookie mavjud bo'lsa — brauzerga bog'lanish tekshiriladi (CSRF).
    // Cookie yo'q bo'lishi mumkin (cross-site POST, `SameSite`), shuning uchun
    // asosiy himoya — Redis'dagi bir martalik `state`.
    if (cookieState && cookieState !== input.state) {
      throw AppException.businessRule('errors.lti_state_invalid');
    }
    const key = `lti:state:${input.state}`;
    const stored = await this.cache.get<StoredState>(key);
    if (!stored) throw AppException.businessRule('errors.lti_state_invalid');
    await this.cache.del(key);

    const platform = await this.prisma.db.ltiPlatform.findUnique({
      where: { id: stored.platformId },
      select: {
        id: true,
        name: true,
        issuer: true,
        clientId: true,
        deploymentId: true,
        jwksUrl: true,
        publicJwks: true,
        isActive: true,
      },
    });
    if (!platform || !platform.isActive)
      throw AppException.businessRule('errors.lti_platform_unknown');

    let decoded;
    try {
      decoded = decodeJwt(input.id_token);
    } catch {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'malformed' });
    }

    const jwk = await this.resolveKey(platform, decoded.header.kid);
    if (!jwk)
      throw AppException.businessRule('errors.lti_key_not_found', {
        kid: decoded.header.kid ?? '',
      });
    if (!verifyRs256(decoded, jwk)) {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'signature' });
    }

    const claims = this.readClaims(decoded.payload);
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== platform.issuer) {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'issuer' });
    }
    if (!claims.aud.includes(platform.clientId)) {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'audience' });
    }
    if (!claims.exp || claims.exp + CLOCK_SKEW_SECONDS < now) {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'expired' });
    }
    if (!claims.iat || claims.iat - CLOCK_SKEW_SECONDS > now) {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'issued_in_future' });
    }
    if (!claims.nonce || claims.nonce !== stored.nonce) {
      throw AppException.businessRule('errors.lti_nonce_invalid');
    }
    const isDeepLinking = claims.messageType === MESSAGE_TYPE_DEEP_LINKING;
    if (claims.messageType !== MESSAGE_TYPE_RESOURCE_LINK && !isDeepLinking) {
      throw AppException.businessRule('errors.lti_message_unsupported', {
        messageType: claims.messageType ?? '',
      });
    }
    if (isDeepLinking && !claims.deepLinking?.returnUrl) {
      throw AppException.businessRule('errors.lti_token_invalid', {
        reason: 'deep_linking_settings',
      });
    }
    if (claims.version !== '1.3.0') {
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'version' });
    }
    if (claims.deploymentId !== platform.deploymentId) {
      throw AppException.businessRule('errors.lti_deployment_mismatch');
    }
    if (!claims.sub)
      throw AppException.businessRule('errors.lti_token_invalid', { reason: 'subject' });

    // 3. Foydalanuvchi va sessiya
    const userId = await this.resolveUser(platform.id, claims);
    const login = await this.auth.loginExternal(userId, `lti:${platform.name}`, context);
    const web = this.config.get('WEB_PUBLIC_URL', { infer: true });

    let redirectUrl: string;
    if (isDeepLinking) {
      // Deep Linking: o'qituvchi bizning kurslardan birini tanlaydi, keyin platformaga qaytadi
      const token = randomBytes(24).toString('base64url');
      const dlState: DeepLinkState = {
        platformId: platform.id,
        userId,
        returnUrl: claims.deepLinking!.returnUrl,
        data: claims.deepLinking!.data,
      };
      await this.cache.set(`lti:dl:${token}`, dlState, 900);
      redirectUrl = `${web}/${login.user.locale}/lti/deep-link?token=${encodeURIComponent(token)}`;
    } else {
      redirectUrl = await this.resolveRedirect(userId, claims, login.user.locale);
      await this.rememberResourceLink(platform.id, claims);
    }

    await this.audit.record({
      actorId: userId,
      action: 'lti.launch',
      resource: 'integration',
      resourceId: platform.id,
      after: { sub: claims.sub, courseId: claims.custom.course_id ?? null },
      ip: context.ip,
      userAgent: context.userAgent,
      traceId: context.traceId,
    });

    return { login, redirectUrl };
  }

  // --- Yordamchilar ---------------------------------------------------------------

  private readClaims(payload: Record<string, unknown>): LaunchClaims {
    const str = (value: unknown) => (typeof value === 'string' ? value : undefined);
    const audRaw = payload.aud;
    const aud = Array.isArray(audRaw)
      ? audRaw.filter((item): item is string => typeof item === 'string')
      : typeof audRaw === 'string'
        ? [audRaw]
        : [];
    const rolesRaw = payload[`${CLAIM}/roles`];
    const customRaw = payload[`${CLAIM}/custom`];
    const custom: Record<string, string> = {};
    if (customRaw && typeof customRaw === 'object') {
      for (const [key, value] of Object.entries(customRaw as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'number') custom[key] = String(value);
      }
    }
    const launchPresentation = payload[`${CLAIM}/launch_presentation`] as
      Record<string, unknown> | undefined;

    return {
      iss: str(payload.iss) ?? '',
      sub: str(payload.sub) ?? '',
      aud,
      exp: Number(payload.exp ?? 0),
      iat: Number(payload.iat ?? 0),
      nonce: str(payload.nonce) ?? '',
      email: str(payload.email)?.toLowerCase(),
      givenName: str(payload.given_name),
      familyName: str(payload.family_name),
      name: str(payload.name),
      messageType: str(payload[`${CLAIM}/message_type`]),
      version: str(payload[`${CLAIM}/version`]),
      deploymentId: str(payload[`${CLAIM}/deployment_id`]),
      targetLinkUri: str(payload[`${CLAIM}/target_link_uri`]),
      roles: Array.isArray(rolesRaw)
        ? rolesRaw.filter((item): item is string => typeof item === 'string')
        : [],
      custom,
      locale: str(launchPresentation?.locale),
      resourceLink: readObject(payload[`${CLAIM}/resource_link`], (node) => ({
        id: str(node.id) ?? '',
        title: str(node.title),
      })),
      context: readObject(payload[`${CLAIM}/context`], (node) => ({
        id: str(node.id) ?? '',
        title: str(node.title),
      })),
      ags: readObject(
        payload['https://purl.imsglobal.org/spec/lti-ags/claim/endpoint'],
        (node) => ({
          lineitem: str(node.lineitem),
          lineitems: str(node.lineitems),
          scope: Array.isArray(node.scope)
            ? (node.scope as unknown[]).filter((item): item is string => typeof item === 'string')
            : [],
        }),
      ),
      nrps: readObject(
        payload['https://purl.imsglobal.org/spec/lti-nrps/claim/namesroleservice'],
        (node) => ({ membershipsUrl: str(node.context_memberships_url) ?? '' }),
      ),
      deepLinking: readObject(
        payload['https://purl.imsglobal.org/spec/lti-dl/claim/deep_linking_settings'],
        (node) => ({ returnUrl: str(node.deep_link_return_url) ?? '', data: str(node.data) }),
      ),
    };
  }

  /**
   * Launch kontekstini saqlaydi: resurs havolasi → kurs, AGS/NRPS manzillari.
   * Keyin baholar shu manzillarga yuboriladi, a'zolar shu yerdan olinadi.
   */
  private async rememberResourceLink(platformId: string, claims: LaunchClaims): Promise<void> {
    if (!claims.resourceLink?.id) return;
    const courseId = claims.custom.course_id ?? claims.custom.courseId;
    const validCourse =
      courseId && /^[0-9a-f-]{36}$/i.test(courseId)
        ? await this.prisma.db.course.findUnique({ where: { id: courseId }, select: { id: true } })
        : null;
    // Faqat KELGAN claimlar yangilanadi: xizmatsiz (AGS/NRPS claim'siz) launch
    // oldin saqlangan manzillarni o'chirib yubormasin
    const update = {
      ...(validCourse ? { courseId: validCourse.id } : {}),
      ...(claims.resourceLink.title ? { title: claims.resourceLink.title } : {}),
      ...(claims.context?.id ? { contextId: claims.context.id } : {}),
      ...(claims.context?.title ? { contextTitle: claims.context.title } : {}),
      ...(claims.ags?.lineitem ? { lineItemUrl: claims.ags.lineitem } : {}),
      ...(claims.ags?.lineitems ? { lineItemsUrl: claims.ags.lineitems } : {}),
      ...(claims.nrps?.membershipsUrl ? { membershipsUrl: claims.nrps.membershipsUrl } : {}),
      ...(claims.ags?.scope.length ? { scopes: claims.ags.scope } : {}),
    };
    await this.prisma.db.ltiResourceLink.upsert({
      where: { platformId_resourceLinkId: { platformId, resourceLinkId: claims.resourceLink.id } },
      create: {
        platformId,
        resourceLinkId: claims.resourceLink.id,
        courseId: validCourse?.id ?? null,
        title: claims.resourceLink.title ?? null,
        contextId: claims.context?.id ?? null,
        contextTitle: claims.context?.title ?? null,
        lineItemUrl: claims.ags?.lineitem ?? null,
        lineItemsUrl: claims.ags?.lineitems ?? null,
        membershipsUrl: claims.nrps?.membershipsUrl || null,
        scopes: claims.ags?.scope ?? [],
      },
      update,
    });
  }

  /** Tool kaliti bilan RS256 JWT (AGS token so'rovi, Deep Linking javobi). */
  signWithToolKey(payload: Record<string, unknown>): string {
    return signRs256(payload, this.privateKey, this.kid);
  }

  /** Platforma kaliti: qo'lda kiritilgan JWKS yoki `jwksUrl` (keshlangan, `kid` topilmasa yangilanadi). */
  private async resolveKey(
    platform: { id: string; jwksUrl: string | null; publicJwks: unknown },
    kid: string | undefined,
  ): Promise<RsaJwk | undefined> {
    if (platform.publicJwks) {
      const parsed = jwksSchema.safeParse(platform.publicJwks);
      if (parsed.success) {
        const found = selectJwk(parsed.data.keys as RsaJwk[], kid);
        if (found) return found;
      }
    }
    if (!platform.jwksUrl) return undefined;

    const cacheKey = `lti:jwks:${platform.id}`;
    const cached = await this.cache.get<RsaJwk[]>(cacheKey);
    if (cached) {
      const found = selectJwk(cached, kid);
      if (found) return found;
    }

    // Kalit rotatsiyasi: keshda yo'q bo'lsa bir marta qayta yuklaymiz
    const fresh = await this.fetchJwks(platform.jwksUrl);
    if (!fresh) return undefined;
    await this.cache.set(cacheKey, fresh, JWKS_CACHE_SECONDS);
    return selectJwk(fresh, kid);
  }

  private async fetchJwks(url: string): Promise<RsaJwk[] | null> {
    try {
      const response = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        this.logger.warn({ url, status: response.status }, 'Platforma JWKS ni bermadi');
        return null;
      }
      const parsed = jwksSchema.safeParse(await response.json());
      if (!parsed.success) {
        this.logger.warn({ url }, "Platforma JWKS formati noto'g'ri");
        return null;
      }
      return parsed.data.keys as RsaJwk[];
    } catch (error) {
      this.logger.warn(
        { url, error: (error as Error).message },
        "Platforma JWKS ni yuklab bo'lmadi",
      );
      return null;
    }
  }

  /**
   * Foydalanuvchini aniqlash tartibi:
   *  1. `platformId + sub` bog'lanishi;
   *  2. `email` bo'yicha mavjud foydalanuvchi → bog'lanadi;
   *  3. yangi foydalanuvchi (rol: o'qituvchi claim'lari bo'lsa TEACHER, aks holda STUDENT).
   */
  private async resolveUser(platformId: string, claims: LaunchClaims): Promise<string> {
    const link = await this.prisma.db.ltiUserLink.findUnique({
      where: { platformId_subject: { platformId, subject: claims.sub } },
      select: { userId: true, user: { select: { status: true, deletedAt: true } } },
    });
    if (link) {
      if (link.user.deletedAt || link.user.status !== 'ACTIVE') {
        throw AppException.unauthenticated('account_inactive');
      }
      await this.prisma.db.ltiUserLink.update({
        where: { platformId_subject: { platformId, subject: claims.sub } },
        data: { lastLaunchAt: new Date() },
      });
      return link.userId;
    }

    if (claims.email) {
      const existing = await this.prisma.db.user.findUnique({
        where: { email: claims.email },
        select: { id: true, status: true },
      });
      if (existing) {
        if (existing.status !== 'ACTIVE') throw AppException.unauthenticated('account_inactive');
        await this.prisma.db.ltiUserLink.create({
          data: { platformId, subject: claims.sub, userId: existing.id, lastLaunchAt: new Date() },
        });
        return existing.id;
      }
    }

    return this.provisionUser(platformId, claims);
  }

  private async provisionUser(platformId: string, claims: LaunchClaims): Promise<string> {
    const isInstructor = claims.roles.some((role) =>
      LTI_INSTRUCTOR_ROLE_FRAGMENTS.some((fragment) => role.includes(fragment)),
    );
    const roleCode = isInstructor ? 'TEACHER' : 'STUDENT';
    const role = await this.prisma.db.role.findUnique({
      where: { code: roleCode },
      select: { id: true },
    });
    if (!role) throw AppException.notFound('role', roleCode);

    // Email bo'lmasa — platforma+sub dan barqaror texnik manzil (kirish faqat LTI orqali)
    const subjectHash = createHash('sha256')
      .update(`${platformId}:${claims.sub}`)
      .digest('hex')
      .slice(0, 16);
    const email = claims.email ?? `lti-${subjectHash}@lti.invalid`;
    const [firstFromName, ...restOfName] = (claims.name ?? '').trim().split(/\s+/);
    const firstName = (claims.givenName ?? firstFromName ?? '').trim() || 'LTI';
    const lastName = (claims.familyName ?? restOfName.join(' ')).trim() || claims.sub.slice(0, 12);
    const passwordHash = await this.crypto.hashPassword(this.crypto.generateToken(24));
    const locale = ['uz-Latn', 'uz-Cyrl', 'ru', 'en'].includes(claims.locale ?? '')
      ? (claims.locale as string)
      : 'uz-Latn';

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          status: 'ACTIVE',
          locale,
          externalProvider: 'lti',
          emailVerifiedAt: claims.email ? new Date() : null,
          searchText: normalizeForSearch(`${lastName} ${firstName} ${email}`),
          profile: {
            create: { firstName: firstName.slice(0, 64), lastName: lastName.slice(0, 64) },
          },
          roles: { create: { roleId: role.id } },
        },
        select: { id: true },
      });
      await tx.passwordHistory.create({ data: { userId: created.id, passwordHash } });
      await tx.ltiUserLink.create({
        data: { platformId, subject: claims.sub, userId: created.id, lastLaunchAt: new Date() },
      });
      return created;
    });

    await this.audit.record({
      actorId: user.id,
      action: 'lti.user_provisioned',
      resource: 'user',
      resourceId: user.id,
      after: { platformId, roleCode, email },
    });
    return user.id;
  }

  /**
   * Yo'naltirish: `custom.course_id` bo'lsa va kurs mavjud bo'lsa — talaba
   * yozilmagan bo'lsa yoziladi (o'qituvchiga avtomatik huquq BERILMAYDI — bu
   * kurs egasining qarori), keyin kurs sahifasi; aks holda bosh sahifa.
   */
  private async resolveRedirect(
    userId: string,
    claims: LaunchClaims,
    locale: string,
  ): Promise<string> {
    const web = this.config.get('WEB_PUBLIC_URL', { infer: true });
    const courseId = claims.custom.course_id ?? claims.custom.courseId;
    if (!courseId || !/^[0-9a-f-]{36}$/i.test(courseId)) return `${web}/${locale}/dashboard`;

    const course = await this.prisma.db.course.findUnique({
      where: { id: courseId },
      select: { id: true },
    });
    if (!course) return `${web}/${locale}/dashboard`;

    const isInstructor = claims.roles.some((role) =>
      LTI_INSTRUCTOR_ROLE_FRAGMENTS.some((fragment) => role.includes(fragment)),
    );
    if (!isInstructor) {
      const enrollment = await this.prisma.db.enrollment.findFirst({
        where: { courseId, userId },
        select: { id: true },
      });
      if (!enrollment) {
        await this.prisma.db.enrollment.create({ data: { courseId, userId, status: 'ACTIVE' } });
      }
      // Yozilish o'zgargani uchun keshlangan ruxsat konteksti eskiradi
      await this.cache.delByPattern(`auth:ctx:${userId}:*`);
    }
    return `${web}/${locale}/courses/${courseId}`;
  }
}
