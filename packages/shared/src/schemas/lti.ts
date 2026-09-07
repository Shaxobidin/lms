/**
 * Maqsad: LTI 1.3 (Tool Provider rejimi) sxemalari — §10 "LTI 1.3 (Tool Provider)".
 *
 * Bizning LMS "tool" (vosita) sifatida ishlaydi: tashqi platforma (Moodle,
 * Canvas, boshqa LMS) foydalanuvchini OIDC oqimi orqali bizga uzatadi.
 * Platforma yozuvi administrator tomonidan ro'yxatga olinadi.
 */

import { z } from 'zod';

const httpsUrlSchema = z
  .string()
  .trim()
  .url({ message: 'validation.url' })
  .max(2048)
  .refine((value) => /^https?:\/\//i.test(value), { message: 'validation.url' });

/** JSON Web Key Set — platforma ochiq kalitlari (`jwksUrl` ga muqobil). */
export const jwksSchema = z.object({
  keys: z
    .array(
      z
        .object({
          kty: z.literal('RSA'),
          kid: z.string().min(1).max(256).optional(),
          alg: z.string().max(16).optional(),
          use: z.string().max(16).optional(),
          n: z.string().min(1),
          e: z.string().min(1),
        })
        .passthrough(),
    )
    .min(1)
    .max(20),
});
export type Jwks = z.infer<typeof jwksSchema>;

const ltiPlatformBaseSchema = z.object({
  name: z.string().trim().min(2).max(120),
  /** Platformaning `iss` qiymati (masalan, `https://moodle.qdu.uz`). */
  issuer: httpsUrlSchema,
  clientId: z.string().trim().min(1).max(256),
  deploymentId: z.string().trim().min(1).max(256),
  /** OIDC autentifikatsiya endpointi (Moodle: `/mod/lti/auth.php`). */
  authLoginUrl: httpsUrlSchema,
  /** Token endpointi (AGS/NRPS uchun; hozircha faqat saqlanadi). */
  authTokenUrl: httpsUrlSchema,
  jwksUrl: httpsUrlSchema.nullable().optional(),
  publicJwks: jwksSchema.nullable().optional(),
  isActive: z.boolean().default(true),
});

/** Kalit manbasi: `jwksUrl` yoki `publicJwks` dan kamida bittasi bo'lishi shart. */
const requireKeySource = (value: { jwksUrl?: string | null; publicJwks?: unknown }) =>
  Boolean(value.jwksUrl) || Boolean(value.publicJwks);

export const createLtiPlatformSchema = ltiPlatformBaseSchema.refine(requireKeySource, {
  message: 'validation.lti_key_source_required',
  path: ['jwksUrl'],
});

export const updateLtiPlatformSchema = ltiPlatformBaseSchema.partial();

/** OIDC login initiation — platforma yuboradigan parametrlar (GET yoki POST). */
export const ltiLoginInitiationSchema = z.object({
  iss: z.string().trim().min(1).max(2048),
  login_hint: z.string().trim().min(1).max(2048),
  target_link_uri: z.string().trim().min(1).max(2048),
  client_id: z.string().trim().max(256).optional(),
  lti_message_hint: z.string().trim().max(4096).optional(),
  lti_deployment_id: z.string().trim().max(256).optional(),
});

/** Launch — platforma `form_post` bilan qaytaradi. */
export const ltiLaunchSchema = z.object({
  id_token: z.string().min(1).max(64_000),
  state: z.string().min(1).max(256),
});

/** Deep Linking: o'qituvchi tanlagan kurs platformaga qaytariladi. */
export const ltiDeepLinkRespondSchema = z.object({
  token: z.string().min(8).max(256),
  courseId: z.string().uuid({ message: 'validation.uuid' }),
});
export type LtiDeepLinkRespondInput = z.infer<typeof ltiDeepLinkRespondSchema>;

export type CreateLtiPlatformInput = z.infer<typeof createLtiPlatformSchema>;
export type UpdateLtiPlatformInput = z.infer<typeof updateLtiPlatformSchema>;
export type LtiLoginInitiationInput = z.infer<typeof ltiLoginInitiationSchema>;
export type LtiLaunchInput = z.infer<typeof ltiLaunchSchema>;

/** LTI 1.3 rol URI'lari → LMS roli (faqat ikkitasi ajratiladi, qolgani talaba). */
export const LTI_INSTRUCTOR_ROLE_FRAGMENTS = [
  '#Instructor',
  '#TeachingAssistant',
  '#ContentDeveloper',
] as const;
