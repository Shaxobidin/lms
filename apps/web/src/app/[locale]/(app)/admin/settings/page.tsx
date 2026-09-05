/**
 * Maqsad: tizim sozlamalari va feature flag lar (F-17).
 */

'use client';

import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings, ToggleLeft } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';

interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
  isPublic: boolean;
  updatedAt: string;
}

interface FlagRow {
  key: string;
  enabled: boolean;
  description: string | null;
}

interface SystemStats {
  users: number;
  courses: number;
  submissions: number;
  quizAttempts: number;
  files: { count: number; totalBytes: string };
  auditEntries: number;
}

export default function AdminSettingsPage() {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const settings = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: async () => (await api.get<SettingRow[]>('/admin/settings')).data,
  });

  const flags = useQuery({
    queryKey: ['admin', 'flags'],
    queryFn: async () => (await api.get<FlagRow[]>('/admin/feature-flags')).data,
  });

  const stats = useQuery({
    queryKey: ['admin', 'stats'],
    queryFn: async () => (await api.get<SystemStats>('/admin/stats')).data,
  });

  const toggleFlag = useMutation({
    mutationFn: async (input: { key: string; enabled: boolean }) =>
      api.patch(`/admin/feature-flags/${input.key}`, { enabled: input.enabled }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void queryClient.invalidateQueries({ queryKey: ['admin', 'flags'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('admin.settings')}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin.systemStats')}</CardTitle>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <Skeleton className="h-20" />
          ) : stats.data ? (
            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat label={t('nav.users')} value={stats.data.users} />
              <Stat label={t('nav.courses')} value={stats.data.courses} />
              <Stat label={t('assignments.submissions')} value={stats.data.submissions} />
              <Stat label={t('quizzes.attempts')} value={stats.data.quizAttempts} />
              <Stat label={t('admin.auditLog')} value={stats.data.auditEntries} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ToggleLeft className="size-4" aria-hidden="true" />
            {t('admin.featureFlags')}
          </CardTitle>
          <CardDescription>{t('admin.settings')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {flags.isLoading ? (
            <Skeleton className="h-32" />
          ) : (
            (flags.data ?? []).map((flag) => (
              <div
                key={flag.key}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0">
                  <p className="font-mono text-sm">{flag.key}</p>
                  {flag.description ? (
                    <p className="text-xs text-muted-foreground">{flag.description}</p>
                  ) : null}
                </div>

                <Button
                  variant={flag.enabled ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => toggleFlag.mutate({ key: flag.key, enabled: !flag.enabled })}
                  loading={toggleFlag.isPending}
                >
                  {flag.enabled ? t('admin.enabled') : t('admin.disabled')}
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="size-4" aria-hidden="true" />
            {t('admin.settings')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {settings.isLoading ? (
            <Skeleton className="h-40" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.code')}</TableHead>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('common.description')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(settings.data ?? []).map((setting) => (
                  <TableRow key={setting.key}>
                    <TableCell className="font-mono text-xs">
                      {setting.key}
                      {setting.isPublic ? (
                        <Badge variant="muted" className="ml-2">
                          public
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm">{JSON.stringify(setting.value)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {setting.description ?? '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-border p-3">
      <p className="text-xl font-semibold tabular-nums">{value.toLocaleString('uz-Latn-UZ')}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
