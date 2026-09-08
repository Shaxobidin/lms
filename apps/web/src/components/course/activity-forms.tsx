/**
 * Maqsad: element tanlangandan keyingi yaratish oynalari (F-04, F-05, F-06,
 * F-07, F-10, F-11).
 *
 * Har bir tur o'z minimal maydonlari bilan yaratiladi — batafsil sozlamalar
 * yaratilgandan keyin o'z sahifasida tahrirlanadi. Bu Moodle dagi yondashuv:
 * avval element paydo bo'ladi, keyin sozlanadi.
 */

'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { Upload } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { formatFileSize, uploadFile } from '@/lib/upload';
import { Button, Input, Label, ProgressBar } from '@/components/ui/primitives';
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
import { RichTextEditor } from '@/components/editor/rich-text-editor';
import { QuizSettingsForm, toQuizPayload } from './quiz-settings-form';
import { AssignmentSettingsForm, toAssignmentPayload } from './assignment-settings-form';
import type { ChooserAction } from './activity-chooser';

/** Sana-vaqt maydonini `datetime-local` uchun boshlang'ich qiymatga aylantiradi. */
function defaultDateTime(daysAhead: number): string {
  const date = new Date(Date.now() + daysAhead * 86_400_000);
  date.setMinutes(0, 0, 0);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

interface CommonProps {
  action: ChooserAction;
  courseId: string;
  topicId?: string;
  lessonId?: string;
  onClose: () => void;
  onCreated: () => void;
}

export function ActivityForm(props: CommonProps) {
  const { action } = props;

  if (action.type === 'resource') return <ResourceForm {...props} action={action} />;
  if (action.type === 'assignment') return <AssignmentForm {...props} />;
  if (action.type === 'quiz') return <QuizForm {...props} />;
  if (action.type === 'forum') return <ForumForm {...props} />;
  if (action.type === 'meeting') return <MeetingForm {...props} />;
  return null;
}

/** Oyna qobig'i — barcha formalar bir xil ko'rinishda bo'lsin. */
function FormShell({
  titleKey,
  descriptionKey,
  onClose,
  onSubmit,
  isPending,
  disabled,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  onClose: () => void;
  onSubmit: () => void;
  isPending: boolean;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">{children}</DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={isPending} disabled={disabled} onClick={onSubmit}>
            {t('common.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function useCreate(onCreated: () => void, onClose: () => void) {
  const t = useTranslations();

  return {
    onSuccess: () => {
      onClose();
      onCreated();
      toast.success(t('courses.itemCreated'));
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  };
}

/** Mavzuda dars bo'lmasa, material shu nomli darsga joylanadi. */
const MATERIALS_LESSON_TITLE = 'Materiallar';

// --- Resurs -----------------------------------------------------------------

function ResourceForm({
  action,
  courseId,
  topicId,
  lessonId,
  onClose,
  onCreated,
}: CommonProps & { action: Extract<ChooserAction, { type: 'resource' }> }) {
  const t = useTranslations();
  const handlers = useCreate(onCreated, onClose);
  const fileInput = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState<LocalizedText>({});
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [isRequired, setIsRequired] = useState(action.source !== 'url');
  const [picked, setPicked] = useState<File[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  const multiple = action.source === 'files';

  const create = useMutation({
    mutationFn: async () => {
      // Resurs modelda darsga bog'lanadi. Moodle da esa material to'g'ridan-to'g'ri
      // mavzuda turadi — mavzuda dars bo'lmasa, material uchun konteyner dars
      // yaratamiz (faqat saqlashda, foydalanuvchi bekor qilsa hech narsa qolmaydi).
      let targetLessonId = lessonId;
      if (!targetLessonId && topicId) {
        const lesson = await api.post<{ id: string }>('/courses/lessons', {
          topicId,
          title: { 'uz-Latn': MATERIALS_LESSON_TITLE },
          durationMinutes: 0,
          isPublished: true,
        });
        targetLessonId = lesson.data.id;
      }

      const body: Record<string, unknown> = {
        lessonId: targetLessonId,
        kind: action.kind,
        title,
        isRequired,
        meta: {},
      };

      if (action.source === 'url') {
        body['externalUrl'] = url;
      }

      if (action.source === 'text') {
        body['meta'] = { text: { 'uz-Latn': text } };
      }

      if (action.source === 'file') {
        const file = picked[0];
        if (!file) throw new Error('file_missing');
        setProgress(0);
        const uploaded = await uploadFile(file, {
          purpose: 'COURSE_CONTENT',
          courseId,
          onProgress: (fraction) => setProgress(fraction),
        });
        body['fileObjectId'] = uploaded.fileObjectId;
      }

      if (action.source === 'files') {
        const files = [];
        for (const [index, file] of picked.entries()) {
          const uploaded = await uploadFile(file, {
            purpose: 'COURSE_CONTENT',
            courseId,
            onProgress: (fraction) => setProgress((index + fraction) / picked.length),
          });
          files.push({
            fileObjectId: uploaded.fileObjectId,
            name: file.name,
            sizeBytes: file.size,
          });
        }
        body['meta'] = { files };
      }

      return api.post('/courses/resources', body);
    },
    onSuccess: () => {
      setProgress(null);
      handlers.onSuccess();
    },
    onError: (error) => {
      setProgress(null);
      handlers.onError(error);
    },
  });

  const ready =
    Boolean(lessonId || topicId) &&
    Boolean(title['uz-Latn']?.trim()) &&
    (action.source === 'url'
      ? url.startsWith('http')
      : action.source === 'text'
        ? text.trim().length > 0
        : picked.length > 0);

  return (
    <FormShell
      titleKey={`activities.${resourceTitleKey(action)}`}
      descriptionKey={`activities.${resourceTitleKey(action)}Hint`}
      onClose={onClose}
      onSubmit={() => create.mutate()}
      isPending={create.isPending}
      disabled={!ready}
    >
      <LocalizedField
        idPrefix="resource-form-title"
        label={t('common.title')}
        value={title}
        required
        moreLabel={t('common.otherLanguages')}
        onChange={setTitle}
      />

      {action.source === 'url' ? (
        <div className="space-y-1.5">
          <Label htmlFor="resource-form-url" required>
            {t('courses.linkUrl')}
          </Label>
          <Input
            id="resource-form-url"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
        </div>
      ) : null}

      {action.source === 'text' ? (
        <div className="space-y-1.5">
          <Label htmlFor="resource-form-text" required>
            {t('activities.labelText')}
          </Label>
          <RichTextEditor
            id="resource-form-text"
            value={text}
            onChange={setText}
            courseId={courseId}
            minHeight={160}
            placeholder={t('activities.labelPlaceholder')}
          />
        </div>
      ) : null}

      {action.source === 'file' || action.source === 'files' ? (
        <div className="space-y-2">
          <input
            ref={fileInput}
            type="file"
            multiple={multiple}
            className="sr-only"
            aria-label={t('courses.uploadFile')}
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              setPicked(files);
              if (files[0] && !title['uz-Latn']) {
                setTitle({ 'uz-Latn': multiple ? t('activities.folder') : files[0].name });
              }
            }}
          />

          <Button variant="outline" size="sm" onClick={() => fileInput.current?.click()}>
            <Upload className="size-4" aria-hidden="true" />
            {multiple ? t('activities.selectFiles') : t('activities.selectFile')}
          </Button>

          {picked.length > 0 ? (
            <ul className="space-y-1 rounded-md border border-border p-2">
              {picked.map((file) => (
                <li
                  key={file.name}
                  className="flex justify-between gap-2 text-xs text-muted-foreground"
                >
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0">{formatFileSize(file.size)}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {progress !== null ? <ProgressBar value={Math.round(progress * 100)} /> : null}

      <SwitchField
        id="resource-form-required"
        label={t('courses.required')}
        description={t('courses.requiredHint')}
        checked={isRequired}
        onCheckedChange={setIsRequired}
      />
    </FormShell>
  );
}

/** Resurs turiga mos i18n kalitini beradi — oynada tanish nom chiqsin. */
function resourceTitleKey(action: Extract<ChooserAction, { type: 'resource' }>): string {
  const byKind: Record<string, string> = {
    FILE: 'file',
    FOLDER: 'folder',
    LINK: 'url',
    TEXT: 'label',
    EMBED: 'embed',
    VIDEO: 'video',
    AUDIO: 'audio',
    PDF: 'pdf',
    SCORM: 'scorm',
    H5P: 'h5p',
  };
  return byKind[action.kind] ?? 'file';
}

// --- Topshiriq ---------------------------------------------------------------

function AssignmentForm({ courseId, topicId, onClose, onCreated }: CommonProps) {
  const t = useTranslations();
  const handlers = useCreate(onCreated, onClose);

  const create = useMutation({
    mutationFn: async (values: Parameters<typeof toAssignmentPayload>[0]) =>
      api.post('/assignments', {
        courseId,
        topicId: topicId ?? null,
        ...toAssignmentPayload(values, 'create'),
      }),
    ...handlers,
  });

  return (
    <SettingsDialog
      titleKey="activities.assignment"
      descriptionKey="activities.assignmentHint"
      onClose={onClose}
    >
      <AssignmentSettingsForm
        mode="create"
        courseId={courseId}
        pending={create.isPending}
        submitLabel={t('common.add')}
        onCancel={onClose}
        onSubmit={(values) => create.mutate(values)}
      />
    </SettingsDialog>
  );
}

/** Keng oyna: Moodle uslubidagi bo'limli sozlamalar formasi uchun. */
function SettingsDialog({
  titleKey,
  descriptionKey,
  onClose,
  children,
}: {
  titleKey: string;
  descriptionKey: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="lg" closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t(titleKey)}</DialogTitle>
          <DialogDescription>{t(descriptionKey)}</DialogDescription>
        </DialogHeader>
        <DialogBody>{children}</DialogBody>
      </DialogContent>
    </Dialog>
  );
}

// --- Test --------------------------------------------------------------------

function QuizForm({ courseId, topicId, onClose, onCreated }: CommonProps) {
  const t = useTranslations();
  const handlers = useCreate(onCreated, onClose);

  const create = useMutation({
    mutationFn: async (values: Parameters<typeof toQuizPayload>[0]) =>
      api.post('/quizzes', { courseId, topicId: topicId ?? null, ...toQuizPayload(values) }),
    ...handlers,
  });

  return (
    <SettingsDialog
      titleKey="activities.quiz"
      descriptionKey="activities.quizHint"
      onClose={onClose}
    >
      <QuizSettingsForm
        mode="create"
        courseId={courseId}
        pending={create.isPending}
        submitLabel={t('common.add')}
        onCancel={onClose}
        onSubmit={(values) => create.mutate(values)}
      />
    </SettingsDialog>
  );
}

// --- Forum -------------------------------------------------------------------

function ForumForm({ courseId, onClose, onCreated }: CommonProps) {
  const t = useTranslations();
  const handlers = useCreate(onCreated, onClose);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isQuestion, setIsQuestion] = useState(false);

  const create = useMutation({
    mutationFn: async () => api.post('/forum/threads', { courseId, title, body, isQuestion }),
    ...handlers,
  });

  return (
    <FormShell
      titleKey="activities.forum"
      descriptionKey="activities.forumHint"
      onClose={onClose}
      onSubmit={() => create.mutate()}
      isPending={create.isPending}
      disabled={title.trim().length < 3 || body.trim().length === 0}
    >
      <div className="space-y-1.5">
        <Label htmlFor="forum-title" required>
          {t('common.title')}
        </Label>
        <Input id="forum-title" value={title} onChange={(event) => setTitle(event.target.value)} />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="forum-body" required>
          {t('activities.forumBody')}
        </Label>
        <RichTextEditor
          id="forum-body"
          value={body}
          onChange={setBody}
          courseId={courseId}
          minHeight={160}
        />
      </div>

      <SwitchField
        id="forum-question"
        label={t('activities.questionMode')}
        description={t('activities.questionModeHint')}
        checked={isQuestion}
        onCheckedChange={setIsQuestion}
      />
    </FormShell>
  );
}

// --- Onlayn dars -------------------------------------------------------------

function MeetingForm({ courseId, onClose, onCreated }: CommonProps) {
  const t = useTranslations();
  const handlers = useCreate(onCreated, onClose);

  const [title, setTitle] = useState('');
  const [startsAt, setStartsAt] = useState(defaultDateTime(1));
  const [durationMinutes, setDurationMinutes] = useState(80);
  const [recordingEnabled, setRecordingEnabled] = useState(false);

  const create = useMutation({
    mutationFn: async () =>
      api.post('/classroom/meetings', {
        courseId,
        title,
        startsAt: new Date(startsAt).toISOString(),
        durationMinutes,
        recordingEnabled,
      }),
    ...handlers,
  });

  return (
    <FormShell
      titleKey="activities.meeting"
      descriptionKey="activities.meetingHint"
      onClose={onClose}
      onSubmit={() => create.mutate()}
      isPending={create.isPending}
      disabled={title.trim().length < 3}
    >
      <div className="space-y-1.5">
        <Label htmlFor="meeting-title" required>
          {t('common.title')}
        </Label>
        <Input
          id="meeting-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="meeting-start">{t('classroom.startsAt')}</Label>
          <Input
            id="meeting-start"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="meeting-duration">{t('courses.durationMinutes')}</Label>
          <Input
            id="meeting-duration"
            type="number"
            min={5}
            max={600}
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
          />
        </div>
      </div>

      <SwitchField
        id="meeting-recording"
        label={t('activities.recording')}
        description={t('activities.recordingHint')}
        checked={recordingEnabled}
        onCheckedChange={setRecordingEnabled}
      />
    </FormShell>
  );
}
