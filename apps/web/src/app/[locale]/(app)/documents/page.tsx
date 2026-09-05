/**
 * Maqsad: hujjatlar — generatsiya so'rovi va tayyor fayllar (F-14).
 *
 * Generatsiya navbatda bajariladi (ADR-004), shuning uchun ro'yxat
 * "QUEUED" holatdagi yozuv bo'lsa avtomatik yangilanadi.
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { DOCUMENT_TEMPLATES } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Alert,
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

interface DocumentRow {
  id: string;
  templateKey: string;
  format: string;
  status: string;
  documentNumber: string | null;
  signedAt: string | null;
  createdAt: string;
  fileObjectId: string | null;
}

interface CourseOption {
  id: string;
  code: string;
}

interface GroupOption {
  id: string;
  name: string;
}

export default function DocumentsPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();

  const [template, setTemplate] = useState<string>('RATING_SHEET');
  const [courseId, setCourseId] = useState('');
  const [groupId, setGroupId] = useState('');

  const documents = useQuery({
    queryKey: ['documents'],
    queryFn: async () => (await api.get<DocumentRow[]>('/documents')).data,
    // Navbatdagi hujjat bo'lsa har 5 soniyada holatni tekshiramiz
    refetchInterval: (query) =>
      (query.state.data ?? []).some((item) => item.status === 'QUEUED') ? 5000 : false,
  });

  const courses = useQuery({
    queryKey: ['courses', 'for-documents'],
    queryFn: async () => (await api.get<CourseOption[]>('/courses?limit=50')).data,
  });

  const groups = useQuery({
    queryKey: ['groups', 'for-documents'],
    queryFn: async () => (await api.get<GroupOption[]>('/org/groups')).data,
  });

  const generate = useMutation({
    mutationFn: async () =>
      api.post('/documents/generate', {
        template,
        format: template === 'ATTENDANCE_SHEET' ? 'XLSX' : 'DOCX',
        params: {
          ...(courseId ? { courseId } : {}),
          ...(groupId ? { groupId } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(t('analytics.reportQueued'));
      void queryClient.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  const download = async (fileId: string) => {
    try {
      const { data } = await api.get<{ url: string }>(`/content/files/${fileId}/download`);
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('errors.internal'));
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('documents.title')}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('documents.generate')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Alert>{t('documents.gostNote')}</Alert>

          <div className="grid gap-2 sm:grid-cols-3">
            <select
              value={template}
              onChange={(event) => setTemplate(event.target.value)}
              aria-label={t('documents.title')}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {DOCUMENT_TEMPLATES.map((item) => (
                <option key={item} value={item}>
                  {t(`documents.${item}`)}
                </option>
              ))}
            </select>

            <select
              value={courseId}
              onChange={(event) => setCourseId(event.target.value)}
              aria-label={t('nav.courses')}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('nav.courses')}</option>
              {(courses.data ?? []).map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code}
                </option>
              ))}
            </select>

            <select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              aria-label={t('org.group')}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">{t('org.group')}</option>
              {(groups.data ?? []).map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <Button onClick={() => generate.mutate()} loading={generate.isPending}>
            <FileText className="size-4" aria-hidden="true" />
            {t('documents.generate')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('documents.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {documents.isLoading ? (
            <Skeleton className="h-32" />
          ) : (documents.data ?? []).length === 0 ? (
            <EmptyState
              icon={<FileText className="size-8" />}
              title={t('documents.emptyTitle')}
              description={t('documents.emptyDescription')}
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('documents.title')}</TableHead>
                  <TableHead>{t('documents.format')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  <TableHead>{t('common.date')}</TableHead>
                  <TableHead>{t('common.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.data?.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">
                      {t(`documents.${row.templateKey}`)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{row.format}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          row.status === 'SIGNED'
                            ? 'success'
                            : row.status === 'GENERATED'
                              ? 'default'
                              : 'muted'
                        }
                      >
                        {row.status === 'QUEUED' ? t('documents.generating') : row.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDateTime(row.createdAt, locale)}
                    </TableCell>
                    <TableCell>
                      {row.fileObjectId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => void download(row.fileObjectId as string)}
                        >
                          <Download className="size-3.5" aria-hidden="true" />
                          {t('common.download')}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
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
