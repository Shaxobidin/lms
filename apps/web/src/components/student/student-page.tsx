/**
 * Maqsad: HEMIS uslubidagi "Talaba" bo'limi sahifalari uchun umumiy qobiq va
 * holat belgilari — sahifalar bir xil ko'rinishda bo'lsin.
 */

'use client';

import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/primitives';

export function StudentPage({
  icon: Icon,
  title,
  hint,
  children,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Icon className="size-6" aria-hidden="true" />
          {title}
        </h1>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </header>
      {children}
    </div>
  );
}

const REQUEST_VARIANTS: Record<
  string,
  'default' | 'success' | 'warning' | 'destructive' | 'muted'
> = {
  PENDING: 'muted',
  IN_PROGRESS: 'warning',
  APPROVED: 'success',
  REJECTED: 'destructive',
  DONE: 'success',
  PASSED: 'success',
  FAILED: 'destructive',
  IN_PROGRESS_PLAN: 'warning',
  CURRENT: 'default',
  UPCOMING: 'muted',
  MISSED: 'destructive',
};

/** `student.status_<STATUS>` yorlig'i bilan belgi. */
export function StatusBadge({ status }: { status: string }) {
  const t = useTranslations();
  return (
    <Badge variant={REQUEST_VARIANTS[status] ?? 'muted'}>{t(`student.status_${status}`)}</Badge>
  );
}

export function formatDate(value: string | Date | null | undefined, locale: string): string {
  if (!value) return '—';
  return new Date(value).toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
