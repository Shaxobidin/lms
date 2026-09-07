/**
 * Maqsad: topshiriqlar ro'yxati (F-06).
 *
 * Talaba o'z ishlarini va muddatlarni ko'radi; o'qituvchi baholanmagan
 * ishlarni bir joyda ko'rib chiqadi (§9 — o'qituvchi uchun maksimal tezlik).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { cn, deadlineColorClass, formatDateTime, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives';

interface SubmissionRow {
  id: string;
  status: string;
  score: string | null;
  submittedAt: string | null;
  gradedAt: string | null;
  similarityPercent: string | null;
  user: { id: string; profile: { firstName: string; lastName: string } | null };
  assignment: { id: string; title: unknown; maxScore: string; dueAt: string; courseId: string };
}

export default function AssignmentsPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const [ungradedOnly, setUngradedOnly] = useState(false);

  const isTeacher = can('submission:grade:own_course');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['submissions', ungradedOnly],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (ungradedOnly) params.set('ungradedOnly', 'true');
      return (await api.get<SubmissionRow[]>(`/submissions?${params.toString()}`)).data;
    },
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('assignments.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {data?.length ?? 0} {t('assignments.submissions').toLowerCase()}
          </p>
        </div>

        {isTeacher ? (
          <Button
            variant={ungradedOnly ? 'default' : 'outline'}
            size="sm"
            onClick={() => setUngradedOnly((value) => !value)}
          >
            {t('assignments.ungradedOnly')}
          </Button>
        ) : null}
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title={t('assignments.emptyTitle')}
          description={t('assignments.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          {data?.map((row) => (
            <Card key={row.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="font-medium">{localize(row.assignment.title, locale)}</h2>
                  <p className={cn('text-xs', deadlineColorClass(row.assignment.dueAt))}>
                    {t('assignments.dueAt')}: {formatDateTime(row.assignment.dueAt, locale)}
                  </p>
                  {isTeacher && row.user.profile ? (
                    <p className="text-xs text-muted-foreground">
                      {[row.user.profile.lastName, row.user.profile.firstName]
                        .filter(Boolean)
                        .join(' ')}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {row.similarityPercent && Number(row.similarityPercent) > 0 ? (
                    <Badge
                      variant={Number(row.similarityPercent) > 40 ? 'destructive' : 'muted'}
                      title={t('assignments.similarityHint')}
                    >
                      {t('assignments.similarity')}: {Number(row.similarityPercent).toFixed(0)}%
                    </Badge>
                  ) : null}

                  <Badge
                    variant={
                      row.status === 'GRADED'
                        ? 'success'
                        : row.status === 'LATE'
                          ? 'warning'
                          : row.status === 'DRAFT'
                            ? 'muted'
                            : 'default'
                    }
                  >
                    {t(`assignments.${row.status}`)}
                    {row.score !== null ? ` · ${Number(row.score).toFixed(1)}` : ''}
                  </Badge>

                  {/* Baholash ish o'rni: rubrika va navbat bilan baholash shu yerda */}
                  <Button
                    asChild
                    size="sm"
                    variant={isTeacher && !row.gradedAt ? 'default' : 'outline'}
                  >
                    <Link href={`/assignments/${row.assignment.id}`}>
                      {isTeacher ? t('assignments.grade') : t('common.more')}
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
