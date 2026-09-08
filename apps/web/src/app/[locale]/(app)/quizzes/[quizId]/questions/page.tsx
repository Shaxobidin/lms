/**
 * Maqsad: testga savollarni biriktirish — test konstruktori (F-07).
 *
 * Bu sahifa savollar banki bilan test o'rtasidagi bo'g'in: chapda bank
 * savollari, o'ngda testning joriy tarkibi. Ball va tartib shu yerda
 * belgilanadi, pool teglari esa variant generatsiyasini boshqaradi
 * (`questionsPerAttempt` bilan birga).
 *
 * Muhim cheklov: urinish boshlangan testning savollari QULFLANADI — server
 * `errors.quiz_has_attempts` qaytaradi, shuning uchun interfeys ham shu holatda
 * saqlashni to'sadi va sababi ko'rsatiladi.
 */

'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Lock, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import type { QuestionType } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '@/components/ui/primitives';
import { Select } from '@/components/ui/form-controls';

interface BankRow {
  id: string;
  title: unknown;
  _count: { questions: number };
}

interface BankQuestion {
  id: string;
  type: QuestionType;
  text: unknown;
  defaultScore: string;
  difficulty: string;
}

interface BuilderState {
  quiz: {
    id: string;
    courseId: string;
    title: unknown;
    controlType: string;
    durationMinutes: number;
    questionsPerAttempt: number;
    questionsPerPage: number;
    isPublished: boolean;
  };
  questions: Array<{
    questionId: string;
    score: string;
    position: number;
    poolTag: string | null;
    question: { id: string; type: QuestionType; text: unknown; defaultScore: string };
  }>;
  locked: boolean;
  attempts: number;
}

/** Testga biriktirilgan savol — mahalliy tahrirlash holati. */
interface SelectedQuestion {
  questionId: string;
  text: unknown;
  type: QuestionType;
  score: string;
  poolTag: string;
}

