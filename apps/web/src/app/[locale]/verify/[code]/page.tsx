/**
 * Maqsad: sertifikatni ochiq tekshirish sahifasi (F-12, §15).
 *
 * Autentifikatsiya TALAB QILINMAYDI — QR kodni skanerlagan har qanday
 * tashkilot sertifikat haqiqiyligini tekshira oladi. Sahifa server
 * komponenti sifatida render qilinadi: tez ochiladi va JS talab qilmaydi.
 */

import { getTranslations, setRequestLocale } from 'next-intl/server';
import { BadgeCheck, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';

interface VerificationResult {
  valid: boolean;
  reasonKey?: string;
  serialNumber?: string;
  fullName?: string;
  courseTitle?: Record<string, string>;
  academicHours?: number;
  issuedAt?: string;
  expiresAt?: string | null;
  revokedAt?: string;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'certificates' });
  return { title: t('verifyTitle'), robots: { index: false } };
}

export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ locale: string; code: string }>;
}) {
  const { locale, code } = await params;
  setRequestLocale(locale);

  const t = await getTranslations({ locale });

  const baseUrl =
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    'http://localhost:4000/api/v1';

  let result: VerificationResult | null = null;
  let failed = false;

  try {
    const response = await fetch(`${baseUrl}/certificates/verify/${encodeURIComponent(code)}`, {
      cache: 'no-store',
    });
    const payload = (await response.json()) as { data?: VerificationResult };
    result = payload.data ?? null;
  } catch {
    failed = true;
  }

  const valid = result?.valid === true;

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10"
    >
      <div className="w-full max-w-md space-y-4">
        <div className="text-center">
          <h1 className="text-xl font-semibold">{t('app.institution')}</h1>
          <p className="text-sm text-muted-foreground">{t('certificates.verifyTitle')}</p>
        </div>

        <div
          className={`rounded-lg border p-6 text-center ${
            valid ? 'border-success/40 bg-success/5' : 'border-destructive/40 bg-destructive/5'
          }`}
        >
          <div className="mb-3 flex justify-center">
            {valid ? (
              <BadgeCheck className="size-12 text-success" aria-hidden="true" />
            ) : (
              <ShieldAlert className="size-12 text-destructive" aria-hidden="true" />
            )}
          </div>

          <p className={`text-lg font-medium ${valid ? 'text-success' : 'text-destructive'}`}>
            {failed
              ? t('errors.dependency_unavailable')
              : valid
                ? t('certificates.valid')
                : t('certificates.invalid')}
          </p>

          {valid && result ? (
            <dl className="mt-5 space-y-2 text-left text-sm">
              <Row label={t('auth.firstName')} value={result.fullName ?? '—'} />
              <Row
                label={t('courses.courseTitle')}
                value={result.courseTitle?.[locale] ?? result.courseTitle?.['uz-Latn'] ?? '—'}
              />
              {result.academicHours ? (
                <Row label={t('courses.academicHours')} value={String(result.academicHours)} />
              ) : null}
              <Row label={t('certificates.serialNumber')} value={result.serialNumber ?? '—'} />
              <Row
                label={t('certificates.issuedAt')}
                value={
                  result.issuedAt
                    ? new Intl.DateTimeFormat('uz-Latn-UZ', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                        timeZone: 'Asia/Tashkent',
                      }).format(new Date(result.issuedAt))
                    : '—'
                }
              />
            </dl>
          ) : null}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {t('certificates.verify')}: <span className="font-mono">{code}</span>
        </p>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border/60 pb-1.5 last:border-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
