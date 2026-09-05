/**
 * Maqsad: haftalik dars jadvali (F-09).
 */

'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays } from 'lucide-react';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives';

interface ScheduleRow {
  id: string;
  weekday: number;
  startsAt: string;
  endsAt: string;
  room: string | null;
  lessonType: string;
  course: { id: string; code: string; title: unknown };
  group: { id: string; name: string };
}

const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

export default function SchedulePage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['schedule'],
    queryFn: async () => (await api.get<ScheduleRow[]>('/schedule')).data,
  });

  const byDay = DAY_KEYS.map((key, index) => ({
    key,
    weekday: index + 1,
    items: (data ?? [])
      .filter((row) => row.weekday === index + 1)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt)),
  }));

  const hasAny = (data ?? []).length > 0;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('schedule.title')}</h1>
      </header>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void refetch()}
          retryLabel={t('common.retry')}
        />
      ) : !hasAny ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title={t('schedule.emptyTitle')}
          description={t('schedule.emptyDescription')}
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {byDay
            .filter((day) => day.items.length > 0)
            .map((day) => (
              <Card key={day.key}>
                <CardContent className="p-4">
                  <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-muted-foreground">
                    {t(`schedule.${day.key}`)}
                  </h2>

                  <ul className="space-y-2">
                    {day.items.map((item) => (
                      <li key={item.id} className="rounded-md border border-border p-2.5 text-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-mono text-xs tabular-nums text-muted-foreground">
                            {item.startsAt}–{item.endsAt}
                          </span>
                          <Badge variant="outline">{t(`attendance.${item.lessonType}`)}</Badge>
                        </div>

                        <p className="mt-1 font-medium leading-snug">
                          {localize(item.course.title, locale)}
                        </p>

                        <p className="text-xs text-muted-foreground">
                          {item.group.name}
                          {item.room ? ` · ${item.room}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
        </div>
      )}
    </div>
  );
}
