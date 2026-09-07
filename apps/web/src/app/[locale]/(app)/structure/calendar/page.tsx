/**
 * Maqsad: akademik kalendar — o'quv yillari va semestrlar (F-02).
 *
 * Bir vaqtning o'zida faqat bitta joriy o'quv yili va bitta joriy semestr
 * bo'ladi — buni server (tranzaksiya) ham, bazadagi qisman unikal indeks ham
 * kafolatlaydi; interfeys esa "Joriy deb belgilash" ni bitta tugmaga
 * aylantiradi. Semestrning **jurnal yopilish sanasi** (RSK-10) shu yerda
 * belgilanadi — undan keyin baho kiritish faqat dekanat ruxsati bilan.
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarDays, Pencil, Plus, Star } from 'lucide-react';
import { toast } from 'sonner';
import {
  createAcademicYearSchema,
  createSemesterSchema,
  updateAcademicYearSchema,
  updateSemesterSchema,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Skeleton,
} from '@/components/ui/primitives';
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

interface SemesterRow {
  id: string;
  number: number;
  startsAt: string;
  endsAt: string;
  isCurrent: boolean;
  gradingClosesAt: string | null;
}

interface AcademicYearRow {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  isCurrent: boolean;
  semesters: SemesterRow[];
}

/** ISO sana-vaqtdan `<input type="date">` uchun `YYYY-MM-DD`. */
const toDateInput = (value: string | null | undefined) => (value ? value.slice(0, 10) : '');

type DialogState =
  | { kind: 'year'; row?: AcademicYearRow }
  | { kind: 'semester'; year: AcademicYearRow; row?: SemesterRow }
  | null;

