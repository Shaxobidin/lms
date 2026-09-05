/**
 * Maqsad: analitika paneli (F-13) — dinamika, issiqlik xaritasi, xavf ostidagilar.
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, BarChart3, Download } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';

interface CourseOption {
  id: string;
  code: string;
  title: unknown;
}

interface RiskRow {
  userId: string;
  fullName?: string;
  riskScore: number;
  level: 'LOW' | 'MEDIUM' | 'HIGH';
  factors: {
    lowAttendance: boolean;
    missedAssignments: number;
    lowScore: boolean;
    inactiveDays: number;
  };
  recommendationKeys: string[];
}

export default function AnalyticsPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const [courseId, setCourseId] = useState('');

  const courses = useQuery({
    queryKey: ['courses', 'for-analytics'],
    queryFn: async () => (await api.get<CourseOption[]>('/courses?limit=50')).data,
  });

  const selectedCourse = courseId || courses.data?.[0]?.id || '';

  const trend = useQuery({
    queryKey: ['analytics', 'trend', selectedCourse],
    queryFn: async () =>
      (
        await api.get<Array<{ week: string; averagePercent: number; gradedCount: number }>>(
          `/analytics/courses/${selectedCourse}/trend?weeks=12`,
        )
      ).data,
    enabled: Boolean(selectedCourse),
  });

  const heatmap = useQuery({
    queryKey: ['analytics', 'heatmap', selectedCourse],
    queryFn: async () =>
      (
        await api.get<Array<{ weekday: number; hour: number; events: number }>>(
          `/analytics/courses/${selectedCourse}/heatmap?days=30`,
        )
      ).data,
    enabled: Boolean(selectedCourse),
  });

  const atRisk = useQuery({
    queryKey: ['analytics', 'at-risk', selectedCourse],
    queryFn: async () =>
      (await api.get<RiskRow[]>(`/analytics/courses/${selectedCourse}/at-risk`)).data,
    enabled: Boolean(selectedCourse),
  });

  const exportReport = async (report: string) => {
    try {
      await api.post('/analytics/export', {
        report,
        format: 'XLSX',
        ...(selectedCourse ? { courseId: selectedCourse } : {}),
      });
      toast.success(t('analytics.reportQueued'));
    } catch {
      toast.error(t('errors.internal'));
    }
  };

  // Issiqlik xaritasini kunlar bo'yicha yig'amiz (soddalashtirilgan ko'rinish)
  const heatmapByDay = Array.from({ length: 7 }, (_, index) => {
    const weekday = index + 1;
    const events = (heatmap.data ?? [])
      .filter((item) => item.weekday === weekday)
      .reduce((sum, item) => sum + item.events, 0);
    return { day: t(`schedule.${DAY_KEYS[index]}`), events };
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('analytics.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('analytics.performanceTrend')}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={selectedCourse}
            onChange={(event) => setCourseId(event.target.value)}
            aria-label={t('nav.courses')}
            className="h-9 max-w-64 rounded-md border border-input bg-background px-3 text-sm"
          >
            {(courses.data ?? []).map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} — {localize(course.title, locale)}
              </option>
            ))}
          </select>

          {can('analytics:read:own_course') ? (
            <Button variant="outline" onClick={() => void exportReport('PERFORMANCE')}>
              <Download className="size-4" aria-hidden="true" />
              {t('analytics.exportReport')}
            </Button>
          ) : null}
        </div>
      </header>

      {!selectedCourse ? (
        <EmptyState
          icon={<BarChart3 className="size-8" />}
          title={t('analytics.emptyTitle')}
          description={t('analytics.emptyDescription')}
        />
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.performanceTrend')}</CardTitle>
              </CardHeader>
              <CardContent>
                {trend.isLoading ? (
                  <Skeleton className="h-56" />
                ) : (trend.data ?? []).length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    {t('analytics.emptyDescription')}
                  </p>
                ) : (
                  <ResponsiveContainer width="100%" height={224}>
                    <LineChart data={trend.data}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis
                        dataKey="week"
                        tickFormatter={(value: string) =>
                          new Date(value).toLocaleDateString('uz-Latn-UZ', {
                            day: 'numeric',
                            month: 'short',
                          })
                        }
                        className="text-xs"
                      />
                      <YAxis domain={[0, 100]} className="text-xs" />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="averagePercent"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('analytics.activityHeatmap')}</CardTitle>
              </CardHeader>
              <CardContent>
                {heatmap.isLoading ? (
                  <Skeleton className="h-56" />
                ) : (
                  <ResponsiveContainer width="100%" height={224}>
                    <BarChart data={heatmapByDay}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="day" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip />
                      <Bar dataKey="events" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                {t('analytics.atRiskStudents')}
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => void exportReport('AT_RISK')}>
                <Download className="size-3.5" aria-hidden="true" />
                {t('common.export')}
              </Button>
            </CardHeader>

            <CardContent>
              {atRisk.isLoading ? (
                <Skeleton className="h-40" />
              ) : (atRisk.data ?? []).length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {t('common.noResults')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('dashboard.students')}</TableHead>
                      <TableHead>{t('analytics.riskScore')}</TableHead>
                      <TableHead>{t('attendance.title')}</TableHead>
                      <TableHead>{t('assignments.title')}</TableHead>
                      <TableHead>{t('analytics.recommendation.keep_monitoring')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {atRisk.data?.map((row) => (
                      <TableRow key={row.userId}>
                        <TableCell className="font-medium">{row.fullName ?? row.userId}</TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              row.level === 'HIGH'
                                ? 'destructive'
                                : row.level === 'MEDIUM'
                                  ? 'warning'
                                  : 'muted'
                            }
                          >
                            {row.riskScore} · {t(`analytics.risk${capitalize(row.level)}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.factors.lowAttendance ? (
                            <Badge variant="warning">{t('attendance.atRisk')}</Badge>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {row.factors.missedAssignments}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.recommendationKeys
                            .map((key) => t(`analytics.recommendation.${key.split('.').pop()}`))
                            .join('; ')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

const DAY_KEYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;

function capitalize(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}
