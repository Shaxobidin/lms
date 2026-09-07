/**
 * Maqsad: savollar bankidagi 10 tur savol uchun payload muharrirlari (F-07).
 *
 * Har bir tur `@lms/shared` dagi `questionPayloadSchema` ning aynan bir tarmog'ini
 * to'ldiradi — validatsiya kontrakti bitta manbadan olinadi (ADR-011), shu sababli
 * bu yerda qoidalar takrorlanmaydi: muharrir faqat to'g'ri SHAKLDAGI obyektni
 * yig'adi, yaroqliligini esa yuborishdan oldin zod tekshiradi.
 *
 * Ko'p tillilik haqida: savol matni 4 tilda kiritiladi, variantlar va elementlar
 * matni esa o'qituvchi ishlayotgan JORIY tilda saqlanadi. Sabab — 10 ta variantni
 * 4 tilda so'rash formani ishlatib bo'lmas darajada uzaytiradi; `resolveLocalized`
 * zaxira zanjiri boshqa tildagi foydalanuvchiga matnni baribir ko'rsatadi (A-15).
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText, QuestionPayload, QuestionType } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import { Button, Input, Label, Textarea } from '@/components/ui/primitives';
import { Select, SwitchField } from '@/components/ui/form-controls';

type Of<T extends QuestionType> = Extract<QuestionPayload, { type: T }>;

/** Qisqa, barqaror identifikator — variant va element id lari uchun. */
function newId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** Joriy tildagi matnni o'qish. */
function read(value: LocalizedText, locale: AppLocale): string {
  return value[locale] ?? value['uz-Latn'] ?? Object.values(value).find(Boolean) ?? '';
}

/** Joriy tilga yozish; bo'sh qiymat kalitni olib tashlaydi (sxema `min(1)` talab qiladi). */
function write(value: LocalizedText, locale: AppLocale, next: string): LocalizedText {
  const result = { ...value };
  if (next.trim().length === 0) delete result[locale];
  else result[locale] = next;
  return result;
}

/** Har bir tur uchun bo'sh, ammo sxema shakliga mos boshlang'ich qiymat. */
export function defaultPayload(type: QuestionType, locale: AppLocale): QuestionPayload {
  const label = (text: string): LocalizedText => ({ [locale]: text });

  switch (type) {
    case 'SINGLE':
      return {
        type: 'SINGLE',
        options: [
          { id: newId(), text: {}, isCorrect: true, weight: 0 },
          { id: newId(), text: {}, isCorrect: false, weight: 0 },
        ],
      };
    case 'MULTI':
      return {
        type: 'MULTI',
        penalizeWrong: true,
        options: [
          { id: newId(), text: {}, isCorrect: true, weight: 0 },
          { id: newId(), text: {}, isCorrect: true, weight: 0 },
          { id: newId(), text: {}, isCorrect: false, weight: 0 },
        ],
      };
    case 'MATCHING': {
      const left = [
        { id: newId(), text: {} },
        { id: newId(), text: {} },
      ];
      const right = [
        { id: newId(), text: {} },
        { id: newId(), text: {} },
      ];
      return {
        type: 'MATCHING',
        left,
        right,
        // Boshlang'ich juftliklar tartib bo'yicha: 1-1, 2-2
        pairs: left.flatMap((item, index) => {
          const match = right[index];
          return match ? [{ leftId: item.id, rightId: match.id }] : [];
        }),
      };
    }
    case 'ORDERING': {
      const items = [
        { id: newId(), text: {} },
        { id: newId(), text: {} },
      ];
      return { type: 'ORDERING', items, correctOrder: items.map((item) => item.id) };
    }
    case 'CLOZE':
      return {
        type: 'CLOZE',
        template: label(''),
        blanks: [{ key: '1', accepted: [''], caseSensitive: false, points: 1 }],
      };
    case 'ESSAY':
      return { type: 'ESSAY', minWords: 0, maxWords: 0, allowAttachments: false };
    case 'NUMERIC':
      return { type: 'NUMERIC', correctValue: 0, tolerance: 0 };
    case 'HOTSPOT':
      return { type: 'HOTSPOT', imageFileId: '', areas: [], requiredAreaIds: [] };
    case 'DRAG_DROP': {
      const item = { id: newId(), text: {} };
      const zone = { id: newId(), label: {} };
      return {
        type: 'DRAG_DROP',
        items: [item],
        zones: [zone],
        placements: [{ itemId: item.id, zoneId: zone.id }],
      };
    }
    case 'CODE':
      return { type: 'CODE', language: 'python', starterCode: '', testCases: [] };
  }
}

