/**
 * Maqsad: dekanat / kurator / administrator uchun talaba arizalarini ko'rib
 * chiqish (HEMIS "Talaba xizmatlari" ning xodim tomoni, F-14).
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy } from 'lucide-react';
import { toast } from 'sonner';
import { STUDENT_REQUEST_STATUSES, type LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import { useAuthStore } from '@/lib/auth-store';
import {
  Button,
  Card,
  CardContent,
  EmptyState,
  Input,
  Label,
  Skeleton,
} from '@/components/ui/primitives';
import { Select } from '@/components/ui/form-controls';
import { StatusBadge, StudentPage, formatDate } from '@/components/student/student-page';

interface StaffRequest {
  id: string;
  type: string;
  subject: string;
  details: string | null;
  status: string;
  resolution: string | null;
  documentId: string | null;
  createdAt: string;
  course: { id: string; title: LocalizedText } | null;
  user: {
    id: string;
    email: string;
    profile: { firstName: string; lastName: string } | null;
    studentGroups: Array<{ group: { name: string } }>;
  };
  handledBy: { profile: { firstName: string; lastName: string } | null } | null;
}

export default function StaffStudentRequestsPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const { can } = useAuthStore();
  const canManage = can('studentrequest:manage:all') || can('studentrequest:manage:own_faculty');
  const [status, setStatus] = useState<string>('');
  const [notes, setNotes] = useState<Record<string, string>>({});

  const requests = useQuery({
    queryKey: ['staff-student-requests', status],
    queryFn: async () =>
      (await api.get<StaffRequest[]>(`/student-requests${status ? `?status=${status}` : ''}`)).data,
  });

  const update = useMutation({
    mutationFn: async (input: { id: string; status: string }) =>
      api.patch(`/student-requests/${input.id}`, {
        status: input.status,
        resolution: notes[input.id]?.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void queryClient.invalidateQueries({ queryKey: ['staff-student-requests'] });
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });

  return (
    <StudentPage
      icon={LifeBuoy}
      title={t('student.staffRequestsTitle')}
      hint={t('student.staffRequestsHint')}
    >
      <div className="flex items-center gap-2">
        <Label htmlFor="request-status-filter">{t('student.filterStatus')}</Label>
        <Select
          id="request-status-filter"
          className="w-48"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option value="">{t('student.all')}</option>
          {STUDENT_REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {t(`student.status_${value}`)}
            </option>
          ))}
        </Select>
      </div>

      {requests.isLoading ? <Skeleton className="h-40 w-full" /> : null}
      {requests.data && requests.data.length === 0 ? (
        <EmptyState icon={<LifeBuoy className="size-8" />} title={t('student.noRequests')} />
      ) : null}

      <div className="space-y-3">
        {(requests.data ?? []).map((request) => {
          const open = request.status === 'PENDING' || request.status === 'IN_PROGRESS';
          const student = [request.user.profile?.lastName, request.user.profile?.firstName]
            .filter(Boolean)
            .join(' ');
          return (
            <Card key={request.id}>
              <CardContent className="space-y-3 pt-6 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{request.subject}</span>
                  <StatusBadge status={request.status} />
                  <span className="text-xs text-muted-foreground">
                    {t(`student.type_${request.type}`)} · {formatDate(request.createdAt, locale)}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  {t('student.student')}: {student || request.user.email}
                  {request.user.studentGroups[0]
                    ? ` · ${request.user.studentGroups[0].group.name}`
                    : ''}
                  {request.course ? ` · ${localize(request.course.title, locale)}` : ''}
                </p>
                {request.details ? <p>{request.details}</p> : null}
                {request.resolution ? (
                  <p>
                    <span className="text-muted-foreground">{t('student.resolution')}:</span>{' '}
                    {request.resolution}
                    {request.handledBy?.profile
                      ? ` (${t('student.handledBy')}: ${request.handledBy.profile.lastName} ${request.handledBy.profile.firstName})`
                      : ''}
                  </p>
                ) : null}

                {canManage && open ? (
                  <div className="space-y-2 border-t border-border pt-3">
                    <Input
                      aria-label={t('student.resolution')}
                      placeholder={t('student.resolutionPlaceholder')}
                      value={notes[request.id] ?? ''}
                      onChange={(event) => setNotes({ ...notes, [request.id]: event.target.value })}
                    />
                    <div className="flex flex-wrap gap-2">
                      {request.status === 'PENDING' ? (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={update.isPending}
                          onClick={() => update.mutate({ id: request.id, status: 'IN_PROGRESS' })}
                        >
                          {t('student.takeInProgress')}
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        loading={update.isPending}
                        onClick={() => update.mutate({ id: request.id, status: 'APPROVED' })}
                      >
                        {t('student.approve')}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        loading={update.isPending}
                        onClick={() => update.mutate({ id: request.id, status: 'REJECTED' })}
                      >
                        {t('student.reject')}
                      </Button>
                    </div>
                  </div>
                ) : null}
                {canManage && request.status === 'APPROVED' ? (
                  <Button
                    size="sm"
                    variant="outline"
                    loading={update.isPending}
                    onClick={() => update.mutate({ id: request.id, status: 'DONE' })}
                  >
                    {t('student.markDone')}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </StudentPage>
  );
}
