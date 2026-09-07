/**
 * Maqsad: topshirilgan ishni baholash oynasi (F-06, F-08).
 *
 * Oyna navbat bilan ishlaydi: o'qituvchi bitta ishni baholab, ro'yxatdagi
 * keyingisiga o'tadi va oynani yopmaydi. §9 talabi — o'qituvchi interfeysida
 * maksimal tezlik — shu sababli klaviatura yorliqlari mavjud:
 *
 *   Ctrl/Cmd + Enter — saqlash va keyingisiga o'tish
 *   Alt + ← / →      — navbat bo'ylab harakat
 *
 * Ball ikki yo'l bilan qo'yiladi: rubrika bo'lsa — mezonlar bo'yicha (server
 * ularni topshiriq maksimal balliga proporsional o'giradi), aks holda — umumiy
 * ball. Kechikish jarimasini server hisoblaydi, shuning uchun bu yerda faqat
 * ogohlantirish ko'rsatiladi — mijozda takroran hisoblab, farq chiqarmaslik uchun.
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { cn, formatDateTime, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import { Badge, Button, Input, Label, ProgressBar, Textarea } from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SwitchField } from '@/components/ui/form-controls';

// --- Turlar -----------------------------------------------------------------

export interface RubricCriterion {
  id: string;
  title: unknown;
  description?: unknown;
  maxPoints: string | number;
  levels?: Array<{ label: unknown; points: number; description?: unknown }> | null;
}

export interface GradableAssignment {
  id: string;
  title: unknown;
  maxScore: string | number;
  dueAt: string;
  lateUntil?: string | null;
  latePenaltyPercent?: string | number | null;
  rubric?: {
    id: string;
    title: unknown;
    totalPoints: string | number;
    criteria: RubricCriterion[];
  } | null;
}

export interface GradableSubmission {
  id: string;
  status: string;
  score: string | null;
  attemptNumber: number;
  submittedAt: string | null;
  gradedAt: string | null;
  similarityPercent?: string | null;
  contentHtml?: string | null;
  fileIds?: string[];
  feedback?: string | null;
  user: { id: string; profile: { firstName: string; lastName: string } | null };
  rubricScores?: Array<{
    criterionId: string;
    points: string | number;
    comment: string | null;
    reviewerId: string | null;
  }>;
}

interface GraderProps {
  assignment: GradableAssignment;
  /** Baholash navbati — oyna ichida ro'yxat bo'ylab yurish uchun. */
  queue: GradableSubmission[];
  startIndex: number;
  onClose: () => void;
  /** Muvaffaqiyatli baholangandan keyin ro'yxatni yangilash uchun. */
  onGraded: () => void;
}

/** Talaba ismi — familiya oldinda (rasmiy ro'yxatlar tartibi). */
function studentName(submission: GradableSubmission, fallback: string): string {
  const profile = submission.user.profile;
  if (!profile) return fallback;
  return [profile.lastName, profile.firstName].filter(Boolean).join(' ') || fallback;
}

