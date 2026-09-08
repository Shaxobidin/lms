/**
 * Maqsad: kurs sahifasi — tuzilma, topshiriqlar, testlar va jurnal (F-04, F-06, F-07, F-08).
 *
 * Ko'rinish rolga qarab o'zgaradi: talaba progressni, o'qituvchi esa
 * qo'shimcha ravishda jurnal va tahrirlash tugmalarini ko'radi.
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Circle,
  ClipboardList,
  FileText,
  ListChecks,
  Users,
} from 'lucide-react';
import { api } from '@/lib/api-client';
import { usePublicSettings } from '@/lib/public-settings';
import { useAuthStore } from '@/lib/auth-store';
import { CourseBuilder } from '@/components/course/course-builder';
import { LtiCoursePanel } from '@/components/course/lti-course-panel';
import { SwitchField } from '@/components/ui/form-controls';
import { cn, deadlineColorClass, formatDateTime, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  ProgressBar,
  Skeleton,
} from '@/components/ui/primitives';

interface LessonNode {
  id: string;
  title: unknown;
  position: number;
  durationMinutes: number;
  isPublished: boolean;
  resources: Array<{ id: string; kind: string; title: unknown }>;
  progress?: Array<{ state: string; secondsSpent: number }>;
}

interface CourseStructure {
  id: string;
  code: string;
  title: unknown;
  description: unknown;
  status: string;
  deliveryMode: string;
  academicHours: number;
  subject: { id: string; code: string; name: unknown; credits: number } | null;
  department: { id: string; name: unknown } | null;
  teachers: Array<{
    role: string;
    user: { id: string; email: string; profile: { firstName: string; lastName: string } | null };
  }>;
  modules: Array<{
    id: string;
    title: unknown;
    position: number;
    isPublished: boolean;
    topics: Array<{
      id: string;
      title: unknown;
      position: number;
      lessons: LessonNode[];
      assignments: TopicAssignment[];
      quizzes: TopicQuiz[];
    }>;
  }>;
}

/** Mavzu ichidagi topshiriq (Moodle: "Topshiriq" faoliyati). */
interface TopicAssignment {
  id: string;
  title: unknown;
  kind: string;
  dueAt: string;
  maxScore: string | number;
  isPublished: boolean;
}

/** Mavzu ichidagi test (Moodle: "Test" faoliyati). */
interface TopicQuiz {
  id: string;
  title: unknown;
  controlType: string;
  durationMinutes: number;
  isPublished: boolean;
  _count: { questions: number };
}

interface AssignmentItem {
  id: string;
  title: unknown;
  maxScore: string | number;
  dueAt: string;
  isPublished: boolean;
  submissions?: Array<{ id: string; status: string; score: string | null }>;
  _count?: { submissions: number };
}

interface QuizItem {
  id: string;
  title: unknown;
  controlType: string;
  durationMinutes: number;
  maxAttempts: number;
  passScore: string | number;
  isPublished: boolean;
  opensAt: string | null;
  closesAt: string | null;
  _count: { questions: number };
  attempts?: Array<{ id: string; status: string; score: string | null; attemptNumber: number }>;
}

type Tab = 'content' | 'assignments' | 'quizzes' | 'gradebook';

/** Jurnalga kiradigan nazorat turlari — ular uchun i18n kaliti mavjud. */
function isControlType(value: string): value is 'JN' | 'ON' | 'YN' {
  return value === 'JN' || value === 'ON' || value === 'YN';
}

