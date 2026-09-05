/**
 * Maqsad: til ichidagi 404 sahifasi — tarjima qilingan matn bilan.
 */

import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/routing';

export default async function LocaleNotFound() {
  const t = await getTranslations();

  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
      <p className="text-5xl font-semibold text-muted-foreground">404</p>
      <h1 className="text-lg font-medium">{t('errors.not_found')}</h1>
      <Link
        href="/dashboard"
        className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
      >
        {t('nav.dashboard')}
      </Link>
    </main>
  );
}
