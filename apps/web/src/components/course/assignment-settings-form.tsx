/**
 * Maqsad: topshiriq sozlamalari — Moodle "Assignment settings" uslubidagi forma
 * (F-06): Umumiy, Mavjudlik, Topshirish turlari, Baho, O'zaro baholash,
 * Qo'shimcha, Nashr. Yaratish va tahrirlash bitta formada.
 *
 * Tahrirlashda tur (yakka/guruh) va nazorat turi o'zgartirilmaydi — ular jurnal
 * ustuni bilan bog'liq; forma ularni faqat ko'rsatadi.
 */

'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  ALLOWED_MIME_TYPES,
  createAssignmentSchema,
  updateAssignmentSchema,
  type LocalizedText,
} from '@lms/shared';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import { Button, FieldError, Input, Label } from '@/components/ui/primitives';
import { LocalizedField, Select, SwitchField } from '@/components/ui/form-controls';
import { SettingsSections } from '@/components/ui/settings-sections';
import { LocalizedRichField } from '@/components/editor/rich-text-editor';
import { toLocalInput } from './quiz-settings-form';

export interface AssignmentSettingsValues {
  title: LocalizedText;
  description: LocalizedText;
  kind: string;
  controlType: string;
  maxScore: number;
  dueAt: string;
  lateUntil: string;
  latePenaltyPercent: number;
  maxAttempts: number;
  rubricId: string;
  peerReviewEnabled: boolean;
  peerReviewCount: number;
  peerReviewDueAt: string;
  plagiarismCheck: boolean;
  allowedMimeTypes: string[];
  maxFileSizeMb: number;
  maxFiles: number;
  isPublished: boolean;
}

function defaultDue(): string {
  const date = new Date(Date.now() + 7 * 86_400_000);
  date.setMinutes(0, 0, 0);
  return toLocalInput(date.toISOString());
}

export const DEFAULT_ASSIGNMENT_SETTINGS: AssignmentSettingsValues = {
  title: {},
  description: {},
  kind: 'INDIVIDUAL',
  controlType: 'JN',
  maxScore: 100,
  dueAt: defaultDue(),
  lateUntil: '',
  latePenaltyPercent: 10,
  maxAttempts: 1,
  rubricId: '',
  peerReviewEnabled: false,
  peerReviewCount: 0,
  peerReviewDueAt: '',
  plagiarismCheck: false,
  allowedMimeTypes: [],
  maxFileSizeMb: 50,
  maxFiles: 5,
  isPublished: false,
};

