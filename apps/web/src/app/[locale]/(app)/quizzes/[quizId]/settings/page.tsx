/**
 * Maqsad: test sozlamalari sahifasi (Moodle "Edit settings") — F-07.
 * Savollar konstruktori alohida (`/quizzes/[quizId]/questions`), bu yerda
 * vaqt, baho, joylashuv, xatti-harakat va nashr sozlanadi.
 */

'use client';

import { use } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { Alert, Button, ErrorState, Skeleton } from '@/components/ui/primitives';
import {
  QuizSettingsForm,
  toLocalInput,
  toQuizPayload,
  type QuizSettingsValues,
} from '@/components/course/quiz-settings-form';

interface QuizSettings {
  id: string;
  courseId: string;
  title: LocalizedText;
  description: LocalizedText | null;
  controlType: string;
  durationMinutes: number;
  maxAttempts: number;
  gradingMethod: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  questionsPerAttempt: number;
  opensAt: string | null;
  closesAt: string | null;
  passScore: string | number;
  proctoringEnabled: boolean;
  showAnswers: string;
  questionsPerPage: number;
  allowBacktrack: boolean;
  isPublished: boolean;
  attempts: number;
}

export default function QuizSettingsPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();

  const quiz = useQuery({
    queryKey: ['quiz-settings', quizId],
    queryFn: async () => (await api.get<QuizSettings>(`/quizzes/${quizId}`)).data,
  });

  const save = useMutation({
    mutationFn: async (values: QuizSettingsValues) =>
      api.patch(`/quizzes/${quizId}`, toQuizPayload(values)),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void queryClient.invalidateQueries({ queryKey: ['quiz-settings', quizId] });
      void queryClient.invalidateQueries({ queryKey: ['quiz-builder', quizId] });
    },
    onError: (error) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t.has(key) ? t(key) : t('common.somethingWentWrong'));
    },
  });

  if (quiz.isLoading) return <Skeleton className="h-96 w-full" />;
  if (quiz.isError || !quiz.data) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void quiz.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const data = quiz.data;

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href={`/courses/${data.courseId}` as '/courses'}>{t('courses.backToCourse')}</Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {localize(data.title, locale)}
            </h1>
            <p className="text-sm text-muted-foreground">{t('quizzes.settingsSubtitle')}</p>
          </div>
          <Button asChild variant="outline">
            <Link href={`/quizzes/${quizId}/questions` as '/quizzes'}>
              <ListChecks className="size-4" aria-hidden="true" />
              {t('quizzes.editQuestions')}
            </Link>
          </Button>
        </div>
      </header>

      {data.attempts > 0 ? (
        <Alert variant="warning" title={t('quizzes.lockedTitle')}>
          {t('quizzes.settingsWithAttempts', { attempts: data.attempts })}
        </Alert>
      ) : null}

      <QuizSettingsForm
        key={data.id}
        mode="edit"
        courseId={data.courseId}
        pending={save.isPending}
        submitLabel={t('common.save')}
        initial={{
          title: data.title ?? {},
          description: data.description ?? {},
          controlType: data.controlType,
          durationMinutes: data.durationMinutes,
          maxAttempts: data.maxAttempts,
          gradingMethod: data.gradingMethod,
          shuffleQuestions: data.shuffleQuestions,
          shuffleOptions: data.shuffleOptions,
          questionsPerAttempt: data.questionsPerAttempt,
          opensAt: toLocalInput(data.opensAt),
          closesAt: toLocalInput(data.closesAt),
          passScore: Number(data.passScore),
          proctoringEnabled: data.proctoringEnabled,
          showAnswers: data.showAnswers,
          questionsPerPage: data.questionsPerPage,
          allowBacktrack: data.allowBacktrack,
          isPublished: data.isPublished,
        }}
        onSubmit={(values) => save.mutate(values)}
      />
    </div>
  );
}
