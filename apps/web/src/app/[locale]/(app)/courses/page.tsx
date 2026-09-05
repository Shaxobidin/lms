/**
 * Maqsad: kurslar katalogi (F-04).
 *
 * Ro'yxat cursor pagination bilan yuklanadi (§8) va rolga qarab filtrlanadi —
 * backend allaqachon scope bo'yicha cheklaydi, frontend qo'shimcha filtr beradi.
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useInfiniteQuery } from '@tanstack/react-query';
import { BookOpen, Plus, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '@/components/ui/primitives';

interface CourseListItem {
  id: string;
  code: string;
  title: unknown;
  description: unknown;
  type: string;
  status: string;
  deliveryMode: string;
  academicHours: number;
  department: { id: string; name: unknown } | null;
  subject: { id: string; code: string; name: unknown; credits: number } | null;
  teachers: Array<{
    role: string;
    user: { id: string; profile: { firstName: string; lastName: string } | null };
  }>;
  _count: { enrollments: number; modules: number };
}

export default function CoursesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const canCreate = can('course:create:own') || can('course:create:own_department');

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['courses', search, statusFilter],
      initialPageParam: '',
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '20' });
        if (search) params.set('search', search);
        if (statusFilter) params.set('status', statusFilter);
        if (pageParam) params.set('cursor', String(pageParam));

        const result = await api.get<CourseListItem[]>(`/courses?${params.toString()}`);
        return { items: result.data, nextCursor: result.meta?.nextCursor ?? null };
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const courses = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('courses.title')}</h1>
          <p className="text-sm text-muted-foreground">
            {courses.length} {t('common.showing').toLowerCase()}
          </p>
        </div>

        {canCreate ? (
          <Button asChild>
            <Link href="/courses/new">
              <Plus className="size-4" aria-hidden="true" />
              {t('courses.createCourse')}
            </Link>
          </Button>
        ) : null}
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('common.search')}
            className="pl-8"
            aria-label={t('common.search')}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label={t('common.status')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('common.all')}</option>
          <option value="PUBLISHED">{t('courses.PUBLISHED')}</option>
          <option value="DRAFT">{t('courses.DRAFT')}</option>
          <option value="ARCHIVED">{t('courses.ARCHIVED')}</option>
        </select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void refetch()}
          retryLabel={t('common.retry')}
        />
      ) : courses.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title={t('courses.emptyTitle')}
          description={t('courses.emptyDescription')}
          action={
            canCreate ? (
              <Button asChild size="sm">
                <Link href="/courses/new">{t('courses.createCourse')}</Link>
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((course) => (
              <Link key={course.id} href={`/courses/${course.id}` as '/courses'}>
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardContent className="space-y-2 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{course.code}</span>
                      <Badge
                        variant={
                          course.status === 'PUBLISHED'
                            ? 'success'
                            : course.status === 'DRAFT'
                              ? 'warning'
                              : 'muted'
                        }
                      >
                        {t(`courses.${course.status}`)}
                      </Badge>
                    </div>

                    <h2 className="line-clamp-2 font-medium leading-snug">
                      {localize(course.title, locale)}
                    </h2>

                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {localize(course.description, locale, '')}
                    </p>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Badge variant="outline">{t(`courses.${course.deliveryMode}`)}</Badge>
                      {course.subject ? (
                        <Badge variant="outline">
                          {course.subject.credits} {t('courses.credits').toLowerCase()}
                        </Badge>
                      ) : null}
                      <Badge variant="muted">
                        {course._count.enrollments} {t('dashboard.students').toLowerCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>

          {hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void fetchNextPage()}
                loading={isFetchingNextPage}
              >
                {t('common.more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
