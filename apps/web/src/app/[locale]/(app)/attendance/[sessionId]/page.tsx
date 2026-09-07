/**
 * Maqsad: bitta dars sessiyasi bo'yicha davomat jurnali (F-09).
 *
 * O'qituvchi guruh ro'yxatini ko'radi va har bir talabaga holat qo'yadi.
 * §9 talabi — o'qituvchi uchun maksimal tezlik — shu sababli:
 *  - "Hammasini hozir deb belgilash" bitta bosishda ishlaydi (odatda ko'pchilik
 *    darsda bo'ladi, keyin faqat yo'qlar belgilanadi);
 *  - holat tugmalari klaviatura bilan ham boshqariladi.
 *
 * Belgilangan jurnal qayta ochilganda oldingi holatlar ko'rinadi — server
 * `roster` bilan birga mavjud belgilarni qaytaradi.
 */

'use client';

import { use, useEffect, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { cn, formatDate, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '@/components/ui/primitives';

interface RosterStudent {
  userId: string;
  firstName: string;
  lastName: string;
  status: AttendanceStatus | null;
  method: string | null;
  comment: string | null;
  markedAt: string | null;
}

interface RosterResponse {
  session: {
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
  };
  students: RosterStudent[];
  markedCount: number;
}

const STATUS_STYLES: Record<AttendanceStatus, string> = {
  PRESENT: 'border-success bg-success/15 text-success',
  ABSENT: 'border-destructive bg-destructive/15 text-destructive',
  LATE: 'border-warning bg-warning/15 text-warning',
  EXCUSED: 'border-border bg-muted text-muted-foreground',
};

export default function AttendanceSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const canMark = can('attendance:manage:own_course') || can('attendance:update:own_group');

  const [marks, setMarks] = useState<Record<string, AttendanceStatus>>({});
  const [comments, setComments] = useState<Record<string, string>>({});

  const roster = useQuery({
    queryKey: ['attendance-roster', sessionId],
    queryFn: async () =>
      (await api.get<RosterResponse>(`/class-sessions/${sessionId}/roster`)).data,
  });

  // Serverdagi mavjud belgilarni mahalliy holatga ko'chiramiz
  useEffect(() => {
    if (!roster.data) return;
    const existing: Record<string, AttendanceStatus> = {};
    const existingComments: Record<string, string> = {};
    for (const student of roster.data.students) {
      if (student.status) existing[student.userId] = student.status;
      if (student.comment) existingComments[student.userId] = student.comment;
    }
    setMarks(existing);
    setComments(existingComments);
  }, [roster.data]);

  const students = roster.data?.students ?? [];
  const markedCount = useMemo(
    () => students.filter((student) => marks[student.userId]).length,
    [students, marks],
  );

  const save = useMutation({
    mutationFn: async () =>
      api.post('/attendance/mark', {
        classSessionId: sessionId,
        records: students
          .filter((student) => marks[student.userId])
          .map((student) => ({
            userId: student.userId,
            status: marks[student.userId],
            ...(comments[student.userId]?.trim() ? { comment: comments[student.userId] } : {}),
          })),
      }),
    onSuccess: () => {
      toast.success(t('attendance.saved'));
      void roster.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  if (roster.isError) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void roster.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const session = roster.data?.session;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/attendance">{t('nav.attendance')}</Link>
        </Button>

        {roster.isLoading || !session ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {localize(session.course.title, locale)}
              </h1>
              <p className="text-sm text-muted-foreground">
                {formatDate(session.date, locale)} · {session.startsAt}–{session.endsAt} ·{' '}
                {session.group.name}
                {session.room ? ` · ${session.room}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{t(`attendance.${session.lessonType}`)}</Badge>
              <Badge variant={markedCount === students.length ? 'success' : 'muted'}>
                {t('attendance.markedOf', { marked: markedCount, total: students.length })}
              </Badge>
            </div>
          </div>
        )}
      </header>

      {roster.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-14" />
          ))}
        </div>
      ) : students.length === 0 ? (
        <EmptyState
          icon={<CalendarCheck className="size-8" />}
          title={t('attendance.emptyRosterTitle')}
          description={t('attendance.emptyRosterDescription')}
        />
      ) : (
        <>
          {canMark ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setMarks(
                    Object.fromEntries(
                      students.map((student) => [student.userId, 'PRESENT' as AttendanceStatus]),
                    ),
                  )
                }
              >
                {t('attendance.markAllPresent')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMarks({})}>
                {t('common.reset')}
              </Button>
            </div>
          ) : null}

          <ul className="space-y-2">
            {students.map((student, index) => (
              <li key={student.userId}>
                <Card>
                  <CardContent className="flex flex-wrap items-center gap-3 p-3">
                    <span className="w-6 shrink-0 text-xs tabular-nums text-muted-foreground">
                      {index + 1}.
                    </span>

                    <div className="min-w-0 flex-1">
                      <p className="font-medium">
                        {[student.lastName, student.firstName].filter(Boolean).join(' ')}
                      </p>
                      {student.method && student.method !== 'MANUAL' ? (
                        <p className="text-xs text-muted-foreground">
                          {t(`attendance.${student.method}`)}
                        </p>
                      ) : null}
                    </div>

                    {canMark ? (
                      <>
                        <div
                          className="flex flex-wrap gap-1"
                          role="group"
                          aria-label={`${student.lastName} ${student.firstName} — ${t('common.status')}`}
                        >
                          {ATTENDANCE_STATUSES.map((status) => {
                            const active = marks[student.userId] === status;
                            return (
                              <button
                                key={status}
                                type="button"
                                aria-pressed={active}
                                onClick={() =>
                                  setMarks((state) => ({ ...state, [student.userId]: status }))
                                }
                                className={cn(
                                  'rounded-md border px-2 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                                  active ? STATUS_STYLES[status] : 'border-border hover:bg-muted',
                                )}
                              >
                                {t(`attendance.${status}`)}
                              </button>
                            );
                          })}
                        </div>

                        <Input
                          className="h-8 w-full sm:w-48"
                          placeholder={t('attendance.commentPlaceholder')}
                          aria-label={`${student.lastName} — ${t('assignments.feedback')}`}
                          value={comments[student.userId] ?? ''}
                          onChange={(event) =>
                            setComments((state) => ({
                              ...state,
                              [student.userId]: event.target.value,
                            }))
                          }
                        />
                      </>
                    ) : student.status ? (
                      <Badge
                        variant={
                          student.status === 'PRESENT'
                            ? 'success'
                            : student.status === 'ABSENT'
                              ? 'destructive'
                              : student.status === 'LATE'
                                ? 'warning'
                                : 'muted'
                        }
                      >
                        {t(`attendance.${student.status}`)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">{t('attendance.notMarked')}</Badge>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          {canMark ? (
            <div className="flex justify-end">
              <Button
                loading={save.isPending}
                disabled={markedCount === 0}
                onClick={() => save.mutate()}
              >
                {t('attendance.saveJournal')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
