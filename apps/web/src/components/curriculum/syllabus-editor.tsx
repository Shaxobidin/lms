/**
 * Maqsad: sillabus konstruktori — O'UM yadrosi (F-03).
 *
 * Bitta oynada sillabusning barcha bo'limlari: maqsad, vazifalar, o'quv
 * natijalari (Bloom darajasi bilan), mavzular rejasi (soatlar), adabiyotlar,
 * talabalar siyosati va baholash siyosati (JN/ON/YN og'irliklari).
 *
 * Ikki rejim: yaratish (`POST /syllabi`) va yangi versiya
 * (`POST /syllabi/:id/versions`). Tasdiqlangan versiya hech qachon
 * o'zgartirilmaydi — tahrir har doim yangi versiya (ADR-012, audit talabi),
 * shuning uchun muharrir oxirgi versiya mazmuni bilan ochiladi.
 *
 * Validatsiya `createSyllabusSchema` / `updateSyllabusVersionSchema` bilan
 * yuborishdan oldin (ADR-011). Ko'p tillilik: maqsad va siyosat 4 tilda,
 * ro'yxat elementlari esa joriy tilda — savol muharriridagi kabi (A-15).
 */

'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BLOOM_LEVELS,
  DEFAULT_GRADING_POLICY,
  createSyllabusSchema,
  updateSyllabusVersionSchema,
  type LocalizedText,
  type SyllabusContent,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import type { AppLocale } from '@/i18n/routing';
import { Button, Input, Label, Textarea } from '@/components/ui/primitives';
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

/** Serverdan kelgan baholash siyosati — og'irliklar va chegaralar. */
export interface GradingPolicy {
  weights: { JN: number; ON: number; YN: number };
  passingScore: number;
  finalExamThreshold: number;
  finalExamMinScore: number;
  latePenaltyPercent: number;
}

export interface SyllabusEditorProps {
  subjectId: string;
  departmentId: string;
  /** Berilsa — yangi versiya rejimi; bo'lmasa — yaratish. */
  syllabusId?: string;
  initialContent?: Partial<SyllabusContent> | null;
  initialPolicy?: GradingPolicy | null;
  onClose: () => void;
  onSaved: () => void;
}

const LITERATURE_TYPES = ['MAIN', 'ADDITIONAL', 'ELECTRONIC'] as const;

function read(value: LocalizedText | undefined, locale: AppLocale): string {
  if (!value) return '';
  return value[locale] ?? value['uz-Latn'] ?? Object.values(value).find(Boolean) ?? '';
}

function write(value: LocalizedText | undefined, locale: AppLocale, next: string): LocalizedText {
  const result = { ...(value ?? {}) };
  if (next.trim().length === 0) delete result[locale];
  else result[locale] = next;
  return result;
}

/** Mahalliy holat — raqamlar matn sifatida (bo'sh maydonga ruxsat berish uchun). */
interface DraftTopic {
  title: LocalizedText;
  lectureHours: string;
  practiceHours: string;
  labHours: string;
  independentHours: string;
  week: string;
}

interface DraftOutcome {
  text: LocalizedText;
  bloomLevel: string;
  competencyCode: string;
}

interface DraftLiterature {
  type: (typeof LITERATURE_TYPES)[number];
  citation: string;
  url: string;
}

const emptyTopic = (): DraftTopic => ({
  title: {},
  lectureHours: '2',
  practiceHours: '2',
  labHours: '0',
  independentHours: '4',
  week: '',
});