export default function CoursePage() {
  const t = useTranslations();
  const siteSettings = usePublicSettings();
  const locale = useLocale() as AppLocale;
  const params = useParams<{ courseId: string }>();
  const courseId = params.courseId;

  const can = useAuthStore((state) => state.can);
  const user = useAuthStore((state) => state.user);
  const [tab, setTab] = useState<Tab>('content');
  const [editing, setEditing] = useState(false);

  const isTeacher = user?.scope.courseIds.includes(courseId) ?? false;
  const canSeeGradebook = can('grade:read:own_course') || can('grade:read:own_faculty');
  // Tuzilmani faqat kurs muallifi yoki kafedra darajasidagi rol tahrirlaydi
  const canEdit =
    can('lesson:manage:own_course') && (isTeacher || can('course:update:own_department'));

  const structure = useQuery({
    queryKey: ['course', courseId],
    queryFn: async () => (await api.get<CourseStructure>(`/courses/${courseId}`)).data,
  });

  const assignments = useQuery({
    queryKey: ['course', courseId, 'assignments'],
    queryFn: async () => (await api.get<AssignmentItem[]>(`/courses/${courseId}/assignments`)).data,
    enabled: tab === 'assignments',
  });

  const quizzes = useQuery({
    queryKey: ['course', courseId, 'quizzes'],
    queryFn: async () => (await api.get<QuizItem[]>(`/courses/${courseId}/quizzes`)).data,
    enabled: tab === 'quizzes',
  });

  if (structure.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (structure.isError || !structure.data) {
    return (
      <ErrorState
        title={t('errors.not_found')}
        onRetry={() => void structure.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const course = structure.data;
  const totalLessons = course.modules.flatMap((m) => m.topics.flatMap((tp) => tp.lessons)).length;
  const completedLessons = course.modules
    .flatMap((m) => m.topics.flatMap((tp) => tp.lessons))
    .filter((lesson) => lesson.progress?.[0]?.state === 'COMPLETED').length;

  const tabs: Array<{ id: Tab; label: string; icon: typeof BookOpen; visible: boolean }> = [
    { id: 'content', label: t('courses.modules'), icon: BookOpen, visible: true },
    { id: 'assignments', label: t('nav.assignments'), icon: ClipboardList, visible: true },
    { id: 'quizzes', label: t('nav.quizzes'), icon: ListChecks, visible: true },
    { id: 'gradebook', label: t('grades.gradebook'), icon: FileText, visible: canSeeGradebook },
  ];

  return (
    <div className="space-y-5">
      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-xs text-muted-foreground">{course.code}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {localize(course.title, locale)}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {localize(course.description, locale, '')}
            </p>
          </div>

          <div className="flex flex-wrap items-start gap-2">
            <Badge variant={course.status === 'PUBLISHED' ? 'success' : 'warning'}>
              {t(`courses.${course.status}`)}
            </Badge>
            <Badge variant="outline">{t(`courses.${course.deliveryMode}`)}</Badge>
            {course.subject ? (
              <Badge variant="outline">
                {course.subject.credits} {t('courses.credits').toLowerCase()}
              </Badge>
            ) : null}
          </div>
        </div>

        {!isTeacher && totalLessons > 0 ? (
          <div className="max-w-md space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{t('courses.progress')}</span>
              <span className="tabular-nums">
                {completedLessons} / {totalLessons}
              </span>
            </div>
            <ProgressBar
              value={(completedLessons / totalLessons) * 100}
              label={t('courses.progress')}
            />
          </div>
        ) : null}

        {course.teachers.length > 0 ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Users className="size-4" aria-hidden="true" />
            {course.teachers
              .map((item) =>
                [item.user.profile?.lastName, item.user.profile?.firstName]
                  .filter(Boolean)
                  .join(' '),
              )
              .join(', ')}
          </div>
        ) : null}
      </header>

      {/* Tahrirlash rejimi — Moodle dagi "tahrirlashni yoqish" ga o'xshash */}
      {canEdit ? (
        <div className="max-w-md">
          <SwitchField
            id="course-editing"
            label={t('courses.editingMode')}
            description={t('courses.editingModeHint')}
            checked={editing}
            onCheckedChange={setEditing}
          />
        </div>
      ) : null}

      {/* Tab navigatsiyasi */}
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border">
        {tabs
          .filter((item) => item.visible)
          .map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors',
                  tab === item.id
                    ? 'border-primary font-medium text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
              >
                <Icon className="size-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
      </div>

      {/* --- Kurs tuzilishi --- */}
      {tab === 'content' && editing ? (
        <>
          <LtiCoursePanel courseId={courseId} />
          <CourseBuilder courseId={courseId} modules={course.modules} locale={locale} />
        </>
      ) : null}

      {tab === 'content' && !editing && course.modules.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-sm font-medium">{t('courses.topicHeadings')}</h2>
            <ol className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
              {course.modules.flatMap((module) =>
                module.topics.map((topic) => (
                  <li key={topic.id}>
                    <a href={`#topic-${topic.id}`} className="text-primary hover:underline">
                      {localize(topic.title, locale)}
                    </a>
                  </li>
                )),
              )}
            </ol>
          </CardContent>
        </Card>
      ) : null}

      {tab === 'content' && !editing ? (
        course.modules.length === 0 ? (
          <EmptyState
            icon={<BookOpen className="size-8" />}
            title={t('courses.structureEmpty')}
            description={isTeacher ? t('courses.emptyDescription') : undefined}
          />
        ) : (
          <div className="space-y-3">
            {course.modules.map((module) => (
              <ModuleAccordion
                key={module.id}
                module={module}
                locale={locale}
                courseId={courseId}
                isTeacher={isTeacher}
              />
            ))}
          </div>
        )
      ) : null}

      {/* --- Forum: barcha ishtirokchilar uchun (sayt boshqaruvida o'chirilishi mumkin) --- */}
      {siteSettings.enabled('advanced.forum') ? (
        <div className="flex justify-end">
          <Button asChild size="sm" variant="ghost">
            <Link href={`/courses/${courseId}/forum`}>{t('messaging.forum')}</Link>
          </Button>
        </div>
      ) : null}

      {/* --- Topshiriqlar --- */}
      {tab === 'assignments' && canEdit ? (
        <div className="flex justify-end">
          {/* Rubrika baholash mezonlarini belgilaydi — topshiriqdan oldin tuziladi */}
          <Button asChild size="sm" variant="outline">
            <Link href={`/courses/${courseId}/rubrics`}>{t('assignments.rubrics')}</Link>
          </Button>
        </div>
      ) : null}

      {tab === 'assignments' ? (
        assignments.isLoading ? (
          <Skeleton className="h-40" />
        ) : (assignments.data ?? []).length === 0 ? (
          <EmptyState
            icon={<ClipboardList className="size-8" />}
            title={t('assignments.emptyTitle')}
            description={t('assignments.emptyDescription')}
          />
        ) : (
          <div className="space-y-2">
            {assignments.data?.map((item) => {
              const submission = item.submissions?.[0];
              return (
                <Card key={item.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <h3 className="font-medium">{localize(item.title, locale)}</h3>
                      <p className={cn('text-xs', deadlineColorClass(item.dueAt))}>
                        {t('assignments.dueAt')}: {formatDateTime(item.dueAt, locale)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {submission ? (
                        <Badge
                          variant={
                            submission.status === 'GRADED'
                              ? 'success'
                              : submission.status === 'LATE'
                                ? 'warning'
                                : 'default'
                          }
                        >
                          {t(`assignments.${submission.status}`)}
                          {submission.score !== null ? ` · ${submission.score}` : ''}
                        </Badge>
                      ) : item._count ? (
                        <Badge variant="muted">
                          {item._count.submissions} {t('assignments.submissions').toLowerCase()}
                        </Badge>
                      ) : (
                        <Badge variant="outline">{t('grades.notGraded')}</Badge>
                      )}

                      <Button asChild size="sm" variant="outline">
                        <Link href={`/assignments/${item.id}` as '/assignments'}>
                          {t('common.more')}
                        </Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {/* --- Testlar --- */}
      {tab === 'quizzes' ? (
        quizzes.isLoading ? (
          <Skeleton className="h-40" />
        ) : (quizzes.data ?? []).length === 0 ? (
          <EmptyState
            icon={<ListChecks className="size-8" />}
            title={t('quizzes.emptyTitle')}
            description={t('quizzes.emptyDescription')}
          />
        ) : (
          <div className="space-y-2">
            {quizzes.data?.map((quiz) => {
              const attemptsUsed = quiz.attempts?.length ?? 0;
              const best = quiz.attempts?.find((attempt) => attempt.score !== null);

              return (
                <Card key={quiz.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <h3 className="font-medium">{localize(quiz.title, locale)}</h3>
                      <p className="text-xs text-muted-foreground">
                        {/* PRACTICE turi jurnalga kirmaydi va i18n kaliti yo'q */}
                        {isControlType(quiz.controlType)
                          ? t(`grades.${quiz.controlType}`)
                          : quiz.controlType}{' '}
                        · {quiz.durationMinutes} {t('courses.minutes')} · {quiz._count.questions}{' '}
                        {t('quizzes.question').toLowerCase()}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {best?.score ? (
                        <Badge variant="success">
                          {t('quizzes.score')}: {best.score}
                        </Badge>
                      ) : null}
                      {quiz.attempts ? (
                        <Badge variant="muted">
                          {t('quizzes.attemptsLeft', {
                            count: Math.max(0, quiz.maxAttempts - attemptsUsed),
                          })}
                        </Badge>
                      ) : null}

                      {/* O'qituvchi test tarkibini konstruktorda tuzadi (F-07) */}
                      {canEdit ? (
                        <Button asChild size="sm" variant="outline">
                          <Link href={`/quizzes/${quiz.id}/questions`}>
                            {t('quizzes.manageQuestions')}
                          </Link>
                        </Button>
                      ) : quiz._count.questions === 0 ? (
                        // Savolsiz test boshlanmaydi (server 422 qaytaradi) — tugma o'rniga holat
                        <Badge variant="muted">{t('quizzes.noQuestionsYet')}</Badge>
                      ) : (
                        <Button asChild size="sm">
                          <Link href={`/quizzes/${quiz.id}` as '/quizzes'}>
                            {t('quizzes.start')}
                          </Link>
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : null}

      {/* --- Jurnal --- */}
      {tab === 'gradebook' ? <GradebookPanel courseId={courseId} /> : null}
    </div>
  );
}

/** Modul akkordeoni — mavzular va darslar bilan. */
function ModuleAccordion({
  module,
  locale,
  courseId,
  isTeacher,
}: {
  module: CourseStructure['modules'][number];
  locale: AppLocale;
  courseId: string;
  isTeacher: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(true);

  const lessons = module.topics.flatMap((topic) => topic.lessons);
  const completed = lessons.filter((lesson) => lesson.progress?.[0]?.state === 'COMPLETED').length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 p-4 text-left"
      >
        <div className="min-w-0">
          <h2 className="font-medium">{localize(module.title, locale)}</h2>
          <p className="text-xs text-muted-foreground">
            {lessons.length} {t('courses.lessons').toLowerCase()}
            {!isTeacher && lessons.length > 0 ? ` · ${completed} / ${lessons.length}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!module.isPublished ? <Badge variant="warning">{t('courses.DRAFT')}</Badge> : null}
          <ChevronDown
            className={cn(
              'size-4 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {open ? (
        <CardContent className="space-y-3">
          {module.topics.map((topic) => (
            <div key={topic.id} id={`topic-${topic.id}`} className="scroll-mt-20">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {localize(topic.title, locale)}
              </p>
              <ul className="space-y-0.5">
                {topic.lessons.map((lesson) => {
                  const done = lesson.progress?.[0]?.state === 'COMPLETED';
                  return (
                    <li key={lesson.id}>
                      <Link
                        href={`/courses/${courseId}/lessons/${lesson.id}` as '/courses'}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                      >
                        {done ? (
                          <CheckCircle2
                            className="size-4 shrink-0 text-success"
                            aria-hidden="true"
                          />
                        ) : (
                          <Circle
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{localize(lesson.title, locale)}</span>
                        <Badge variant="outline" className="shrink-0">
                          {t('activities.lesson')}
                        </Badge>
                        {lesson.durationMinutes > 0 ? (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {lesson.durationMinutes} {t('courses.minutes')}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}

                {/* Moodle uslubi: topshiriq va testlar ham mavzu ichida */}
                {topic.assignments.map((assignment) => (
                  <li key={assignment.id}>
                    <Link
                      href={`/assignments/${assignment.id}` as '/assignments'}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <ClipboardList
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">{localize(assignment.title, locale)}</span>
                      <Badge variant="outline" className="shrink-0">
                        {t('activities.assignment')}
                      </Badge>
                      {!assignment.isPublished ? (
                        <Badge variant="warning" className="shrink-0">
                          {t('courses.DRAFT')}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}

                {topic.quizzes.map((quiz) => (
                  <li key={quiz.id}>
                    <Link
                      href={`/quizzes/${quiz.id}` as '/quizzes'}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent"
                    >
                      <ListChecks
                        className="size-4 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                      <span className="truncate">{localize(quiz.title, locale)}</span>
                      <Badge variant="outline" className="shrink-0">
                        {t('activities.quiz')}
                      </Badge>
                      {!quiz.isPublished ? (
                        <Badge variant="warning" className="shrink-0">
                          {t('courses.DRAFT')}
                        </Badge>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}

/** Kurs jurnali — o'qituvchi va dekanat uchun. */
function GradebookPanel({ courseId }: { courseId: string }) {
  const t = useTranslations();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gradebook', courseId],
    queryFn: async () =>
      (
        await api.get<
          Array<{
            userId: string;
            fullName: string;
            group: { id: string; name: string } | null;
            controls: Array<{ controlType: string; earned: number; max: number }>;
            final: { score: number; letter: string; gpaPoints: number; passed: boolean };
          }>
        >(`/grading/courses/${courseId}/gradebook`)
      ).data,
  });

  if (isLoading) return <Skeleton className="h-64" />;
  if (isError) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }
  if (!data || data.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="size-8" />}
        title={t('grades.emptyTitle')}
        description={t('grades.emptyDescription')}
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('grades.gradebook')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase text-muted-foreground">
                <th className="py-2 pr-3 font-medium">{t('dashboard.students')}</th>
                <th className="px-2 py-2 font-medium">{t('org.group')}</th>
                <th className="px-2 py-2 text-center font-medium">{t('grades.JN')}</th>
                <th className="px-2 py-2 text-center font-medium">{t('grades.ON')}</th>
                <th className="px-2 py-2 text-center font-medium">{t('grades.YN')}</th>
                <th className="px-2 py-2 text-center font-medium">{t('grades.finalScore')}</th>
                <th className="px-2 py-2 text-center font-medium">{t('grades.letterGrade')}</th>
              </tr>
            </thead>
            <tbody>
              {data.map((row) => (
                <tr key={row.userId} className="border-b border-border last:border-0">
                  <td className="py-2 pr-3">{row.fullName}</td>
                  <td className="px-2 py-2 text-muted-foreground">{row.group?.name ?? '—'}</td>
                  {(['JN', 'ON', 'YN'] as const).map((code) => {
                    const control = row.controls.find((item) => item.controlType === code);
                    return (
                      <td key={code} className="px-2 py-2 text-center tabular-nums">
                        {control ? control.earned.toFixed(1) : '—'}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center font-medium tabular-nums">
                    {row.final.score.toFixed(1)}
                  </td>
                  <td className="px-2 py-2 text-center">
                    <Badge variant={row.final.passed ? 'success' : 'destructive'}>
                      {row.final.letter}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