export function SubmissionGrader({
  assignment,
  queue,
  startIndex,
  onClose,
  onGraded,
}: GraderProps) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [index, setIndex] = useState(startIndex);
  const submission = queue[index];

  const criteria = assignment.rubric?.criteria ?? [];
  const useRubric = criteria.length > 0;
  const maxScore = Number(assignment.maxScore);
  const rubricTotal = Number(assignment.rubric?.totalPoints ?? 0);

  // Forma holati — ish almashganda qayta tiklanadi
  const [points, setPoints] = useState<Record<string, string>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [returnForRevision, setReturnForRevision] = useState(false);

  /**
   * Navbatdagi ish almashganda formani o'sha ishning MAVJUD baholari bilan
   * to'ldiramiz: qayta baholashda o'qituvchi hammasini qaytadan kiritmasin.
   * Peer-review ballari (`reviewerId` bo'lgan) hisobga olinmaydi — ular
   * o'qituvchi bahosi emas.
   */
  useEffect(() => {
    if (!submission) return;

    const existing: Record<string, string> = {};
    const existingComments: Record<string, string> = {};
    for (const row of submission.rubricScores ?? []) {
      if (row.reviewerId) continue;
      existing[row.criterionId] = String(Number(row.points));
      if (row.comment) existingComments[row.criterionId] = row.comment;
    }

    setPoints(existing);
    setComments(existingComments);
    setScore(submission.score !== null ? String(Number(submission.score)) : '');
    setFeedback(submission.feedback ?? '');
    setReturnForRevision(false);
  }, [submission]);

  // Rubrika bo'yicha yig'ilgan ball va uning topshiriq shkalasidagi qiymati
  const earned = useMemo(
    () =>
      criteria.reduce((sum, criterion) => {
        const value = Number(points[criterion.id] ?? 0);
        return sum + (Number.isFinite(value) ? value : 0);
      }, 0),
    [criteria, points],
  );

  const projectedScore =
    useRubric && rubricTotal > 0 ? (earned / rubricTotal) * maxScore : Number(score || 0);

  /** Kechikkan ishda jarima qo'llanishini oldindan aytamiz (hisobni server qiladi). */
  const isLate = submission?.status === 'LATE';

  const canSubmit = useRubric
    ? criteria.every((criterion) => {
        const raw = points[criterion.id];
        if (raw === undefined || raw === '') return false;
        const value = Number(raw);
        return Number.isFinite(value) && value >= 0 && value <= Number(criterion.maxPoints);
      })
    : score !== '' &&
      Number.isFinite(Number(score)) &&
      Number(score) >= 0 &&
      Number(score) <= maxScore;

  const grade = useMutation({
    mutationFn: async () => {
      // Navbat bo'sh bo'lsa tugma ham ko'rinmaydi; bu tekshiruv tip xavfsizligi uchun
      if (!submission) throw new Error('no_submission');

      const body = useRubric
        ? {
            rubricScores: criteria.map((criterion) => ({
              criterionId: criterion.id,
              points: Number(points[criterion.id] ?? 0),
              ...(comments[criterion.id] ? { comment: comments[criterion.id] } : {}),
            })),
          }
        : { score: Number(score) };

      return api.post(`/submissions/${submission.id}/grade`, {
        ...body,
        ...(feedback.trim() ? { feedback } : {}),
        returnForRevision,
      });
    },
    onSuccess: () => {
      toast.success(t('assignments.gradeSaved'));
      onGraded();
      // Navbatda keyingisi bo'lsa — unga o'tamiz, aks holda oyna yopiladi
      if (index < queue.length - 1) setIndex((value) => value + 1);
      else onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const save = useCallback(() => {
    if (!canSubmit || grade.isPending) return;
    grade.mutate();
  }, [canSubmit, grade]);

  // Klaviatura yorliqlari (§9)
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
        return;
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        setIndex((value) => Math.max(0, value - 1));
        return;
      }
      if (event.altKey && event.key === 'ArrowRight') {
        event.preventDefault();
        setIndex((value) => Math.min(queue.length - 1, value + 1));
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [save, queue.length]);

  if (!submission) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="lg">
        <DialogHeader>
          <DialogTitle>{t('assignments.gradeSubmission')}</DialogTitle>
          <DialogDescription>
            {localize(assignment.title, locale)} · {t('common.showing')} {index + 1}{' '}
            {t('common.of')} {queue.length}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* --- Ish sarlavhasi --- */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-3">
            <div className="min-w-0">
              <p className="font-medium">{studentName(submission, t('common.none'))}</p>
              <p className="text-xs text-muted-foreground">
                {t('assignments.attempt')} {submission.attemptNumber}
                {submission.submittedAt
                  ? ` · ${formatDateTime(submission.submittedAt, locale)}`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {submission.similarityPercent && Number(submission.similarityPercent) > 0 ? (
                <Badge
                  variant={Number(submission.similarityPercent) > 40 ? 'destructive' : 'muted'}
                  title={t('assignments.similarityHint')}
                >
                  {t('assignments.similarity')}: {Number(submission.similarityPercent).toFixed(0)}%
                </Badge>
              ) : null}
              <Badge variant={isLate ? 'warning' : submission.gradedAt ? 'success' : 'default'}>
                {t(`assignments.${submission.status}`)}
              </Badge>
            </div>
          </div>

          {isLate ? (
            <p className="text-xs text-warning">{t('assignments.latePenaltyNotice')}</p>
          ) : null}

          {/* --- Ish mazmuni --- */}
          <section className="space-y-2">
            <h3 className="text-sm font-medium">{t('assignments.submission')}</h3>
            {submission.contentHtml ? (
              <div
                className="prose-lms max-h-64 overflow-y-auto rounded-md border border-border p-3 text-sm"
                dangerouslySetInnerHTML={{ __html: submission.contentHtml }}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{t('assignments.noSubmissionText')}</p>
            )}

            {(submission.fileIds ?? []).length > 0 ? (
              <ul className="space-y-1">
                {submission.fileIds?.map((fileId, position) => (
                  <li key={fileId}>
                    <SubmissionFile fileId={fileId} position={position + 1} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          {/* --- Baholash --- */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">
                {useRubric ? t('assignments.rubric') : t('assignments.grade')}
              </h3>
              <span className="text-sm tabular-nums text-muted-foreground">
                {projectedScore.toFixed(1)} / {maxScore}
              </span>
            </div>

            {useRubric ? (
              <>
                <ProgressBar
                  value={maxScore > 0 ? Math.min(100, (projectedScore / maxScore) * 100) : 0}
                  label={localize(assignment.rubric?.title, locale, '')}
                />
                <div className="space-y-3">
                  {criteria.map((criterion) => (
                    <CriterionRow
                      key={criterion.id}
                      criterion={criterion}
                      locale={locale}
                      value={points[criterion.id] ?? ''}
                      comment={comments[criterion.id] ?? ''}
                      onValueChange={(next) =>
                        setPoints((state) => ({ ...state, [criterion.id]: next }))
                      }
                      onCommentChange={(next) =>
                        setComments((state) => ({ ...state, [criterion.id]: next }))
                      }
                    />
                  ))}
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="grader-score" required>
                  {t('assignments.grade')} (0–{maxScore})
                </Label>
                <Input
                  id="grader-score"
                  type="number"
                  min={0}
                  max={maxScore}
                  step="0.1"
                  value={score}
                  onChange={(event) => setScore(event.target.value)}
                  aria-invalid={score !== '' && !canSubmit}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="grader-feedback">{t('assignments.feedback')}</Label>
              <Textarea
                id="grader-feedback"
                rows={3}
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder={t('assignments.feedbackPlaceholder')}
              />
            </div>

            <SwitchField
              id="grader-return"
              label={t('assignments.returnForRevision')}
              description={t('assignments.returnForRevisionHint')}
              checked={returnForRevision}
              onCheckedChange={setReturnForRevision}
            />
          </section>

          <p className="text-xs text-muted-foreground">{t('assignments.gradeShortcuts')}</p>
        </DialogBody>

        <DialogFooter className="justify-between">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('common.previous')}
              disabled={index === 0}
              onClick={() => setIndex((value) => Math.max(0, value - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label={t('common.next')}
              disabled={index >= queue.length - 1}
              onClick={() => setIndex((value) => Math.min(queue.length - 1, value + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button loading={grade.isPending} disabled={!canSubmit} onClick={save}>
              {index < queue.length - 1 ? t('assignments.saveAndNext') : t('common.save')}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bitta mezon: darajalar tugmasi (tez tanlash) + aniq ball + izoh. */
function CriterionRow({
  criterion,
  locale,
  value,
  comment,
  onValueChange,
  onCommentChange,
}: {
  criterion: RubricCriterion;
  locale: AppLocale;
  value: string;
  comment: string;
  onValueChange: (next: string) => void;
  onCommentChange: (next: string) => void;
}) {
  const t = useTranslations();
  const max = Number(criterion.maxPoints);
  const numeric = Number(value);
  const invalid = value !== '' && (!Number.isFinite(numeric) || numeric < 0 || numeric > max);

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{localize(criterion.title, locale)}</p>
          {criterion.description ? (
            <p className="text-xs text-muted-foreground">
              {localize(criterion.description, locale, '')}
            </p>
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          <Input
            aria-label={`${localize(criterion.title, locale)} — ${t('assignments.grade')}`}
            type="number"
            min={0}
            max={max}
            step="0.5"
            className="h-8 w-20 text-right"
            value={value}
            onChange={(event) => onValueChange(event.target.value)}
            aria-invalid={invalid}
          />
          <span className="text-xs text-muted-foreground">/ {max}</span>
        </div>
      </div>

      {/* Darajalar — bir bosishda ball qo'yish (o'qituvchi tezligi uchun) */}
      {(criterion.levels ?? []).length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {criterion.levels?.map((level, position) => {
            const active = value !== '' && numeric === level.points;
            return (
              <button
                key={`${criterion.id}-${position}`}
                type="button"
                onClick={() => onValueChange(String(level.points))}
                aria-pressed={active}
                className={cn(
                  'rounded-md border px-2 py-1 text-xs transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border hover:bg-muted',
                )}
              >
                {localize(level.label, locale, String(level.points))} · {level.points}
              </button>
            );
          })}
        </div>
      ) : null}

      <Input
        aria-label={`${localize(criterion.title, locale)} — ${t('assignments.feedback')}`}
        className="h-8"
        placeholder={t('assignments.criterionCommentPlaceholder')}
        value={comment}
        onChange={(event) => onCommentChange(event.target.value)}
      />
    </div>
  );
}

/**
 * Biriktirilgan fayl. Havola so'ralgan paytda olinadi — presigned URL qisqa
 * muddatli, shuning uchun ro'yxat chizilganda oldindan so'ralmaydi.
 */
function SubmissionFile({ fileId, position }: { fileId: string; position: number }) {
  const t = useTranslations();
  const [pending, setPending] = useState(false);

  const open = async () => {
    setPending(true);
    try {
      const { data } = await api.get<{ url: string }>(`/content/files/${fileId}/download`);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="w-full justify-start"
      loading={pending}
      onClick={() => void open()}
    >
      <FileText className="size-4" />
      <span className="truncate">
        {t('assignments.attachment')} {position}
      </span>
      <Download className="ms-auto size-4" />
    </Button>
  );
}
