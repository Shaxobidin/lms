/**
 * Maqsad: LTI Deep Linking — tashqi platforma "kontent tanlang" deb yuborganda
 * o'qituvchi bizning kurslardan birini tanlaydi; server imzolangan javob JWT
 * beradi, sahifa uni platformaning qaytish manziliga `form_post` qiladi (§10).
 *
 * `token` — launch'da yaratilgan bir martalik Deep Linking holati (15 daqiqa).
 */

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plug } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/components/ui/primitives';

interface CourseRow {
  id: string;
  code?: string | null;
  title: unknown;
}

export default function DeepLinkPage() {
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <DeepLinkContent />
    </Suspense>
  );
}

function DeepLinkContent() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const formRef = useRef<HTMLFormElement>(null);
  const [response, setResponse] = useState<{
    returnUrl: string;
    jwt: string;
    title: string;
  } | null>(null);

  const context = useQuery({
    queryKey: ['lti-deep-link', token],
    queryFn: async () =>
      (
        await api.get<{ platform: string; returnUrl: string }>(
          `/lti/deep-link?token=${encodeURIComponent(token)}`,
        )
      ).data,
    enabled: token.length > 0,
    retry: false,
  });

  const courses = useQuery({
    queryKey: ['lti-deep-link-courses'],
    queryFn: async () => (await api.get<CourseRow[]>('/courses?limit=50')).data,
    enabled: context.isSuccess,
  });

  const respond = useMutation({
    mutationFn: async (courseId: string) =>
      (
        await api.post<{ returnUrl: string; jwt: string; title: string }>(
          '/lti/deep-link/respond',
          { token, courseId },
        )
      ).data,
    onSuccess: (result) => setResponse(result),
  });

  // Javob tayyor bo'lgach platformaga form-post — brauzer platformaga qaytadi
  useEffect(() => {
    if (response) formRef.current?.submit();
  }, [response]);

  if (!token || context.isError) {
    const message =
      context.error instanceof ApiClientError &&
      context.error.messageKey === 'errors.lti_state_invalid'
        ? t('errors.lti_state_invalid')
        : t('lti.deepLinkInvalid');
    return (
      <EmptyState
        icon={<Plug className="size-8" />}
        title={t('lti.deepLinkTitle')}
        description={message}
      />
    );
  }

  if (context.isLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plug className="size-4 text-primary" aria-hidden="true" />
            {t('lti.deepLinkTitle')}
          </CardTitle>
          <CardDescription>
            {t('lti.deepLinkHint', { platform: context.data?.platform ?? '' })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {respond.isError ? (
            <Alert variant="destructive">
              {respond.error instanceof ApiClientError &&
              t.has(`errors.${respond.error.messageKey.replace(/^errors\./, '')}`)
                ? t(`errors.${respond.error.messageKey.replace(/^errors\./, '')}`)
                : t('common.somethingWentWrong')}
            </Alert>
          ) : null}
          {response ? (
            <Alert variant="success">{t('lti.deepLinkReturning', { title: response.title })}</Alert>
          ) : null}

          {courses.isLoading ? (
            <Skeleton className="h-24" />
          ) : (courses.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('lti.deepLinkNoCourses')}</p>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {courses.data?.map((course) => (
                <li key={course.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{localize(course.title, locale)}</p>
                    {course.code ? (
                      <p className="text-xs text-muted-foreground">{course.code}</p>
                    ) : null}
                  </div>
                  <Button
                    size="sm"
                    disabled={respond.isPending || Boolean(response)}
                    onClick={() => respond.mutate(course.id)}
                  >
                    {t('lti.deepLinkSelect')}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {response ? (
        <form ref={formRef} method="post" action={response.returnUrl} className="hidden">
          <input type="hidden" name="JWT" value={response.jwt} />
        </form>
      ) : null}
    </div>
  );
}