interface EditorProps {
  payload: QuestionPayload;
  onChange: (next: QuestionPayload) => void;
  locale: AppLocale;
  courseId?: string;
}

export function PayloadEditor(props: EditorProps) {
  const { payload } = props;

  switch (payload.type) {
    case 'SINGLE':
    case 'MULTI':
      return <ChoiceEditor {...props} payload={payload} />;
    case 'MATCHING':
      return <MatchingEditor {...props} payload={payload} />;
    case 'ORDERING':
      return <OrderingEditor {...props} payload={payload} />;
    case 'CLOZE':
      return <ClozeEditor {...props} payload={payload} />;
    case 'ESSAY':
      return <EssayEditor {...props} payload={payload} />;
    case 'NUMERIC':
      return <NumericEditor {...props} payload={payload} />;
    case 'HOTSPOT':
      return <HotspotEditor {...props} payload={payload} />;
    case 'DRAG_DROP':
      return <DragDropEditor {...props} payload={payload} />;
    case 'CODE':
      return <CodeEditor {...props} payload={payload} />;
  }
}

/** Ro'yxat sarlavhasi + "qo'shish" tugmasi — barcha turlarda takrorlanadi. */
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

function RemoveButton({
  onClick,
  disabled,
  label,
}: {
  onClick: () => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className="size-8 shrink-0"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
    >
      <Trash2 className="size-4" />
    </Button>
  );
}

// --- SINGLE / MULTI ---------------------------------------------------------

function ChoiceEditor({
  payload,
  onChange,
  locale,
}: EditorProps & { payload: Of<'SINGLE'> | Of<'MULTI'> }) {
  const t = useTranslations();
  const isMulti = payload.type === 'MULTI';
  const maxOptions = isMulti ? 15 : 10;

  const update = (options: Of<'SINGLE'>['options']) => onChange({ ...payload, options });

  /** SINGLE turida faqat bitta to'g'ri javob bo'ladi — tanlov radio kabi ishlaydi. */
  const toggleCorrect = (id: string, value: boolean) =>
    update(
      payload.options.map((option) => ({
        ...option,
        isCorrect: isMulti ? (option.id === id ? value : option.isCorrect) : option.id === id,
      })),
    );

  return (
    <div className="space-y-3">
      <ListHeader
        label={t('quizzes.options')}
        disabled={payload.options.length >= maxOptions}
        onAdd={() =>
          update([...payload.options, { id: newId(), text: {}, isCorrect: false, weight: 0 }])
        }
      />

      <ul className="space-y-2">
        {payload.options.map((option, index) => (
          <li key={option.id} className="flex items-center gap-2">
            <input
              type={isMulti ? 'checkbox' : 'radio'}
              name="correct-option"
              className="size-4 shrink-0 accent-[hsl(var(--primary))]"
              checked={option.isCorrect}
              aria-label={`${t('quizzes.correct')} — ${index + 1}`}
              onChange={(event) => toggleCorrect(option.id, event.target.checked)}
            />
            <Input
              value={read(option.text, locale)}
              placeholder={`${t('quizzes.option')} ${index + 1}`}
              aria-label={`${t('quizzes.option')} ${index + 1}`}
              onChange={(event) =>
                update(
                  payload.options.map((item) =>
                    item.id === option.id
                      ? { ...item, text: write(item.text, locale, event.target.value) }
                      : item,
                  ),
                )
              }
            />
            <RemoveButton
              label={t('common.delete')}
              disabled={payload.options.length <= 2}
              onClick={() => update(payload.options.filter((item) => item.id !== option.id))}
            />
          </li>
        ))}
      </ul>

      {isMulti ? (
        <SwitchField
          id="penalize-wrong"
          label={t('quizzes.penalizeWrong')}
          description={t('quizzes.penalizeWrongHint')}
          checked={payload.penalizeWrong}
          onCheckedChange={(value) => onChange({ ...payload, penalizeWrong: value })}
        />
      ) : null}
    </div>
  );
}

// --- MATCHING ---------------------------------------------------------------

