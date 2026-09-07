/**
 * Maqsad: HEMIS "So'rovnoma" — ochiq so'rovnomalar va javob berish.
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText } from 'lucide-react';
import { toast } from 'sonner';
import { SURVEY_SCALE_MAX, type LocalizedText, type SurveyQuestion } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { StudentPage, formatDate } from '@/components/student/student-page';

interface Survey {
  id: string;
  title: LocalizedText;
  description: LocalizedText | null;
  questions: SurveyQuestion[];
  isAnonymous: boolean;
  closesAt: string | null;
  course: { id: string; title: LocalizedText } | null;
  answered: boolean;
}

export default function StudentSurveysPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const surveys = useQuery({
    queryKey: ['student-surveys'],
    queryFn: async () => (await api.get<Survey[]>('/student/surveys')).data,
  });
  const [open, setOpen] = useState<string | null>(null);

  return (
    <StudentPage
      icon={MessageSquareText}
      title={t('student.surveysTitle')}
      hint={t('student.surveysHint')}
    >
      {surveys.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {surveys.data && surveys.data.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-8" />}
          title={t('student.noSurveys')}
        />
      ) : null}
      {surveys.data?.map((survey) => (
        <Card key={survey.id}>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              {localize(survey.title, locale)}
              {survey.isAnonymous ? (
                <Badge variant="outline">{t('student.anonymous')}</Badge>
              ) : null}
              {survey.answered ? <Badge variant="success">{t('student.answered')}</Badge> : null}
            </CardTitle>
            <CardDescription>
              {survey.course ? `${localize(survey.course.title, locale)} · ` : ''}
              {survey.closesAt
                ? t('student.closesAt', { date: formatDate(survey.closesAt, locale) })
                : ''}
            </CardDescription>
            {survey.description ? (
              <div
                className="prose-lms text-sm"
                dangerouslySetInnerHTML={{ __html: localize(survey.description, locale, '') }}
              />
            ) : null}
          </CardHeader>
          <CardContent>
            {survey.answered ? null : open === survey.id ? (
              <SurveyForm survey={survey} locale={locale} onDone={() => setOpen(null)} />
            ) : (
              <Button size="sm" onClick={() => setOpen(survey.id)}>
                {t('student.answer')}
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </StudentPage>
  );
}

function SurveyForm({
  survey,
  locale,
  onDone,
}: {
  survey: Survey;
  locale: AppLocale;
  onDone: () => void;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string | number>>({});
  const submit = useMutation({
    mutationFn: async () => api.post(`/student/surveys/${survey.id}/responses`, { answers }),
    onSuccess: () => {
      toast.success(t('student.thanks'));
      void queryClient.invalidateQueries({ queryKey: ['student-surveys'] });
      onDone();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });
  const complete = survey.questions.every(
    (question) =>
      question.required === false ||
      (answers[question.id] !== undefined && answers[question.id] !== ''),
  );

  return (
    <div className="space-y-4">
      {survey.questions.map((question, index) => (
        <fieldset key={question.id} className="space-y-2">
          <legend className="text-sm font-medium">
            {index + 1}. {localize(question.text, locale)}
            {question.required !== false ? (
              <span className="ml-1 text-xs text-muted-foreground">
                ({t('student.requiredMark')})
              </span>
            ) : null}
          </legend>
          {question.type === 'SCALE' ? (
            <div className="flex flex-wrap items-center gap-2">
              {Array.from({ length: SURVEY_SCALE_MAX }, (_, i) => i + 1).map((value) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name={`${survey.id}-${question.id}`}
                    checked={answers[question.id] === value}
                    onChange={() => setAnswers({ ...answers, [question.id]: value })}
                  />
                  {value}
                </label>
              ))}
              <span className="text-xs text-muted-foreground">{t('student.scaleHint')}</span>
            </div>
          ) : null}
          {question.type === 'CHOICE' ? (
            <div className="grid gap-1.5 sm:grid-cols-2">
              {(question.options ?? []).map((option, optionIndex) => (
                <label
                  key={optionIndex}
                  className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="radio"
                    name={`${survey.id}-${question.id}`}
                    checked={answers[question.id] === optionIndex}
                    onChange={() => setAnswers({ ...answers, [question.id]: optionIndex })}
                  />
                  {localize(option, locale)}
                </label>
              ))}
            </div>
          ) : null}
          {question.type === 'TEXT' ? (
            <div className="space-y-1">
              <Label htmlFor={`${survey.id}-${question.id}`} className="sr-only">
                {localize(question.text, locale)}
              </Label>
              <Textarea
                id={`${survey.id}-${question.id}`}
                rows={3}
                value={String(answers[question.id] ?? '')}
                onChange={(event) => setAnswers({ ...answers, [question.id]: event.target.value })}
              />
            </div>
          ) : null}
        </fieldset>
      ))}
      <div className="flex gap-2">
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button loading={submit.isPending} disabled={!complete} onClick={() => submit.mutate()}>
          {t('student.submitAnswers')}
        </Button>
      </div>
    </div>
  );
}
