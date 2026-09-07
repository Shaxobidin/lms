/**
 * Maqsad: darsni tahrirlash — mazmun va o'quv materiallari (F-04, F-05).
 *
 * Avtosaqlash ATAYLAB qo'yilmagan: o'qituvchi darsni nashr qilishdan oldin
 * ko'rib chiqishi kerak. Buning o'rniga saqlanmagan o'zgarish ogohlantirishi
 * bor (§9) — sahifadan chiqishda ma'lumot yo'qolmaydi.
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Eye, Save } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { useParams } from 'next/navigation';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ErrorState,
  Input,
  Label,
  Skeleton,
} from '@/components/ui/primitives';
import { LocalizedField, SwitchField } from '@/components/ui/form-controls';
import { LocalizedRichField } from '@/components/editor/rich-text-editor';
import { ResourceManager, type LessonResource } from '@/components/course/resource-manager';

interface LessonDetail {
  id: string;
  title: LocalizedText;
  contentHtml: LocalizedText | null;
  durationMinutes: number;
  isPublished: boolean;
  resources: LessonResource[];
}

export default function LessonEditorPage() {
  const params = useParams<{ courseId: string; lessonId: string }>();
  const courseId = params.courseId;
  const lessonId = params.lessonId;
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();

  const lesson = useQuery({
    queryKey: ['lesson', lessonId],
    queryFn: async () => (await api.get<LessonDetail>(`/courses/lessons/${lessonId}`)).data,
  });

  const [draft, setDraft] = useState<{
    title: LocalizedText;
    contentHtml: LocalizedText;
    durationMinutes: number;
    isPublished: boolean;
  } | null>(null);

  // Server ma'lumoti kelgach qoralama bir marta to'ldiriladi
  useEffect(() => {
    if (lesson.data && draft === null) {
      setDraft({
        title: lesson.data.title ?? {},
        contentHtml: lesson.data.contentHtml ?? {},
        durationMinutes: lesson.data.durationMinutes,
        isPublished: lesson.data.isPublished,
      });
    }
  }, [lesson.data, draft]);

  const isDirty = useMemo(() => {
    if (!lesson.data || !draft) return false;
    return (
      JSON.stringify(draft.title) !== JSON.stringify(lesson.data.title ?? {}) ||
      JSON.stringify(draft.contentHtml) !== JSON.stringify(lesson.data.contentHtml ?? {}) ||
      draft.durationMinutes !== lesson.data.durationMinutes ||
      draft.isPublished !== lesson.data.isPublished
    );
  }, [draft, lesson.data]);

  // Saqlanmagan o'zgarish bo'lsa sahifadan chiqishda ogohlantiramiz (§9)
  useEffect(() => {
    if (!isDirty) return undefined;

    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const save = useMutation({
    mutationFn: async () => api.patch(`/courses/lessons/${lessonId}`, draft),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] });
      await queryClient.invalidateQueries({ queryKey: ['course', courseId] });
      toast.success(t('common.saved'));
    },
    onError: (error) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  if (lesson.isLoading || !draft) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
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

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1">
            <Link href={`/courses/${courseId}` as '/courses'}>
              <ArrowLeft className="size-4" aria-hidden="true" />
              {t('courses.backToCourse')}
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            {localize(draft.title, locale, t('courses.untitledLesson'))}
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/courses/${courseId}/lessons/${lessonId}` as '/courses'}>
              <Eye className="size-4" aria-hidden="true" />
              {t('courses.preview')}
            </Link>
          </Button>
          <Button
            size="sm"
            loading={save.isPending}
            disabled={!isDirty}
            onClick={() => save.mutate()}
          >
            <Save className="size-4" aria-hidden="true" />
            {isDirty ? t('common.save') : t('common.saved')}
          </Button>
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('courses.lessonSettings')}</CardTitle>
          <CardDescription>{t('courses.localizedHint')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <LocalizedField
            idPrefix="lesson-title"
            label={t('common.title')}
            value={draft.title}
            required
            moreLabel={t('common.otherLanguages')}
            onChange={(title) => setDraft({ ...draft, title })}
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="duration">{t('courses.durationMinutes')}</Label>
              <Input
                id="duration"
                type="number"
                min={0}
                max={600}
                value={draft.durationMinutes}
                onChange={(event) =>
                  setDraft({ ...draft, durationMinutes: Number(event.target.value) })
                }
              />
            </div>

            <SwitchField
              id="lesson-published"
              label={t('courses.published')}
              description={t('courses.publishedHint')}
              checked={draft.isPublished}
              onCheckedChange={(isPublished) => setDraft({ ...draft, isPublished })}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('courses.lessonContent')}</CardTitle>
          <CardDescription>{t('courses.contentHint')}</CardDescription>
        </CardHeader>

        <CardContent className="space-y-1.5">
          <LocalizedRichField
            idPrefix="content"
            label={t('courses.lessonContent')}
            value={draft.contentHtml}
            courseId={courseId}
            minHeight={360}
            hint={t('courses.editorHint')}
            onChange={(contentHtml) => setDraft({ ...draft, contentHtml })}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('courses.materials')}</CardTitle>
          <CardDescription>{t('courses.materialsHint')}</CardDescription>
        </CardHeader>

        <CardContent>
          <ResourceManager
            lessonId={lessonId}
            courseId={courseId}
            resources={lesson.data.resources ?? []}
            locale={locale}
          />
        </CardContent>
      </Card>
    </div>
  );
}