/** Fayl turlari guruhlari — Moodle "Accepted file types" kabi tanlanadi. */
const MIME_GROUPS: Array<{ key: string; mimes: string[] }> = [
  {
    key: 'documents',
    mimes: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ],
  },
  {
    key: 'spreadsheets',
    mimes: [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  },
  {
    key: 'presentations',
    mimes: [
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ],
  },
  { key: 'images', mimes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'] },
  { key: 'media', mimes: ['video/mp4', 'video/webm', 'audio/mpeg', 'audio/wav'] },
  { key: 'archives', mimes: ['application/zip'] },
  { key: 'text', mimes: ['text/plain', 'text/csv'] },
];

export function toAssignmentPayload(values: AssignmentSettingsValues, mode: 'create' | 'edit') {
  const base = {
    title: values.title,
    description: values.description,
    maxScore: values.maxScore,
    dueAt: new Date(values.dueAt).toISOString(),
    lateUntil: values.lateUntil ? new Date(values.lateUntil).toISOString() : null,
    latePenaltyPercent: values.latePenaltyPercent,
    maxAttempts: values.maxAttempts,
    rubricId: values.rubricId || null,
    peerReviewEnabled: values.peerReviewEnabled,
    peerReviewCount: values.peerReviewEnabled ? values.peerReviewCount : 0,
    peerReviewDueAt:
      values.peerReviewEnabled && values.peerReviewDueAt
        ? new Date(values.peerReviewDueAt).toISOString()
        : null,
    plagiarismCheck: values.plagiarismCheck,
    allowedMimeTypes: values.allowedMimeTypes.filter((mime) =>
      (ALLOWED_MIME_TYPES as readonly string[]).includes(mime),
    ),
    maxFileSizeMb: values.maxFileSizeMb,
    maxFiles: values.maxFiles,
    isPublished: values.isPublished,
  };
  return mode === 'create' ? { ...base, kind: values.kind, controlType: values.controlType } : base;
}

export function AssignmentSettingsForm({
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
  initial?: Partial<AssignmentSettingsValues>;
  pending: boolean;
  submitLabel: string;
  onSubmit: (values: AssignmentSettingsValues) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const [values, setValues] = useState<AssignmentSettingsValues>({
    ...DEFAULT_ASSIGNMENT_SETTINGS,
    ...initial,
  });
  const update = (patch: Partial<AssignmentSettingsValues>) =>
    setValues((state) => ({ ...state, ...patch }));

  const rubrics = useQuery({
    queryKey: ['rubrics', courseId],
    queryFn: async () =>
      (
        await api.get<Array<{ id: string; title: unknown; totalPoints: number }>>(
          `/courses/${courseId}/rubrics`,
        )
      ).data,
  });

  const validation = useMemo(() => {
    const payload = toAssignmentPayload(values, mode);
    return mode === 'create'
      ? createAssignmentSchema.safeParse({ ...payload, courseId })
      : updateAssignmentSchema.safeParse(payload);
  }, [values, mode, courseId]);

  const issueFor = (field: string) =>
    validation.success
      ? undefined
      : validation.error.issues.find((issue) => issue.path[0] === field)?.message;

  const number =
    (key: keyof AssignmentSettingsValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
      update({ [key]: Number(event.target.value) } as Partial<AssignmentSettingsValues>);

  const toggleGroup = (mimes: string[], checked: boolean) =>
    update({
      allowedMimeTypes: checked
        ? Array.from(new Set([...values.allowedMimeTypes, ...mimes]))
        : values.allowedMimeTypes.filter((mime) => !mimes.includes(mime)),
    });

  return (
    <div className="space-y-4">
      <SettingsSections
        expandAllLabel={t('settingsForm.expandAll')}
        collapseAllLabel={t('settingsForm.collapseAll')}
        // Yaratishda baho bo'limi ham ochiq: maksimal ball va rubrika — asosiy qaror
        defaultOpen={mode === 'create' ? ['general', 'availability', 'grade'] : ['general']}
        sections={[
          {
            id: 'general',
            title: t('settingsForm.general'),
            children: (
              <>
                <LocalizedField
                  idPrefix="assignment-title"
                  label={t('common.title')}
                  value={values.title}
                  required
                  moreLabel={t('common.otherLanguages')}
                  onChange={(title) => update({ title })}
                />
                <LocalizedRichField
                  idPrefix="assignment-description"
                  label={t('common.description')}
                  value={values.description}
                  courseId={courseId}
                  minHeight={160}
                  hint={t('assignments.descriptionHint')}
                  onChange={(description) => update({ description })}
                />
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-kind">{t('assignments.kind')}</Label>
                    <Select
                      id="assignment-kind"
                      value={values.kind}
                      disabled={mode === 'edit'}
                      onChange={(event) => update({ kind: event.target.value })}
                    >
                      <option value="INDIVIDUAL">{t('assignments.kind_INDIVIDUAL')}</option>
                      <option value="GROUP">{t('assignments.kind_GROUP')}</option>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-control">{t('grades.controlType')}</Label>
                    <Select
                      id="assignment-control"
                      value={values.controlType}
                      disabled={mode === 'edit'}
                      onChange={(event) => update({ controlType: event.target.value })}
                    >
                      <option value="JN">{t('grades.JN')}</option>
                      <option value="ON">{t('grades.ON')}</option>
                      <option value="YN">{t('grades.YN')}</option>
                    </Select>
                  </div>
                </div>
              </>
            ),
          },
          {
            id: 'availability',
            title: t('settingsForm.availability'),
            children: (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="assignment-due" required>
                    {t('assignments.dueAt')}
                  </Label>
                  <Input
                    id="assignment-due"
                    type="datetime-local"
                    value={values.dueAt}
                    onChange={(event) => update({ dueAt: event.target.value })}
                  />
                  <FieldError
                    id="assignment-due-error"
                    message={issueFor('dueAt') ? t('validation.required') : undefined}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignment-late">{t('assignments.lateUntil')}</Label>
                  <Input
                    id="assignment-late"
                    type="datetime-local"
                    value={values.lateUntil}
                    onChange={(event) => update({ lateUntil: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">{t('assignments.lateUntilHint')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignment-penalty">{t('assignments.latePenalty')}</Label>
                  <Input
                    id="assignment-penalty"
                    type="number"
                    min={0}
                    max={100}
                    value={values.latePenaltyPercent}
                    onChange={number('latePenaltyPercent')}
                  />
                </div>
              </div>
            ),
          },
          {
            id: 'submission',
            title: t('settingsForm.submission'),
            children: (
              <>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-attempts">{t('quizzes.maxAttempts')}</Label>
                    <Input
                      id="assignment-attempts"
                      type="number"
                      min={1}
                      max={10}
                      value={values.maxAttempts}
                      onChange={number('maxAttempts')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-files">{t('assignments.maxFiles')}</Label>
                    <Input
                      id="assignment-files"
                      type="number"
                      min={0}
                      max={20}
                      value={values.maxFiles}
                      onChange={number('maxFiles')}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="assignment-size">{t('assignments.maxFileSizeMb')}</Label>
                    <Input
                      id="assignment-size"
                      type="number"
                      min={1}
                      max={512}
                      value={values.maxFileSizeMb}
                      onChange={number('maxFileSizeMb')}
                    />
                  </div>
                </div>
                <fieldset className="space-y-1.5">
                  <legend className="text-sm font-medium">{t('assignments.allowedTypes')}</legend>
                  <p className="text-xs text-muted-foreground">
                    {t('assignments.allowedTypesHint')}
                  </p>
                  <div className="grid gap-1 sm:grid-cols-2">
                    {MIME_GROUPS.map((group) => {
                      const checked = group.mimes.every((mime) =>
                        values.allowedMimeTypes.includes(mime),
                      );
                      return (
                        <label key={group.key} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            className="size-4 rounded border-input"
                            checked={checked}
                            onChange={(event) => toggleGroup(group.mimes, event.target.checked)}
                          />
                          {t(`assignments.mime_${group.key}`)}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              </>
            ),
          },
          {
            id: 'grade',
            title: t('settingsForm.grade'),
            children: (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="assignment-score" required>
                    {t('assignments.maxScore')}
                  </Label>
                  <Input
                    id="assignment-score"
                    type="number"
                    min={1}
                    max={1000}
                    value={values.maxScore}
                    onChange={number('maxScore')}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="assignment-rubric">{t('assignments.rubric')}</Label>
                  <Select
                    id="assignment-rubric"
                    value={values.rubricId}
                    disabled={rubrics.isLoading}
                    onChange={(event) => update({ rubricId: event.target.value })}
                  >
                    <option value="">{t('assignments.noRubric')}</option>
                    {rubrics.data?.map((rubric) => (
                      <option key={rubric.id} value={rubric.id}>
                        {localize(rubric.title, locale, '')} ({rubric.totalPoints})
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">{t('assignments.rubricPickHint')}</p>
                </div>
              </div>
            ),
          },
          {
            id: 'peer',
            title: t('settingsForm.peerReview'),
            children: (
              <>
                <SwitchField
                  id="assignment-peer"
                  label={t('assignments.peerReview')}
                  description={t('assignments.peerReviewHint')}
                  checked={values.peerReviewEnabled}
                  onCheckedChange={(peerReviewEnabled) =>
                    update({
                      peerReviewEnabled,
                      peerReviewCount: peerReviewEnabled ? Math.max(1, values.peerReviewCount) : 0,
                    })
                  }
                />
                {values.peerReviewEnabled ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="assignment-peer-count">
                        {t('assignments.peerReviewCount')}
                      </Label>
                      <Input
                        id="assignment-peer-count"
                        type="number"
                        min={1}
                        max={10}
                        value={values.peerReviewCount}
                        onChange={number('peerReviewCount')}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="assignment-peer-due">
                        {t('assignments.peerReviewDueAt')}
                      </Label>
                      <Input
                        id="assignment-peer-due"
                        type="datetime-local"
                        value={values.peerReviewDueAt}
                        onChange={(event) => update({ peerReviewDueAt: event.target.value })}
                      />
                    </div>
                  </div>
                ) : null}
              </>
            ),
          },
          {
            id: 'extra',
            title: t('settingsForm.extra'),
            children: (
              <SwitchField
                id="assignment-plagiarism"
                label={t('assignments.plagiarismCheck')}
                description={t('assignments.plagiarismCheckHint')}
                checked={values.plagiarismCheck}
                onCheckedChange={(plagiarismCheck) => update({ plagiarismCheck })}
              />
            ),
          },
          {
            id: 'publish',
            title: t('settingsForm.publish'),
            children: (
              <SwitchField
                id="assignment-published"
                label={t('courses.published')}
                description={t('assignments.publishedHint')}
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
