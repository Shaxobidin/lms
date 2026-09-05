/**
 * Maqsad: gamifikatsiya — nishonlar, XP, daraja va reyting (F-15).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Award, Trophy } from 'lucide-react';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/primitives';

interface MyAchievements {
  badges: Array<{
    awardedAt: string;
    badge: { code: string; name: unknown; description: unknown; icon: string; xpReward: number };
    course: { id: string; code: string; title: unknown } | null;
  }>;
  xp: {
    total: number;
    weekly: number;
    level: number;
    nextLevelAt: number;
    progressPercent: number;
  };
}

interface LeaderboardRow {
  rank: number;
  userId: string;
  fullName: string;
  xp: number;
  level: number;
}

export default function AchievementsPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const [period, setPeriod] = useState<'WEEK' | 'SEMESTER'>('SEMESTER');

  const mine = useQuery({
    queryKey: ['gamification', 'me'],
    queryFn: async () => (await api.get<MyAchievements>('/gamification/me')).data,
  });

  const leaderboard = useQuery({
    queryKey: ['gamification', 'leaderboard', period],
    queryFn: async () =>
      (
        await api.get<LeaderboardRow[]>(
          `/gamification/leaderboard?scope=GLOBAL&period=${period}&limit=20`,
        )
      ).data,
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('gamification.title')}</h1>
      </header>

      {mine.isLoading ? (
        <Skeleton className="h-28" />
      ) : mine.data ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('gamification.level')}
                </p>
                <p className="text-3xl font-semibold tabular-nums">{mine.data.xp.level}</p>
              </div>

              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t('gamification.xp')}
                </p>
                <p className="text-2xl font-semibold tabular-nums">{mine.data.xp.total}</p>
                <p className="text-xs text-muted-foreground">
                  {t('gamification.weeklyXp')}: {mine.data.xp.weekly}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{t('gamification.nextLevel')}</span>
                <span className="tabular-nums">
                  {mine.data.xp.total} / {mine.data.xp.nextLevelAt}
                </span>
              </div>
              <ProgressBar
                value={mine.data.xp.progressPercent}
                label={t('gamification.nextLevel')}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Award className="size-4" aria-hidden="true" />
            {t('gamification.badges')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {mine.isLoading ? (
            <Skeleton className="h-32" />
          ) : (mine.data?.badges ?? []).length === 0 ? (
            <EmptyState
              icon={<Award className="size-8" />}
              title={t('gamification.emptyTitle')}
              description={t('gamification.emptyDescription')}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.data?.badges.map((item) => (
                <div
                  key={item.badge.code}
                  className="flex gap-3 rounded-md border border-border p-3"
                >
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <Award className="size-5" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium">{localize(item.badge.name, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {localize(item.badge.description, locale, '')}
                    </p>
                    <Badge variant="muted" className="mt-1">
                      +{item.badge.xpReward} XP
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Trophy className="size-4" aria-hidden="true" />
            {t('gamification.leaderboard')}
          </CardTitle>

          <div className="flex gap-1">
            <Button
              size="sm"
              variant={period === 'WEEK' ? 'default' : 'ghost'}
              onClick={() => setPeriod('WEEK')}
            >
              {t('schedule.week')}
            </Button>
            <Button
              size="sm"
              variant={period === 'SEMESTER' ? 'default' : 'ghost'}
              onClick={() => setPeriod('SEMESTER')}
            >
              {t('org.semester')}
            </Button>
          </div>
        </CardHeader>

        <CardContent>
          {leaderboard.isLoading ? (
            <Skeleton className="h-40" />
          ) : (leaderboard.data ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {t('common.noResults')}
            </p>
          ) : (
            <ol className="space-y-1.5">
              {leaderboard.data?.map((row) => (
                <li
                  key={row.userId}
                  className="flex items-center gap-3 rounded-md border border-border p-2.5"
                >
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      row.rank <= 3 ? 'bg-primary text-primary-foreground' : 'bg-muted'
                    }`}
                  >
                    {row.rank}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">{row.fullName}</span>
                  <Badge variant="outline">
                    {t('gamification.level')} {row.level}
                  </Badge>
                  <span className="w-16 text-right text-sm font-medium tabular-nums">
                    {row.xp} XP
                  </span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
