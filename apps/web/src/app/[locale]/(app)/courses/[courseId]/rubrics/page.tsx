/**
 * Maqsad: kurs rubrikalari — ro'yxat, yaratish, tahrirlash, o'chirish (F-06).
 *
 * Rubrika kursga tegishli, shuning uchun sahifa kurs ostida turadi. Bu yerdan
 * yaratilgan rubrika topshiriq yaratishda tanlanadi va baholash oynasida
 * mezonlar bo'yicha ball qo'yishga aylanadi.
 */

'use client';

import { use, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ListChecks, Lock, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { RubricEditor, type EditableRubric } from '@/components/grading/rubric-editor';
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
} from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface RubricRow extends EditableRubric {
  totalPoints: number;
  _count: { assignments: number };
}

export default function CourseRubricsPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const canManage = can('rubric:manage:own_course');

  const [editing, setEditing] = useState<RubricRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<RubricRow | null>(null);

  const rubrics = useQuery({
    queryKey: ['rubrics', courseId],
    queryFn: async () => (await api.get<RubricRow[]>(`/courses/${courseId}/rubrics`)).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/rubrics/${id}`),
    onSuccess: () => {
      toast.success(t('assignments.rubricDeleted'));
      setRemoving(null);
      void rubrics.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href={`/courses/${courseId}`}>{t('courses.backToCourse')}</Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('assignments.rubrics')}</h1>
            <p className="text-sm text-muted-foreground">{t('assignments.rubricsHint')}</p>
          </div>

          {canManage ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="size-4" />
              {t('assignments.createRubric')}
            </Button>
          ) : null}
        </div>
      </header>

      {rubrics.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
      ) : rubrics.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void rubrics.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (rubrics.data ?? []).length === 0 ? (
        <EmptyState
          icon={<ListChecks className="size-8" />}
          title={t('assignments.noRubricsTitle')}
          description={t('assignments.noRubricsDescription')}
          action={
            canManage ? (
              <Button onClick={() => setEditing('new')}>{t('assignments.createRubric')}</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rubrics.data?.map((rubric) => (
            <Card key={rubric.id}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <CardTitle>{localize(rubric.title, locale)}</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {rubric.criteria.length} {t('assignments.criteria').toLowerCase()} ·{' '}
                    {t('assignments.rubricTotal')}: {rubric.totalPoints}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {rubric.locked ? (
                    <Badge variant="warning" title={t('assignments.rubricLockedDescription')}>
                      <Lock className="me-1 size-3" aria-hidden="true" />
                      {t('assignments.rubricLockedTitle')}
                    </Badge>
                  ) : null}

                  <Badge variant="muted">
                    {t('assignments.usedBy', { count: rubric._count.assignments })}
                  </Badge>

                  {canManage ? (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setEditing(rubric)}>
                        {t('common.edit')}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={rubric._count.assignments > 0}
                        title={
                          rubric._count.assignments > 0
                            ? t('assignments.rubricInUseHint')
                            : undefined
                        }
                        onClick={() => setRemoving(rubric)}
                      >
                        {t('common.delete')}
                      </Button>
                    </>
                  ) : null}
                </div>
              </CardHeader>

              <CardContent>
                <ul className="space-y-1.5">
                  {rubric.criteria.map((criterion) => (
                    <li
                      key={criterion.id}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                    >
                      <span>{localize(criterion.title, locale)}</span>
                      <span className="flex items-center gap-2">
                        {/* Darajalar baholash oynasida tugmaga aylanadi */}
                        <span className="text-xs text-muted-foreground">
                          {(criterion.levels ?? [])
                            .map((level) => Number(level.points))
                            .join(' · ')}
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          {Number(criterion.maxPoints)} {t('assignments.points')}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {editing ? (
        <RubricEditor
          courseId={courseId}
          rubric={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void rubrics.refetch()}
        />
      ) : null}

      {removing ? (
        <Dialog open onOpenChange={(open) => !open && setRemoving(null)}>
          <DialogContent closeLabel={t('common.close')} size="sm">
            <DialogHeader>
              <DialogTitle>{t('courses.deleteTitle')}</DialogTitle>
              <DialogDescription>{localize(removing.title, locale)}</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p className="text-sm text-muted-foreground">
                {t('assignments.rubricDeleteWarning')}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setRemoving(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(removing.id)}
              >
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
