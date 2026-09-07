/**
 * Maqsad: davomat (F-09) — talaba uchun shaxsiy tarix, o'qituvchi/tyutor
 * uchun guruh hisoboti.
 */

'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, ClipboardCheck } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
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

interface SessionRow {
  id: string;
  date: string;
  startsAt: string;
  endsAt: string;
  room: string | null;
  lessonType: string;
  status: string;
  topic: string | null;
  course: { id: string; code: string; title: unknown };
  group: { id: string; name: string };
  _count: { attendances: number };
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

  /**
   * Jurnal to'ldirish uchun yaqin sessiyalar: bir hafta orqaga va bir hafta
   * oldinga. O'tgan darslar jurnalini keyinroq to'ldirish odatiy holat.
   */
  const sessions = useQuery({
    queryKey: ['attendance', 'sessions'],
    queryFn: async () => {
      const from = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
      const to = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
      return (await api.get<SessionRow[]>(`/class-sessions?from=${from}&to=${to}`)).data;
    },
    enabled: !isStudentView,
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('attendance.title')}</h1>
      </header>

      {/* --- Jurnal to'ldirish uchun yaqin darslar --- */}
      {!isStudentView ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('attendance.recentSessions')}</CardTitle>
          </CardHeader>
          <CardContent>
            {sessions.isLoading ? (
              <Skeleton className="h-24" />
            ) : (sessions.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('attendance.noSessions')}</p>
            ) : (
              <ul className="space-y-2">
                {sessions.data?.slice(0, 10).map((session) => (
                  <li
                    key={session.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {localize(session.course.title, locale)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(session.date, locale)} · {session.startsAt}–{session.endsAt} ·{' '}
                        {session.group.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={session._count.attendances > 0 ? 'success' : 'muted'}>
                        {session._count.attendances > 0
                          ? t('attendance.journalFilled')
                          : t('attendance.notMarked')}
                      </Badge>
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/attendance/${session.id}`}>
                          <ClipboardCheck className="size-4" />
                          {t('attendance.fillJournal')}
                        </Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

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
