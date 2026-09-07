/**
 * Maqsad: HEMIS "Yakuniy" — har bir kurs bo'yicha JN+ON natijasi, yakuniyga
 * kirish huquqi va YN imtihonlari (F-07, F-08).
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { GraduationCap } from 'lucide-react';
import type { LocalizedText } from '@lms/shared';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/components/ui/primitives';
import { StudentPage, formatDate } from '@/components/student/student-page';

interface Finals {
  courses: Array<{
    course: { id: string; code: string; title: LocalizedText };
    eligibleForFinal: boolean;
    breakdown: Record<string, { percent: number; weighted: number }>;
    score: number;
    passed: boolean;
    letter: string;
    exams: Array<{
      id: string;
      title: LocalizedText;
      opensAt: string | null;
      closesAt: string | null;
      durationMinutes: number;
      maxAttempts: number;
      passScore: number;
      attemptsUsed: number;
      bestScore: number | null;
    }>;
  }>;
}

export default function StudentFinalsPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const data = useQuery({
    queryKey: ['student-finals'],
    queryFn: async () => (await api.get<Finals>('/student/finals')).data,
  });

  return (
    <StudentPage
      icon={GraduationCap}
      title={t('student.finalsTitle')}
      hint={t('student.finalsHint')}
    >
      {data.isLoading ? <Skeleton className="h-48 w-full" /> : null}
      {data.data && data.data.courses.length === 0 ? (
        <EmptyState
          icon={<GraduationCap className="size-8" />}
          title={t('student.noEnrolledCourses')}
        />
      ) : null}
      {data.data?.courses.map((row) => (
        <Card key={row.course.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {localize(row.course.title, locale)}
              <Badge variant="outline">{row.course.code}</Badge>
              {row.eligibleForFinal ? (
                <Badge variant="success">{t('student.eligible')}</Badge>
              ) : (
                <Badge variant="warning">{t('student.notEligible')}</Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {Object.entries(row.breakdown)
                .map(([code, part]) => `${code}: ${part.percent}%`)
                .join(' · ')}{' '}
              · {t('student.currentScore')}: {row.score} ({row.letter})
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {row.exams.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('student.noExams')}</p>
            ) : (
              row.exams.map((exam) => (
                <div
                  key={exam.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3 text-sm"
                >
                  <div>
                    <p className="font-medium">{localize(exam.title, locale)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('student.opens')}: {formatDate(exam.opensAt, locale)} ·{' '}
                      {t('student.closes')}: {formatDate(exam.closesAt, locale)} ·{' '}
                      {exam.durationMinutes} {t('courses.minutes')} · {exam.attemptsUsed}/
                      {exam.maxAttempts} {t('student.attempts')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {exam.bestScore !== null ? (
                      <Badge variant={exam.bestScore >= exam.passScore ? 'success' : 'destructive'}>
                        {t('student.bestScore')}: {exam.bestScore}
                      </Badge>
                    ) : null}
                    {row.eligibleForFinal && exam.attemptsUsed < exam.maxAttempts ? (
                      <Button asChild size="sm">
                        <Link href={`/quizzes/${exam.id}` as '/quizzes'}>
                          {t('student.goToExam')}
                        </Link>
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      ))}
    </StudentPage>
  );
}
