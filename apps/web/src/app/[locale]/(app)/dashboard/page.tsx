/**
 * Maqsad: rolga qarab moslashadigan bosh sahifa (F-13).
 *
 * Bitta sahifa, ammo mazmuni foydalanuvchi ruxsatlariga qarab o'zgaradi:
 * talaba o'z progressini, o'qituvchi kurs statistikasini, dekanat esa
 * fakultet ko'rsatkichlarini ko'radi.
 */

'use client';

import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  TrendingUp,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Link } from '@/i18n/routing';
import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/primitives';

interface DashboardSummary {
  scope: string;
  totals: { students: number; teachers: number; courses: number; activeCourses: number };
  performance: { averageScore: number; passRate: number; gradedStudents: number };
  attendance: { averagePercent: number; atRiskCount: number };
  activity: {
    activeUsersLast7Days: number;
    submissionsLast7Days: number;
    quizAttemptsLast7Days: number;
  };
}

interface StudentOverview {
  courses: {
    total: number;
    completed: number;
    averageProgress: number;
    list: Array<{
      progressPercent: string | number;
      status: string;
      course: { id: string; code: string; title: unknown };
    }>;
  };
  submissions: number;
  quizAttempts: number;
  attendancePercent: number;
  badges: number;
}

export default function DashboardPage() {
  const t = useTranslations();
  const user = useAuthStore((state) => state.user);
  const can = useAuthStore((state) => state.can);

  const isStudent = user?.roles.includes('STUDENT') ?? false;
  const canSeeAggregate =
    can('analytics:read:own_course') ||
    can('analytics:read:own_faculty') ||
    can('analytics:read:all');

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['analytics', 'dashboard'],
    queryFn: async () => (await api.get<DashboardSummary>('/analytics/dashboard')).data,
    enabled: canSeeAggregate,
  });

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['analytics', 'student-overview'],
    queryFn: async () => (await api.get<StudentOverview>('/analytics/student-overview')).data,
    enabled: isStudent,
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('dashboard.welcome', { name: user?.firstName ?? '' })}
        </h1>
        <p className="text-sm text-muted-foreground">
          {user?.roles.map((role) => t(`roles.${role}`)).join(', ')}
        </p>
      </header>

      {/* --- Talaba ko'rsatkichlari --- */}
      {isStudent ? (
        overviewLoading ? (
          <StatGridSkeleton />
        ) : overview ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<BookOpen className="size-4" />}
                label={t('dashboard.activeCourses')}
                value={String(overview.courses.total)}
                hint={`${overview.courses.completed} ${t('courses.PUBLISHED').toLowerCase()}`}
              />
              <StatCard
                icon={<TrendingUp className="size-4" />}
                label={t('courses.progress')}
                value={`${overview.courses.averageProgress}%`}
              />
              <StatCard
                icon={<CalendarCheck className="size-4" />}
                label={t('dashboard.attendanceRate')}
                value={`${overview.attendancePercent}%`}
              />
              <StatCard
                icon={<ClipboardList className="size-4" />}
                label={t('assignments.submissions')}
                value={String(overview.submissions)}
                hint={`${overview.quizAttempts} ${t('quizzes.attempts').toLowerCase()}`}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('nav.myCourses')}</CardTitle>
                <CardDescription>{t('courses.progress')}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {overview.courses.list.length === 0 ? (
                  <EmptyState
                    icon={<GraduationCap className="size-8" />}
                    title={t('courses.emptyStudentTitle')}
                    description={t('courses.emptyStudentDescription')}
                  />
                ) : (
                  overview.courses.list.map((item) => (
                    <Link
                      key={item.course.id}
                      href={`/courses/${item.course.id}` as '/courses'}
                      className="block rounded-md border border-border p-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">{item.course.code}</span>
                        <Badge variant={item.status === 'COMPLETED' ? 'success' : 'muted'}>
                          {Number(item.progressPercent)}%
                        </Badge>
                      </div>
                      <ProgressBar
                        value={Number(item.progressPercent)}
                        label={t('courses.progress')}
                      />
                    </Link>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        ) : null
      ) : null}

      {/* --- Boshqaruv ko'rsatkichlari --- */}
      {canSeeAggregate ? (
        summaryLoading ? (
          <StatGridSkeleton />
        ) : summary ? (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                icon={<BookOpen className="size-4" />}
                label={t('nav.courses')}
                value={String(summary.totals.courses)}
                hint={`${summary.totals.activeCourses} ${t('courses.PUBLISHED').toLowerCase()}`}
              />
              <StatCard
                icon={<Users className="size-4" />}
                label={t('dashboard.students')}
                value={String(summary.totals.students)}
                hint={`${summary.totals.teachers} ${t('dashboard.teachers').toLowerCase()}`}
              />
              <StatCard
                icon={<TrendingUp className="size-4" />}
                label={t('dashboard.averageScore')}
                value={String(summary.performance.averageScore)}
                hint={`${summary.performance.passRate}% ${t('analytics.passRate').toLowerCase()}`}
              />
              <StatCard
                icon={<CalendarCheck className="size-4" />}
                label={t('dashboard.attendanceRate')}
                value={`${summary.attendance.averagePercent}%`}
                hint={
                  summary.attendance.atRiskCount > 0
                    ? `${summary.attendance.atRiskCount} ${t('attendance.atRisk').toLowerCase()}`
                    : undefined
                }
                tone={summary.attendance.atRiskCount > 0 ? 'warning' : 'default'}
              />
            </div>

            <Card>
              <CardHeader>
                <CardTitle>{t('dashboard.activityLast7Days')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3">
                  <ActivityItem
                    icon={<Activity className="size-4" />}
                    label={t('dashboard.students')}
                    value={summary.activity.activeUsersLast7Days}
                  />
                  <ActivityItem
                    icon={<ClipboardList className="size-4" />}
                    label={t('assignments.submissions')}
                    value={summary.activity.submissionsLast7Days}
                  />
                  <ActivityItem
                    icon={<GraduationCap className="size-4" />}
                    label={t('quizzes.attempts')}
                    value={summary.activity.quizAttemptsLast7Days}
                  />
                </div>
              </CardContent>
            </Card>
          </>
        ) : null
      ) : null}

      {!isStudent && !canSeeAggregate ? (
        <EmptyState
          icon={<Activity className="size-8" />}
          title={t('analytics.emptyTitle')}
          description={t('analytics.emptyDescription')}
        />
      ) : null}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          {icon}
          <span className="text-xs font-medium uppercase tracking-wide">{label}</span>
        </div>
        <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? (
          <p
            className={
              tone === 'warning'
                ? 'mt-0.5 text-xs text-warning'
                : 'mt-0.5 text-xs text-muted-foreground'
            }
          >
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ActivityItem({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <div className="flex size-8 items-center justify-center rounded-md bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-lg font-semibold tabular-nums">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function StatGridSkeleton() {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, index) => (
        <Skeleton key={index} className="h-24" />
      ))}
    </div>
  );
}
