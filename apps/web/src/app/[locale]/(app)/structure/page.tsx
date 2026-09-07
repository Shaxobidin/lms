/**
 * Maqsad: tashkiliy tuzilma — ko'rish va boshqarish (F-02).
 *
 * Fakultet → Kafedra → Yo'nalish → Guruh iyerarxiyasi. Daraxt `/org/tree`
 * dan emas, TEKIS ro'yxatlardan quriladi: tree keshlangan va unda dekan/mudir/
 * kurator identifikatorlari yo'q, tahrirlash oynalari esa aynan shularni
 * talab qiladi. Bitta ma'lumot yo'li — ko'ruvchi ham, menejer ham bir xil
 * daraxtni ko'radi, faqat amallar ruxsatga qarab chiqadi.
 *
 * Har bir daraja o'z oynasi bilan yaratiladi/tahrirlanadi; validatsiya
 * `@lms/shared` sxemalari bilan yuborishdan oldin (ADR-011). Fakultetni
 * o'chirish faqat u bo'sh bo'lsa — buni server ham tekshiradi.
 */

'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import {
  EDUCATION_FORMS,
  EDUCATION_LEVELS,
  LOCALES,
  createDepartmentSchema,
  createFacultySchema,
  createGroupSchema,
  createSpecialitySchema,
  updateDepartmentSchema,
  updateFacultySchema,
  updateGroupSchema,
  updateSpecialitySchema,
  type LocalizedText,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { cn, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
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
import { LocalizedField, Select } from '@/components/ui/form-controls';

// --- Ma'lumot shakllari (tekis ro'yxatlar) ----------------------------------

interface Person {
  id: string;
  profile: { firstName: string; lastName: string } | null;
}

interface FacultyRow {
  id: string;
  code: string;
  name: LocalizedText;
  position: number;
  dean: Person | null;
  _count: { departments: number };
}

interface DepartmentRow {
  id: string;
  code: string;
  name: LocalizedText;
  facultyId: string;
  head: Person | null;
}

interface SpecialityRow {
  id: string;
  code: string;
  name: LocalizedText;
  level: string;
  durationYears: number;
  departmentId: string;
}

interface GroupRow {
  id: string;
  name: string;
  admissionYear: number;
  educationForm: string;
  languageOfInstruction: string;
  curator: Person | null;
  speciality: { id: string };
  _count: { members: number };
}

interface UserOption {
  id: string;
  fullName: string;
}

function personName(person: Person | null): string {
  if (!person?.profile) return '';
  return [person.profile.lastName, person.profile.firstName].filter(Boolean).join(' ');
}

/** Xatolik kalitini toast'ga o'giradi — barcha oynalar bir xil ishlaydi. */
function useErrorToast() {
  const t = useTranslations();
  return (error: unknown) => {
    const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
    toast.error(t(key));
  };
}

// --- Sahifa -----------------------------------------------------------------

type DialogState =
  | { kind: 'faculty'; row?: FacultyRow }
  | { kind: 'department'; facultyId: string; row?: DepartmentRow }
  | { kind: 'speciality'; departmentId: string; row?: SpecialityRow }
  | { kind: 'group'; specialityId: string; row?: GroupRow }
  | { kind: 'members'; group: GroupRow }
  | { kind: 'delete-faculty'; row: FacultyRow }
  | null;

export default function StructurePage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const perms = {
    faculty: can('faculty:manage:all'),
    department: can('department:manage:all') || can('department:update:own_department'),
    departmentCreate: can('department:manage:all'),
    speciality: can('speciality:manage:all'),
    group: can('group:manage:all'),
    assign: can('group:manage:all') || can('group:update:own_faculty'),
    calendar: can('academicyear:manage:all') || can('academicyear:read:all'),
  };

  const [dialog, setDialog] = useState<DialogState>(null);

  const faculties = useQuery({
    queryKey: ['org', 'faculties'],
    queryFn: async () => (await api.get<FacultyRow[]>('/org/faculties')).data,
  });
  const departments = useQuery({
    queryKey: ['org', 'departments'],
    queryFn: async () => (await api.get<DepartmentRow[]>('/org/departments')).data,
  });
  const specialities = useQuery({
    queryKey: ['org', 'specialities'],
    queryFn: async () => (await api.get<SpecialityRow[]>('/org/specialities')).data,
  });
  const groups = useQuery({
    queryKey: ['org', 'groups'],
    queryFn: async () => (await api.get<GroupRow[]>('/org/groups')).data,
  });

  const isLoading =
    faculties.isLoading || departments.isLoading || specialities.isLoading || groups.isLoading;
  const isError =
    faculties.isError || departments.isError || specialities.isError || groups.isError;

  const refetchAll = () => {
    void faculties.refetch();
    void departments.refetch();
    void specialities.refetch();
    void groups.refetch();
  };

  // Tekis ro'yxatlardan daraxt: har bir daraja ota id bo'yicha guruhlanadi
  const tree = useMemo(() => {
    const byFaculty = new Map<string, DepartmentRow[]>();
    for (const row of departments.data ?? []) {
      byFaculty.set(row.facultyId, [...(byFaculty.get(row.facultyId) ?? []), row]);
    }
    const byDepartment = new Map<string, SpecialityRow[]>();
    for (const row of specialities.data ?? []) {
      byDepartment.set(row.departmentId, [...(byDepartment.get(row.departmentId) ?? []), row]);
    }
    const bySpeciality = new Map<string, GroupRow[]>();
    for (const row of groups.data ?? []) {
      bySpeciality.set(row.speciality.id, [...(bySpeciality.get(row.speciality.id) ?? []), row]);
    }
    return { byFaculty, byDepartment, bySpeciality };
  }, [departments.data, specialities.data, groups.data]);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('nav.structure')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('org.faculties')} → {t('org.departments')} → {t('org.specialities')} →{' '}
            {t('org.groups')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {perms.calendar ? (
            <Button asChild variant="outline">
              <Link href="/structure/calendar">
                <CalendarDays className="size-4" />
                {t('org.academicCalendar')}
              </Link>
            </Button>
          ) : null}
          {perms.faculty ? (
            <Button onClick={() => setDialog({ kind: 'faculty' })}>
              <Plus className="size-4" />
              {t('org.createFaculty')}
            </Button>
          ) : null}
        </div>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={refetchAll}
          retryLabel={t('common.retry')}
        />
      ) : (faculties.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-8" />}
          title={t('org.emptyTitle')}
          description={t('org.emptyDescription')}
          action={
            perms.faculty ? (
              <Button onClick={() => setDialog({ kind: 'faculty' })}>
                {t('org.createFaculty')}
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {faculties.data?.map((faculty) => (
            <FacultyNode
              key={faculty.id}
              faculty={faculty}
              departments={tree.byFaculty.get(faculty.id) ?? []}
              specialitiesOf={(id) => tree.byDepartment.get(id) ?? []}
              groupsOf={(id) => tree.bySpeciality.get(id) ?? []}
              perms={perms}
              locale={locale}
              onAction={setDialog}
            />
          ))}
        </div>
      )}

      {dialog?.kind === 'faculty' ? (
        <FacultyDialog row={dialog.row} onClose={() => setDialog(null)} onSaved={refetchAll} />
      ) : null}
      {dialog?.kind === 'department' ? (
        <DepartmentDialog
          facultyId={dialog.facultyId}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={refetchAll}
        />
      ) : null}
      {dialog?.kind === 'speciality' ? (
        <SpecialityDialog
          departmentId={dialog.departmentId}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={refetchAll}
        />
      ) : null}
      {dialog?.kind === 'group' ? (
        <GroupDialog
          specialityId={dialog.specialityId}
          row={dialog.row}
          onClose={() => setDialog(null)}
          onSaved={refetchAll}
        />
      ) : null}
      {dialog?.kind === 'members' ? (
        <MembersDialog
          group={dialog.group}
          canAssign={perms.assign}
          onClose={() => setDialog(null)}
          onChanged={refetchAll}
        />
      ) : null}
      {dialog?.kind === 'delete-faculty' ? (
        <DeleteFacultyDialog
          row={dialog.row}
          onClose={() => setDialog(null)}
          onDeleted={refetchAll}
        />
      ) : null}
    </div>
  );
}

