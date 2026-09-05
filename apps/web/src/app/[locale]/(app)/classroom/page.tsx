/**
 * Maqsad: virtual sinf — rejalashtirilgan onlayn darslar (F-11).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Video } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { formatDateTime, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import { Badge, Button, Card, CardContent, EmptyState, Skeleton } from '@/components/ui/primitives';

interface CourseOption {
  id: string;
  code: string;
  title: unknown;
}

interface MeetingRow {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  recordingEnabled: boolean;
  recordingUrl: string | null;
  endedAt: string | null;
  provider: string;
}

export default function ClassroomPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const [courseId, setCourseId] = useState('');

  const courses = useQuery({
    queryKey: ['courses', 'for-classroom'],
    queryFn: async () => (await api.get<CourseOption[]>('/courses?limit=50')).data,
  });

  const selected = courseId || courses.data?.[0]?.id || '';

  const meetings = useQuery({
    queryKey: ['classroom', selected],
    queryFn: async () =>
      (await api.get<MeetingRow[]>(`/classroom/courses/${selected}/meetings`)).data,
    enabled: Boolean(selected),
  });

  const join = async (meetingId: string) => {
    try {
      const { data } = await api.post<{ joinUrl: string }>(`/classroom/meetings/${meetingId}/join`);
      window.open(data.joinUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    }
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.classroom')}</h1>

        <select
          value={selected}
          onChange={(event) => setCourseId(event.target.value)}
          aria-label={t('nav.courses')}
          className="h-9 max-w-64 rounded-md border border-input bg-background px-3 text-sm"
        >
          {(courses.data ?? []).map((course) => (
            <option key={course.id} value={course.id}>
              {course.code} — {localize(course.title, locale)}
            </option>
          ))}
        </select>
      </header>

      {meetings.isLoading ? (
        <Skeleton className="h-40" />
      ) : (meetings.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Video className="size-8" />}
          title={t('nav.classroom')}
          description={t('schedule.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          {meetings.data?.map((meeting) => {
            const ended = Boolean(meeting.endedAt);
            return (
              <Card key={meeting.id}>
                <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <h2 className="font-medium">{meeting.title}</h2>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(meeting.startsAt, locale)} · {meeting.durationMinutes}{' '}
                      {t('courses.minutes')} · {meeting.provider}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {ended ? (
                      <>
                        <Badge variant="muted">{t('common.close')}</Badge>
                        {meeting.recordingUrl ? (
                          <Button size="sm" variant="outline" asChild>
                            <a
                              href={meeting.recordingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {t('common.download')}
                            </a>
                          </Button>
                        ) : null}
                      </>
                    ) : (
                      <Button size="sm" onClick={() => void join(meeting.id)}>
                        <Video className="size-3.5" aria-hidden="true" />
                        {t('nav.classroom')}
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
