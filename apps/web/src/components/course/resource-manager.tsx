/**
 * Maqsad: darsdagi o'quv materiallarini boshqarish (F-05).
 *
 * Yangi material "Resurs qo'shish" oynasi orqali qo'shiladi — u Moodle dagi
 * activity chooser bilan bir xil ro'yxatni beradi, lekin dars darajasida
 * faqat resurslar ko'rsatiladi (topshiriq va test mavzuga biriktiriladi).
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Braces,
  ExternalLink,
  FileArchive,
  FileText,
  Film,
  FolderOpen,
  Link2,
  Music,
  Paperclip,
  Pencil,
  Plus,
  Trash2,
  Type,
} from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import { formatFileSize } from '@/lib/upload';
import { Badge, Button, EmptyState } from '@/components/ui/primitives';
import { ActivityChooser, type ChooserAction } from './activity-chooser';
import { ActivityForm } from './activity-forms';
import { ResourceEditDialog } from './resource-edit-dialog';

export interface LessonResource {
  id: string;
  kind: string;
  title: unknown;
  externalUrl: string | null;
  isRequired: boolean;
  meta?: {
    text?: Record<string, string>;
    files?: Array<{ fileObjectId: string; name: string; sizeBytes: number }>;
    embedHeight?: number;
  } | null;
  file?: { originalName: string; sizeBytes: string | number; mimeType: string } | null;
}

const KIND_ICONS: Record<string, typeof FileText> = {
  VIDEO: Film,
  AUDIO: Music,
  PDF: FileText,
  SCORM: FileArchive,
  LINK: Link2,
  TEXT: Type,
  FOLDER: FolderOpen,
  EMBED: Braces,
  H5P: Braces,
  XAPI: Braces,
  FILE: Paperclip,
};

export function ResourceManager({
  lessonId,
  courseId,
  resources,
  locale,
}: {
  lessonId: string;
  courseId: string;
  resources: LessonResource[];
  locale: AppLocale;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [chooserOpen, setChooserOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<ChooserAction | null>(null);
  const [editing, setEditing] = useState<LessonResource | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['lesson', lessonId] });

  const reportError = (error: unknown) => {
    const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
    toast.error(t(key));
  };

  const toggleRequired = useMutation({
    mutationFn: async ({ id, isRequired }: { id: string; isRequired: boolean }) =>
      api.patch(`/courses/resources/${id}`, { isRequired }),
    onSuccess: invalidate,
    onError: reportError,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/courses/resources/${id}`),
    onSuccess: async () => {
      await invalidate();
      toast.success(t('courses.resourceDeleted'));
    },
    onError: reportError,
  });

  return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={() => setChooserOpen(true)}>
        <Plus className="size-4" aria-hidden="true" />
        {t('activities.addResource')}
      </Button>

      {resources.length === 0 ? (
        <EmptyState
          icon={<Paperclip className="size-8" />}
          title={t('courses.noResources')}
          description={t('courses.noResourcesHint')}
        />
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {resources.map((resource) => {
            const Icon = KIND_ICONS[resource.kind] ?? Paperclip;
            const size = resource.file ? Number(resource.file.sizeBytes) : 0;
            const folderCount = resource.meta?.files?.length ?? 0;

            return (
              <li key={resource.id} className="flex flex-wrap items-center gap-3 p-3">
                <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {localize(resource.title, locale, resource.file?.originalName ?? '—')}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {resource.kind}
                    {size > 0 ? ` · ${formatFileSize(size)}` : ''}
                    {folderCount > 0 ? ` · ${folderCount} ${t('activities.filesCount')}` : ''}
                    {resource.externalUrl ? ` · ${resource.externalUrl.slice(0, 48)}` : ''}
                  </p>
                </div>

                {resource.isRequired ? (
                  <Badge variant="default">{t('courses.required')}</Badge>
                ) : null}

                {resource.externalUrl ? (
                  <a
                    href={resource.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t('common.open')}
                    className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="size-4" aria-hidden="true" />
                  </a>
                ) : null}

                <button
                  type="button"
                  onClick={() =>
                    toggleRequired.mutate({ id: resource.id, isRequired: !resource.isRequired })
                  }
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {resource.isRequired ? t('courses.makeOptional') : t('courses.makeRequired')}
                </button>

                <button
                  type="button"
                  onClick={() => setEditing(resource)}
                  aria-label={`${t('common.edit')}: ${localize(resource.title, locale, resource.kind)}`}
                  title={t('common.edit')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Pencil className="size-4" aria-hidden="true" />
                </button>

                <button
                  type="button"
                  onClick={() => remove.mutate(resource.id)}
                  aria-label={t('common.delete')}
                  title={t('common.delete')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <ActivityChooser
        open={chooserOpen}
        onOpenChange={setChooserOpen}
        scope="lesson"
        onSelect={setPendingAction}
      />

      {editing ? (
        <ResourceEditDialog
          resource={editing}
          courseId={courseId}
          onClose={() => setEditing(null)}
          onSaved={invalidate}
        />
      ) : null}

      {pendingAction ? (
        <ActivityForm
          action={pendingAction}
          courseId={courseId}
          lessonId={lessonId}
          onClose={() => setPendingAction(null)}
          onCreated={() => void invalidate()}
        />
      ) : null}
    </div>
  );
}