export function SyllabusEditor({
  subjectId,
  departmentId,
  syllabusId,
  initialContent,
  initialPolicy,
  onClose,
  onSaved,
}: SyllabusEditorProps) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [goal, setGoal] = useState<LocalizedText>(initialContent?.goal ?? {});
  const [policy, setPolicy] = useState<LocalizedText>(initialContent?.policy ?? {});
  const [objectives, setObjectives] = useState<LocalizedText[]>(initialContent?.objectives ?? [{}]);
  const [outcomes, setOutcomes] = useState<DraftOutcome[]>(
    (initialContent?.learningOutcomes ?? []).map((item) => ({
      text: item.text,
      bloomLevel: item.bloomLevel,
      competencyCode: item.competencyCode ?? '',
    })),
  );
  const [topics, setTopics] = useState<DraftTopic[]>(
    (initialContent?.topics ?? []).map((item) => ({
      title: item.title,
      lectureHours: String(item.lectureHours ?? 0),
      practiceHours: String(item.practiceHours ?? 0),
      labHours: String(item.labHours ?? 0),
      independentHours: String(item.independentHours ?? 0),
      week: item.week ? String(item.week) : '',
    })),
  );
  const [literature, setLiterature] = useState<DraftLiterature[]>(
    (initialContent?.literature ?? []).map((item) => ({
      type: item.type,
      citation: item.citation,
      url: item.url ?? '',
    })),
  );

  const basePolicy = initialPolicy ?? (DEFAULT_GRADING_POLICY as GradingPolicy);
  const [weights, setWeights] = useState({
    JN: String(basePolicy.weights.JN),
    ON: String(basePolicy.weights.ON),
    YN: String(basePolicy.weights.YN),
  });
  const [passingScore, setPassingScore] = useState(String(basePolicy.passingScore));
  const [finalExamThreshold, setFinalExamThreshold] = useState(
    String(basePolicy.finalExamThreshold),
  );
  const [changeNote, setChangeNote] = useState('');

  const weightSum = Number(weights.JN || 0) + Number(weights.ON || 0) + Number(weights.YN || 0);

  const hoursTotal = useMemo(
    () =>
      topics.reduce(
        (acc, topic) => ({
          lecture: acc.lecture + Number(topic.lectureHours || 0),
          practice: acc.practice + Number(topic.practiceHours || 0),
          lab: acc.lab + Number(topic.labHours || 0),
          independent: acc.independent + Number(topic.independentHours || 0),
        }),
        { lecture: 0, practice: 0, lab: 0, independent: 0 },
      ),
    [topics],
  );

  // Backend bilan bir xil sxema orqali yig'iladi va tekshiriladi
  const content = {
    goal,
    objectives: objectives.filter((item) => Object.values(item).some(Boolean)),
    learningOutcomes: outcomes.map((item) => ({
      text: item.text,
      bloomLevel: item.bloomLevel,
      ...(item.competencyCode.trim() ? { competencyCode: item.competencyCode.trim() } : {}),
    })),
    topics: topics.map((item) => ({
      title: item.title,
      lectureHours: item.lectureHours,
      practiceHours: item.practiceHours,
      labHours: item.labHours,
      independentHours: item.independentHours,
      ...(item.week ? { week: item.week } : {}),
    })),
    literature: literature.map((item) => ({
      type: item.type,
      citation: item.citation,
      ...(item.url.trim() ? { url: item.url.trim() } : {}),
    })),
    ...(Object.values(policy).some(Boolean) ? { policy } : {}),
  };

  const gradingPolicy = {
    weights: { JN: weights.JN, ON: weights.ON, YN: weights.YN },
    passingScore,
    finalExamThreshold,
    finalExamMinScore: basePolicy.finalExamMinScore,
    latePenaltyPercent: basePolicy.latePenaltyPercent,
  };

  const parsed = syllabusId
    ? updateSyllabusVersionSchema.safeParse({
        content,
        gradingPolicy,
        ...(changeNote.trim() ? { changeNote } : {}),
      })
    : createSyllabusSchema.safeParse({ subjectId, departmentId, content, gradingPolicy });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      if (syllabusId) return api.post(`/syllabi/${syllabusId}/versions`, parsed.data);
      return api.post('/syllabi', parsed.data);
    },
    onSuccess: () => {
      toast.success(syllabusId ? t('curriculum.versionCreated') : t('curriculum.syllabusCreated'));
      onSaved();
      onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const update = <T,>(list: T[], index: number, patch: Partial<T>): T[] =>
    list.map((item, position) => (position === index ? { ...item, ...patch } : item));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="lg">
        <DialogHeader>
          <DialogTitle>
            {syllabusId ? t('curriculum.newVersion') : t('curriculum.createSyllabus')}
          </DialogTitle>
          <DialogDescription>{t('curriculum.editorHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          {/* --- Maqsad --- */}
          <section className="space-y-1.5">
            <Label htmlFor="syllabus-goal" required>
              {t('curriculum.goal')}
            </Label>
            <Textarea
              id="syllabus-goal"
              rows={3}
              value={read(goal, locale)}
              onChange={(event) => setGoal(write(goal, locale, event.target.value))}
            />
          </section>

          {/* --- Vazifalar --- */}
          <section className="space-y-2">
            <ListHeader
              label={t('curriculum.objectives')}
              disabled={objectives.length >= 20}
              onAdd={() => setObjectives((s) => [...s, {}])}
            />
            {objectives.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  aria-label={`${t('curriculum.objectives')} ${index + 1}`}
                  value={read(item, locale)}
                  onChange={(event) =>
                    setObjectives((s) =>
                      s.map((row, i) =>
                        i === index ? write(row, locale, event.target.value) : row,
                      ),
                    )
                  }
                />
                <RemoveButton
                  label={t('common.delete')}
                  onClick={() => setObjectives((s) => s.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </section>

          {/* --- O'quv natijalari (Bloom) --- */}
          <section className="space-y-2">
            <ListHeader
              label={t('curriculum.learningOutcomes')}
              disabled={outcomes.length >= 30}
              onAdd={() =>
                setOutcomes((s) => [
                  ...s,
                  { text: {}, bloomLevel: 'UNDERSTAND', competencyCode: '' },
                ])
              }
            />
            {outcomes.map((item, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Input
                  className="min-w-0 flex-1"
                  aria-label={`${t('curriculum.learningOutcomes')} ${index + 1}`}
                  value={read(item.text, locale)}
                  onChange={(event) =>
                    setOutcomes((s) =>
                      update(s, index, { text: write(item.text, locale, event.target.value) }),
                    )
                  }
                />
                <Select
                  className="w-40"
                  aria-label={`${t('curriculum.bloomLevel')} ${index + 1}`}
                  value={item.bloomLevel}
                  onChange={(event) =>
                    setOutcomes((s) => update(s, index, { bloomLevel: event.target.value }))
                  }
                >
                  {BLOOM_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {t(`curriculum.${level}`)}
                    </option>
                  ))}
                </Select>
                <Input
                  className="w-28"
                  placeholder={t('curriculum.competencyCode')}
                  aria-label={`${t('curriculum.competencyCode')} ${index + 1}`}
                  value={item.competencyCode}
                  onChange={(event) =>
                    setOutcomes((s) => update(s, index, { competencyCode: event.target.value }))
                  }
                />
                <RemoveButton
                  label={t('common.delete')}
                  onClick={() => setOutcomes((s) => s.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </section>

          {/* --- Mavzular rejasi --- */}
          <section className="space-y-2">
            <ListHeader
              label={t('curriculum.topics')}
              disabled={topics.length >= 100}
              onAdd={() => setTopics((s) => [...s, emptyTopic()])}
            />
            <p className="text-xs text-muted-foreground">
              {t('curriculum.hoursTotal', {
                lecture: hoursTotal.lecture,
                practice: hoursTotal.practice,
                lab: hoursTotal.lab,
                independent: hoursTotal.independent,
              })}
            </p>
            {topics.map((item, index) => (
              <div key={index} className="space-y-1.5 rounded-md border border-border p-2">
                <div className="flex items-center gap-2">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  <Input
                    aria-label={`${t('curriculum.topics')} ${index + 1}`}
                    value={read(item.title, locale)}
                    onChange={(event) =>
                      setTopics((s) =>
                        update(s, index, { title: write(item.title, locale, event.target.value) }),
                      )
                    }
                  />
                  <RemoveButton
                    label={t('common.delete')}
                    onClick={() => setTopics((s) => s.filter((_, i) => i !== index))}
                  />
                </div>
                <div className="grid grid-cols-5 gap-1.5 ps-8">
                  {(
                    [
                      ['lectureHours', 'lectureHours'],
                      ['practiceHours', 'practiceHours'],
                      ['labHours', 'labHours'],
                      ['independentHours', 'independentHours'],
                    ] as const
                  ).map(([field, key]) => (
                    <HourCell
                      key={field}
                      label={t(`curriculum.${key}`)}
                      value={item[field]}
                      onChange={(value) => setTopics((s) => update(s, index, { [field]: value }))}
                    />
                  ))}
                  <HourCell
                    label={t('curriculum.week')}
                    value={item.week}
                    onChange={(value) => setTopics((s) => update(s, index, { week: value }))}
                  />
                </div>
              </div>
            ))}
          </section>

          {/* --- Adabiyotlar --- */}
          <section className="space-y-2">
            <ListHeader
              label={t('curriculum.literature')}
              disabled={literature.length >= 100}
              onAdd={() => setLiterature((s) => [...s, { type: 'MAIN', citation: '', url: '' }])}
            />
            {literature.map((item, index) => (
              <div key={index} className="flex flex-wrap items-center gap-2">
                <Select
                  className="w-36"
                  aria-label={`${t('curriculum.literature')} ${index + 1}`}
                  value={item.type}
                  onChange={(event) =>
                    setLiterature((s) =>
                      update(s, index, { type: event.target.value as DraftLiterature['type'] }),
                    )
                  }
                >
                  {LITERATURE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {t(`curriculum.literature_${type}`)}
                    </option>
                  ))}
                </Select>
                <Input
                  className="min-w-0 flex-1"
                  placeholder={t('curriculum.citation')}
                  aria-label={`${t('curriculum.citation')} ${index + 1}`}
                  value={item.citation}
                  onChange={(event) =>
                    setLiterature((s) => update(s, index, { citation: event.target.value }))
                  }
                />
                <Input
                  className="w-44"
                  placeholder="https://"
                  aria-label={`URL ${index + 1}`}
                  value={item.url}
                  onChange={(event) =>
                    setLiterature((s) => update(s, index, { url: event.target.value }))
                  }
                />
                <RemoveButton
                  label={t('common.delete')}
                  onClick={() => setLiterature((s) => s.filter((_, i) => i !== index))}
                />
              </div>
            ))}
          </section>

          {/* --- Talabalar siyosati --- */}
          <section className="space-y-1.5">
            <Label htmlFor="syllabus-policy">{t('curriculum.studentPolicy')}</Label>
            <Textarea
              id="syllabus-policy"
              rows={2}
              value={read(policy, locale)}
              onChange={(event) => setPolicy(write(policy, locale, event.target.value))}
            />
          </section>

          {/* --- Baholash siyosati --- */}
          <section className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between">
              <Label>{t('curriculum.gradingPolicy')}</Label>
              <span
                className={
                  Math.abs(weightSum - 100) < 0.001
                    ? 'text-xs tabular-nums text-success'
                    : 'text-xs tabular-nums text-destructive'
                }
              >
                {t('curriculum.weightSum', { sum: weightSum })}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['JN', 'ON', 'YN'] as const).map((key) => (
                <div key={key} className="space-y-1">
                  <Label htmlFor={`weight-${key}`} className="text-xs">
                    {t(`grades.${key}`)} %
                  </Label>
                  <Input
                    id={`weight-${key}`}
                    type="number"
                    min={0}
                    max={100}
                    value={weights[key]}
                    onChange={(event) => setWeights((s) => ({ ...s, [key]: event.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label htmlFor="passing-score" className="text-xs">
                  {t('curriculum.passingScore')}
                </Label>
                <Input
                  id="passing-score"
                  type="number"
                  min={0}
                  max={100}
                  value={passingScore}
                  onChange={(event) => setPassingScore(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="final-threshold" className="text-xs">
                  {t('curriculum.finalExamThreshold')}
                </Label>
                <Input
                  id="final-threshold"
                  type="number"
                  min={0}
                  max={100}
                  value={finalExamThreshold}
                  onChange={(event) => setFinalExamThreshold(event.target.value)}
                />
              </div>
            </div>
          </section>

          {syllabusId ? (
            <section className="space-y-1.5">
              <Label htmlFor="change-note">{t('curriculum.changeNote')}</Label>
              <Input
                id="change-note"
                value={changeNote}
                placeholder={t('curriculum.changeNotePlaceholder')}
                onChange={(event) => setChangeNote(event.target.value)}
              />
            </section>
          ) : null}

          {!parsed.success ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t('curriculum.incomplete')}
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

function ListHeader({
  label,
  onAdd,
  disabled,
}: {
  label: string;
  onAdd: () => void;
  disabled?: boolean;
}) {
  const t = useTranslations();
  return (
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Button type="button" size="sm" variant="outline" onClick={onAdd} disabled={disabled}>
        <Plus className="size-4" />
        {t('common.add')}
      </Button>
    </div>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-8 shrink-0"
      aria-label={label}
      onClick={onClick}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

function HourCell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-0.5">
      <span className="block truncate text-[10px] text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        max={100}
        aria-label={label}
        className="h-8 px-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
