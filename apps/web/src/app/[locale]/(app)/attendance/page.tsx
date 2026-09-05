/**
 * Maqsad: davomat (F-09) — talaba uchun shaxsiy tarix, o'qituvchi/tyutor
 * uchun guruh hisoboti.
 */

'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';

interface MyAttendanceRow {
  id: string;
  status: string;
  method: string;
  markedAt: string;
  classSession: {
    id: string;
    date: string;
    startsAt: string;
    lessonType: string;
    topic: string | null;
    course: { id: string; code: string; title: unknown };
  };
}

interface ReportRow {
  userId: string;
  fullName: string;
  PRESENT: number;
  ABSENT: number;
  LATE: number;
  EXCUSED: number;
  total: number;
  percent: number;
  atRisk: boolean;
}

const STATUS_VARIANTS: Record<string, 'success' | 'destructive' | 'warning' | 'muted'> = {
  PRESENT: 'success',
  ABSENT: 'destructive',
  LATE: 'warning',
  EXCUSED: 'muted',
};

export default function AttendancePage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const isStudentView = !can('attendance:read:own_course') && !can('attendance:read:own_group');

  const mine = useQuery({
    queryKey: ['attendance', 'mine'],
    queryFn: async () => (await api.get<MyAttendanceRow[]>('/attendance/mine')).data,
    enabled: isStudentView,
  });

  const report = useQuery({
    queryKey: ['attendance', 'report'],
    queryFn: async () => (await api.get<ReportRow[]>('/attendance/report')).data,
    enabled: !isStudentView,
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('attendance.title')}</h1>
      </header>

      {isStudentView ? (
        mine.isLoading ? (
          <Skeleton className="h-64" />
        ) : (mine.data ?? []).length === 0 ? (
          <EmptyState
            icon={<CalendarCheck className="size-8" />}
            title={t('attendance.emptyTitle')}
            description={t('attendance.emptyDescription')}
          />
        ) : (
          <>
            <AttendanceSummary rows={mine.data ?? []} />

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('nav.courses')}</TableHead>
                  <TableHead>{t('attendance.classSession')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mine.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatDate(row.classSession.date, locale)} · {row.classSession.startsAt}
                    </TableCell>
                    <TableCell className="text-sm">
                      {localize(row.classSession.course.title, locale)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {t(`attendance.${row.classSession.lessonType}`)}
                      {row.classSession.topic ? ` · ${row.classSession.topic}` : ''}
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[row.status] ?? 'muted'}>
                        {t(`attendance.${row.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )
      ) : report.isLoading ? (
        <Skeleton className="h-64" />
      ) : (report.data ?? []).length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="size-8" />}
          title={t('attendance.emptyTitle')}
          description={t('attendance.emptyDescription')}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('attendance.attendanceRate')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('dashboard.students')}</TableHead>
                  <TableHead className="text-center">{t('attendance.PRESENT')}</TableHead>
                  <TableHead className="text-center">{t('attendance.LATE')}</TableHead>
                  <TableHead className="text-center">{t('attendance.EXCUSED')}</TableHead>
                  <TableHead className="text-center">{t('attendance.ABSENT')}</TableHead>
                  <TableHead className="text-center">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.data?.map((row) => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">
                      {row.fullName}
                      {row.atRisk ? (
                        <Badge variant="warning" className="ml-2">
                          {t('attendance.atRisk')}
                        </Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-center tabular-nums">{row.PRESENT}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.LATE}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.EXCUSED}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.ABSENT}</TableCell>
                    <TableCell className="text-center">
                      <span
                        className={
                          row.percent < 75 ? 'font-medium text-destructive' : 'font-medium'
                        }
                      >
                        {row.percent}%
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/** Talabaning umumiy davomat ko'rsatkichi. */
function AttendanceSummary({ rows }: { rows: MyAttendanceRow[] }) {
  const t = useTranslations();

  const total = rows.length;
  const attended = rows.filter((row) => row.status !== 'ABSENT').length;
  const percent = total === 0 ? 0 : Math.round((attended / total) * 100);

  return (
    <Card>
      <CardContent className="space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('attendance.attendanceRate')}</span>
          <span className="text-lg font-semibold tabular-nums">{percent}%</span>
        </div>
        <ProgressBar value={percent} label={t('attendance.attendanceRate')} />
        <p className="text-xs text-muted-foreground">
          {attended} / {total}
        </p>
      </CardContent>
    </Card>
  );
}
