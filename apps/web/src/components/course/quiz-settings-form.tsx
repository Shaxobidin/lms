/**
 * Maqsad: test sozlamalari — Moodle "Quiz settings" uslubidagi to'liq forma
 * (F-07): Umumiy, Vaqt, Baho, Joylashuv, Savol xatti-harakati, Ko'rib chiqish,
 * Qo'shimcha cheklovlar, Nashr. Yaratishda ham, tahrirlashda ham shu forma.
 *
 * Qiymatlar `createQuizSchema`/`updateQuizSchema` bilan tekshiriladi (ADR-011):
 * xato bo'lsa saqlash tugmasi o'chiq turadi va sabab ko'rsatiladi.
 */

'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { createQuizSchema, updateQuizSchema, type LocalizedText } from '@lms/shared';
import { Button, FieldError, Input, Label } from '@/components/ui/primitives';
import { LocalizedField, Select, SwitchField } from '@/components/ui/form-controls';
import { SettingsSections } from '@/components/ui/settings-sections';
import { LocalizedRichField } from '@/components/editor/rich-text-editor';

export interface QuizSettingsValues {
  title: LocalizedText;
  description: LocalizedText;
  controlType: string;
  durationMinutes: number;
  maxAttempts: number;
  gradingMethod: string;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  questionsPerAttempt: number;
  opensAt: string;
  closesAt: string;
  passScore: number;
  proctoringEnabled: boolean;
  showAnswers: string;
  questionsPerPage: number;
  allowBacktrack: boolean;
  isPublished: boolean;
}

export const DEFAULT_QUIZ_SETTINGS: QuizSettingsValues = {
  title: {},
  description: {},
  controlType: 'JN',
  durationMinutes: 30,
  maxAttempts: 1,
  gradingMethod: 'HIGHEST',
  shuffleQuestions: true,
  shuffleOptions: true,
  questionsPerAttempt: 0,
  opensAt: '',
  closesAt: '',
  passScore: 60,
  proctoringEnabled: false,
  showAnswers: 'AFTER_CLOSE',
  questionsPerPage: 1,
  allowBacktrack: true,
  isPublished: false,
};

