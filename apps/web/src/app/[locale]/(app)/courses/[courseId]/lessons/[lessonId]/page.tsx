/**
 * Maqsad: dars sahifasi — kontent, resurslar va progress (F-04, F-05).
 *
 * Dars mazmuni ALOHIDA endpointdan olinadi (`/courses/lessons/:id`): kurs
 * tuzilishi javobiga barcha darslar matnini qo'shish uni og'irlashtirardi.
 * Navigatsiya (oldingi/keyingi) uchun yengil tuzilma so'rovi ishlatiladi.
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { CheckCircle2, Download, FileText, Film, Link2, Music } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { Badge, Button, Card, CardContent, ErrorState, Skeleton } from '@/components/ui/primitives';

interface LessonResource {
  id: string;
  kind: string;
  title: unknown;
  externalUrl: string | null;
  file: { id: string; objectKey: string; mimeType: string } | null;
}

interface LessonDetail {
  id: string;
  title: unknown;
  contentHtml: unknown;
  durationMinutes: number;
  resources: LessonResource[];
  progress: Array<{ state: string; secondsSpent: number; completedAt: string | null }>;
  topic: { id: string; title: unknown; module: { id: string; title: unknown; courseId: string } };
}

interface CourseStructure {
  id: string;
  title: unknown;
  modules: Array<{
    topics: Array<{ lessons: Array<{ id: string }> }>;
  }>;
}

const RESOURCE_ICONS: Record<string, typeof FileText> = {
  VIDEO: Film,
  AUDIO: Music,
  PDF: FileText,
  LINK: Link2,
  FILE: Download,
};

export default function LessonPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const params = useParams<{ courseId: string; lessonId: string }>();
  const queryClient = useQueryClient();

  const startedAt = useRef(Date.now());
  const [completed, setCompleted] = useState(false);

  const lesson = useQuery({
    queryKey: ['lesson', params.lessonId],
    queryFn: async () => (await api.get<LessonDetail>(`/courses/lessons/${params.lessonId}`)).data,
  });

  const structure = useQuery({
    queryKey: ['course', params.courseId],
    queryFn: async () => (await api.get<CourseStructure>(`/courses/${params.courseId}`)).data,
  });

  const saveProgress = useMutation({
    mutationFn: async (input: { completed: boolean }) =>
      api.put('/content/progress', {
        lessonId: params.lessonId,
        secondsSpent: Math.round((Date.now() - startedAt.current) / 1000),
        completed: input.completed,
      }),
    onSuccess: (_result, variables) => {
      if (variables.completed) {
        setCompleted(true);
        toast.success(t('common.saved'));
        void queryClient.invalidateQueries({ queryKey: ['course', params.courseId] });
        void queryClient.invalidateQueries({ queryKey: ['lesson', params.lessonId] });
      }
      startedAt.current = Date.now();
    },
  });

  // Sahifadan chiqishda sarflangan vaqt saqlanadi
  useEffect(() => {
    const lessonId = params.lessonId;
    return () => {
      const seconds = Math.round((Date.now() - startedAt.current) / 1000);
      if (seconds > 5) {
        void api
          .put('/content/progress', { lessonId, secondsSpent: seconds, completed: false })
          .catch(() => undefined);
      }
    };
  }, [params.lessonId]);

  if (lesson.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (lesson.isError || !lesson.data) {
    return (
      <ErrorState
        title={t('errors.not_found')}
        onRetry={() => void lesson.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const data = lesson.data;
  const isDone = completed || data.progress[0]?.state === 'COMPLETED';

  const allLessonIds =
    structure.data?.modules
      .flatMap((module) => module.topics)
      .flatMap((topic) => topic.lessons.map((item) => item.id)) ?? [];
  const index = allLessonIds.indexOf(params.lessonId);
  const previous = index > 0 ? allLessonIds[index - 1] : null;
  const next = index >= 0 && index < allLessonIds.length - 1 ? allLessonIds[index + 1] : null;

  const contentHtml = localize(data.contentHtml, locale, '');

  return (
    <article className="mx-auto max-w-3xl space-y-5">
      <header className="space-y-2">
        <Link
          href={`/courses/${params.courseId}` as '/courses'}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {localize(structure.data?.title ?? data.topic.module.title, locale)}
        </Link>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{localize(data.title, locale)}</h1>
          {isDone ? (
            <Badge variant="success">
              <CheckCircle2 className="mr-1 size-3" aria-hidden="true" />
              {t('assignments.GRADED')}
            </Badge>
          ) : null}
        </div>

        <p className="text-sm text-muted-foreground">
          {localize(data.topic.title, locale)}
          {data.durationMinutes > 0 ? ` · ${data.durationMinutes} ${t('courses.minutes')}` : ''}
          {index >= 0 ? ` · ${index + 1} / ${allLessonIds.length}` : ''}
        </p>
      </header>

      {/* Kontent server tomonida DOMPurify bilan tozalangan (§11) */}
      {contentHtml ? (
        <div className="prose-lms" dangerouslySetInnerHTML={{ __html: contentHtml }} />
      ) : (
        <p className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('courses.structureEmpty')}
        </p>
      )}

      {data.resources.length > 0 ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <h2 className="text-sm font-medium">{t('courses.resources')}</h2>
            <ul className="space-y-1.5">
              {data.resources.map((resource) => {
                const Icon = RESOURCE_ICONS[resource.kind] ?? FileText;
                return (
                  <li key={resource.id}>
                    <ResourceLink
                      resource={resource}
                      icon={<Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
                      locale={locale}
                    />
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
        <div className="flex gap-2">
          {previous ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${params.courseId}/lessons/${previous}` as '/courses'}>
                {t('common.previous')}
              </Link>
            </Button>
          ) : null}
          {next ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/courses/${params.courseId}/lessons/${next}` as '/courses'}>
                {t('common.next')}
              </Link>
            </Button>
          ) : null}
        </div>

        {!isDone ? (
          <Button
            onClick={() => saveProgress.mutate({ completed: true })}
            loading={saveProgress.isPending}
          >
            <CheckCircle2 className="size-4" aria-hidden="true" />
            {t('common.confirm')}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

/** Resurs havolasi — fayl uchun vaqtinchalik URL so'raladi. */
function ResourceLink({
  resource,
  icon,
  locale,
}: {
  resource: LessonResource;
  icon: React.ReactNode;
  locale: AppLocale;
}) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);

  const open = async () => {
    if (resource.externalUrl) {
      window.open(resource.externalUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (!resource.file) return;

    setLoading(true);
    try {
      const { data } = await api.get<{ url: string }>(
        `/content/files/${resource.file.id}/download`,
      );
      window.open(data.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('errors.internal'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="flex w-full items-center gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:opacity-60"
    >
      {icon}
      <span className="flex-1 truncate">{localize(resource.title, locale)}</span>
      <Badge variant="outline">{resource.kind}</Badge>
    </button>
  );
}
