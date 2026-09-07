/**
 * Maqsad: foydalanuvchilarni boshqarish (F-01, F-17) — ro'yxat, bloklash va
 * rol berish. Rol berishda doira (fakultet/kafedra) yoki muddat talab
 * qilinadi: dekanat/metodist → fakultet, kafedra mudiri → kafedra, tashqi
 * ekspert → muddat (admin-guide §3).
 */

'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldOff, UserCheck, UserCog, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  ROLE_CODES,
  ROLE_SCOPE_REQUIREMENTS,
  roleScopeIssues,
  type LocalizedText,
  type RoleCode,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  ErrorState,
  FieldError,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@/components/ui/primitives';
import { Select } from '@/components/ui/form-controls';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface ScopeRef {
  id: string;
  name: LocalizedText;
}

interface UserRole {
  code: string;
  expiresAt: string | null;
  faculty: ScopeRef | null;
  department: ScopeRef | null;
}

interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  fullName: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: UserRole[];
}

interface OrgUnit {
  id: string;
  code: string;
  name: LocalizedText;
}

/** Rol nishoni: "Dekanat · Aniq fanlar" — doira ko'rinib turadi. */
function roleLabel(role: UserRole, locale: AppLocale, t: (key: string) => string): string {
  const scope = role.department ?? role.faculty;
  return scope
    ? `${t(`roles.${role.code}`)} · ${localize(scope.name, locale)}`
    : t(`roles.${role.code}`);
}

function roleKey(role: UserRole): string {
  return `${role.code}-${role.faculty?.id ?? ''}-${role.department?.id ?? ''}`;
}