function MatchingEditor({ payload, onChange, locale }: EditorProps & { payload: Of<'MATCHING'> }) {
  const t = useTranslations();

  /** Chap element o'chirilganda unga tegishli juftlik ham yo'qoladi. */
  const removeLeft = (id: string) =>
    onChange({
      ...payload,
      left: payload.left.filter((item) => item.id !== id),
      pairs: payload.pairs.filter((pair) => pair.leftId !== id),
    });

  const setPair = (leftId: string, rightId: string) =>
    onChange({
      ...payload,
      pairs: [...payload.pairs.filter((pair) => pair.leftId !== leftId), { leftId, rightId }],
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ListHeader
          label={t('quizzes.matchingRight')}
          disabled={payload.right.length >= 20}
          onAdd={() =>
            onChange({ ...payload, right: [...payload.right, { id: newId(), text: {} }] })
          }
        />
        <ul className="space-y-2">
          {payload.right.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <Input
                value={read(item.text, locale)}
                placeholder={`${t('quizzes.matchingRight')} ${index + 1}`}
                aria-label={`${t('quizzes.matchingRight')} ${index + 1}`}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    right: payload.right.map((row) =>
                      row.id === item.id
                        ? { ...row, text: write(row.text, locale, event.target.value) }
                        : row,
                    ),
                  })
                }
              />
              <RemoveButton
                label={t('common.delete')}
                disabled={payload.right.length <= 2}
                onClick={() =>
                  onChange({
                    ...payload,
                    right: payload.right.filter((row) => row.id !== item.id),
                    pairs: payload.pairs.filter((pair) => pair.rightId !== item.id),
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <ListHeader
          label={t('quizzes.matchingLeft')}
          disabled={payload.left.length >= 15}
          onAdd={() => onChange({ ...payload, left: [...payload.left, { id: newId(), text: {} }] })}
        />
        <ul className="space-y-2">
          {payload.left.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <Input
                value={read(item.text, locale)}
                placeholder={`${t('quizzes.matchingLeft')} ${index + 1}`}
                aria-label={`${t('quizzes.matchingLeft')} ${index + 1}`}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    left: payload.left.map((row) =>
                      row.id === item.id
                        ? { ...row, text: write(row.text, locale, event.target.value) }
                        : row,
                    ),
                  })
                }
              />
              <Select
                className="w-40 shrink-0"
                aria-label={`${t('quizzes.correctPair')} — ${index + 1}`}
                value={payload.pairs.find((pair) => pair.leftId === item.id)?.rightId ?? ''}
                onChange={(event) => setPair(item.id, event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {payload.right.map((option, position) => (
                  <option key={option.id} value={option.id}>
                    {read(option.text, locale) || `${t('quizzes.matchingRight')} ${position + 1}`}
                  </option>
                ))}
              </Select>
              <RemoveButton
                label={t('common.delete')}
                disabled={payload.left.length <= 2}
                onClick={() => removeLeft(item.id)}
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- ORDERING ---------------------------------------------------------------

function OrderingEditor({ payload, onChange, locale }: EditorProps & { payload: Of<'ORDERING'> }) {
  const t = useTranslations();

  /** Elementlar shu yerda TO'G'RI tartibda turadi; pleyer ularni aralashtiradi. */
  const move = (index: number, delta: number) => {
    const next = [...payload.items];
    const target = index + delta;
    const current = next[index];
    const swapped = next[target];
    if (!current || !swapped) return;
    next[index] = swapped;
    next[target] = current;
    onChange({ ...payload, items: next, correctOrder: next.map((item) => item.id) });
  };

  const setItems = (items: Of<'ORDERING'>['items']) =>
    onChange({ ...payload, items, correctOrder: items.map((item) => item.id) });

  return (
    <div className="space-y-2">
      <ListHeader
        label={t('quizzes.correctOrder')}
        disabled={payload.items.length >= 15}
        onAdd={() => setItems([...payload.items, { id: newId(), text: {} }])}
      />
      <p className="text-xs text-muted-foreground">{t('quizzes.correctOrderHint')}</p>

      <ol className="space-y-2">
        {payload.items.map((item, index) => (
          <li key={item.id} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
              {index + 1}.
            </span>
            <Input
              value={read(item.text, locale)}
              aria-label={`${t('quizzes.option')} ${index + 1}`}
              onChange={(event) =>
                setItems(
                  payload.items.map((row) =>
                    row.id === item.id
                      ? { ...row, text: write(row.text, locale, event.target.value) }
                      : row,
                  ),
                )
              }
            />
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label={t('common.moveUp')}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              ↑
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              aria-label={t('common.moveDown')}
              disabled={index === payload.items.length - 1}
              onClick={() => move(index, 1)}
            >
              ↓
            </Button>
            <RemoveButton
              label={t('common.delete')}
              disabled={payload.items.length <= 2}
              onClick={() => setItems(payload.items.filter((row) => row.id !== item.id))}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

// --- CLOZE ------------------------------------------------------------------

function ClozeEditor({ payload, onChange, locale }: EditorProps & { payload: Of<'CLOZE'> }) {
  const t = useTranslations();
  const template = read(payload.template, locale);

  /**
   * Matndagi `[[kalit]]` belgilarini bo'shliqlar ro'yxati bilan moslashtiradi:
   * yangi kalitlar qo'shiladi, matndan olib tashlanganlari o'chiriladi.
   * Mavjud kalitlarning javoblari saqlanib qoladi.
   */
  const syncBlanks = () => {
    const keys = [...template.matchAll(/\[\[([^\]]{1,16})\]\]/g)].map(
      (match) => match[1]?.trim() ?? '',
    );
    const unique = keys.filter((key, index) => key.length > 0 && keys.indexOf(key) === index);

    if (unique.length === 0) {
      toast.error(t('quizzes.clozeNoBlanks'));
      return;
    }

    onChange({
      ...payload,
      blanks: unique.map(
        (key) =>
          payload.blanks.find((blank) => blank.key === key) ?? {
            key,
            accepted: [''],
            caseSensitive: false,
            points: 1,
          },
      ),
    });
  };

  const updateBlank = (key: string, patch: Partial<Of<'CLOZE'>['blanks'][number]>) =>
    onChange({
      ...payload,
      blanks: payload.blanks.map((blank) => (blank.key === key ? { ...blank, ...patch } : blank)),
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="cloze-template" required>
          {t('quizzes.clozeTemplate')}
        </Label>
        <Textarea
          id="cloze-template"
          rows={4}
          value={template}
          placeholder={t('quizzes.clozeTemplatePlaceholder')}
          onChange={(event) =>
            onChange({ ...payload, template: write(payload.template, locale, event.target.value) })
          }
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">{t('quizzes.clozeHint')}</p>
          <Button type="button" size="sm" variant="outline" onClick={syncBlanks}>
            {t('quizzes.clozeSync')}
          </Button>
        </div>
      </div>

      <ul className="space-y-2">
        {payload.blanks.map((blank) => (
          <li key={blank.key} className="space-y-2 rounded-md border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="font-mono text-sm">[[{blank.key}]]</span>
              <div className="flex items-center gap-2">
                <Label htmlFor={`blank-points-${blank.key}`} className="text-xs">
                  {t('quizzes.score')}
                </Label>
                <Input
                  id={`blank-points-${blank.key}`}
                  type="number"
                  min={0}
                  step="0.5"
                  className="h-8 w-20"
                  value={blank.points}
                  onChange={(event) =>
                    updateBlank(blank.key, { points: Number(event.target.value) })
                  }
                />
              </div>
            </div>

            <Input
              aria-label={`${t('quizzes.acceptedAnswers')} — ${blank.key}`}
              placeholder={t('quizzes.acceptedAnswersPlaceholder')}
              value={blank.accepted.join(' | ')}
              onChange={(event) =>
                updateBlank(blank.key, {
                  accepted: event.target.value.split('|').map((value) => value.trim()),
                })
              }
            />

            <Input
              aria-label={`${t('quizzes.clozeOptions')} — ${blank.key}`}
              placeholder={t('quizzes.clozeOptionsPlaceholder')}
              value={(blank.options ?? []).join(' | ')}
              onChange={(event) => {
                const options = event.target.value
                  .split('|')
                  .map((value) => value.trim())
                  .filter(Boolean);
                updateBlank(blank.key, { options: options.length > 0 ? options : undefined });
              }}
            />
            <p className="text-xs text-muted-foreground">{t('quizzes.clozeOptionsHint')}</p>

            <SwitchField
              id={`blank-case-${blank.key}`}
              label={t('quizzes.caseSensitive')}
              checked={blank.caseSensitive}
              onCheckedChange={(value) => updateBlank(blank.key, { caseSensitive: value })}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

// --- ESSAY ------------------------------------------------------------------

function EssayEditor({ payload, onChange, locale }: EditorProps & { payload: Of<'ESSAY'> }) {
  const t = useTranslations();

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('quizzes.manualGradingNotice')}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="essay-min">{t('quizzes.minWords')}</Label>
          <Input
            id="essay-min"
            type="number"
            min={0}
            value={payload.minWords}
            onChange={(event) => onChange({ ...payload, minWords: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="essay-max">{t('quizzes.maxWords')}</Label>
          <Input
            id="essay-max"
            type="number"
            min={0}
            value={payload.maxWords}
            onChange={(event) => onChange({ ...payload, maxWords: Number(event.target.value) })}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="essay-hint">{t('quizzes.gradingHint')}</Label>
        <Textarea
          id="essay-hint"
          rows={2}
          value={read(payload.gradingHint ?? {}, locale)}
          onChange={(event) =>
            onChange({
              ...payload,
              gradingHint: write(payload.gradingHint ?? {}, locale, event.target.value),
            })
          }
        />
      </div>

      <SwitchField
        id="essay-attachments"
        label={t('quizzes.allowAttachments')}
        checked={payload.allowAttachments}
        onCheckedChange={(value) => onChange({ ...payload, allowAttachments: value })}
      />
    </div>
  );
}

// --- NUMERIC ----------------------------------------------------------------

function NumericEditor({ payload, onChange }: EditorProps & { payload: Of<'NUMERIC'> }) {
  const t = useTranslations();

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="space-y-1.5">
        <Label htmlFor="numeric-value" required>
          {t('quizzes.numericAnswer')}
        </Label>
        <Input
          id="numeric-value"
          type="number"
          step="any"
          value={payload.correctValue}
          onChange={(event) => onChange({ ...payload, correctValue: Number(event.target.value) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="numeric-tolerance">{t('quizzes.tolerance')}</Label>
        <Input
          id="numeric-tolerance"
          type="number"
          min={0}
          step="any"
          value={payload.tolerance}
          onChange={(event) => onChange({ ...payload, tolerance: Number(event.target.value) })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="numeric-unit">{t('quizzes.unit')}</Label>
        <Input
          id="numeric-unit"
          value={payload.unit ?? ''}
          onChange={(event) => onChange({ ...payload, unit: event.target.value || undefined })}
        />
      </div>

      <div className="sm:col-span-3">
        <SwitchField
          id="numeric-slider"
          label={t('quizzes.slider')}
          description={t('quizzes.sliderHint')}
          checked={Boolean(payload.range)}
          onCheckedChange={(value) =>
            onChange({ ...payload, range: value ? { min: 0, max: 100, step: 1 } : undefined })
          }
        />
      </div>
      {payload.range ? (
        <>
          <NumberCell
            label={t('quizzes.rangeMin')}
            value={payload.range.min}
            onChange={(value) => onChange({ ...payload, range: { ...payload.range!, min: value } })}
          />
          <NumberCell
            label={t('quizzes.rangeMax')}
            value={payload.range.max}
            onChange={(value) => onChange({ ...payload, range: { ...payload.range!, max: value } })}
          />
          <NumberCell
            label={t('quizzes.rangeStep')}
            value={payload.range.step}
            onChange={(value) =>
              onChange({ ...payload, range: { ...payload.range!, step: value > 0 ? value : 1 } })
            }
          />
        </>
      ) : null}
    </div>
  );
}

// --- HOTSPOT ----------------------------------------------------------------

function HotspotEditor({ payload, onChange, courseId }: EditorProps & { payload: Of<'HOTSPOT'> }) {
  const t = useTranslations();
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Rasm havolasi qisqa muddatli (presigned) — fayl almashganda qayta olinadi
  useEffect(() => {
    if (!payload.imageFileId) {
      setPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await api.get<{ url: string }>(
          `/content/files/${payload.imageFileId}/download`,
        );
        if (!cancelled) setPreviewUrl(data.url);
      } catch {
        if (!cancelled) setPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload.imageFileId]);

  const upload = async (file: File) => {
    setUploading(true);
    try {
      const result = await uploadFile(file, { purpose: 'COURSE_CONTENT', courseId });
      onChange({ ...payload, imageFileId: result.fileObjectId, areas: [], requiredAreaIds: [] });
    } catch (error) {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    } finally {
      setUploading(false);
    }
  };

  /** Rasmga bosilganda o'sha nuqtada standart o'lchamli to'rtburchak soha yaratiladi. */
  const addAreaAt = (event: React.MouseEvent<HTMLImageElement>) => {
    if (payload.areas.length >= 20) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    const area = {
      id: newId(),
      shape: 'RECT' as const,
      x: Math.max(0, Math.min(90, Math.round(x - 5))),
      y: Math.max(0, Math.min(90, Math.round(y - 5))),
      width: 10,
      height: 10,
    };
    onChange({
      ...payload,
      areas: [...payload.areas, area],
      requiredAreaIds: [...payload.requiredAreaIds, area.id],
    });
  };

  const updateArea = (id: string, patch: Partial<Of<'HOTSPOT'>['areas'][number]>) =>
    onChange({
      ...payload,
      areas: payload.areas.map((area) => (area.id === id ? { ...area, ...patch } : area)),
    });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="hotspot-image" required>
          {t('quizzes.hotspotImage')}
        </Label>
        <Input
          id="hotspot-image"
          type="file"
          accept="image/*"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <p className="text-xs text-muted-foreground">{t('quizzes.hotspotHint')}</p>
      </div>

      {previewUrl ? (
        <div className="relative inline-block max-w-full overflow-hidden rounded-md border border-border">
          {/* `next/image` emas: havola qisqa muddatli presigned URL, uni
              optimizatsiya qatlami orqali keshlab bo'lmaydi */}
          <img
            src={previewUrl}
            alt={t('quizzes.hotspotImage')}
            className="block max-w-full cursor-crosshair"
            onClick={addAreaAt}
          />
          {payload.areas
            .filter((area) => area.shape !== 'POLY')
            .map((area) => (
              <span
                key={area.id}
                aria-hidden="true"
                className={cn(
                  'pointer-events-none absolute border-2 border-primary bg-primary/20',
                  area.shape === 'CIRCLE' ? 'rounded-full' : 'rounded-sm',
                )}
                style={{
                  left: `${area.x}%`,
                  top: `${area.y}%`,
                  width: `${area.shape === 'CIRCLE' ? (area.radius ?? 5) * 2 : (area.width ?? 10)}%`,
                  height: `${area.shape === 'CIRCLE' ? (area.radius ?? 5) * 2 : (area.height ?? 10)}%`,
                }}
              />
            ))}
          {payload.areas.some((area) => area.shape === 'POLY') ? (
            // Ko'pburchaklar — foiz koordinatalarida SVG qatlami
            <svg
              aria-hidden="true"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 h-full w-full"
            >
              {payload.areas
                .filter((area) => area.shape === 'POLY')
                .map((area) => (
                  <polygon
                    key={area.id}
                    points={(area.points ?? []).map((point) => `${point.x},${point.y}`).join(' ')}
                    className="fill-primary/20 stroke-primary"
                    strokeWidth={0.6}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
            </svg>
          ) : null}
        </div>
      ) : null}

      <ul className="space-y-2">
        {payload.areas.map((area, index) => (
          <li
            key={area.id}
            className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2"
          >
            <span className="text-xs text-muted-foreground">
              {t('quizzes.hotspotArea')} {index + 1}
            </span>
            <Select
              className="h-8 w-28"
              aria-label={`${t('quizzes.hotspotArea')} ${index + 1}`}
              value={area.shape}
              onChange={(event) => {
                const shape = event.target.value as 'RECT' | 'CIRCLE' | 'POLY';
                updateArea(area.id, {
                  shape,
                  // Ko'pburchakka o'tganda mavjud to'rtburchakdan uchburchak yasaymiz
                  ...(shape === 'POLY' && !area.points
                    ? {
                        points: [
                          { x: area.x, y: area.y },
                          { x: Math.min(100, area.x + (area.width ?? 10)), y: area.y },
                          { x: area.x, y: Math.min(100, area.y + (area.height ?? 10)) },
                        ],
                      }
                    : {}),
                });
              }}
            >
              <option value="RECT">{t('quizzes.shapeRect')}</option>
              <option value="CIRCLE">{t('quizzes.shapeCircle')}</option>
              <option value="POLY">{t('quizzes.shapePoly')}</option>
            </Select>
            <NumberCell
              label="X"
              value={area.x}
              onChange={(value) => updateArea(area.id, { x: value })}
            />
            <NumberCell
              label="Y"
              value={area.y}
              onChange={(value) => updateArea(area.id, { y: value })}
            />
            {area.shape === 'POLY' ? (
              <div className="min-w-64 flex-1 space-y-1">
                <Input
                  aria-label={`${t('quizzes.polyPoints')} ${index + 1}`}
                  placeholder="10,10; 30,10; 20,30"
                  value={(area.points ?? []).map((point) => `${point.x},${point.y}`).join('; ')}
                  onChange={(event) => {
                    const points = event.target.value
                      .split(';')
                      .map((pair) => pair.split(',').map((value) => Number(value.trim())))
                      .filter(
                        (pair): pair is [number, number] =>
                          pair.length === 2 && pair.every((value) => Number.isFinite(value)),
                      )
                      .map(([x, y]) => ({
                        x: Math.max(0, Math.min(100, x)),
                        y: Math.max(0, Math.min(100, y)),
                      }));
                    updateArea(area.id, {
                      points,
                      x: points[0]?.x ?? area.x,
                      y: points[0]?.y ?? area.y,
                    });
                  }}
                />
                <p className="text-xs text-muted-foreground">{t('quizzes.polyPointsHint')}</p>
              </div>
            ) : area.shape === 'CIRCLE' ? (
              <NumberCell
                label="R"
                value={area.radius ?? 5}
                onChange={(value) => updateArea(area.id, { radius: value })}
              />
            ) : (
              <>
                <NumberCell
                  label="W"
                  value={area.width ?? 10}
                  onChange={(value) => updateArea(area.id, { width: value })}
                />
                <NumberCell
                  label="H"
                  value={area.height ?? 10}
                  onChange={(value) => updateArea(area.id, { height: value })}
                />
              </>
            )}
            <RemoveButton
              label={t('common.delete')}
              onClick={() =>
                onChange({
                  ...payload,
                  areas: payload.areas.filter((row) => row.id !== area.id),
                  requiredAreaIds: payload.requiredAreaIds.filter((id) => id !== area.id),
                })
              }
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

function NumberCell({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-0.5">
      <span className="block text-[10px] uppercase text-muted-foreground">{label}</span>
      <Input
        type="number"
        min={0}
        max={100}
        aria-label={label}
        className="h-8 w-16"
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

// --- DRAG_DROP --------------------------------------------------------------

function DragDropEditor({ payload, onChange, locale }: EditorProps & { payload: Of<'DRAG_DROP'> }) {
  const t = useTranslations();

  const setPlacement = (itemId: string, zoneId: string) =>
    onChange({
      ...payload,
      placements: [
        ...payload.placements.filter((row) => row.itemId !== itemId),
        { itemId, zoneId },
      ],
    });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <ListHeader
          label={t('quizzes.zones')}
          disabled={payload.zones.length >= 10}
          onAdd={() =>
            onChange({ ...payload, zones: [...payload.zones, { id: newId(), label: {} }] })
          }
        />
        <ul className="space-y-2">
          {payload.zones.map((zone, index) => (
            <li key={zone.id} className="flex items-center gap-2">
              <Input
                value={read(zone.label, locale)}
                placeholder={`${t('quizzes.zones')} ${index + 1}`}
                aria-label={`${t('quizzes.zones')} ${index + 1}`}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    zones: payload.zones.map((row) =>
                      row.id === zone.id
                        ? { ...row, label: write(row.label, locale, event.target.value) }
                        : row,
                    ),
                  })
                }
              />
              <RemoveButton
                label={t('common.delete')}
                disabled={payload.zones.length <= 1}
                onClick={() =>
                  onChange({
                    ...payload,
                    zones: payload.zones.filter((row) => row.id !== zone.id),
                    placements: payload.placements.filter((row) => row.zoneId !== zone.id),
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        <ListHeader
          label={t('quizzes.draggableItems')}
          disabled={payload.items.length >= 20}
          onAdd={() =>
            onChange({ ...payload, items: [...payload.items, { id: newId(), text: {} }] })
          }
        />
        <ul className="space-y-2">
          {payload.items.map((item, index) => (
            <li key={item.id} className="flex items-center gap-2">
              <Input
                value={read(item.text, locale)}
                placeholder={`${t('quizzes.draggableItems')} ${index + 1}`}
                aria-label={`${t('quizzes.draggableItems')} ${index + 1}`}
                onChange={(event) =>
                  onChange({
                    ...payload,
                    items: payload.items.map((row) =>
                      row.id === item.id
                        ? { ...row, text: write(row.text, locale, event.target.value) }
                        : row,
                    ),
                  })
                }
              />
              <Select
                className="w-40 shrink-0"
                aria-label={`${t('quizzes.correctZone')} — ${index + 1}`}
                value={payload.placements.find((row) => row.itemId === item.id)?.zoneId ?? ''}
                onChange={(event) => setPlacement(item.id, event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {payload.zones.map((zone, position) => (
                  <option key={zone.id} value={zone.id}>
                    {read(zone.label, locale) || `${t('quizzes.zones')} ${position + 1}`}
                  </option>
                ))}
              </Select>
              <RemoveButton
                label={t('common.delete')}
                disabled={payload.items.length <= 1}
                onClick={() =>
                  onChange({
                    ...payload,
                    items: payload.items.filter((row) => row.id !== item.id),
                    placements: payload.placements.filter((row) => row.itemId !== item.id),
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// --- CODE -------------------------------------------------------------------

const CODE_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'csharp',
  'sql',
] as const;

function CodeEditor({ payload, onChange, locale }: EditorProps & { payload: Of<'CODE'> }) {
  const t = useTranslations();

  const updateCase = (index: number, patch: Partial<Of<'CODE'>['testCases'][number]>) =>
    onChange({
      ...payload,
      testCases: payload.testCases.map((row, position) =>
        position === index ? { ...row, ...patch } : row,
      ),
    });

  return (
    <div className="space-y-3">
      {/* Kod bajarilmaydi — bu §16 talabiga ko'ra ochiq aytiladi */}
      <p className="text-xs text-muted-foreground">{t('quizzes.codeNotExecutedNotice')}</p>

      <div className="space-y-1.5">
        <Label htmlFor="code-language">{t('quizzes.language')}</Label>
        <Select
          id="code-language"
          value={payload.language}
          onChange={(event) =>
            onChange({ ...payload, language: event.target.value as Of<'CODE'>['language'] })
          }
        >
          {CODE_LANGUAGES.map((language) => (
            <option key={language} value={language}>
              {language}
            </option>
          ))}
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="code-starter">{t('quizzes.starterCode')}</Label>
        <Textarea
          id="code-starter"
          rows={4}
          className="font-mono text-xs"
          value={payload.starterCode}
          onChange={(event) => onChange({ ...payload, starterCode: event.target.value })}
        />
      </div>

      <div className="space-y-2">
        <ListHeader
          label={t('quizzes.testCases')}
          disabled={payload.testCases.length >= 20}
          onAdd={() =>
            onChange({ ...payload, testCases: [...payload.testCases, { input: '', expected: '' }] })
          }
        />
        <ul className="space-y-2">
          {payload.testCases.map((testCase, index) => (
            <li key={index} className="flex items-center gap-2">
              <Input
                className="font-mono text-xs"
                placeholder={t('quizzes.testInput')}
                aria-label={`${t('quizzes.testInput')} ${index + 1}`}
                value={testCase.input}
                onChange={(event) => updateCase(index, { input: event.target.value })}
              />
              <Input
                className="font-mono text-xs"
                placeholder={t('quizzes.testExpected')}
                aria-label={`${t('quizzes.testExpected')} ${index + 1}`}
                value={testCase.expected}
                onChange={(event) => updateCase(index, { expected: event.target.value })}
              />
              <RemoveButton
                label={t('common.delete')}
                onClick={() =>
                  onChange({
                    ...payload,
                    testCases: payload.testCases.filter((_, position) => position !== index),
                  })
                }
              />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="code-hint">{t('quizzes.gradingHint')}</Label>
        <Textarea
          id="code-hint"
          rows={2}
          value={read(payload.gradingHint ?? {}, locale)}
          onChange={(event) =>
            onChange({
              ...payload,
              gradingHint: write(payload.gradingHint ?? {}, locale, event.target.value),
            })
          }
        />
      </div>
    </div>
  );
}
