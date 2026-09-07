/**
 * Maqsad: test pleyeri (F-07) — talaba oqimining eng murakkab ekrani.
 *
 * Muhim jihatlar:
 *  - taymer SERVERDAN kelgan `remainingSeconds` asosida ishlaydi, mijoz soatiga
 *    ishonilmaydi; vaqt tugaganda urinish avtomatik yuboriladi;
 *  - har bir javob darhol saqlanadi (avtosaqlash) — internet uzilsa ham
 *    natija yo'qolmaydi (RSK-08);
 *  - proctoring yoqilgan bo'lsa, tab almashtirish hodisalari qayd etiladi (A-09).
 */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { AlertTriangle, Clock, Flag, Send } from 'lucide-react';
import { toast } from 'sonner';
import type { QuestionResponse } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { Select } from '@/components/ui/form-controls';
import { cn, formatDuration, localize } from '@/lib/utils';
import { useRouter, type AppLocale } from '@/i18n/routing';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Spinner,
  Textarea,
} from '@/components/ui/primitives';

interface AttemptQuestion {
  id: string;
  type: string;
  text: unknown;
  score: number;
  payload: Record<string, unknown>;
  savedResponse: QuestionResponse | null;
  flagged: boolean;
}

interface AttemptPayload {
  attemptId: string;
  attemptNumber: number;
  quiz: {
    id: string;
    title: unknown;
    questionsPerPage: number;
    allowBacktrack: boolean;
    proctoringEnabled: boolean;
  };
  maxScore: number;
  remainingSeconds: number;
  questions: AttemptQuestion[];
}