export default function AdminUsersPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const can = useAuthStore((state) => state.can);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [assignFor, setAssignFor] = useState<UserRow | null>(null);

  const canManage = can('user:manage:all');

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['admin', 'users', search, roleFilter],
      initialPageParam: '',
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '25' });
        if (search) params.set('search', search);
        if (roleFilter) params.set('roleCode', roleFilter);
        if (pageParam) params.set('cursor', String(pageParam));

        const result = await api.get<UserRow[]>(`/users?${params.toString()}`);
        return { items: result.data, nextCursor: result.meta?.nextCursor ?? null };
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const setStatus = useMutation({
    mutationFn: async (input: { id: string; status: 'ACTIVE' | 'BLOCKED' }) =>
      api.patch(`/users/${input.id}/status`, {
        status: input.status,
        reason: input.status === 'BLOCKED' ? 'Administrator qarori' : 'Blokdan chiqarildi',
      }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  const users = data?.pages.flatMap((page) => page.items) ?? [];
  // Oyna ochiq turganda ro'yxat yangilansa — joriy rollar ham yangilanadi
  const assignTarget = assignFor
    ? (users.find((user) => user.id === assignFor.id) ?? assignFor)
    : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.users')}</h1>
        <p className="text-sm text-muted-foreground">
          {users.length} {t('common.showing').toLowerCase()}
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('common.search')}
            className="pl-8"
            aria-label={t('common.search')}
          />
        </div>

        <select
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
          aria-label={t('admin.roleScope')}
          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="">{t('common.all')}</option>
          {ROLE_CODES.map((code) => (
            <option key={code} value={code}>
              {t(`roles.${code}`)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <TableSkeleton rows={8} columns={5} />
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void refetch()}
          retryLabel={t('common.retry')}
        />
      ) : users.length === 0 ? (
        <EmptyState icon={<Users className="size-8" />} title={t('common.noResults')} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('auth.firstName')}</TableHead>
                <TableHead>{t('auth.email')}</TableHead>
                <TableHead>{t('admin.currentRoles')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead>{t('common.date')}</TableHead>
                {canManage ? <TableHead>{t('common.actions')}</TableHead> : null}
              </TableRow>
            </TableHeader>

            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.fullName}</TableCell>
                  <TableCell className="text-muted-foreground">{user.email}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {user.roles.map((role) => (
                        <Badge key={roleKey(role)} variant="outline">
                          {roleLabel(role, locale, t)}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        user.status === 'ACTIVE'
                          ? 'success'
                          : user.status === 'BLOCKED'
                            ? 'destructive'
                            : 'warning'
                      }
                    >
                      {user.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(user.lastLoginAt ?? user.createdAt, locale)}
                  </TableCell>

                  {canManage ? (
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setAssignFor(user)}>
                          <UserCog className="size-3.5" aria-hidden="true" />
                          {t('admin.assignRole')}
                        </Button>
                        {user.status === 'ACTIVE' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStatus.mutate({ id: user.id, status: 'BLOCKED' })}
                            loading={setStatus.isPending}
                          >
                            <ShieldOff className="size-3.5" aria-hidden="true" />
                            {t('admin.blockUser')}
                          </Button>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setStatus.mutate({ id: user.id, status: 'ACTIVE' })}
                            loading={setStatus.isPending}
                          >
                            <UserCheck className="size-3.5" aria-hidden="true" />
                            {t('admin.unblockUser')}
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void fetchNextPage()}
                loading={isFetchingNextPage}
              >
                {t('common.more')}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {assignTarget ? (
        <AssignRoleDialog
          user={assignTarget}
          locale={locale}
          onClose={() => setAssignFor(null)}
          onChanged={() => void queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })}
        />
      ) : null}
    </div>
  );
}

// --- Rol berish oynasi -------------------------------------------------------

function AssignRoleDialog({
  user,
  locale,
  onClose,
  onChanged,
}: {
  user: UserRow;
  locale: AppLocale;
  onClose: () => void;
  onChanged: () => void;
}) {
  const t = useTranslations();
  const [roleCode, setRoleCode] = useState<RoleCode>('TEACHER');
  const [facultyId, setFacultyId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [serverError, setServerError] = useState<string | null>(null);

  const requirement = ROLE_SCOPE_REQUIREMENTS[roleCode] ?? null;
  const showFaculty = requirement === 'FACULTY' || requirement === 'DEPARTMENT';
  const showDepartment = requirement === 'DEPARTMENT';
  const showExpiry = requirement === 'EXPIRES_AT';

  const faculties = useQuery({
    queryKey: ['org', 'faculties'],
    queryFn: async () => (await api.get<OrgUnit[]>('/org/faculties')).data,
    enabled: showFaculty,
  });
  const departments = useQuery({
    queryKey: ['org', 'departments', facultyId],
    queryFn: async () => (await api.get<OrgUnit[]>(`/org/departments?facultyId=${facultyId}`)).data,
    enabled: showDepartment && facultyId.length > 0,
  });

  const candidate = useMemo(
    () => ({
      userId: user.id,
      roleCode,
      scopeFacultyId: showFaculty && facultyId ? facultyId : null,
      scopeDepartmentId: showDepartment && departmentId ? departmentId : null,
      expiresAt: showExpiry && expiresAt ? new Date(expiresAt) : null,
    }),
    [
      user.id,
      roleCode,
      facultyId,
      departmentId,
      expiresAt,
      showFaculty,
      showDepartment,
      showExpiry,
    ],
  );
  const issues = roleScopeIssues(candidate);
  const issueMessage = (path: string) => {
    const key = issues.find((issue) => issue.path === path)?.message;
    return key ? t(key) : undefined;
  };

  const assign = useMutation({
    mutationFn: async () =>
      api.post('/users/roles', {
        ...candidate,
        expiresAt: candidate.expiresAt ? candidate.expiresAt.toISOString() : null,
      }),
    onSuccess: () => {
      toast.success(t('admin.roleAssigned'));
      setServerError(null);
      onChanged();
    },
    onError: (error) => {
      setServerError(
        error instanceof ApiClientError ? t(error.translationKey) : t('common.somethingWentWrong'),
      );
    },
  });

  const revoke = useMutation({
    mutationFn: async (code: string) =>
      api.post(`/users/${user.id}/roles/revoke`, { roleCode: code }),
    onSuccess: () => {
      toast.success(t('admin.roleRevoked'));
      onChanged();
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('admin.assignRole')}</DialogTitle>
          <DialogDescription>
            {user.fullName} · {user.email}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {serverError ? <Alert variant="destructive">{serverError}</Alert> : null}

          <div className="space-y-1.5">
            <p className="text-sm font-medium">{t('admin.currentRoles')}</p>
            <div className="flex flex-wrap gap-1">
              {user.roles.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                user.roles.map((role) => (
                  <Badge key={roleKey(role)} variant="outline" className="gap-1">
                    {roleLabel(role, locale, t)}
                    <button
                      type="button"
                      className="rounded-full p-0.5 hover:bg-muted"
                      aria-label={`${t('admin.revokeRole')}: ${t(`roles.${role.code}`)}`}
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(role.code)}
                    >
                      <X className="size-3" aria-hidden="true" />
                    </button>
                  </Badge>
                ))
              )}
            </div>
          </div>

          <p className="text-xs text-muted-foreground">{t('admin.assignRoleHint')}</p>

          <div className="space-y-1.5">
            <Label htmlFor="role-code" required>
              {t('admin.assignRole')}
            </Label>
            <Select
              id="role-code"
              value={roleCode}
              onChange={(event) => {
                setRoleCode(event.target.value as RoleCode);
                setServerError(null);
              }}
            >
              {ROLE_CODES.map((code) => (
                <option key={code} value={code}>
                  {t(`roles.${code}`)}
                </option>
              ))}
            </Select>
          </div>

          {showFaculty ? (
            <div className="space-y-1.5">
              <Label htmlFor="role-faculty" required>
                {t('admin.scopeFaculty')}
              </Label>
              <Select
                id="role-faculty"
                value={facultyId}
                aria-describedby="role-faculty-error"
                onChange={(event) => {
                  setFacultyId(event.target.value);
                  setDepartmentId('');
                }}
              >
                <option value="">—</option>
                {(faculties.data ?? []).map((faculty) => (
                  <option key={faculty.id} value={faculty.id}>
                    {faculty.code} · {localize(faculty.name, locale)}
                  </option>
                ))}
              </Select>
              <FieldError id="role-faculty-error" message={issueMessage('scopeFacultyId')} />
            </div>
          ) : null}

          {showDepartment ? (
            <div className="space-y-1.5">
              <Label htmlFor="role-department" required>
                {t('admin.scopeDepartment')}
              </Label>
              <Select
                id="role-department"
                value={departmentId}
                aria-describedby="role-department-error"
                disabled={!facultyId}
                onChange={(event) => setDepartmentId(event.target.value)}
              >
                <option value="">—</option>
                {(departments.data ?? []).map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.code} · {localize(department.name, locale)}
                  </option>
                ))}
              </Select>
              <FieldError id="role-department-error" message={issueMessage('scopeDepartmentId')} />
            </div>
          ) : null}

          {showExpiry ? (
            <div className="space-y-1.5">
              <Label htmlFor="role-expires" required>
                {t('admin.roleExpiresAt')}
              </Label>
              <Input
                id="role-expires"
                type="date"
                value={expiresAt}
                aria-describedby="role-expires-error"
                onChange={(event) => setExpiresAt(event.target.value)}
              />
              <FieldError id="role-expires-error" message={issueMessage('expiresAt')} />
            </div>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button
            loading={assign.isPending}
            disabled={issues.length > 0}
            onClick={() => assign.mutate()}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