export default function QuizQuestionsPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [bankId, setBankId] = useState('');
  const [selected, setSelected] = useState<SelectedQuestion[]>([]);
  const [dirty, setDirty] = useState(false);

  const builder = useQuery({
    queryKey: ['quiz-builder', quizId],
    queryFn: async () => (await api.get<BuilderState>(`/quizzes/${quizId}/questions`)).data,
  });

  const courseId = builder.data?.quiz.courseId ?? '';
  // Banklar aynan shu kursnikilar bo'lsin: filtrsiz ro'yxatda boshqa kurslarning
  // banklari chiqib, birinchisi avtomatik tanlanib qolardi (F-07)
  const banks = useQuery({
    queryKey: ['question-banks', courseId],
    queryFn: async () => (await api.get<BankRow[]>(`/question-banks?courseId=${courseId}`)).data,
    enabled: courseId !== '',
  });

  /** Kursda bank bo'lmasa — konstruktordan chiqmasdan yaratiladi. */
  const createBank = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ id: string }>('/question-banks', {
          courseId,
          title: { [locale]: t('quizzes.questionBank') },
        })
      ).data,
    onSuccess: (bank) => {
      setBankId(bank.id);
      void banks.refetch();
      toast.success(t('common.saved'));
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });

  const questions = useQuery({
    queryKey: ['questions', bankId],
    queryFn: async () =>
      (await api.get<BankQuestion[]>(`/question-banks/${bankId}/questions`)).data,
    enabled: bankId !== '',
  });

  // Serverdagi tarkibni mahalliy holatga ko'chiramiz (faqat birinchi yuklashda)
  useEffect(() => {
    if (!builder.data) return;
    setSelected(
      builder.data.questions.map((row) => ({
        questionId: row.questionId,
        text: row.question.text,
        type: row.question.type,
        score: String(Number(row.score)),
        poolTag: row.poolTag ?? '',
      })),
    );
    setDirty(false);
  }, [builder.data]);

  // Birinchi bank avtomatik tanlanadi — o'qituvchi bitta bosishni tejaydi
  useEffect(() => {
    const first = banks.data?.[0];
    if (bankId === '' && first) setBankId(first.id);
  }, [banks.data, bankId]);

  const noBanks = banks.isSuccess && (banks.data?.length ?? 0) === 0;

  const selectedIds = useMemo(() => new Set(selected.map((item) => item.questionId)), [selected]);

  const totalScore = selected.reduce((sum, item) => sum + Number(item.score || 0), 0);
  const locked = builder.data?.locked ?? false;
  // Sahifa ajratgichlari sozlamalardagi "bir sahifada nechta savol" bo'yicha
  const perPage = Math.max(1, builder.data?.quiz.questionsPerPage ?? 1);

  const add = (question: BankQuestion) => {
    if (selectedIds.has(question.id) || selected.length >= 300) return;
    setSelected((state) => [
      ...state,
      {
        questionId: question.id,
        text: question.text,
        type: question.type,
        score: String(Number(question.defaultScore)),
        poolTag: '',
      },
    ]);
    setDirty(true);
  };

  const remove = (questionId: string) => {
    setSelected((state) => state.filter((item) => item.questionId !== questionId));
    setDirty(true);
  };

  const patch = (questionId: string, changes: Partial<SelectedQuestion>) => {
    setSelected((state) =>
      state.map((item) => (item.questionId === questionId ? { ...item, ...changes } : item)),
    );
    setDirty(true);
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    const next = [...selected];
    const current = next[index];
    const swapped = next[target];
    if (!current || !swapped) return;
    next[index] = swapped;
    next[target] = current;
    setSelected(next);
    setDirty(true);
  };

  /**
   * Pool teglari `poolSelection` ni hosil qiladi: har bir tegdan nechta savol
   * olinishi testning `questionsPerAttempt` sozlamasiga qarab teng taqsimlanadi.
   * Teg berilmagan savollar har doim tushadi.
   */
  const save = useMutation({
    mutationFn: async () => {
      const tags = [...new Set(selected.map((item) => item.poolTag.trim()).filter(Boolean))];
      const perTag = builder.data?.quiz.questionsPerAttempt ?? 0;

      return api.post(`/quizzes/${quizId}/questions`, {
        questions: selected.map((item, index) => ({
          questionId: item.questionId,
          score: Number(item.score),
          position: index,
          ...(item.poolTag.trim() ? { poolTag: item.poolTag.trim() } : {}),
        })),
        poolSelection:
          perTag > 0 && tags.length > 0
            ? tags.map((poolTag) => ({
                poolTag,
                take: Math.max(1, Math.floor(perTag / tags.length)),
              }))
            : [],
      });
    },
    onSuccess: () => {
      toast.success(t('quizzes.questionsSaved'));
      setDirty(false);
      void builder.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  if (builder.isError) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void builder.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        {builder.data ? (
          <Button asChild variant="ghost" size="sm" className="-ms-3">
            <Link href={`/courses/${builder.data.quiz.courseId}`}>{t('courses.backToCourse')}</Link>
          </Button>
        ) : null}

        {builder.isLoading || !builder.data ? (
          <Skeleton className="h-14" />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {localize(builder.data.quiz.title, locale)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {selected.length} {t('quizzes.question').toLowerCase()} · {t('quizzes.totalScore')}:{' '}
                {totalScore.toFixed(1)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline">
                <Link href={`/quizzes/${quizId}/settings` as '/quizzes'}>
                  <Settings2 className="size-4" aria-hidden="true" />
                  {t('quizzes.settings')}
                </Link>
              </Button>
              <Button
                loading={save.isPending}
                disabled={locked || !dirty || selected.length === 0}
                onClick={() => save.mutate()}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </header>

      {locked ? (
        <Alert variant="warning" title={t('quizzes.lockedTitle')}>
          <span className="inline-flex items-center gap-2">
            <Lock className="size-4" aria-hidden="true" />
            {t('quizzes.lockedDescription', { attempts: builder.data?.attempts ?? 0 })}
          </span>
        </Alert>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* --- Bank savollari --- */}
        <Card>
          <CardHeader className="space-y-2">
            <CardTitle>{t('quizzes.questionBank')}</CardTitle>
            <Select
              value={bankId}
              aria-label={t('quizzes.questionBank')}
              disabled={banks.isLoading}
              onChange={(event) => setBankId(event.target.value)}
            >
              <option value="">{t('common.none')}</option>
              {banks.data?.map((bank) => (
                <option key={bank.id} value={bank.id}>
                  {localize(bank.title, locale, '')} ({bank._count.questions})
                </option>
              ))}
            </Select>
          </CardHeader>

          <CardContent className="space-y-2">
            {bankId === '' ? (
              <EmptyState
                title={noBanks ? t('quizzes.noBankForCourse') : t('quizzes.selectBankTitle')}
                description={
                  noBanks ? t('quizzes.noBankForCourseHint') : t('quizzes.selectBankDescription')
                }
                action={
                  noBanks ? (
                    <Button
                      size="sm"
                      loading={createBank.isPending}
                      onClick={() => createBank.mutate()}
                    >
                      {t('quizzes.createBank')}
                    </Button>
                  ) : (
                    <Button asChild size="sm" variant="outline">
                      <Link href="/question-banks">{t('quizzes.questionBank')}</Link>
                    </Button>
                  )
                }
              />
            ) : questions.isLoading ? (
              <Skeleton className="h-40" />
            ) : (questions.data ?? []).length === 0 ? (
              <EmptyState
                title={t('quizzes.noQuestionsTitle')}
                description={t('quizzes.noQuestionsDescription')}
                action={
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/question-banks/${bankId}`}>{t('quizzes.addQuestion')}</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto">
                {questions.data?.map((question) => {
                  const already = selectedIds.has(question.id);
                  return (
                    <li
                      key={question.id}
                      className="flex items-center gap-2 rounded-md border border-border p-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div
                          className="prose-lms line-clamp-1 text-sm"
                          dangerouslySetInnerHTML={{
                            __html: localize(question.text, locale, ''),
                          }}
                        />
                        <Badge variant="outline">{t(`quizzes.${question.type}`)}</Badge>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        aria-label={t('common.add')}
                        disabled={already || locked}
                        onClick={() => add(question)}
                      >
                        <ArrowRight className="size-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* --- Testning tarkibi --- */}
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.quizContent')}</CardTitle>
          </CardHeader>

          <CardContent className="space-y-2">
            {selected.length === 0 ? (
              <EmptyState
                title={t('quizzes.emptyQuizTitle')}
                description={t('quizzes.emptyQuizDescription')}
              />
            ) : (
              <ol className="max-h-[28rem] space-y-1.5 overflow-y-auto">
                {selected.map((item, index) => (
                  <li
                    key={item.questionId}
                    className="space-y-2 rounded-md border border-border p-2"
                  >
                    {index % perPage === 0 ? (
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('quizzes.pageBreak', { page: Math.floor(index / perPage) + 1 })}
                      </p>
                    ) : null}
                    <div className="flex items-start gap-2">
                      <span className="w-5 shrink-0 pt-1 text-xs tabular-nums text-muted-foreground">
                        {index + 1}.
                      </span>
                      <div
                        className="prose-lms min-w-0 flex-1 line-clamp-1 text-sm"
                        dangerouslySetInnerHTML={{ __html: localize(item.text, locale, '') }}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        aria-label={t('common.moveUp')}
                        disabled={index === 0 || locked}
                        onClick={() => move(index, -1)}
                      >
                        ↑
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        aria-label={t('common.moveDown')}
                        disabled={index === selected.length - 1 || locked}
                        onClick={() => move(index, 1)}
                      >
                        ↓
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 shrink-0"
                        aria-label={t('common.delete')}
                        disabled={locked}
                        onClick={() => remove(item.questionId)}
                      >
                        <ArrowLeft className="size-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-2 ps-7">
                      <Input
                        type="number"
                        min={0.1}
                        max={100}
                        step="0.5"
                        className="h-8 w-20"
                        aria-label={`${t('quizzes.score')} ${index + 1}`}
                        value={item.score}
                        disabled={locked}
                        onChange={(event) => patch(item.questionId, { score: event.target.value })}
                      />
                      <Input
                        className="h-8"
                        placeholder={t('quizzes.poolTag')}
                        aria-label={`${t('quizzes.poolTag')} ${index + 1}`}
                        value={item.poolTag}
                        disabled={locked}
                        onChange={(event) =>
                          patch(item.questionId, { poolTag: event.target.value })
                        }
                      />
                    </div>
                  </li>
                ))}
              </ol>
            )}

            {builder.data && builder.data.quiz.questionsPerAttempt > 0 ? (
              <p className="text-xs text-muted-foreground">
                {t('quizzes.poolHint', { count: builder.data.quiz.questionsPerAttempt })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
