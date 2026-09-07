/**
 * Maqsad: HEMIS "Talaba xizmatlari" — arizalar (ma'lumotnoma, akademik ta'til,
 * qayta o'qish, o'tkazish, transkript) va ularning holati (F-14).
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  STUDENT_REQUEST_TYPES,
  createStudentRequestSchema,
  type LocalizedText,
  type StudentRequestType,
} from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import { Select } from '@/components/ui/form-controls';
import { StatusBadge, StudentPage, formatDate } from '@/components/student/student-page';

interface StudentRequest {
  id: string;
  type: StudentRequestType;
  subject: string;
  details: string | null;
  status: string;
  resolution: string | null;
  documentId: string | null;
  handledAt: string | null;
  createdAt: string;
  course: { id: string; code: string; title: LocalizedText } | null;
}

interface EnrolledCourse {
  id: string;
  title: LocalizedText;
}

export default function StudentServicesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const requests = useQuery({
    queryKey: ['student-requests'],
    queryFn: async () => (await api.get<StudentRequest[]>('/student/requests')).data,
  });
  const courses = useQuery({
    queryKey: ['my-courses'],
    queryFn: async () =>
      (await api.get<EnrolledCourse[]>('/courses?onlyEnrolled=true&limit=50')).data,
  });

  const [form, setForm] = useState({
    type: 'REFERENCE' as StudentRequestType,
    courseId: '',
    subject: '',
    details: '',
  });
  const [showForm, setShowForm] = useState(false);

  const create = useMutation({
    mutationFn: async () => {
      const body = {
        type: form.type,
        courseId: form.courseId || undefined,
        subject: form.subject.trim(),
        details: form.details.trim() || undefined,
      };
      const parsed = createStudentRequestSchema.safeParse(body);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'validation.required');
      }
      return api.post('/student/requests', parsed.data);
    },
    onSuccess: () => {
      toast.success(t('student.requestCreated'));
      setForm({ type: 'REFERENCE', courseId: '', subject: '', details: '' });
      setShowForm(false);
      void queryClient.invalidateQueries({ queryKey: ['student-requests'] });
    },
    onError: (error: unknown) => {
      const key =
        error instanceof ApiClientError
          ? error.translationKey
          : error instanceof Error && error.message.startsWith('validation.')
            ? error.message
            : 'errors.internal';
      toast.error(t(key));
    },
  });

  const needsCourse = form.type === 'RETAKE';

  return (
    <StudentPage
      icon={LifeBuoy}
      title={t('student.servicesTitle')}
      hint={t('student.servicesHint')}
    >
      {!showForm ? (
        <Button onClick={() => setShowForm(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t('student.newRequest')}
        </Button>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('student.newRequest')}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="request-type" required>
                {t('student.requestType')}
              </Label>
              <Select
                id="request-type"
                value={form.type}
                onChange={(event) =>
                  setForm({ ...form, type: event.target.value as StudentRequestType })
                }
              >
                {STUDENT_REQUEST_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(`student.type_${type}`)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="request-course" required={needsCourse}>
                {t('student.requestCourse')}
              </Label>
              <Select
                id="request-course"
                value={form.courseId}
                onChange={(event) => setForm({ ...form, courseId: event.target.value })}
              >
                <option value="">—</option>
                {(courses.data ?? []).map((course) => (
                  <option key={course.id} value={course.id}>
                    {localize(course.title, locale)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="request-subject" required>
                {t('student.requestSubject')}
              </Label>
              <Input
                id="request-subject"
                value={form.subject}
                onChange={(event) => setForm({ ...form, subject: event.target.value })}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="request-details">{t('student.requestDetails')}</Label>
              <Textarea
                id="request-details"
                rows={3}
                value={form.details}
                onChange={(event) => setForm({ ...form, details: event.target.value })}
              />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <Button variant="ghost" onClick={() => setShowForm(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={create.isPending}
                disabled={form.subject.trim().length < 3 || (needsCourse && !form.courseId)}
                onClick={() => create.mutate()}
              >
                {t('student.send')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('student.myRequests')}</CardTitle>
        </CardHeader>
        <CardContent>
          {requests.isLoading ? <Skeleton className="h-24 w-full" /> : null}
          {requests.data && requests.data.length === 0 ? (
            <EmptyState icon={<LifeBuoy className="size-8" />} title={t('student.noRequests')} />
          ) : null}
          <ul className="divide-y divide-border">
            {(requests.data ?? []).map((request) => (
              <li key={request.id} className="space-y-1 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{request.subject}</span>
                  <StatusBadge status={request.status} />
                  <span className="text-xs text-muted-foreground">
                    {t(`student.type_${request.type}`)} · {formatDate(request.createdAt, locale)}
                  </span>
                </div>
                {request.course ? (
                  <p className="text-xs text-muted-foreground">
                    {localize(request.course.title, locale)}
                  </p>
                ) : null}
                {request.details ? (
                  <p className="text-muted-foreground">{request.details}</p>
                ) : null}
                {request.resolution ? (
                  <p>
                    <span className="text-muted-foreground">{t('student.resolution')}:</span>{' '}
                    {request.resolution}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </StudentPage>
  );
}
