/**
 * Maqsad: HEMIS "Fan tanlov" — o'quv rejadagi tanlov fanlari uchun ochiq
 * kurslarni tanlash / bekor qilish (F-03, F-04).
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/components/ui/primitives';
import { StudentPage } from '@/components/student/student-page';

interface ElectiveCourse {
  id: string;
  code: string;
  title: LocalizedText;
  isPaid: boolean;
  priceUzs: number;
  enrolled: number;
  limit: number | null;
  teachers: string[];
  myStatus: 'ACTIVE' | 'COMPLETED' | 'PENDING_PAYMENT' | null;
}

interface Electives {
  groupName: string | null;
  curriculumCode: string | null;
  subjects: Array<{
    semesterNumber: number;
    subject: { id: string; code: string; name: LocalizedText; credits: number };
    courses: ElectiveCourse[];
  }>;
}

export default function StudentElectivesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: ['student-electives'],
    queryFn: async () => (await api.get<Electives>('/student/electives')).data,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['student-electives'] });
    void queryClient.invalidateQueries({ queryKey: ['my-courses'] });
  };
  const onError = (error: unknown) =>
    toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));

  const choose = useMutation({
    mutationFn: async (courseId: string) => api.post('/student/electives', { courseId }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      refresh();
    },
    onError,
  });
  const withdraw = useMutation({
    mutationFn: async (courseId: string) => api.delete(`/student/electives/${courseId}`),
    onSuccess: () => {
      toast.success(t('common.saved'));
      refresh();
    },
    onError,
  });

  return (
    <StudentPage
      icon={ListChecks}
      title={t('student.electivesTitle')}
      hint={t('student.electivesHint')}
    >
      {data.isLoading ? <Skeleton className="h-48 w-full" /> : null}
      {data.data && !data.data.groupName ? (
        <Alert variant="warning">{t('student.noGroup')}</Alert>
      ) : null}
      {data.data && data.data.groupName && data.data.subjects.length === 0 ? (
        <EmptyState icon={<ListChecks className="size-8" />} title={t('student.noElectives')} />
      ) : null}

      {data.data?.subjects.map((row) => (
        <Card key={`${row.subject.id}-${row.semesterNumber}`}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {localize(row.subject.name, locale)}
              <Badge variant="outline">{row.subject.code}</Badge>
              <Badge variant="muted">
                {t('student.semester', { number: row.semesterNumber })} · {row.subject.credits}{' '}
                {t('student.credits')}
              </Badge>
            </CardTitle>
            {row.courses.length === 0 ? (
              <CardDescription>{t('student.noCourses')}</CardDescription>
            ) : null}
          </CardHeader>
          {row.courses.length > 0 ? (
            <CardContent className="grid gap-3 sm:grid-cols-2">
              {row.courses.map((course) => {
                const full = course.limit !== null && course.enrolled >= course.limit;
                return (
                  <div
                    key={course.id}
                    className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
                  >
                    <div>
                      <p className="font-medium">{localize(course.title, locale)}</p>
                      <p className="text-xs text-muted-foreground">
                        {course.code}
                        {course.teachers.length > 0
                          ? ` · ${t('student.teacher')}: ${course.teachers.join(', ')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {course.limit !== null ? (
                        <span>
                          {t('student.seats', { enrolled: course.enrolled, limit: course.limit })}
                        </span>
                      ) : null}
                      {course.isPaid ? (
                        <Badge variant="warning">
                          {t('student.paid', { price: course.priceUzs.toLocaleString(locale) })}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-auto flex items-center gap-2">
                      {course.myStatus === 'PENDING_PAYMENT' ? (
                        <Badge variant="warning">{t('student.pendingPayment')}</Badge>
                      ) : course.myStatus ? (
                        <Badge variant="success">{t('student.chosen')}</Badge>
                      ) : null}
                      {course.myStatus && course.myStatus !== 'COMPLETED' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={withdraw.isPending}
                          onClick={() => withdraw.mutate(course.id)}
                        >
                          {t('student.withdraw')}
                        </Button>
                      ) : null}
                      {!course.myStatus ? (
                        <Button
                          size="sm"
                          disabled={full}
                          loading={choose.isPending}
                          onClick={() => choose.mutate(course.id)}
                        >
                          {t('student.choose')}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </CardContent>
          ) : null}
        </Card>
      ))}
    </StudentPage>
  );
}
