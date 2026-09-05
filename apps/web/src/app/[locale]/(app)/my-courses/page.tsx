/**
 * Maqsad: talabaning kurslari va progressi (F-04).
 */

'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/primitives';

interface EnrolledCourse {
  id: string;
  code: string;
  title: unknown;
  description: unknown;
  status: string;
  deliveryMode: string;
  subject: { credits: number } | null;
  _count: { modules: number };
}

export default function MyCoursesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['courses', 'enrolled'],
    queryFn: async () =>
      (await api.get<EnrolledCourse[]>('/courses?onlyEnrolled=true&limit=50')).data,
  });

  const progress = useQuery({
    queryKey: ['analytics', 'student-overview'],
    queryFn: async () =>
      (
        await api.get<{
          courses: { list: Array<{ progressPercent: string | number; course: { id: string } }> };
        }>('/analytics/student-overview')
      ).data,
  });

  const progressMap = new Map(
    (progress.data?.courses.list ?? []).map((item) => [
      item.course.id,
      Number(item.progressPercent),
    ]),
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.myCourses')}</h1>
        <p className="text-sm text-muted-foreground">
          {data?.length ?? 0} {t('nav.courses').toLowerCase()}
        </p>
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-8" />}
          title={t('courses.emptyStudentTitle')}
          description={t('courses.emptyStudentDescription')}
          action={
            <Button asChild size="sm">
              <Link href="/courses">{t('nav.catalog')}</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data?.map((course) => {
            const percent = progressMap.get(course.id) ?? 0;
            return (
              <Link key={course.id} href={`/courses/${course.id}` as '/courses'}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="space-y-2.5 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{course.code}</span>
                      <Badge variant={percent >= 100 ? 'success' : 'muted'}>{percent}%</Badge>
                    </div>

                    <h2 className="line-clamp-2 font-medium leading-snug">
                      {localize(course.title, locale)}
                    </h2>

                    <ProgressBar value={percent} label={t('courses.progress')} />

                    <div className="flex flex-wrap gap-1.5">
                      <Badge variant="outline">{t(`courses.${course.deliveryMode}`)}</Badge>
                      <Badge variant="muted">
                        {course._count.modules} {t('courses.modules').toLowerCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
