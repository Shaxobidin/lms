/**
 * Maqsad: topshiriq sozlamalari sahifasi (Moodle "Edit settings") — F-06.
 */

'use client';

import { use } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { Alert, Button, ErrorState, Skeleton } from '@/components/ui/primitives';
import {
  AssignmentSettingsForm,
  toAssignmentPayload,
  type AssignmentSettingsValues,
} from '@/components/course/assignment-settings-form';
import { toLocalInput } from '@/components/course/quiz-settings-form';

interface AssignmentDetail {
  id: string;
  courseId: string;
  title: LocalizedText;
  description: LocalizedText | null;
  kind: string;
  controlType: string;
  maxScore: string | number;
  dueAt: string;
  lateUntil: string | null;
  latePenaltyPercent: string | number;
  maxAttempts: number;
  rubricId: string | null;
  peerReviewEnabled: boolean;
  peerReviewCount: number;
  peerReviewDueAt: string | null;
  plagiarismCheck: boolean;
  allowedMimeTypes: string[];
  maxFileSizeMb: number;
  maxFiles: number;
  isPublished: boolean;
  _count: { submissions: number };
}

export default function AssignmentSettingsPage({
  params,
}: {
  params: Promise<{ assignmentId: string }>;
}) {
  const { assignmentId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();

  const assignment = useQuery({
    queryKey: ['assignment', assignmentId],
    queryFn: async () => (await api.get<AssignmentDetail>(`/assignments/${assignmentId}`)).data,
  });

  const save = useMutation({
    mutationFn: async (values: AssignmentSettingsValues) =>
      api.patch(`/assignments/${assignmentId}`, toAssignmentPayload(values, 'edit')),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void queryClient.invalidateQueries({ queryKey: ['assignment', assignmentId] });
    },
    onError: (error) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t.has(key) ? t(key) : t('common.somethingWentWrong'));
    },
  });

  if (assignment.isLoading) return <Skeleton className="h-96 w-full" />;
  if (assignment.isError || !assignment.data) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void assignment.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const data = assignment.data;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href={`/assignments/${assignmentId}` as '/assignments'}>
            {localize(data.title, locale)}
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">{t('assignments.settingsTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('assignments.settingsSubtitle')}</p>
      </header>

      {data._count.submissions > 0 ? (
        <Alert variant="warning">
          {t('assignments.settingsWithSubmissions', { count: data._count.submissions })}
        </Alert>
      ) : null}

      <AssignmentSettingsForm
        key={data.id}
        mode="edit"
        courseId={data.courseId}
        pending={save.isPending}
        submitLabel={t('common.save')}
        initial={{
          title: data.title ?? {},
          description: data.description ?? {},
          kind: data.kind,
          controlType: data.controlType,
          maxScore: Number(data.maxScore),
          dueAt: toLocalInput(data.dueAt),
          lateUntil: toLocalInput(data.lateUntil),
          latePenaltyPercent: Number(data.latePenaltyPercent),
          maxAttempts: data.maxAttempts,
          rubricId: data.rubricId ?? '',
          peerReviewEnabled: data.peerReviewEnabled,
          peerReviewCount: data.peerReviewCount,
          peerReviewDueAt: toLocalInput(data.peerReviewDueAt),
          plagiarismCheck: data.plagiarismCheck,
          allowedMimeTypes: data.allowedMimeTypes ?? [],
          maxFileSizeMb: data.maxFileSizeMb,
          maxFiles: data.maxFiles,
          isPublished: data.isPublished,
        }}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
