/**
 * Maqsad: so'rovnomalarni boshqarish — yaratish, nashr qilish, natijalar
 * (HEMIS "So'rovnoma" ning xodim tomoni).
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquareText, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText, SurveyQuestion } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { SwitchField } from '@/components/ui/form-controls';
import { StudentPage, formatDate } from '@/components/student/student-page';

interface SurveyRow {
  id: string;
  title: LocalizedText;
  isPublished: boolean;
  isAnonymous: boolean;
  closesAt: string | null;
  createdAt: string;
  _count: { responses: number };
}

interface SurveyResults {
  total: number;
  questions: Array<
    SurveyQuestion & {
      answers?: string[];
      count?: number;
      average?: number | null;
      distribution?: Record<string, number>;
    }
  >;
}

/** "matn | SCALE" / "matn | CHOICE | a; b" / "matn | TEXT" qatorlarini savollarga aylantiradi. */
function parseQuestions(raw: string): SurveyQuestion[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [text = '', type = 'SCALE', options = ''] = line.split('|').map((part) => part.trim());
      const kind = (
        ['SCALE', 'CHOICE', 'TEXT'].includes(type.toUpperCase()) ? type.toUpperCase() : 'SCALE'
      ) as SurveyQuestion['type'];
      return {
        id: `q${index + 1}`,
        text: { 'uz-Latn': text },
        type: kind,
        required: true,
        ...(kind === 'CHOICE'
          ? {
              options: options
                .split(';')
                .map((option) => option.trim())
                .filter(Boolean)
                .map((option) => ({ 'uz-Latn': option })),
            }
          : {}),
      };
    });
}

export default function StaffSurveysPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const surveys = useQuery({
    queryKey: ['staff-surveys'],
    queryFn: async () => (await api.get<SurveyRow[]>('/surveys')).data,
  });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    questions: '',
    publish: true,
    anonymous: true,
  });
  const [resultsFor, setResultsFor] = useState<string | null>(null);

  const onError = (error: unknown) =>
    toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
  const create = useMutation({
    mutationFn: async () =>
      api.post('/surveys', {
        title: { 'uz-Latn': form.title.trim() },
        description: form.description.trim()
          ? { 'uz-Latn': `<p>${form.description.trim()}</p>` }
          : undefined,
        questions: parseQuestions(form.questions),
        audienceRoles: ['STUDENT'],
        isAnonymous: form.anonymous,
        isPublished: form.publish,
      }),
    onSuccess: () => {
      toast.success(t('student.surveyCreated'));
      setShowForm(false);
      setForm({ title: '', description: '', questions: '', publish: true, anonymous: true });
      void queryClient.invalidateQueries({ queryKey: ['staff-surveys'] });
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: async (input: { id: string; isPublished: boolean }) =>
      api.patch(`/surveys/${input.id}`, { isPublished: input.isPublished }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['staff-surveys'] }),
    onError,
  });
  const results = useQuery({
    queryKey: ['survey-results', resultsFor],
    queryFn: async () => (await api.get<SurveyResults>(`/surveys/${resultsFor}/results`)).data,
    enabled: Boolean(resultsFor),
  });

  const parsed = parseQuestions(form.questions);

  return (
    <StudentPage
      icon={MessageSquareText}
      title={t('student.staffSurveysTitle')}
      hint={t('student.staffSurveysHint')}
    >
      {!showForm ? (
        <Button onClick={() => setShowForm(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('student.createSurvey')}
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('student.createSurvey')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="survey-title" required>
                {t('student.surveyTitle')}
              </Label>
              <Input
                id="survey-title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="survey-description">{t('student.surveyDescription')}</Label>
              <Input
                id="survey-description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="survey-questions" required>
                {t('student.questions')}
              </Label>
              <Textarea
                id="survey-questions"
                rows={6}
                value={form.questions}
                onChange={(e) => setForm({ ...form, questions: e.target.value })}
                placeholder={
                  "Darslar sifati | SCALE\nTa'lim shakli | CHOICE | An'anaviy; Aralash; Masofaviy\nTakliflar | TEXT"
                }
              />
              <p className="text-xs text-muted-foreground">{t('student.questionsHint')}</p>
            </div>
            <SwitchField
              id="survey-anonymous"
              label={t('student.anonymous')}
              checked={form.anonymous}
              onCheckedChange={(anonymous) => setForm({ ...form, anonymous })}
            />
            <SwitchField
              id="survey-publish"
              label={t('student.publishNow')}
              checked={form.publish}
              onCheckedChange={(publish) => setForm({ ...form, publish })}
            />
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={create.isPending}
                disabled={form.title.trim().length < 2 || parsed.length === 0}
                onClick={() => create.mutate()}
              >
                {t('common.add')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {surveys.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {surveys.data && surveys.data.length === 0 ? (
        <EmptyState
          icon={<MessageSquareText className="size-8" />}
          title={t('student.noSurveys')}
        />
      ) : null}
      <div className="space-y-3">
        {(surveys.data ?? []).map((survey) => (
          <Card key={survey.id}>
            <CardContent className="space-y-3 pt-6 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{localize(survey.title, locale)}</span>
                <Badge variant={survey.isPublished ? 'success' : 'muted'}>
                  {survey.isPublished ? t('student.published') : t('student.draft')}
                </Badge>
                {survey.isAnonymous ? (
                  <Badge variant="outline">{t('student.anonymous')}</Badge>
                ) : null}
                <span className="text-xs text-muted-foreground">
                  {survey._count.responses} {t('student.responses')} ·{' '}
                  {formatDate(survey.createdAt, locale)}
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  loading={toggle.isPending}
                  onClick={() => toggle.mutate({ id: survey.id, isPublished: !survey.isPublished })}
                >
                  {survey.isPublished ? t('student.unpublish') : t('student.publish')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setResultsFor(resultsFor === survey.id ? null : survey.id)}
                >
                  {t('student.results')}
                </Button>
              </div>
              {resultsFor === survey.id && results.data ? (
                <div className="space-y-2 border-t border-border pt-3">
                  {results.data.total === 0 ? (
                    <p className="text-muted-foreground">{t('student.noResponses')}</p>
                  ) : null}
                  {results.data.questions.map((question) => (
                    <div key={question.id} className="rounded-md border border-border p-2">
                      <p className="font-medium">{localize(question.text, locale)}</p>
                      {question.type === 'TEXT' ? (
                        <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                          {(question.answers ?? []).map((answer, index) => (
                            <li key={index}>{answer}</li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {question.type === 'SCALE'
                            ? `${t('student.average')}: ${question.average ?? '—'} · `
                            : ''}
                          {t('student.distribution')}:{' '}
                          {Object.entries(question.distribution ?? {})
                            .map(([value, count]) =>
                              question.type === 'CHOICE'
                                ? `${localize(question.options?.[Number(value)] ?? {}, locale, value)}: ${count}`
                                : `${value}: ${count}`,
                            )
                            .join(', ') || '—'}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>
    </StudentPage>
  );
}