// --- Daraxt tugunlari -------------------------------------------------------

interface Perms {
  faculty: boolean;
  department: boolean;
  departmentCreate: boolean;
  speciality: boolean;
  group: boolean;
  assign: boolean;
  calendar: boolean;
}

function FacultyNode({
  faculty,
  departments,
  specialitiesOf,
  groupsOf,
  perms,
  locale,
  onAction,
}: {
  faculty: FacultyRow;
  departments: DepartmentRow[];
  specialitiesOf: (departmentId: string) => SpecialityRow[];
  groupsOf: (specialityId: string) => GroupRow[];
  perms: Perms;
  locale: AppLocale;
  onAction: (state: DialogState) => void;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const groupCount = departments
    .flatMap((department) => specialitiesOf(department.id))
    .flatMap((speciality) => groupsOf(speciality.id)).length;

  return (
    <Card>
      <div className="flex items-center gap-2 p-4">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <ChevronRight
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-90',
            )}
            aria-hidden="true"
          />
          <Building2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate font-medium">{localize(faculty.name, locale)}</span>
        </button>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{faculty.code}</Badge>
          {faculty.dean ? (
            <Badge variant="muted" title={t('org.dean')}>
              {personName(faculty.dean)}
            </Badge>
          ) : null}
          <Badge variant="muted">
            {departments.length} {t('org.departments').toLowerCase()}
          </Badge>
          <Badge variant="muted">
            {groupCount} {t('org.groups').toLowerCase()}
          </Badge>

          {perms.faculty ? (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`${t('common.edit')}: ${faculty.code}`}
                onClick={() => onAction({ kind: 'faculty', row: faculty })}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="size-8"
                aria-label={`${t('common.delete')}: ${faculty.code}`}
                disabled={departments.length > 0}
                title={departments.length > 0 ? t('org.facultyNotEmpty') : undefined}
                onClick={() => onAction({ kind: 'delete-faculty', row: faculty })}
              >
                <Trash2 className="size-4" />
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {open ? (
        <CardContent className="space-y-3">
          {departments.map((department) => (
            <div key={department.id} className="rounded-md border border-border p-3">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">
                  {localize(department.name, locale)}
                </p>
                <Badge variant="outline">{department.code}</Badge>
                {department.head ? (
                  <Badge variant="muted" title={t('org.head')}>
                    {personName(department.head)}
                  </Badge>
                ) : null}
                {perms.department ? (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`${t('common.edit')}: ${department.code}`}
                    onClick={() =>
                      onAction({ kind: 'department', facultyId: faculty.id, row: department })
                    }
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                ) : null}
                {perms.speciality ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => onAction({ kind: 'speciality', departmentId: department.id })}
                  >
                    <Plus className="size-3.5" />
                    {t('org.createSpeciality')}
                  </Button>
                ) : null}
              </div>

              <div className="space-y-2 pl-3">
                {specialitiesOf(department.id).map((speciality) => (
                  <div key={speciality.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{localize(speciality.name, locale)}</span>
                      <Badge variant="outline">{speciality.code}</Badge>
                      <Badge variant="muted">{t(`org.${speciality.level}`)}</Badge>
                      <Badge variant="muted">
                        {speciality.durationYears} {t('org.years')}
                      </Badge>
                      {perms.speciality ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          aria-label={`${t('common.edit')}: ${speciality.code}`}
                          onClick={() =>
                            onAction({
                              kind: 'speciality',
                              departmentId: department.id,
                              row: speciality,
                            })
                          }
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      ) : null}
                      {perms.group ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onAction({ kind: 'group', specialityId: speciality.id })}
                        >
                          <Plus className="size-3.5" />
                          {t('org.createGroup')}
                        </Button>
                      ) : null}
                    </div>

                    {groupsOf(speciality.id).length > 0 ? (
                      <ul className="mt-1 flex flex-wrap gap-1.5 pl-3">
                        {groupsOf(speciality.id).map((group) => (
                          <li key={group.id} className="flex items-center gap-1">
                            <button
                              type="button"
                              className="inline-flex items-center rounded-md border border-transparent bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground hover:border-primary/40"
                              title={
                                group.curator
                                  ? `${t('org.curator')}: ${personName(group.curator)}`
                                  : undefined
                              }
                              onClick={() => onAction({ kind: 'members', group })}
                            >
                              <Users className="mr-1 size-3" aria-hidden="true" />
                              {group.name} · {group._count.members}
                            </button>
                            {perms.group ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                aria-label={`${t('common.edit')}: ${group.name}`}
                                onClick={() =>
                                  onAction({
                                    kind: 'group',
                                    specialityId: speciality.id,
                                    row: group,
                                  })
                                }
                              >
                                <Pencil className="size-3" />
                              </Button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}

          {perms.departmentCreate ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onAction({ kind: 'department', facultyId: faculty.id })}
            >
              <Plus className="size-4" />
              {t('org.createDepartment')}
            </Button>
          ) : null}
        </CardContent>
      ) : null}
    </Card>
  );
}

// --- Foydalanuvchi tanlash (dekan / mudir / kurator) ------------------------

/**
 * Rol bo'yicha foydalanuvchilar ro'yxati. Ruxsat bo'lmasa (403) ro'yxat bo'sh
 * qaytadi va maydon o'chirilgan holda ko'rinadi — oyna butunlay yiqilmaydi.
 */
function usePeople(roleCode: string, enabled: boolean) {
  return useQuery({
    queryKey: ['users', 'by-role', roleCode],
    queryFn: async () =>
      (await api.get<UserOption[]>(`/users?roleCode=${roleCode}&limit=100`)).data,
    enabled,
    retry: false,
  });
}

function PersonSelect({
  id,
  label,
  value,
  onChange,
  people,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  people: ReturnType<typeof usePeople>;
}) {
  const t = useTranslations();
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        value={value}
        disabled={people.isLoading || people.isError}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{t('common.none')}</option>
        {people.data?.map((person) => (
          <option key={person.id} value={person.id}>
            {person.fullName}
          </option>
        ))}
      </Select>
      {people.isError ? (
        <p className="text-xs text-muted-foreground">{t('org.peopleUnavailable')}</p>
      ) : null}
    </div>
  );
}

/** Oynalar uchun umumiy qobiq — sarlavha, tavsif, saqlash. */
function FormDialog({
  title,
  description,
  pending,
  canSubmit,
  onClose,
  onSubmit,
  children,
}: {
  title: string;
  description: string;
  pending: boolean;
  canSubmit: boolean;
  onClose: () => void;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">{children}</DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={pending} disabled={!canSubmit} onClick={onSubmit}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Fakultet ---------------------------------------------------------------

function FacultyDialog({
  row,
  onClose,
  onSaved,
}: {
  row?: FacultyRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const onError = useErrorToast();
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState<LocalizedText>(row?.name ?? {});
  const [deanId, setDeanId] = useState(row?.dean?.id ?? '');
  const [position, setPosition] = useState(String(row?.position ?? 0));
  const deans = usePeople('DEANERY', true);

  const body = { code, name, deanId: deanId || null, position };
  const parsed = row ? updateFacultySchema.safeParse(body) : createFacultySchema.safeParse(body);

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      return row
        ? api.patch(`/org/faculties/${row.id}`, parsed.data)
        : api.post('/org/faculties', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      onSaved();
      onClose();
    },
    onError,
  });

  return (
    <FormDialog
      title={row ? t('org.editFaculty') : t('org.createFaculty')}
      description={t('org.facultyHint')}
      pending={save.isPending}
      canSubmit={parsed.success}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      <div className="space-y-1.5">
        <Label htmlFor="faculty-code" required>
          {t('common.code')}
        </Label>
        <Input id="faculty-code" value={code} onChange={(event) => setCode(event.target.value)} />
      </div>
      <LocalizedField
        idPrefix="faculty-name"
        label={t('common.name')}
        value={name}
        onChange={setName}
        required
        moreLabel={t('common.otherLanguages')}
      />
      <PersonSelect
        id="faculty-dean"
        label={t('org.dean')}
        value={deanId}
        onChange={setDeanId}
        people={deans}
      />
      <div className="space-y-1.5">
        <Label htmlFor="faculty-position">{t('org.position')}</Label>
        <Input
          id="faculty-position"
          type="number"
          min={0}
          value={position}
          onChange={(event) => setPosition(event.target.value)}
        />
      </div>
    </FormDialog>
  );
}

function DeleteFacultyDialog({
  row,
  onClose,
  onDeleted,
}: {
  row: FacultyRow;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const onError = useErrorToast();

  const remove = useMutation({
    mutationFn: async () => api.delete(`/org/faculties/${row.id}`),
    onSuccess: () => {
      toast.success(t('courses.itemDeleted'));
      onDeleted();
      onClose();
    },
    onError,
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="sm">
        <DialogHeader>
          <DialogTitle>{t('courses.deleteTitle')}</DialogTitle>
          <DialogDescription>{localize(row.name, locale)}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">{t('org.deleteFacultyWarning')}</p>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" loading={remove.isPending} onClick={() => remove.mutate()}>
            {t('org.deleteFacultyConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Kafedra ----------------------------------------------------------------

function DepartmentDialog({
  facultyId,
  row,
  onClose,
  onSaved,
}: {
  facultyId: string;
  row?: DepartmentRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const onError = useErrorToast();
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState<LocalizedText>(row?.name ?? {});
  const [headId, setHeadId] = useState(row?.head?.id ?? '');
  const heads = usePeople('DEPARTMENT_HEAD', true);

  const body = { code, name, headId: headId || null };
  const parsed = row
    ? updateDepartmentSchema.safeParse(body)
    : createDepartmentSchema.safeParse({ ...body, facultyId });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      return row
        ? api.patch(`/org/departments/${row.id}`, parsed.data)
        : api.post('/org/departments', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      onSaved();
      onClose();
    },
    onError,
  });

  return (
    <FormDialog
      title={row ? t('org.editDepartment') : t('org.createDepartment')}
      description={t('org.departmentHint')}
      pending={save.isPending}
      canSubmit={parsed.success}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      <div className="space-y-1.5">
        <Label htmlFor="department-code" required>
          {t('common.code')}
        </Label>
        <Input
          id="department-code"
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <LocalizedField
        idPrefix="department-name"
        label={t('common.name')}
        value={name}
        onChange={setName}
        required
        moreLabel={t('common.otherLanguages')}
      />
      <PersonSelect
        id="department-head"
        label={t('org.head')}
        value={headId}
        onChange={setHeadId}
        people={heads}
      />
    </FormDialog>
  );
}

// --- Yo'nalish --------------------------------------------------------------

function SpecialityDialog({
  departmentId,
  row,
  onClose,
  onSaved,
}: {
  departmentId: string;
  row?: SpecialityRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const onError = useErrorToast();
  const [code, setCode] = useState(row?.code ?? '');
  const [name, setName] = useState<LocalizedText>(row?.name ?? {});
  const [level, setLevel] = useState(row?.level ?? 'BACHELOR');
  const [durationYears, setDurationYears] = useState(String(row?.durationYears ?? 4));

  const body = { code, name, level, durationYears };
  const parsed = row
    ? updateSpecialitySchema.safeParse(body)
    : createSpecialitySchema.safeParse({ ...body, departmentId });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      return row
        ? api.patch(`/org/specialities/${row.id}`, parsed.data)
        : api.post('/org/specialities', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      onSaved();
      onClose();
    },
    onError,
  });

  return (
    <FormDialog
      title={row ? t('org.editSpeciality') : t('org.createSpeciality')}
      description={t('org.specialityHint')}
      pending={save.isPending}
      canSubmit={parsed.success}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      <div className="space-y-1.5">
        <Label htmlFor="speciality-code" required>
          {t('org.classifierCode')}
        </Label>
        <Input
          id="speciality-code"
          value={code}
          placeholder="60110100"
          onChange={(event) => setCode(event.target.value)}
        />
      </div>
      <LocalizedField
        idPrefix="speciality-name"
        label={t('common.name')}
        value={name}
        onChange={setName}
        required
        moreLabel={t('common.otherLanguages')}
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="speciality-level">{t('org.level')}</Label>
          <Select
            id="speciality-level"
            value={level}
            onChange={(event) => setLevel(event.target.value)}
          >
            {EDUCATION_LEVELS.map((value) => (
              <option key={value} value={value}>
                {t(`org.${value}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="speciality-duration">{t('org.durationYears')}</Label>
          <Input
            id="speciality-duration"
            type="number"
            min={1}
            max={7}
            value={durationYears}
            onChange={(event) => setDurationYears(event.target.value)}
          />
        </div>
      </div>
    </FormDialog>
  );
}

// --- Guruh ------------------------------------------------------------------

function GroupDialog({
  specialityId,
  row,
  onClose,
  onSaved,
}: {
  specialityId: string;
  row?: GroupRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const onError = useErrorToast();
  const [name, setName] = useState(row?.name ?? '');
  const [admissionYear, setAdmissionYear] = useState(
    String(row?.admissionYear ?? new Date().getFullYear()),
  );
  const [educationForm, setEducationForm] = useState(row?.educationForm ?? 'DAYTIME');
  const [language, setLanguage] = useState(row?.languageOfInstruction ?? 'uz-Latn');
  const [curatorId, setCuratorId] = useState(row?.curator?.id ?? '');
  const curators = usePeople('TUTOR', true);

  const body = {
    name,
    admissionYear,
    educationForm,
    languageOfInstruction: language,
    curatorId: curatorId || null,
  };
  const parsed = row
    ? updateGroupSchema.safeParse(body)
    : createGroupSchema.safeParse({ ...body, specialityId });

  const save = useMutation({
    mutationFn: async () => {
      if (!parsed.success) throw new Error('invalid');
      return row
        ? api.patch(`/org/groups/${row.id}`, parsed.data)
        : api.post('/org/groups', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('common.saved'));
      onSaved();
      onClose();
    },
    onError,
  });

  return (
    <FormDialog
      title={row ? t('org.editGroup') : t('org.createGroup')}
      description={t('org.groupHint')}
      pending={save.isPending}
      canSubmit={parsed.success}
      onClose={onClose}
      onSubmit={() => save.mutate()}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="group-name" required>
            {t('common.name')}
          </Label>
          <Input
            id="group-name"
            value={name}
            placeholder="MI-24-01"
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-year">{t('org.admissionYear')}</Label>
          <Input
            id="group-year"
            type="number"
            min={2000}
            max={2100}
            value={admissionYear}
            onChange={(event) => setAdmissionYear(event.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-form">{t('org.educationForm')}</Label>
          <Select
            id="group-form"
            value={educationForm}
            onChange={(event) => setEducationForm(event.target.value)}
          >
            {EDUCATION_FORMS.map((value) => (
              <option key={value} value={value}>
                {t(`org.${value}`)}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-language">{t('org.languageOfInstruction')}</Label>
          <Select
            id="group-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
          >
            {LOCALES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <PersonSelect
        id="group-curator"
        label={t('org.curator')}
        value={curatorId}
        onChange={setCuratorId}
        people={curators}
      />
    </FormDialog>
  );
}

// --- Guruh a'zolari ---------------------------------------------------------

interface MemberRow {
  id: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    status: string;
    profile: { firstName: string; lastName: string; middleName: string | null } | null;
  };
}

/**
 * Guruh talabalari va yangi talabani biriktirish/ko'chirish.
 *
 * Ko'chirishda talabaning oldingi a'zoligi yopiladi, tarix saqlanadi (P6) —
 * shuning uchun sabab (buyruq raqami) so'raladi, u audit jurnaliga tushadi.
 */
function MembersDialog({
  group,
  canAssign,
  onClose,
  onChanged,
}: {
  group: GroupRow;
  canAssign: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const onError = useErrorToast();
  const [search, setSearch] = useState('');
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('');

  const members = useQuery({
    queryKey: ['org', 'members', group.id],
    queryFn: async () => (await api.get<MemberRow[]>(`/org/groups/${group.id}/members`)).data,
  });

  const candidates = useQuery({
    queryKey: ['users', 'students', search],
    queryFn: async () =>
      (
        await api.get<UserOption[]>(
          `/users?roleCode=STUDENT&limit=50${search.trim() ? `&search=${encodeURIComponent(search.trim())}` : ''}`,
        )
      ).data,
    enabled: canAssign,
    retry: false,
  });

  const assign = useMutation({
    mutationFn: async () =>
      api.post('/org/groups/assign-student', {
        userId,
        groupId: group.id,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      toast.success(t('org.studentAssigned'));
      setUserId('');
      setReason('');
      void members.refetch();
      onChanged();
    },
    onError,
  });

  const memberIds = new Set((members.data ?? []).map((row) => row.user.id));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="lg">
        <DialogHeader>
          <DialogTitle>
            {group.name} — {t('org.members')}
          </DialogTitle>
          <DialogDescription>
            {t(`org.${group.educationForm}`)} · {group.admissionYear}
            {group.curator ? ` · ${t('org.curator')}: ${personName(group.curator)}` : ''}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {members.isLoading ? (
            <Skeleton className="h-32" />
          ) : (members.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('org.noMembers')}</p>
          ) : (
            <ol className="max-h-64 space-y-1 overflow-y-auto text-sm">
              {members.data?.map((row, index) => (
                <li key={row.id} className="flex items-center gap-2 rounded px-1 py-0.5">
                  <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {index + 1}.
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {[
                      row.user.profile?.lastName,
                      row.user.profile?.firstName,
                      row.user.profile?.middleName,
                    ]
                      .filter(Boolean)
                      .join(' ') || row.user.email}
                  </span>
                  {row.user.status !== 'ACTIVE' ? (
                    <Badge variant="muted">{row.user.status}</Badge>
                  ) : null}
                </li>
              ))}
            </ol>
          )}

          {canAssign ? (
            <div className="space-y-2 rounded-md border border-border p-3">
              <p className="text-sm font-medium">{t('org.assignStudent')}</p>
              <Input
                aria-label={t('common.search')}
                placeholder={t('org.searchStudent')}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                aria-label={t('org.student')}
                value={userId}
                disabled={candidates.isLoading || candidates.isError}
                onChange={(event) => setUserId(event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {candidates.data
                  ?.filter((person) => !memberIds.has(person.id))
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.fullName}
                    </option>
                  ))}
              </Select>
              <Input
                aria-label={t('org.transferReason')}
                placeholder={t('org.transferReasonPlaceholder')}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">{t('org.assignHint')}</p>
              <div className="flex justify-end">
                <Button
                  size="sm"
                  loading={assign.isPending}
                  disabled={userId === ''}
                  onClick={() => assign.mutate()}
                >
                  {t('org.assignStudent')}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
