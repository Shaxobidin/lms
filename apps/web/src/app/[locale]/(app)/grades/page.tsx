/**
 * Maqsad: talabaning baholari va transkripti (F-08).
 */

'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { localize, scoreColorClass } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';

interface TranscriptEntry {
  courseId: string;
  credits: number;
  score: number;
  letter: string;
  gpaPoints: number;
  passed: boolean;
}

interface TranscriptData {
  semesters: Array<{
    id: string;
    entries: TranscriptEntry[];
    gpa: string | number;
    totalCredits: number;
    earnedCredits: number;
    semester: { id: string; number: number; academicYear: { name: string } };
  }>;
  cumulative: { gpa: number; totalCredits: number; earnedCredits: number };
}

interface EnrolledCourse {
  id: string;
  code: string;
  title: unknown;
}

export default function GradesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const user = useAuthStore((state) => state.user);

  const transcript = useQuery({
    queryKey: ['transcript', user?.id],
    queryFn: async () => (await api.get<TranscriptData>(`/grading/transcript/${user?.id}`)).data,
    enabled: Boolean(user?.id),
  });

  const courses = useQuery({
    queryKey: ['courses', 'enrolled-for-grades'],
    queryFn: async () =>
      (await api.get<EnrolledCourse[]>('/courses?onlyEnrolled=true&limit=50')).data,
  });

  const results = useQuery({
    queryKey: ['grades', 'current', courses.data?.map((c) => c.id).join(',')],
    queryFn: async () => {
      const list = courses.data ?? [];
      // Har bir kurs uchun joriy natija — parallel so'rovlar
      const entries = await Promise.all(
        list.map(async (course) => {
          try {
            const { data } = await api.get<{
              score: number;
              letter: string;
              passed: boolean;
              eligibleForFinal: boolean;
              breakdown: Record<string, { percent: number; weighted: number }>;
            }>(`/grading/courses/${course.id}/my-result`);
            return { course, result: data };
          } catch {
            return null;
          }
        }),
      );
      return entries.filter((item): item is NonNullable<typeof item> => item !== null);
    },
    enabled: (courses.data?.length ?? 0) > 0,
  });

  const cumulative = transcript.data?.cumulative;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('grades.title')}</h1>
      </header>

      {cumulative ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('grades.cumulativeGpa')}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {cumulative.gpa.toFixed(2)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('grades.earnedCredits')}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {cumulative.earnedCredits} / {cumulative.totalCredits}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('nav.courses')}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {courses.data?.length ?? 0}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('grades.finalScore')}</CardTitle>
        </CardHeader>
        <CardContent>
          {results.isLoading || courses.isLoading ? (
            <Skeleton className="h-40" />
          ) : (results.data ?? []).length === 0 ? (
            <EmptyState
              icon={<GraduationCap className="size-8" />}
              title={t('grades.emptyTitle')}
              description={t('grades.emptyDescription')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nav.courses')}</TableHead>
                  <TableHead className="text-center">{t('grades.JN')}</TableHead>
                  <TableHead className="text-center">{t('grades.ON')}</TableHead>
                  <TableHead className="text-center">{t('grades.YN')}</TableHead>
                  <TableHead className="text-center">{t('grades.finalScore')}</TableHead>
                  <TableHead className="text-center">{t('grades.letterGrade')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.data?.map(({ course, result }) => (
                  <TableRow key={course.id}>
                    <TableCell className="font-medium">
                      {localize(course.title, locale)}
                      <span className="ml-2 font-mono text-xs text-muted-foreground">
                        {course.code}
                      </span>
                    </TableCell>
                    {(['JN', 'ON', 'YN'] as const).map((code) => (
                      <TableCell key={code} className="text-center tabular-nums">
                        {result.breakdown?.[code]?.percent
                          ? `${result.breakdown[code].percent.toFixed(0)}%`
                          : '—'}
                      </TableCell>
                    ))}
                    <TableCell
                      className={`text-center font-medium tabular-nums ${scoreColorClass(result.score)}`}
                    >
                      {result.score.toFixed(1)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant={result.passed ? 'success' : 'destructive'}>
                        {result.letter}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {(transcript.data?.semesters ?? []).length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('grades.transcript')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {transcript.data?.semesters.map((semester) => (
              <div key={semester.id} className="rounded-md border border-border p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">
                    {semester.semester.academicYear.name} · {semester.semester.number}-
                    {t('org.semester').toLowerCase()}
                  </span>
                  <Badge variant="outline">
                    {t('grades.gpa')} {Number(semester.gpa).toFixed(2)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t('grades.earnedCredits')}: {semester.earnedCredits} / {semester.totalCredits}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
