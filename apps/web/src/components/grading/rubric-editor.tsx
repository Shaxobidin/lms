/**
 * Maqsad: rubrika muharriri — mezonlar va ularning darajalari (F-06).
 *
 * Rubrika baholashni shaffof qiladi: o'qituvchi har bir mezon uchun daraja
 * tanlaydi, tizim esa yig'ilgan ballni topshiriq shkalasiga proporsional
 * o'giradi. Shuning uchun bu yerda mezon maksimal balli va darajalari
 * ATAYLAB alohida ko'rsatiladi — jami ball jonli hisoblanadi.
 *
 * Qulflash: mezonlar bo'yicha allaqachon ball qo'yilgan bo'lsa, tuzilmani
 * o'zgartirish qo'yilgan baholarni yaroqsiz qiladi. Bunday rubrikada faqat
 * nom va tavsif tahrirlanadi — server ham shu qoidani takrorlaydi
 * (`errors.rubric_has_grades`), interfeys esa buni oldindan aytadi.
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Lock, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { createRubricSchema, updateRubricSchema, type LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import type { AppLocale } from '@/i18n/routing';
import { Alert, Button, Input, Label } from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LocalizedField } from '@/components/ui/form-controls';

export interface RubricLevel {
  label: unknown;
  points: number;
  description?: unknown;
}

export interface EditableCriterion {
  id?: string;
  title: LocalizedText;
  description?: LocalizedText | null;
  maxPoints: string | number;
  levels: RubricLevel[] | null;
}

export interface EditableRubric {
  id: string;
  title: LocalizedText;
  description?: LocalizedText | null;
  criteria: EditableCriterion[];
  /** Ball qo'yilgan — tuzilma qulflangan. */
  locked: boolean;
}

/** Mahalliy tahrirlash holati: raqamlar matn sifatida saqlanadi (bo'sh maydon uchun). */
interface DraftLevel {
  label: LocalizedText;
  points: string;
}

interface DraftCriterion {
  /** Mavjud mezonning `id` si — saqlashda ballar bog'liqligini uzmaslik uchun. */
  id?: string;
  title: LocalizedText;
  maxPoints: string;
  levels: DraftLevel[];
}

function toDraft(criterion: EditableCriterion): DraftCriterion {
  return {
    id: criterion.id,
    title: criterion.title ?? {},
    maxPoints: String(Number(criterion.maxPoints)),
    levels: (criterion.levels ?? []).map((level) => ({
      label: (level.label ?? {}) as LocalizedText,
      points: String(Number(level.points)),
    })),
  };
}

/** Yangi mezon — sxema minimal 2 ta daraja talab qiladi, shuning uchun ikkitasi bilan. */
function emptyCriterion(locale: AppLocale, t: (key: string) => string): DraftCriterion {
  return {
    title: {},
    maxPoints: '10',
    levels: [
      { label: { [locale]: t('assignments.levelLow') }, points: '0' },
      { label: { [locale]: t('assignments.levelHigh') }, points: '10' },
    ],
  };
}

