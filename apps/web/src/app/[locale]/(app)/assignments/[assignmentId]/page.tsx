/**
 * Maqsad: bitta topshiriq bo'yicha baholash ish o'rni (F-06, F-08).
 *
 * Sahifa §15 ning "o'qituvchi talabani baholay oladi" mezonini yopadi:
 * topshirilgan ishlar ro'yxati, rubrika ko'rinishi va navbat bilan baholash.
 * Talaba shu sahifada o'z ishining holatini va olgan bahosini ko'radi —
 * ruxsatlar server tomonida `submission:read:own` bilan cheklanadi.
 */

'use client';

import { use, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Users, Settings2 } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { cn, deadlineColorClass, formatDateTime, localize, scoreColorClass } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  SubmissionGrader,
  type GradableAssignment,
  type GradableSubmission,
} from '@/components/grading/submission-grader';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@/components/ui/primitives';

export default function AssignmentGradingPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const isTeacher = can('submission:grade:own_course');
  const [ungradedOnly, setUngradedOnly] = useState(false);
  const [graderIndex, setGraderIndex] = useState<number | null>(null);

  const assignment = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () =>
      (
        await api.get<
          GradableAssignment & { course: { id: string; code: string; title: unknown } }
        >(`/assignments/${assignmentId}`)
      ).data,
  });

  const submissions = useQuery({
    queryKey: ['submissions', assignmentId, ungradedOnly],
    queryFn: async () => {
      const search = new URLSearchParams({ assignmentId });
      if (ungradedOnly) search.set('ungradedOnly', 'true');
      return (await api.get<GradableSubmission[]>(`/submissions?${search.toString()}`)).data;
    },
  });

  /**
   * Baholash navbati: qoralamalar chiqarib tashlanadi — ular hali topshirilmagan
   * va server ularni baholashni rad etadi (`errors.cannot_grade_draft`).
   */
  const queue = useMemo(
    () => (submissions.data ?? []).filter((row) => row.status !== 'DRAFT'),
    [submissions.data],
  );

  const gradedCount = queue.filter((row) => row.gradedAt !== null).length;

  const refresh = () => {
    void submissions.refetch();
    void assignment.refetch();
  };

  if (assignment.isError) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void assignment.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const detail = assignment.data;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/assignments">{t('assignments.title')}</Link>
        </Button>

        {assignment.isLoading || !detail ? (
          <Skeleton className="h-16" />
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-2xl font-semibold tracking-tight">
                  {localize(detail.title, locale)}
                </h1>
                <p className={cn('text-sm', deadlineColorClass(detail.dueAt))}>
                  {t('assignments.dueAt')}: {formatDateTime(detail.dueAt, locale)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isTeacher ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/assignments/${detail.id}/settings` as '/assignments'}>
                      <Settings2 className="size-4" aria-hidden="true" />
                      {t('assignments.settings')}
                    </Link>
                  </Button>
                ) : null}
                <Badge variant="muted">
                  {t('assignments.maxScore')}: {Number(detail.maxScore)}
                </Badge>
                {detail.rubric ? (
                  <Badge variant="outline">
                    {t('assignments.rubric')}: {localize(detail.rubric.title, locale, '')}
                  </Badge>
                ) : null}
                {/* Rubrikasiz topshiriq umumiy ball bilan baholanadi — yo'lni ko'rsatamiz */}
                {isTeacher ? (
                  <Button asChild size="sm" variant="ghost">
                    <Link href={`/courses/${detail.course.id}/rubrics`}>
                      {t('assignments.rubrics')}
                    </Link>
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="outline">
                  <Link href={`/courses/${detail.course.id}`}>{t('courses.backToCourse')}</Link>
                </Button>
              </div>
            </div>

            {isTeacher ? (
              <p className="text-sm text-muted-foreground">
                {t('assignments.gradedOf', { graded: gradedCount, total: queue.length })}
              </p>
            ) : null}
          </>
        )}
      </header>

      {/* --- Rubrika mezonlari: baholash mezonlari oldindan ko'rinsin --- */}
      {detail?.rubric && detail.rubric.criteria.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('assignments.rubric')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {detail.rubric.criteria.map((criterion) => (
                <li
                  key={criterion.id}
                  className="flex items-baseline justify-between gap-3 text-sm"
                >
                  <span>{localize(criterion.title, locale)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Number(criterion.maxPoints)} {t('assignments.points')}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Topshirilgan ishlar --- */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-medium">{t('assignments.submissions')}</h2>

          <div className="flex items-center gap-2">
            {isTeacher ? (
              <Button
                variant={ungradedOnly ? 'default' : 'outline'}
                size="sm"
                onClick={() => setUngradedOnly((value) => !value)}
              >
                {t('assignments.ungradedOnly')}
              </Button>
            ) : null}

            {isTeacher && queue.length > 0 ? (
              <Button size="sm" onClick={() => setGraderIndex(0)}>
                {t('assignments.gradeAll')}
              </Button>
            ) : null}
          </div>
        </div>

        {submissions.isLoading ? (
          <TableSkeleton rows={5} columns={isTeacher ? 5 : 4} />
        ) : submissions.isError ? (
          <ErrorState
            title={t('common.somethingWentWrong')}
            onRetry={() => void submissions.refetch()}
            retryLabel={t('common.retry')}
          />
        ) : (submissions.data ?? []).length === 0 ? (
          <EmptyState
            icon={<Users className="size-8" />}
            title={t('assignments.noSubmissionsTitle')}
            description={t('assignments.noSubmissionsDescription')}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                {isTeacher ? <TableHead>{t('common.name')}</TableHead> : null}
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('assignments.attempt')}</TableHead>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead className="text-end">{t('assignments.grade')}</TableHead>
                {isTeacher ? (
                  <TableHead className="text-end">{t('common.actions')}</TableHead>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {submissions.data?.map((row) => {
                const queueIndex = queue.findIndex((item) => item.id === row.id);
                return (
                  <TableRow key={row.id}>
                    {isTeacher ? (
                      <TableCell className="font-medium">
                        {row.user.profile
                          ? [row.user.profile.lastName, row.user.profile.firstName]
                              .filter(Boolean)
                              .join(' ')
                          : t('common.none')}
                      </TableCell>
                    ) : null}

                    <TableCell>
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
                      </Badge>
                    </TableCell>

                    <TableCell className="tabular-nums">{row.attemptNumber}</TableCell>

                    <TableCell className="text-muted-foreground">
                      {row.submittedAt ? formatDateTime(row.submittedAt, locale) : '—'}
                    </TableCell>

                    <TableCell className="text-end tabular-nums">
                      {row.score !== null && detail ? (
                        <span
                          className={scoreColorClass(
                            (Number(row.score) / Number(detail.maxScore)) * 100,
                          )}
                        >
                          {Number(row.score).toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">{t('grades.notGraded')}</span>
                      )}
                    </TableCell>

                    {isTeacher ? (
                      <TableCell className="text-end">
                        <Button
                          size="sm"
                          variant={row.gradedAt ? 'outline' : 'default'}
                          disabled={queueIndex < 0}
                          onClick={() => setGraderIndex(queueIndex)}
                        >
                          {row.gradedAt ? t('common.edit') : t('assignments.grade')}
                        </Button>
                      </TableCell>
                    ) : null}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </section>

      {graderIndex !== null && detail && queue.length > 0 ? (
        <SubmissionGrader
          assignment={detail}
          queue={queue}
          startIndex={graderIndex}
          onClose={() => setGraderIndex(null)}
          onGraded={refresh}
        />
      ) : null}

      {/* Talabaga topshirish yo'li — kurs sahifasida (§9: sodda talaba interfeysi) */}
      {!isTeacher && (submissions.data ?? []).length === 0 && detail ? (
        <EmptyState
          icon={<ClipboardList className="size-8" />}
          title={t('assignments.notSubmittedTitle')}
          description={t('assignments.notSubmittedDescription')}
        />
      ) : null}
    </div>
  );
}
