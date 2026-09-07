/**
 * Maqsad: HEMIS "Qayta o'qish" — o'tish balidan past kurslar va qayta o'qishga
 * ariza (F-08, F-14).
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { StatusBadge, StudentPage } from '@/components/student/student-page';

interface Retakes {
  passingScore: number;
  courses: Array<{
    course: { id: string; code: string; title: LocalizedText };
    score: number;
    letter: string;
    eligibleForFinal: boolean;
    request: { id: string; status: string; createdAt: string } | null;
  }>;
}

export default function StudentRetakesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const data = useQuery({
    queryKey: ['student-retakes'],
    queryFn: async () => (await api.get<Retakes>('/student/retakes')).data,
  });
  const apply = useMutation({
    mutationFn: async (course: { id: string; title: LocalizedText }) =>
      api.post('/student/requests', {
        type: 'RETAKE',
        courseId: course.id,
        subject: `${t('student.type_RETAKE')}: ${localize(course.title, locale)}`,
      }),
    onSuccess: () => {
      toast.success(t('student.requestCreated'));
      void queryClient.invalidateQueries({ queryKey: ['student-retakes'] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });

  return (
    <StudentPage
      icon={RotateCcw}
      title={t('student.retakesTitle')}
      hint={t('student.retakesHint', { score: data.data?.passingScore ?? 60 })}
    >
      {data.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {data.data && data.data.courses.length === 0 ? (
        <EmptyState icon={<RotateCcw className="size-8" />} title={t('student.noRetakes')} />
      ) : null}
      {data.data && data.data.courses.length > 0 ? (
        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('nav.courses')}</TableHead>
                  <TableHead>{t('student.currentScore')}</TableHead>
                  <TableHead>{t('student.requestStatus')}</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.courses.map((row) => (
                  <TableRow key={row.course.id}>
                    <TableCell>
                      <p className="font-medium">{localize(row.course.title, locale)}</p>
                      <p className="text-xs text-muted-foreground">{row.course.code}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="destructive">
                        {row.score} ({row.letter})
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {row.request ? <StatusBadge status={row.request.status} /> : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {!row.request ||
                      row.request.status === 'REJECTED' ||
                      row.request.status === 'DONE' ? (
                        <Button
                          size="sm"
                          loading={apply.isPending}
                          onClick={() => apply.mutate(row.course)}
                        >
                          {t('student.applyRetake')}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : null}
    </StudentPage>
  );
}
