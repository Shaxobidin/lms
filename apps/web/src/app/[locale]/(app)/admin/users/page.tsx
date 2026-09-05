/**
 * Maqsad: foydalanuvchilarni boshqarish (F-01, F-17).
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, ShieldOff, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ROLE_CODES } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate } from '@/lib/utils';
import { useLocale } from 'next-intl';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@/components/ui/primitives';

interface UserRow {
  id: string;
  email: string;
  phone: string | null;
  status: string;
  fullName: string;
  lastLoginAt: string | null;
  createdAt: string;
  roles: Array<{ code: string; expiresAt: string | null }>;
}

export default function AdminUsersPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const can = useAuthStore((state) => state.can);

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');

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
          aria-label={t('admin.assignRole')}
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
                <TableHead>{t('admin.assignRole')}</TableHead>
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
                        <Badge key={role.code} variant="outline">
                          {t(`roles.${role.code}`)}
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
    </div>
  );
}
