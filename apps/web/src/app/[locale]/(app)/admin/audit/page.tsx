/**
 * Maqsad: audit jurnali (F-17, §11 — kim, nima, qachon, qaysi IP dan).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Shield } from 'lucide-react';
import { api } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
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

interface AuditRow {
  id: string;
  action: string;
  resource: string;
  resourceId: string | null;
  ip: string | null;
  traceId: string | null;
  createdAt: string;
  actor: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string } | null;
  } | null;
}

export default function AuditLogPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const [action, setAction] = useState('');

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteQuery({
      queryKey: ['admin', 'audit', action],
      initialPageParam: '',
      queryFn: async ({ pageParam }) => {
        const params = new URLSearchParams({ limit: '30' });
        if (action) params.set('action', action);
        if (pageParam) params.set('cursor', String(pageParam));

        const result = await api.get<AuditRow[]>(`/admin/audit-log?${params.toString()}`);
        return { items: result.data, nextCursor: result.meta?.nextCursor ?? null };
      },
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    });

  const rows = data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.auditLog')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('admin.actor')} · {t('admin.action')} · {t('common.date')} · {t('admin.ipAddress')}
        </p>
      </header>

      <Input
        value={action}
        onChange={(event) => setAction(event.target.value)}
        placeholder={t('admin.action')}
        className="max-w-sm"
        aria-label={t('admin.action')}
      />

      {isLoading ? (
        <TableSkeleton rows={10} columns={5} />
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void refetch()}
          retryLabel={t('common.retry')}
        />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Shield className="size-8" />} title={t('common.noResults')} />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead>{t('admin.actor')}</TableHead>
                <TableHead>{t('admin.action')}</TableHead>
                <TableHead>{t('admin.resource')}</TableHead>
                <TableHead>{t('admin.ipAddress')}</TableHead>
              </TableRow>
            </TableHeader>

            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {formatDateTime(row.createdAt, locale)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {row.actor
                      ? [row.actor.profile?.lastName, row.actor.profile?.firstName]
                          .filter(Boolean)
                          .join(' ') || row.actor.email
                      : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{row.action}</Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {row.resource}
                    {row.resourceId ? ` · ${row.resourceId.slice(0, 8)}` : ''}
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {row.ip ?? '—'}
                  </TableCell>
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
