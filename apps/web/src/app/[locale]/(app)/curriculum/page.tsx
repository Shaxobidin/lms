/**
 * Maqsad: o'quv reja va fanlar (F-03).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search } from 'lucide-react';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
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
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/primitives';

interface SubjectRow {
  id: string;
  code: string;
  name: unknown;
  credits: number;
  controlForm: string;
  department: { id: string; name: unknown };
  syllabi: Array<{ id: string; status: string; currentVersion: number }>;
}

interface CurriculumRow {
  id: string;
  code: string;
  name: unknown;
  admissionYear: number;
  totalCredits: number;
  status: string;
  speciality: { id: string; code: string; name: unknown };
  _count: { subjects: number };
}

export default function CurriculumPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const [search, setSearch] = useState('');

  const subjects = useQuery({
    queryKey: ['subjects', search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      return (await api.get<SubjectRow[]>(`/subjects?${params.toString()}`)).data;
    },
  });

  const curricula = useQuery({
    queryKey: ['curricula'],
    queryFn: async () => (await api.get<CurriculumRow[]>('/curricula')).data,
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('curriculum.title')}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('curriculum.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {curricula.isLoading ? (
            <Skeleton className="h-32" />
          ) : (curricula.data ?? []).length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8" />}
              title={t('curriculum.emptyTitle')}
              description={t('curriculum.emptyDescription')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.code')}</TableHead>
                  <TableHead>{t('org.speciality')}</TableHead>
                  <TableHead className="text-center">{t('org.admissionYear')}</TableHead>
                  <TableHead className="text-center">{t('courses.credits')}</TableHead>
                  <TableHead className="text-center">{t('curriculum.subjects')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {curricula.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs">{row.code}</TableCell>
                    <TableCell>{localize(row.speciality.name, locale)}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.admissionYear}</TableCell>
                    <TableCell className="text-center tabular-nums">{row.totalCredits}</TableCell>
                    <TableCell className="text-center tabular-nums">
                      {row._count.subjects}
                    </TableCell>
                    <TableCell>
                      <Badge variant={row.status === 'APPROVED' ? 'success' : 'warning'}>
                        {t(`curriculum.${row.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-3">
          <CardTitle>{t('curriculum.subjects')}</CardTitle>
          <div className="relative max-w-sm">
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
        </CardHeader>

        <CardContent>
          {subjects.isLoading ? (
            <Skeleton className="h-40" />
          ) : subjects.isError ? (
            <ErrorState
              title={t('common.somethingWentWrong')}
              onRetry={() => void subjects.refetch()}
              retryLabel={t('common.retry')}
            />
          ) : (subjects.data ?? []).length === 0 ? (
            <EmptyState icon={<FileText className="size-8" />} title={t('common.noResults')} />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.code')}</TableHead>
                  <TableHead>{t('common.name')}</TableHead>
                  <TableHead>{t('org.department')}</TableHead>
                  <TableHead className="text-center">{t('courses.credits')}</TableHead>
                  <TableHead>{t('curriculum.syllabus')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {subjects.data?.map((subject) => {
                  const syllabus = subject.syllabi[0];
                  return (
                    <TableRow key={subject.id}>
                      <TableCell className="font-mono text-xs">{subject.code}</TableCell>
                      <TableCell className="font-medium">
                        {localize(subject.name, locale)}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {localize(subject.department.name, locale)}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{subject.credits}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {syllabus ? (
                            <Badge variant={syllabus.status === 'APPROVED' ? 'success' : 'warning'}>
                              {t(`curriculum.${syllabus.status}`)} · v{syllabus.currentVersion}
                            </Badge>
                          ) : (
                            <Badge variant="muted">—</Badge>
                          )}
                          {/* Konstruktor va tasdiqlash oqimi fan sahifasida */}
                          <Button asChild size="sm" variant="ghost">
                            <Link href={`/curriculum/subjects/${subject.id}/syllabus`}>
                              {syllabus
                                ? t('curriculum.openSyllabus')
                                : t('curriculum.createSyllabus')}
                            </Link>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