export default function CalendarPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const canManage = can('academicyear:manage:all');

  const [dialog, setDialog] = useState<DialogState>(null);

  const years = useQuery({
    queryKey: ['org', 'academic-years'],
    queryFn: async () => (await api.get<AcademicYearRow[]>('/org/academic-years')).data,
  });

  const errorToast = (error: unknown) => {
    const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
    toast.error(t(key));
  };

  const setCurrentYear = useMutation({
    mutationFn: async (id: string) => api.patch(`/org/academic-years/${id}`, { isCurrent: true }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void years.refetch();
    },
    onError: errorToast,
  });

  const setCurrentSemester = useMutation({
    mutationFn: async (id: string) => api.patch(`/org/semesters/${id}`, { isCurrent: true }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void years.refetch();
    },
    onError: errorToast,
  });

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/structure">{t('nav.structure')}</Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('org.academicCalendar')}</h1>
            <p className="text-sm text-muted-foreground">{t('org.calendarHint')}</p>
          </div>
          {canManage ? (
            <Button onClick={() => setDialog({ kind: 'year' })}>
              <Plus className="size-4" />
              {t('org.createAcademicYear')}
            </Button>
          ) : null}
        </div>
      </header>

      {years.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-40" />
          ))}
        </div>
      ) : years.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void years.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (years.data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarDays className="size-8" />}
          title={t('org.noAcademicYears')}
          description={t('org.calendarHint')}
          action={
            canManage ? (
              <Button onClick={() => setDialog({ kind: 'year' })}>
                {t('org.createAcademicYear')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {years.data?.map((year) => (
            <Card key={year.id} className={year.isCurrent ? 'border-primary/50' : undefined}>
              <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    {year.name}
                    {year.isCurrent ? (
                      <Badge variant="success">
                        <Star className="me-1 size-3" aria-hidden="true" />
                        {t('org.current')}
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(year.startsAt, locale)} — {formatDate(year.endsAt, locale)}
                  </p>
                </div>

                {canManage ? (
                  <div className="flex flex-wrap items-center gap-2">
                    {!year.isCurrent ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={setCurrentYear.isPending && setCurrentYear.variables === year.id}
                        onClick={() => setCurrentYear.mutate(year.id)}
                      >
                        {t('org.setCurrent')}
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: 'year', row: year })}
                    >
                      <Pencil className="size-3.5" />
                      {t('common.edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDialog({ kind: 'semester', year })}
                    >
                      <Plus className="size-3.5" />
                      {t('org.createSemester')}
                    </Button>
                  </div>
                ) : null}
              </CardHeader>

              <CardContent>
                {year.semesters.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('org.noSemesters')}</p>
                ) : (
                  <ul className="space-y-1.5">
                    {year.semesters.map((semester) => (
                      <li
                        key={semester.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {t('org.semesterNumber', { number: semester.number })}
                          </span>
                          {semester.isCurrent ? (
                            <Badge variant="success">{t('org.current')}</Badge>
                          ) : null}
                          <span className="text-xs text-muted-foreground">
                            {formatDate(semester.startsAt, locale)} —{' '}
                            {formatDate(semester.endsAt, locale)}
                          </span>
                          {semester.gradingClosesAt ? (
                            <Badge variant="outline">
                              {t('org.gradingClosesAt')}:{' '}
                              {formatDate(semester.gradingClosesAt, locale)}
                            </Badge>
                          ) : null}
                        </div>

                        {canManage ? (
                          <div className="flex items-center gap-1">
                            {!semester.isCurrent ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                loading={
                                  setCurrentSemester.isPending &&
                                  setCurrentSemester.variables === semester.id
                                }
                                onClick={() => setCurrentSemester.mutate(semester.id)}
                              >
                                {t('org.setCurrent')}
                              </Button>
                            ) : null}
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              aria-label={`${t('common.edit')}: ${t('org.semesterNumber', { number: semester.number })}`}
                              onClick={() => setDialog({ kind: 'semester', year, row: semester })}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {dialog?.kind === 'year' ? (
        <YearDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={() => void years.refetch()}
        />
      ) : null}
      {dialog?.kind === 'semester' ? (
        <SemesterDialog
          year={dialog.year}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={() => void years.refetch()}
        />
      ) : null}
    </div>
  );
}

// --- O'quv yili -------------------------------------------------------------

function YearDialog({
  row,
  onClose,
  onSaved,
}: {
  row?: AcademicYearRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [name, setName] = useState(row?.name ?? '');
  const [startsAt, setStartsAt] = useState(toDateInput(row?.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(row?.endsAt));
  const [isCurrent, setIsCurrent] = useState(row?.isCurrent ?? false);

  const body = { name, startsAt, endsAt, isCurrent };
  const parsed = row
    ? updateAcademicYearSchema.safeParse(body)
    : createAcademicYearSchema.safeParse(body);

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      return row
        ? api.patch(`/org/academic-years/${row.id}`, parsed.data)
        : api.post('/org/academic-years', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
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
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{row ? t('org.editAcademicYear') : t('org.createAcademicYear')}</DialogTitle>
          <DialogDescription>{t('org.academicYearHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="year-name" required>
              {t('common.name')}
            </Label>
            <Input
              id="year-name"
              value={name}
              placeholder="2026-2027"
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="year-starts" required>
                {t('org.startsAt')}
              </Label>
              <Input
                id="year-starts"
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="year-ends" required>
                {t('org.endsAt')}
              </Label>
              <Input
                id="year-ends"
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </div>
          </div>
          <SwitchField
            id="year-current"
            label={t('org.isCurrent')}
            description={t('org.isCurrentHint')}
            checked={isCurrent}
            onCheckedChange={setIsCurrent}
          />
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

// --- Semestr ----------------------------------------------------------------

function SemesterDialog({
  year,
  row,
  onClose,
  onSaved,
}: {
  year: AcademicYearRow;
  row?: SemesterRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const [number, setNumber] = useState(String(row?.number ?? year.semesters.length + 1));
  const [startsAt, setStartsAt] = useState(toDateInput(row?.startsAt ?? year.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(row?.endsAt ?? year.endsAt));
  const [gradingClosesAt, setGradingClosesAt] = useState(toDateInput(row?.gradingClosesAt));
  const [isCurrent, setIsCurrent] = useState(row?.isCurrent ?? false);

  const body = {
    startsAt,
    endsAt,
    isCurrent,
    ...(gradingClosesAt ? { gradingClosesAt } : row ? { gradingClosesAt: null } : {}),
  };
  const parsed = row
    ? updateSemesterSchema.safeParse(body)
    : createSemesterSchema.safeParse({ ...body, academicYearId: year.id, number });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      return row
        ? api.patch(`/org/semesters/${row.id}`, parsed.data)
        : api.post('/org/semesters', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
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
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{row ? t('org.editSemester') : t('org.createSemester')}</DialogTitle>
          <DialogDescription>
            {year.name} · {t('org.semesterHint')}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {!row ? (
            <div className="space-y-1.5">
              <Label htmlFor="semester-number" required>
                {t('org.semester')} №
              </Label>
              <Input
                id="semester-number"
                type="number"
                min={1}
                max={12}
                value={number}
                onChange={(event) => setNumber(event.target.value)}
              />
            </div>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="semester-starts" required>
                {t('org.startsAt')}
              </Label>
              <Input
                id="semester-starts"
                type="date"
                value={startsAt}
                onChange={(event) => setStartsAt(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="semester-ends" required>
                {t('org.endsAt')}
              </Label>
              <Input
                id="semester-ends"
                type="date"
                value={endsAt}
                onChange={(event) => setEndsAt(event.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="semester-closes">{t('org.gradingClosesAt')}</Label>
            <Input
              id="semester-closes"
              type="date"
              value={gradingClosesAt}
              onChange={(event) => setGradingClosesAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('org.gradingClosesHint')}</p>
          </div>
          <SwitchField
            id="semester-current"
            label={t('org.isCurrent')}
            description={t('org.isCurrentHint')}
            checked={isCurrent}
            onCheckedChange={setIsCurrent}
          />
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
