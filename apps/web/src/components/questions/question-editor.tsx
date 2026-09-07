/**
 * Maqsad: savol yaratish va tahrirlash oynasi (F-07).
 *
 * Yuborishdan OLDIN `createQuestionSchema` bilan tekshiriladi — backend bilan
 * bir xil sxema (ADR-011). Shu tufayli noto'g'ri savol serverga umuman
 * bormaydi va o'qituvchi xatoni darhol ko'radi.
 *
 * Tahrirlash rejimida `updateQuestionSchema` (bankId siz) ishlatiladi, chunki
 * savolni boshqa bankka ko'chirish ko'zda tutilmagan.
 */

'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  BLOOM_LEVELS,
  QUESTION_TYPES,
  createQuestionSchema,
  type LocalizedText,
  type QuestionPayload,
  type QuestionType,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import type { AppLocale } from '@/i18n/routing';
import { Button, Input, Label } from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select } from '@/components/ui/form-controls';
import { LocalizedRichField } from '@/components/editor/rich-text-editor';
import { PayloadEditor, defaultPayload } from './payload-editors';

const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'] as const;

export interface EditableQuestion {
  id: string;
  type: QuestionType;
  text: LocalizedText;
  payload: QuestionPayload;
  defaultScore: string | number;
  difficulty: string;
  bloomLevel?: string | null;
  tags?: string[];
  explanation?: LocalizedText | null;
}

export function QuestionEditor({
  bankId,
  courseId,
  question,
  onClose,
  onSaved,
}: {
  bankId: string;
  courseId?: string;
  /** Berilsa — tahrirlash rejimi. */
  question?: EditableQuestion;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [type, setType] = useState<QuestionType>(question?.type ?? 'SINGLE');
  const [text, setText] = useState<LocalizedText>(question?.text ?? {});
  const [explanation, setExplanation] = useState<LocalizedText>(question?.explanation ?? {});
  const [payload, setPayload] = useState<QuestionPayload>(
    question?.payload ?? defaultPayload('SINGLE', locale),
  );
  const [defaultScore, setDefaultScore] = useState(String(Number(question?.defaultScore ?? 1)));
  const [difficulty, setDifficulty] = useState(question?.difficulty ?? 'MEDIUM');
  const [bloomLevel, setBloomLevel] = useState(question?.bloomLevel ?? '');
  const [tags, setTags] = useState((question?.tags ?? []).join(', '));

  /** Tur almashganda payload o'sha turning bo'sh shakliga tushadi. */
  const changeType = (next: QuestionType) => {
    setType(next);
    setPayload(defaultPayload(next, locale));
  };

  const body = useMemo(
    () => ({
      bankId,
      text,
      payload,
      defaultScore,
      difficulty,
      tags: tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      ...(bloomLevel ? { bloomLevel } : {}),
      ...(Object.values(explanation).some(Boolean) ? { explanation } : {}),
    }),
    [bankId, text, payload, defaultScore, difficulty, tags, bloomLevel, explanation],
  );

  const parsed = createQuestionSchema.safeParse(body);

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      if (question) {
        // `bankId` yangilashda yuborilmaydi — sxema uni qabul qilmaydi
        const { bankId: _ignored, ...rest } = parsed.data;
        return api.patch(`/questions/${question.id}`, rest);
      }
      return api.post('/questions', parsed.data);
    },
    onSuccess: () => {
      toast.success(question ? t('common.saved') : t('quizzes.questionCreated'));
      onSaved();
      onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="lg">
        <DialogHeader>
          <DialogTitle>
            {question ? t('quizzes.editQuestion') : t('quizzes.addQuestion')}
          </DialogTitle>
          <DialogDescription>{t('quizzes.questionEditorHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Tur faqat yangi savolda tanlanadi: mavjud savolning turini
              o'zgartirish javoblarni yaroqsiz qiladi (urinishlar tarixi buziladi) */}
          <div className="space-y-1.5">
            <Label htmlFor="question-type">{t('quizzes.questionType')}</Label>
            <Select
              id="question-type"
              value={type}
              disabled={Boolean(question)}
              onChange={(event) => changeType(event.target.value as QuestionType)}
            >
              {QUESTION_TYPES.map((value) => (
                <option key={value} value={value}>
                  {t(`quizzes.${value}`)}
                </option>
              ))}
            </Select>
          </div>

          <LocalizedRichField
            idPrefix="question-text"
            label={t('quizzes.question')}
            value={text}
            onChange={setText}
            courseId={courseId}
            required
            minHeight={140}
          />

          <div className="rounded-md border border-border p-3">
            <PayloadEditor
              payload={payload}
              onChange={setPayload}
              locale={locale}
              courseId={courseId}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="question-score">{t('quizzes.score')}</Label>
              <Input
                id="question-score"
                type="number"
                min={0.1}
                max={100}
                step="0.5"
                value={defaultScore}
                onChange={(event) => setDefaultScore(event.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="question-difficulty">{t('quizzes.difficulty')}</Label>
              <Select
                id="question-difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
              >
                {DIFFICULTIES.map((value) => (
                  <option key={value} value={value}>
                    {t(`quizzes.${value}`)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="question-bloom">{t('curriculum.bloomLevel')}</Label>
              <Select
                id="question-bloom"
                value={bloomLevel}
                onChange={(event) => setBloomLevel(event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {BLOOM_LEVELS.map((value) => (
                  <option key={value} value={value}>
                    {t(`curriculum.${value}`)}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="question-tags">{t('quizzes.tags')}</Label>
            <Input
              id="question-tags"
              value={tags}
              placeholder={t('quizzes.tagsPlaceholder')}
              onChange={(event) => setTags(event.target.value)}
            />
          </div>

          <LocalizedRichField
            idPrefix="question-explanation"
            label={t('quizzes.explanation')}
            value={explanation}
            onChange={setExplanation}
            courseId={courseId}
            minHeight={120}
          />

          {!parsed.success ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t('quizzes.incompleteQuestion')}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!parsed.success} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
