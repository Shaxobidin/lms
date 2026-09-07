/**
 * Maqsad: mavjud resursni Moodle uslubidagi bo'limli oynada tahrirlash (F-05).
 *
 * Yaratish oynasi minimal maydonlarni so'raydi; bu oyna esa keyinroq nom,
 * tarkib (TEXT — WYSIWYG muharrirda 4 tilda, LINK/EMBED — manzil va
 * balandlik) va majburiylikni o'zgartirish uchun. Fayl resursining fayli
 * almashtirilmaydi — Moodle'dagi kabi yangi fayl yangi resurs bo'ladi.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { updateResourceSchema, type LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { formatFileSize } from '@/lib/upload';
import { Button, Input, Label } from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LocalizedField, SwitchField } from '@/components/ui/form-controls';
import { SettingsSections } from '@/components/ui/settings-sections';
import { LocalizedRichField } from '@/components/editor/rich-text-editor';
import type { LessonResource } from './resource-manager';

const URL_KINDS = new Set(['LINK', 'EMBED', 'H5P', 'XAPI']);

function asLocalized(value: unknown): LocalizedText {
  if (!value || typeof value !== 'object') return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      (entry): entry is [string, string] => typeof entry[1] === 'string',
    ),
  );
}

export function ResourceEditDialog({
  resource,
  courseId,
  onClose,
  onSaved,
}: {
  resource: LessonResource;
  courseId: string;
  onClose: () => void;
  onSaved: () => void | Promise<unknown>;
}) {
  const t = useTranslations();

  const isText = resource.kind === 'TEXT';
  const isUrl = URL_KINDS.has(resource.kind);
  const isEmbed = resource.kind === 'EMBED';

  const [title, setTitle] = useState<LocalizedText>(asLocalized(resource.title));
  const [text, setText] = useState<LocalizedText>(asLocalized(resource.meta?.text));
  const [url, setUrl] = useState(resource.externalUrl ?? '');
  const [embedHeight, setEmbedHeight] = useState(String(resource.meta?.embedHeight ?? 600));
  const [isRequired, setIsRequired] = useState(resource.isRequired);
  const [issue, setIssue] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { title, isRequired };
      if (isText) body['meta'] = { text };
      if (isUrl) body['externalUrl'] = url.trim();
      if (isEmbed) body['meta'] = { embedHeight: Number(embedHeight) };

      const parsed = updateResourceSchema.safeParse(body);
      if (!parsed.success) {
        const path = parsed.error.issues[0]?.path[0];
        throw new Error(
          path === 'externalUrl' ? 'validation.resource_needs_url' : 'validation.required',
        );
      }
      return api.patch(`/courses/resources/${resource.id}`, parsed.data);
    },
    onSuccess: async () => {
      await onSaved();
      toast.success(t('courses.resourceUpdated'));
      onClose();
    },
    onError: (error: unknown) => {
      const key =
        error instanceof ApiClientError
          ? error.translationKey
          : error instanceof Error && error.message.startsWith('validation.')
            ? error.message
            : 'errors.internal';
      setIssue(key);
      toast.error(t(key));
    },
  });

  const ready =
    Boolean(title['uz-Latn']?.trim()) &&
    (!isUrl || url.trim().startsWith('http')) &&
    (!isEmbed || Number(embedHeight) >= 200);

  const sections = [
    {
      id: 'general',
      title: t('settingsForm.general'),
      children: (
        <LocalizedField
          idPrefix="resource-edit-title"
          label={t('common.title')}
          value={title}
          required
          moreLabel={t('common.otherLanguages')}
          onChange={setTitle}
        />
      ),
    },
    {
      id: 'content',
      title: t('settingsForm.content'),
      description: t(`courses.resourceContentHint_${isText ? 'text' : isUrl ? 'url' : 'file'}`),
      children: (
        <div className="space-y-4">
          {isText ? (
            <LocalizedRichField
              idPrefix="resource-edit-text"
              label={t('activities.labelText')}
              value={text}
              onChange={setText}
              courseId={courseId}
              minHeight={200}
              hint={t('courses.editorHint')}
            />
          ) : null}

          {isUrl ? (
            <div className="space-y-1.5">
              <Label htmlFor="resource-edit-url" required>
                {t('courses.linkUrl')}
              </Label>
              <Input
                id="resource-edit-url"
                type="url"
                inputMode="url"
                placeholder="https://"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
          ) : null}

          {isEmbed ? (
            <div className="space-y-1.5">
              <Label htmlFor="resource-edit-height">{t('courses.embedHeight')}</Label>
              <Input
                id="resource-edit-height"
                type="number"
                min={200}
                max={2000}
                step={10}
                value={embedHeight}
                onChange={(event) => setEmbedHeight(event.target.value)}
              />
            </div>
          ) : null}

          {resource.file ? (
            <p className="text-sm text-muted-foreground">
              {resource.file.originalName} · {formatFileSize(Number(resource.file.sizeBytes))}
            </p>
          ) : null}

          {resource.meta?.files?.length ? (
            <ul className="space-y-1 rounded-md border border-border p-2">
              {resource.meta.files.map((file) => (
                <li
                  key={file.fileObjectId}
                  className="flex justify-between gap-2 text-xs text-muted-foreground"
                >
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0">{formatFileSize(file.sizeBytes)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ),
    },
    {
      id: 'completion',
      title: t('settingsForm.completion'),
      children: (
        <SwitchField
          id="resource-edit-required"
          label={t('courses.required')}
          description={t('courses.requiredHint')}
          checked={isRequired}
          onCheckedChange={setIsRequired}
        />
      ),
    },
  ];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size={isText ? 'lg' : 'md'} closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('courses.editResource')}</DialogTitle>
          <DialogDescription>{t('courses.editResourceHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <SettingsSections
            sections={sections}
            expandAllLabel={t('settingsForm.expandAll')}
            collapseAllLabel={t('settingsForm.collapseAll')}
            defaultOpen={['general', 'content']}
          />
          {issue ? (
            <p role="alert" className="text-sm text-destructive">
              {t(issue)}
            </p>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={save.isPending} disabled={!ready} onClick={() => save.mutate()}>
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