export function RubricEditor({
  courseId,
  rubric,
  onClose,
  onSaved,
}: {
  courseId: string;
  /** Berilsa — tahrirlash rejimi. */
  rubric?: EditableRubric;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const locked = rubric?.locked ?? false;

  const [title, setTitle] = useState<LocalizedText>(rubric?.title ?? {});
  const [description, setDescription] = useState<LocalizedText>(rubric?.description ?? {});
  const [criteria, setCriteria] = useState<DraftCriterion[]>(
    rubric ? rubric.criteria.map(toDraft) : [emptyCriterion(locale, t)],
  );

  const total = criteria.reduce((sum, criterion) => {
    const value = Number(criterion.maxPoints);
    return sum + (Number.isFinite(value) ? value : 0);
  }, 0);

  const patch = (index: number, changes: Partial<DraftCriterion>) =>
    setCriteria((state) =>
      state.map((criterion, position) =>
        position === index ? { ...criterion, ...changes } : criterion,
      ),
    );

  const move = (index: number, delta: number) => {
    const target = index + delta;
    const next = [...criteria];
    const current = next[index];
    const swapped = next[target];
    if (!current || !swapped) return;
    next[index] = swapped;
    next[target] = current;
    setCriteria(next);
  };

  // Tekshiruv backend bilan bir xil sxemada (ADR-011)
  const body = {
    title,
    ...(Object.values(description).some(Boolean) ? { description } : {}),
    criteria: criteria.map((criterion, index) => ({
      ...(criterion.id ? { id: criterion.id } : {}),
      title: criterion.title,
      maxPoints: criterion.maxPoints,
      position: index,
      levels: criterion.levels.map((level) => ({ label: level.label, points: level.points })),
    })),
  };

  const parsed = rubric
    ? updateRubricSchema.safeParse(body)
    : createRubricSchema.safeParse({ ...body, courseId });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      if (rubric) return api.patch(`/rubrics/${rubric.id}`, parsed.data);
      return api.post('/rubrics', parsed.data);
    },
    onSuccess: () => {
      toast.success(rubric ? t('common.saved') : t('assignments.rubricCreated'));
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
            {rubric ? t('assignments.editRubric') : t('assignments.createRubric')}
          </DialogTitle>
          <DialogDescription>{t('assignments.rubricEditorHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {locked ? (
            <Alert variant="warning" title={t('assignments.rubricLockedTitle')}>
              <span className="inline-flex items-center gap-2">
                <Lock className="size-4" aria-hidden="true" />
                {t('assignments.rubricLockedDescription')}
              </span>
            </Alert>
          ) : null}

          <LocalizedField
            idPrefix="rubric-title"
            label={t('common.title')}
            value={title}
            onChange={setTitle}
            required
            moreLabel={t('common.otherLanguages')}
          />

          <LocalizedField
            idPrefix="rubric-description"
            label={t('common.description')}
            value={description}
            onChange={setDescription}
            moreLabel={t('common.otherLanguages')}
          />

          <section className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('assignments.criteria')}</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {t('assignments.rubricTotal')}: {total}
              </span>
            </div>

            <ol className="space-y-3">
              {criteria.map((criterion, index) => (
                <CriterionCard
                  key={criterion.id ?? `new-${index}`}
                  criterion={criterion}
                  index={index}
                  locale={locale}
                  locked={locked}
                  canRemove={criteria.length > 1}
                  isFirst={index === 0}
                  isLast={index === criteria.length - 1}
                  onChange={(changes) => patch(index, changes)}
                  onMove={(delta) => move(index, delta)}
                  onRemove={() =>
                    setCriteria((state) => state.filter((_, position) => position !== index))
                  }
                />
              ))}
            </ol>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={locked || criteria.length >= 30}
              onClick={() => setCriteria((state) => [...state, emptyCriterion(locale, t)])}
            >
              <Plus className="size-4" />
              {t('assignments.addCriterion')}
            </Button>
          </section>

          {!parsed.success ? (
            <p role="status" className="text-xs text-muted-foreground">
              {t('assignments.rubricIncomplete')}
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

/** Bitta mezon: nom, maksimal ball va darajalar. */
function CriterionCard({
  criterion,
  index,
  locale,
  locked,
  canRemove,
  isFirst,
  isLast,
  onChange,
  onMove,
  onRemove,
}: {
  criterion: DraftCriterion;
  index: number;
  locale: AppLocale;
  locked: boolean;
  canRemove: boolean;
  isFirst: boolean;
  isLast: boolean;
  onChange: (changes: Partial<DraftCriterion>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
}) {
  const t = useTranslations();

  const max = Number(criterion.maxPoints);
  const levelOverMax = criterion.levels.some((level) => Number(level.points) > max);

  const patchLevel = (position: number, changes: Partial<DraftLevel>) =>
    onChange({
      levels: criterion.levels.map((level, current) =>
        current === position ? { ...level, ...changes } : level,
      ),
    });

  return (
    <li className="space-y-3 rounded-md border border-border p-3">
      <div className="flex items-end gap-2">
        <span className="pb-2 text-xs tabular-nums text-muted-foreground">{index + 1}.</span>

        <div className="min-w-0 flex-1 space-y-1.5">
          <Label htmlFor={`criterion-title-${index}`} required>
            {t('assignments.criterion')}
          </Label>
          <Input
            id={`criterion-title-${index}`}
            value={criterion.title[locale] ?? criterion.title['uz-Latn'] ?? ''}
            disabled={locked}
            onChange={(event) =>
              onChange({ title: { ...criterion.title, [locale]: event.target.value } })
            }
          />
        </div>

        <div className="w-24 space-y-1.5">
          <Label htmlFor={`criterion-max-${index}`}>{t('assignments.maxScore')}</Label>
          <Input
            id={`criterion-max-${index}`}
            type="number"
            min={0.5}
            max={100}
            step="0.5"
            value={criterion.maxPoints}
            disabled={locked}
            onChange={(event) => onChange({ maxPoints: event.target.value })}
          />
        </div>

        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 shrink-0"
          aria-label={t('common.moveUp')}
          disabled={locked || isFirst}
          onClick={() => onMove(-1)}
        >
          ↑
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 shrink-0"
          aria-label={t('common.moveDown')}
          disabled={locked || isLast}
          onClick={() => onMove(1)}
        >
          ↓
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-9 shrink-0"
          aria-label={t('common.delete')}
          disabled={locked || !canRemove}
          onClick={onRemove}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>

      {/* Darajalar — baholash oynasida bir bosishli tugmalarga aylanadi */}
      <div className="space-y-1.5 rounded-md bg-muted/30 p-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium">{t('assignments.levels')}</span>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7"
            disabled={locked || criterion.levels.length >= 10}
            onClick={() =>
              onChange({
                levels: [...criterion.levels, { label: {}, points: String(max) }],
              })
            }
          >
            <Plus className="size-3.5" />
            {t('common.add')}
          </Button>
        </div>

        {criterion.levels.map((level, position) => (
          <div key={position} className="flex items-center gap-2">
            <Input
              className="h-8"
              aria-label={`${t('assignments.levels')} ${position + 1}`}
              placeholder={t('assignments.levelPlaceholder')}
              value={level.label[locale] ?? level.label['uz-Latn'] ?? ''}
              disabled={locked}
              onChange={(event) =>
                patchLevel(position, { label: { ...level.label, [locale]: event.target.value } })
              }
            />
            <Input
              className="h-8 w-20 text-right"
              type="number"
              min={0}
              max={100}
              step="0.5"
              aria-label={`${t('assignments.levels')} ${position + 1} — ${t('assignments.grade')}`}
              value={level.points}
              disabled={locked}
              aria-invalid={Number(level.points) > max}
              onChange={(event) => patchLevel(position, { points: event.target.value })}
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label={t('common.delete')}
              disabled={locked || criterion.levels.length <= 2}
              onClick={() =>
                onChange({
                  levels: criterion.levels.filter((_, current) => current !== position),
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        ))}

        {levelOverMax ? (
          <p className="text-xs text-warning">{t('assignments.levelOverMax')}</p>
        ) : null}
      </div>
    </li>
  );
}