/** `datetime-local` maydoni uchun ISO → mahalliy `YYYY-MM-DDTHH:mm`. */
export function toLocalInput(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

/** Forma qiymatlari → API tanasi (sanalar ISO yoki null). */
export function toQuizPayload(values: QuizSettingsValues) {
  return {
    title: values.title,
    description: values.description,
    controlType: values.controlType,
    durationMinutes: values.durationMinutes,
    maxAttempts: values.maxAttempts,
    gradingMethod: values.gradingMethod,
    shuffleQuestions: values.shuffleQuestions,
    shuffleOptions: values.shuffleOptions,
    questionsPerAttempt: values.questionsPerAttempt,
    opensAt: values.opensAt ? new Date(values.opensAt).toISOString() : null,
    closesAt: values.closesAt ? new Date(values.closesAt).toISOString() : null,
    passScore: values.passScore,
    proctoringEnabled: values.proctoringEnabled,
    showAnswers: values.showAnswers,
    questionsPerPage: values.questionsPerPage,
    allowBacktrack: values.allowBacktrack,
    isPublished: values.isPublished,
  };
}

export function QuizSettingsForm({
  mode,
  courseId,
  initial,
  pending,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  mode: 'create' | 'edit';
  courseId: string;
  initial?: Partial<QuizSettingsValues>;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: QuizSettingsValues) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const [values, setValues] = useState<QuizSettingsValues>({
    ...DEFAULT_QUIZ_SETTINGS,
    ...initial,
  });
  const update = (patch: Partial<QuizSettingsValues>) =>
    setValues((state) => ({ ...state, ...patch }));

  const validation = useMemo(() => {
    const payload = toQuizPayload(values);
    return mode === 'create'
      ? createQuizSchema.safeParse({ ...payload, courseId })
      : updateQuizSchema.safeParse(payload);
  }, [values, mode, courseId]);

  const issueFor = (field: string) =>
    validation.success
      ? undefined
      : validation.error.issues.find((issue) => issue.path[0] === field)?.message;
  const dateIssue = issueFor('closesAt');

  const number = (key: keyof QuizSettingsValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
    update({ [key]: Number(event.target.value) } as Partial<QuizSettingsValues>);

  return (
    <div className="space-y-4">
      <SettingsSections
        expandAllLabel={t('settingsForm.expandAll')}
        collapseAllLabel={t('settingsForm.collapseAll')}
        defaultOpen={mode === 'create' ? ['general', 'timing'] : ['general']}
        sections={[
          {
            id: 'general',
            title: t('settingsForm.general'),
            children: (
              <>
                <LocalizedField
                  idPrefix="quiz-title"
                  label={t('common.title')}
                  value={values.title}
                  required
                  moreLabel={t('common.otherLanguages')}
                  onChange={(title) => update({ title })}
                />
                <LocalizedRichField
                  idPrefix="quiz-description"
                  label={t('common.description')}
                  value={values.description}
                  courseId={courseId}
                  minHeight={140}
                  onChange={(description) => update({ description })}
                />
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-control">{t('grades.controlType')}</Label>
                  <Select
                    id="quiz-control"
                    value={values.controlType}
                    onChange={(event) => update({ controlType: event.target.value })}
                  >
                    <option value="JN">{t('grades.JN')}</option>
                    <option value="ON">{t('grades.ON')}</option>
                    <option value="YN">{t('grades.YN')}</option>
                    <option value="PRACTICE">{t('activities.practice')}</option>
                  </Select>
                </div>
              </>
            ),
          },
          {
            id: 'timing',
            title: t('settingsForm.timing'),
            description: t('quizzes.timingHint'),
            children: (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-opens">{t('quizzes.opensAt')}</Label>
                  <Input
                    id="quiz-opens"
                    type="datetime-local"
                    value={values.opensAt}
                    onChange={(event) => update({ opensAt: event.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-closes">{t('quizzes.closesAt')}</Label>
                  <Input
                    id="quiz-closes"
                    type="datetime-local"
                    value={values.closesAt}
                    onChange={(event) => update({ closesAt: event.target.value })}
                  />
                  <FieldError
                    id="quiz-closes-error"
                    message={dateIssue ? t('validation.start_before_end') : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-duration" required>
                    {t('courses.durationMinutes')}
                  </Label>
                  <Input
                    id="quiz-duration"
                    type="number"
                    min={1}
                    max={600}
                    value={values.durationMinutes}
                    onChange={number('durationMinutes')}
                  />
                </div>
              </div>
            ),
          },
          {
            id: 'grade',
            title: t('settingsForm.grade'),
            children: (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-pass">{t('quizzes.passScore')}</Label>
                  <Input
                    id="quiz-pass"
                    type="number"
                    min={0}
                    max={100}
                    value={values.passScore}
                    onChange={number('passScore')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-attempts">{t('quizzes.maxAttempts')}</Label>
                  <Input
                    id="quiz-attempts"
                    type="number"
                    min={1}
                    max={20}
                    value={values.maxAttempts}
                    onChange={number('maxAttempts')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-grading">{t('quizzes.gradingMethod')}</Label>
                  <Select
                    id="quiz-grading"
                    value={values.gradingMethod}
                    onChange={(event) => update({ gradingMethod: event.target.value })}
                  >
                    {['HIGHEST', 'LAST', 'AVERAGE', 'FIRST'].map((method) => (
                      <option key={method} value={method}>
                        {t(`quizzes.grading_${method}`)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            ),
          },
          {
            id: 'layout',
            title: t('settingsForm.layout'),
            children: (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="quiz-per-page">{t('quizzes.questionsPerPage')}</Label>
                  <Input
                    id="quiz-per-page"
                    type="number"
                    min={1}
                    max={50}
                    value={values.questionsPerPage}
                    onChange={number('questionsPerPage')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('quizzes.questionsPerPageHint')}
                  </p>
                </div>
                <SwitchField
                  id="quiz-backtrack"
                  label={t('quizzes.allowBacktrack')}
                  description={t('quizzes.allowBacktrackHint')}
                  checked={values.allowBacktrack}
                  onCheckedChange={(allowBacktrack) => update({ allowBacktrack })}
                />
              </div>
            ),
          },
          {
            id: 'behaviour',
            title: t('settingsForm.behaviour'),
            children: (
              <div className="grid gap-4 sm:grid-cols-2">
                <SwitchField
                  id="quiz-shuffle-questions"
                  label={t('quizzes.shuffleQuestions')}
                  description={t('quizzes.shuffleQuestionsHint')}
                  checked={values.shuffleQuestions}
                  onCheckedChange={(shuffleQuestions) => update({ shuffleQuestions })}
                />
                <SwitchField
                  id="quiz-shuffle-options"
                  label={t('quizzes.shuffleOptions')}
                  description={t('quizzes.shuffleOptionsHint')}
                  checked={values.shuffleOptions}
                  onCheckedChange={(shuffleOptions) => update({ shuffleOptions })}
                />
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="quiz-per-attempt">{t('quizzes.questionsPerAttempt')}</Label>
                  <Input
                    id="quiz-per-attempt"
                    type="number"
                    min={0}
                    max={300}
                    value={values.questionsPerAttempt}
                    onChange={number('questionsPerAttempt')}
                  />
                  <p className="text-xs text-muted-foreground">
                    {t('quizzes.questionsPerAttemptHint')}
                  </p>
                </div>
              </div>
            ),
          },
          {
            id: 'review',
            title: t('settingsForm.review'),
            children: (
              <div className="space-y-1.5">
                <Label htmlFor="quiz-show-answers">{t('quizzes.showAnswers')}</Label>
                <Select
                  id="quiz-show-answers"
                  value={values.showAnswers}
                  onChange={(event) => update({ showAnswers: event.target.value })}
                >
                  {['NEVER', 'AFTER_ATTEMPT', 'AFTER_CLOSE'].map((option) => (
                    <option key={option} value={option}>
                      {t(`quizzes.showAnswers_${option}`)}
                    </option>
                  ))}
                </Select>
              </div>
            ),
          },
          {
            id: 'restrictions',
            title: t('settingsForm.restrictions'),
            children: (
              <SwitchField
                id="quiz-proctoring"
                label={t('quizzes.proctoring')}
                description={t('quizzes.proctoringHint')}
                checked={values.proctoringEnabled}
                onCheckedChange={(proctoringEnabled) => update({ proctoringEnabled })}
              />
            ),
          },
          {
            id: 'publish',
            title: t('settingsForm.publish'),
            children: (
              <SwitchField
                id="quiz-published"
                label={t('courses.published')}
                description={t('quizzes.publishedHint')}
                checked={values.isPublished}
                onCheckedChange={(isPublished) => update({ isPublished })}
              />
            ),
          },
        ]}
      />

      <div className="flex justify-end gap-2">
        {onCancel ? (
          <Button variant="ghost" onClick={onCancel} disabled={pending}>
            {t('common.cancel')}
          </Button>
        ) : null}
        <Button
          loading={pending}
          disabled={!validation.success || !values.title['uz-Latn']?.trim()}
          onClick={() => onSubmit(values)}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