export default function QuizPlayerPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams<{ quizId: string }>();

  const [attempt, setAttempt] = useState<AttemptPayload | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, QuestionResponse>>({});
  const [flagged, setFlagged] = useState<Set<string>>(new Set());
  const [remaining, setRemaining] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [starting, setStarting] = useState(true);

  const submittedRef = useRef(false);

  // --- Urinishni boshlash ---------------------------------------------------
  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      try {
        const { data } = await api.post<AttemptPayload>(`/quizzes/${params.quizId}/attempts`);
        if (cancelled) return;

        setAttempt(data);
        setRemaining(data.remainingSeconds);
        setResponses(
          Object.fromEntries(
            data.questions
              .filter((question) => question.savedResponse)
              .map((question) => [question.id, question.savedResponse as QuestionResponse]),
          ),
        );
        setFlagged(new Set(data.questions.filter((q) => q.flagged).map((q) => q.id)));
      } catch (error) {
        if (cancelled) return;
        setStartError(
          error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'),
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    };

    void start();
    return () => {
      cancelled = true;
    };
  }, [params.quizId, t]);

  // --- Javobni saqlash (avtosaqlash) ---------------------------------------
  const saveAnswer = useMutation({
    mutationFn: async (input: {
      questionId: string;
      response: QuestionResponse;
      flagged: boolean;
    }) =>
      api.post('/attempts/answers', {
        attemptId: attempt?.attemptId,
        questionId: input.questionId,
        response: input.response,
        flagged: input.flagged,
      }),
    onError: () => {
      // Saqlanmasa foydalanuvchi bundan XABARDOR bo'lishi kerak (§16)
      toast.error(t('errors.network'));
    },
  });

  const submitAttempt = useMutation({
    mutationFn: async () =>
      api.post<{ score: number; maxScore: number; needsManualGrading: boolean }>(
        `/attempts/${attempt?.attemptId}/submit`,
      ),
    onSuccess: ({ data }) => {
      submittedRef.current = true;
      void queryClient.invalidateQueries({ queryKey: ['course'] });
      toast.success(`${t('quizzes.result')}: ${data.score} / ${data.maxScore}`);
      router.replace(`/attempts/${attempt?.attemptId}` as '/dashboard');
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  const handleSubmit = useCallback(() => {
    if (submittedRef.current || submitAttempt.isPending) return;
    submitAttempt.mutate();
  }, [submitAttempt]);

  // --- Taymer ---------------------------------------------------------------
  useEffect(() => {
    if (!attempt) return;

    const timer = setInterval(() => {
      setRemaining((value) => {
        if (value <= 1) {
          clearInterval(timer);
          // Vaqt tugadi — urinish avtomatik yuboriladi
          handleSubmit();
          return 0;
        }
        if (value === 300) toast.warning(t('quizzes.timeWarning'));
        return value - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [attempt, handleSubmit, t]);

  // --- Proctoring hooklari (A-09) ------------------------------------------
  useEffect(() => {
    if (!attempt?.quiz.proctoringEnabled) return;

    const record = (type: string) => {
      void api
        .post('/attempts/proctoring', {
          attemptId: attempt.attemptId,
          type,
          occurredAt: new Date().toISOString(),
        })
        .catch(() => undefined);
    };

    const onBlur = () => record('TAB_BLUR');
    const onFocus = () => record('TAB_FOCUS');
    const onCopy = () => record('COPY');
    const onPaste = () => record('PASTE');

    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);

    return () => {
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, [attempt]);

  // Sahifadan chiqishda ogohlantirish (§9 — saqlanmagan o'zgarishlar)
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (submittedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const updateResponse = (questionId: string, response: QuestionResponse) => {
    setResponses((previous) => ({ ...previous, [questionId]: response }));
    saveAnswer.mutate({ questionId, response, flagged: flagged.has(questionId) });
  };

  const toggleFlag = (questionId: string) => {
    setFlagged((previous) => {
      const next = new Set(previous);
      if (next.has(questionId)) next.delete(questionId);
      else next.add(questionId);

      const response = responses[questionId];
      if (response) {
        saveAnswer.mutate({ questionId, response, flagged: next.has(questionId) });
      }
      return next;
    });
  };

  if (starting) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center" role="status">
        <Spinner className="size-6 text-primary" />
        <span className="sr-only">{t('common.loading')}</span>
      </div>
    );
  }

  if (startError || !attempt) {
    return (
      <ErrorState
        title={startError ?? t('common.somethingWentWrong')}
        onRetry={() => window.location.reload()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const perPage = Math.max(1, attempt.quiz.questionsPerPage);
  const pages = Math.ceil(attempt.questions.length / perPage);
  const pageQuestions = attempt.questions.slice(pageIndex * perPage, (pageIndex + 1) * perPage);
  const answeredCount = Object.keys(responses).length;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {/* Sarlavha va taymer — sahifa aylanganda ham ko'rinib turadi */}
      <div className="sticky top-14 z-10 -mx-4 border-b border-border bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h1 className="truncate font-semibold">{localize(attempt.quiz.title, locale)}</h1>
            <p className="text-xs text-muted-foreground">
              {answeredCount} / {attempt.questions.length} · {t('quizzes.attempts')}{' '}
              {attempt.attemptNumber}
            </p>
          </div>

          <div
            className={cn(
              'flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-sm tabular-nums',
              remaining < 300
                ? 'border-destructive/40 bg-destructive/10 text-destructive'
                : 'border-border',
            )}
            role="timer"
            aria-live={remaining < 60 ? 'assertive' : 'off'}
            aria-label={t('quizzes.timeLeft')}
          >
            <Clock className="size-3.5" aria-hidden="true" />
            {formatDuration(remaining)}
          </div>
        </div>
      </div>

      {attempt.quiz.proctoringEnabled ? (
        <Alert variant="warning" title={t('quizzes.title')}>
          <span className="flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" aria-hidden="true" />
            {t('quizzes.submitConfirm')}
          </span>
        </Alert>
      ) : null}

      {pageQuestions.map((question, index) => {
        const number = pageIndex * perPage + index + 1;
        return (
          <Card key={question.id}>
            <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
              <div className="min-w-0">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="muted">
                    {t('quizzes.questionOf', { current: number, total: attempt.questions.length })}
                  </Badge>
                  <Badge variant="outline">
                    {question.score} {t('quizzes.score').toLowerCase()}
                  </Badge>
                </div>
                <CardTitle className="text-base font-normal leading-relaxed">
                  <div
                    className="prose-lms"
                    // Kontent server tomonida DOMPurify bilan tozalangan (§11)
                    dangerouslySetInnerHTML={{ __html: localize(question.text, locale, '') }}
                  />
                </CardTitle>
              </div>

              <Button
                variant={flagged.has(question.id) ? 'default' : 'ghost'}
                size="icon"
                onClick={() => toggleFlag(question.id)}
                aria-label={t('quizzes.flagQuestion')}
                aria-pressed={flagged.has(question.id)}
              >
                <Flag className="size-4" />
              </Button>
            </CardHeader>

            <CardContent>
              <QuestionInput
                question={question}
                value={responses[question.id] ?? null}
                onChange={(response) => updateResponse(question.id, response)}
                locale={locale}
              />
            </CardContent>
          </Card>
        );
      })}

      <div className="flex flex-wrap items-center justify-between gap-2 pb-8">
        <div className="flex gap-2">
          {attempt.quiz.allowBacktrack && pageIndex > 0 ? (
            <Button variant="outline" onClick={() => setPageIndex((value) => value - 1)}>
              {t('common.previous')}
            </Button>
          ) : null}

          {pageIndex < pages - 1 ? (
            <Button variant="outline" onClick={() => setPageIndex((value) => value + 1)}>
              {t('common.next')}
            </Button>
          ) : null}
        </div>

        <Button
          onClick={() => {
            if (window.confirm(t('quizzes.submitConfirm'))) handleSubmit();
          }}
          loading={submitAttempt.isPending}
        >
          <Send className="size-4" aria-hidden="true" />
          {t('quizzes.submitAttempt')}
        </Button>
      </div>
    </div>
  );
}

/**
 * Savol turiga qarab mos kirish elementini ko'rsatadi.
 * Har bir tur uchun javob formati `@lms/shared` dagi `QuestionResponse` bilan mos.
 */
function QuestionInput({
  question,
  value,
  onChange,
  locale,
}: {
  question: AttemptQuestion;
  value: QuestionResponse | null;
  onChange: (response: QuestionResponse) => void;
  locale: AppLocale;
}) {
  const t = useTranslations();
  const payload = question.payload as Record<string, unknown>;

  switch (question.type) {
    case 'SINGLE': {
      const options = (payload['options'] ?? []) as Array<{ id: string; text: unknown }>;
      const selected = value?.type === 'SINGLE' ? value.optionId : null;

      return (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">{t('quizzes.question')}</legend>
          {options.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm transition-colors',
                selected === option.id
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent',
              )}
            >
              <input
                type="radio"
                name={question.id}
                checked={selected === option.id}
                onChange={() => onChange({ type: 'SINGLE', optionId: option.id })}
                className="size-4"
              />
              <span>{localize(option.text, locale)}</span>
            </label>
          ))}
        </fieldset>
      );
    }

    case 'MULTI': {
      const options = (payload['options'] ?? []) as Array<{ id: string; text: unknown }>;
      const selected = value?.type === 'MULTI' ? value.optionIds : [];

      return (
        <fieldset className="space-y-1.5">
          <legend className="sr-only">{t('quizzes.question')}</legend>
          {options.map((option) => (
            <label
              key={option.id}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md border p-2.5 text-sm transition-colors',
                selected.includes(option.id)
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:bg-accent',
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(option.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, option.id]
                    : selected.filter((id) => id !== option.id);
                  onChange({ type: 'MULTI', optionIds: next });
                }}
                className="size-4"
              />
              <span>{localize(option.text, locale)}</span>
            </label>
          ))}
        </fieldset>
      );
    }

    case 'NUMERIC': {
      const current = value?.type === 'NUMERIC' ? value.value : null;
      const range = payload['range'] as { min: number; max: number; step: number } | undefined;
      return (
        <div className="flex flex-wrap items-center gap-2">
          {range ? (
            <input
              type="range"
              min={range.min}
              max={range.max}
              step={range.step}
              value={current ?? range.min}
              onChange={(event) => onChange({ type: 'NUMERIC', value: Number(event.target.value) })}
              className="w-56 max-w-full accent-primary"
              aria-label={t('quizzes.slider')}
            />
          ) : null}
          <Input
            type="number"
            step={range ? range.step : 'any'}
            min={range?.min}
            max={range?.max}
            value={current ?? ''}
            onChange={(event) =>
              onChange({
                type: 'NUMERIC',
                value: event.target.value === '' ? null : Number(event.target.value),
              })
            }
            className="max-w-40"
            aria-label={t('quizzes.question')}
          />
          {typeof payload['unit'] === 'string' ? (
            <span className="text-sm text-muted-foreground">{payload['unit']}</span>
          ) : null}
        </div>
      );
    }

    case 'ESSAY': {
      const current = value?.type === 'ESSAY' ? value.text : '';
      const minWords = Number(payload['minWords'] ?? 0);
      const words = current.trim() ? current.trim().split(/\s+/).length : 0;

      return (
        <div className="space-y-1.5">
          <Textarea
            rows={8}
            value={current}
            onChange={(event) => onChange({ type: 'ESSAY', text: event.target.value, fileIds: [] })}
            aria-label={t('quizzes.ESSAY')}
          />
          {minWords > 0 ? (
            <p
              className={cn('text-xs', words < minWords ? 'text-warning' : 'text-muted-foreground')}
            >
              {words} / {minWords}
            </p>
          ) : null}
        </div>
      );
    }

    case 'CODE': {
      const current = value?.type === 'CODE' ? value.code : String(payload['starterCode'] ?? '');
      return (
        <Textarea
          rows={12}
          value={current}
          onChange={(event) => onChange({ type: 'CODE', code: event.target.value })}
          className="font-mono text-xs"
          spellCheck={false}
          aria-label={t('quizzes.CODE')}
        />
      );
    }

    case 'CLOZE': {
      const blanks = (payload['blanks'] ?? []) as Array<{ key: string; options?: string[] }>;
      const current = value?.type === 'CLOZE' ? value.blanks : [];
      const setBlank = (key: string, nextValue: string) => {
        const next = current.filter((item) => item.key !== key);
        next.push({ key, value: nextValue });
        onChange({ type: 'CLOZE', blanks: next });
      };

      return (
        <div className="space-y-2">
          <div
            className="prose-lms text-sm"
            dangerouslySetInnerHTML={{ __html: localize(payload['template'], locale, '') }}
          />
          {blanks.map((blank) => (
            <div key={blank.key} className="flex items-center gap-2">
              <span className="w-8 shrink-0 text-xs text-muted-foreground">[{blank.key}]</span>
              {blank.options && blank.options.length > 0 ? (
                // Ro'yxatli bo'shliq (QTI inlineChoice): yozilmaydi, tanlanadi
                <Select
                  value={current.find((item) => item.key === blank.key)?.value ?? ''}
                  onChange={(event) => setBlank(blank.key, event.target.value)}
                  aria-label={`${t('quizzes.CLOZE')} ${blank.key}`}
                >
                  <option value="">—</option>
                  {blank.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              ) : (
                <Input
                  value={current.find((item) => item.key === blank.key)?.value ?? ''}
                  onChange={(event) => setBlank(blank.key, event.target.value)}
                  aria-label={`${t('quizzes.CLOZE')} ${blank.key}`}
                />
              )}
            </div>
          ))}
        </div>
      );
    }

    case 'ORDERING': {
      const items = (payload['items'] ?? []) as Array<{ id: string; text: unknown }>;
      const order =
        value?.type === 'ORDERING' && value.order.length > 0
          ? value.order
          : items.map((item) => item.id);

      const move = (index: number, direction: -1 | 1) => {
        const next = [...order];
        const target = index + direction;
        if (target < 0 || target >= next.length) return;
        const a = next[index] as string;
        const b = next[target] as string;
        next[index] = b;
        next[target] = a;
        onChange({ type: 'ORDERING', order: next });
      };

      return (
        <ol className="space-y-1.5">
          {order.map((id, index) => {
            const item = items.find((entry) => entry.id === id);
            return (
              <li
                key={id}
                className="flex items-center gap-2 rounded-md border border-border p-2 text-sm"
              >
                <span className="w-5 text-center text-xs text-muted-foreground">{index + 1}</span>
                <span className="flex-1">{localize(item?.text, locale)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, -1)}
                  aria-label={t('common.previous')}
                  disabled={index === 0}
                >
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => move(index, 1)}
                  aria-label={t('common.next')}
                  disabled={index === order.length - 1}
                >
                  ↓
                </Button>
              </li>
            );
          })}
        </ol>
      );
    }

    case 'MATCHING': {
      const left = (payload['left'] ?? []) as Array<{ id: string; text: unknown }>;
      const right = (payload['right'] ?? []) as Array<{ id: string; text: unknown }>;
      const pairs = value?.type === 'MATCHING' ? value.pairs : [];

      return (
        <div className="space-y-2">
          {left.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{localize(item.text, locale)}</span>
              <select
                value={pairs.find((pair) => pair.leftId === item.id)?.rightId ?? ''}
                onChange={(event) => {
                  const next = pairs.filter((pair) => pair.leftId !== item.id);
                  next.push({
                    leftId: item.id,
                    rightId: event.target.value || null,
                  });
                  onChange({ type: 'MATCHING', pairs: next });
                }}
                className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={localize(item.text, locale)}
              >
                <option value="">—</option>
                {right.map((option) => (
                  <option key={option.id} value={option.id}>
                    {localize(option.text, locale)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }

    case 'DRAG_DROP': {
      const items = (payload['items'] ?? []) as Array<{ id: string; text: unknown }>;
      const zones = (payload['zones'] ?? []) as Array<{ id: string; label: unknown }>;
      const placements = value?.type === 'DRAG_DROP' ? value.placements : [];

      // Kichik ekranlarda sudrab tashlash noqulay — select bilan ham
      // ishlashi mumkin (NF-05, NF-06)
      return (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="flex-1 text-sm">{localize(item.text, locale)}</span>
              <select
                value={placements.find((entry) => entry.itemId === item.id)?.zoneId ?? ''}
                onChange={(event) => {
                  const next = placements.filter((entry) => entry.itemId !== item.id);
                  next.push({ itemId: item.id, zoneId: event.target.value || null });
                  onChange({ type: 'DRAG_DROP', placements: next });
                }}
                className="h-9 min-w-40 rounded-md border border-input bg-background px-2 text-sm"
                aria-label={localize(item.text, locale)}
              >
                <option value="">—</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {localize(zone.label, locale)}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      );
    }

    case 'HOTSPOT': {
      const areas = (payload['areas'] ?? []) as Array<{ id: string; shape: string }>;
      const selected = value?.type === 'HOTSPOT' ? value.areaIds : [];

      return (
        <fieldset className="space-y-1.5">
          <legend className="mb-1 text-sm text-muted-foreground">{t('quizzes.HOTSPOT')}</legend>
          {areas.map((area, index) => (
            <label
              key={area.id}
              className="flex cursor-pointer items-center gap-2.5 rounded-md border border-border p-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={selected.includes(area.id)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, area.id]
                    : selected.filter((id) => id !== area.id);
                  onChange({ type: 'HOTSPOT', areaIds: next });
                }}
                className="size-4"
              />
              <span>
                {t('quizzes.question')} {index + 1}
              </span>
            </label>
          ))}
        </fieldset>
      );
    }

    default:
      return <p className="text-sm text-muted-foreground">{question.type}</p>;
  }
}
