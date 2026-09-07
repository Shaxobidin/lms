/**
 * Maqsad: HEMIS "Individual shaxsiy reja" — o'quv reja semestrlar bo'yicha va
 * talabaning har bir fan bo'yicha holati/natijasi (F-03, F-08).
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Route } from 'lucide-react';
import type { LocalizedText } from '@lms/shared';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Alert,
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ProgressBar,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';
import { StatusBadge, StudentPage } from '@/components/student/student-page';

interface PlanSubject {
  id: string;
  subject: { id: string; code: string; name: LocalizedText; credits: number; controlForm: string };
  hours: { lecture: number; practice: number; lab: number; seminar: number; independent: number };
  isElective: boolean;
  courseId: string | null;
  courseTitle: LocalizedText | null;
  status: 'PASSED' | 'FAILED' | 'IN_PROGRESS' | 'CURRENT' | 'UPCOMING' | 'MISSED';
  result: { score: number; passed: boolean; letter: string } | null;
}

interface Plan {
  groupName: string | null;
  curriculumCode: string | null;
  currentSemesterNumber: number | null;
  speciality: { code: string; name: LocalizedText } | null;
  totalCredits: number;
  earnedCredits: number;
  semesters: Array<{ number: number; isCurrent: boolean; subjects: PlanSubject[] }>;
}

export default function StudentPlanPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const plan = useQuery({
    queryKey: ['student-plan'],
    queryFn: async () => (await api.get<Plan>('/student/plan')).data,
  });

  return (
    <StudentPage icon={Route} title={t('student.planTitle')} hint={t('student.planHint')}>
      {plan.isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {plan.data && !plan.data.groupName ? (
        <Alert variant="warning">{t('student.noGroup')}</Alert>
      ) : null}
      {plan.data && plan.data.groupName && !plan.data.curriculumCode ? (
        <Alert variant="warning">{t('student.noCurriculum')}</Alert>
      ) : null}

      {plan.data?.curriculumCode ? (
        <>
          <Card>
            <CardContent className="space-y-2 pt-6">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">
                  {plan.data.speciality ? localize(plan.data.speciality.name, locale) : ''}
                </span>
                <Badge variant="outline">{plan.data.curriculumCode}</Badge>
                <Badge variant="muted">{plan.data.groupName}</Badge>
                {plan.data.currentSemesterNumber ? (
                  <Badge variant="default">
                    {t('student.semester', { number: plan.data.currentSemesterNumber })}
                  </Badge>
                ) : null}
              </div>
              <ProgressBar
                value={
                  plan.data.totalCredits > 0
                    ? Math.round((plan.data.earnedCredits / plan.data.totalCredits) * 100)
                    : 0
                }
              />
              <p className="text-xs text-muted-foreground">
                {t('student.creditsEarned', {
                  earned: plan.data.earnedCredits,
                  total: plan.data.totalCredits,
                })}
              </p>
            </CardContent>
          </Card>

          {plan.data.semesters.map((semester) => (
            <Card key={semester.number}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {t('student.semester', { number: semester.number })}
                  {semester.isCurrent ? (
                    <Badge variant="default">{t('student.currentSemester')}</Badge>
                  ) : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('student.subjectCol')}</TableHead>
                      <TableHead>{t('student.credits')}</TableHead>
                      <TableHead>{t('student.hours')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                      <TableHead>{t('student.gradeCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {semester.subjects.map((row) => (
                      <TableRow key={row.id}>
                        <TableCell>
                          <div className="font-medium">
                            {row.courseId ? (
                              <Link href={`/courses/${row.courseId}` as '/courses'}>
                                {localize(row.subject.name, locale)}
                              </Link>
                            ) : (
                              localize(row.subject.name, locale)
                            )}
                            {row.isElective ? (
                              <Badge variant="outline" className="ml-2">
                                {t('student.elective')}
                              </Badge>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{row.subject.code}</p>
                        </TableCell>
                        <TableCell>{row.subject.credits}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {row.hours.lecture} {t('student.hoursLecture')} · {row.hours.practice}{' '}
                          {t('student.hoursPractice')} · {row.hours.independent}{' '}
                          {t('student.hoursIndependent')}
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={row.status} />
                        </TableCell>
                        <TableCell>
                          {row.result ? `${row.result.score} (${row.result.letter})` : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </>
      ) : null}
    </StudentPage>
  );
}
