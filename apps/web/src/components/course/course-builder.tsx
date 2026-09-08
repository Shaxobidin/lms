/**
 * Maqsad: kurs tuzilmasini tahrirlash — modul, mavzu va darslar (F-04).
 *
 * Yondashuv Moodle ning "tahrirlashni yoqish" rejimiga o'xshaydi: oddiy
 * ko'rinishda talaba nima ko'rsa, o'qituvchi ham shuni ko'radi; tahrirlash
 * yoqilganda har bir element yonida amallar paydo bo'ladi.
 *
 * Tartiblash tugmalar bilan (yuqoriga/pastga) — sudrab tashlash sichqonchasiz
 * ishlamaydi va WCAG 2.1 AA klaviatura talabini buzardi (NF-05). Server bitta
 * so'rovda butun tartibni qabul qiladi, shuning uchun bu N ta so'rov emas.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Eye,
  EyeOff,
  FileText,
  Download,
  FolderPlus,
  LayoutGrid,
  ListChecks,
  ListPlus,
  Pencil,
  MessageSquare,
  Paperclip,
  PackageOpen,
  Plus,
  Video,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { cn, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { Badge, Button, Card, CardContent, EmptyState, Input } from '@/components/ui/primitives';
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
import { ActivityChooser, type ChooserAction } from './activity-chooser';
import { ResourceEditDialog } from './resource-edit-dialog';
import type { LessonResource } from './resource-manager';
import { ActivityForm } from './activity-forms';
import { CartridgeImportDialog } from './cartridge-import-dialog';

export interface BuilderLesson {
  id: string;
  title: unknown;
  position: number;
  durationMinutes: number;
  isPublished: boolean;
  resources: LessonResource[];
}

/** Mavzu ichidagi topshiriq — Moodle dagi "Topshiriq" faoliyati. */
export interface BuilderAssignment {
  id: string;
  title: unknown;
  isPublished: boolean;
}

/** Mavzu ichidagi test — Moodle dagi "Test" faoliyati. */
export interface BuilderQuiz {
  id: string;
  title: unknown;
  isPublished: boolean;
  _count: { questions: number };
}

/** Mavzu ichidagi forum — Moodle dagi "Forum" faoliyati. */
export interface BuilderForum {
  id: string;
  title: string;
  isQuestion: boolean;
  postCount: number;
}

/** Mavzu ichidagi onlayn dars — Moodle dagi "BigBlueButton" faoliyati. */
export interface BuilderMeeting {
  id: string;
  title: string;
  startsAt: string;
  durationMinutes: number;
  joinUrl: string;
}

export interface BuilderTopic {
  id: string;
  title: unknown;
  position: number;
  lessons: BuilderLesson[];
  assignments: BuilderAssignment[];
  quizzes: BuilderQuiz[];
  forumThreads: BuilderForum[];
  meetings: BuilderMeeting[];
}

export interface BuilderModule {
  id: string;
  title: unknown;
  position: number;
  isPublished: boolean;
  topics: BuilderTopic[];
}

type EntityKind = 'module' | 'topic' | 'lesson';

interface EditorState {
  kind: EntityKind;
  /** Mavjud element tahrirlanayotgan bo'lsa — uning identifikatori. */
  id?: string;
  /** Yangi element yaratilayotgan bo'lsa — ota elementning identifikatori. */
  parentId?: string;
  title: LocalizedText;
  isPublished: boolean;
  durationMinutes: number;
}

export function CourseBuilder({
  courseId,
  modules,
  locale,
}: {
  courseId: string;
  modules: BuilderModule[];
  locale: AppLocale;
}) {
  const t = useTranslations();
  const queryClient = useQueryClient();

  const [editor, setEditor] = useState<EditorState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ kind: EntityKind; id: string } | null>(null);

  /** Element tanlash oynasi qaysi mavzu uchun ochilgan. */
  const [chooserTopicId, setChooserTopicId] = useState<string | null>(null);
  const [editingResource, setEditingResource] = useState<LessonResource | null>(null);
  const [pendingResourceDelete, setPendingResourceDelete] = useState<string | null>(null);
  /** IMS CC paketini import qilish oynasi. */
  const [importing, setImporting] = useState(false);

  /** Tanlangan element uchun yaratish formasi. */
  const [pendingAction, setPendingAction] = useState<{
    action: ChooserAction;
    topicId: string;
  } | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['course', courseId] });

  const reportError = (error: unknown) => {
    const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
    toast.error(t(key));
  };

  const exportCartridge = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ url: string; counts: { modules: number } }>('/content/cc/export', {
          courseId,
          locale,
        })
      ).data,
    onSuccess: (result) => {
      toast.success(t('cc.exportDone', { modules: result.counts.modules }));
      window.open(result.url, '_blank', 'noopener');
    },
    onError: reportError,
  });

  const save = useMutation({
    mutationFn: async (state: EditorState) => {
      const body: Record<string, unknown> = { title: state.title };

      if (state.kind === 'module') {
        body['isPublished'] = state.isPublished;
        if (state.id) return api.patch(`/courses/modules/${state.id}`, body);
        return api.post('/courses/modules', { ...body, courseId });
      }

      if (state.kind === 'topic') {
        if (state.id) return api.patch(`/courses/topics/${state.id}`, body);
        return api.post('/courses/topics', { ...body, moduleId: state.parentId });
      }

      body['isPublished'] = state.isPublished;
      body['durationMinutes'] = state.durationMinutes;
      if (state.id) return api.patch(`/courses/lessons/${state.id}`, body);
      return api.post('/courses/lessons', { ...body, topicId: state.parentId });
    },
    onSuccess: async (_data, state) => {
      setEditor(null);
      await invalidate();
      toast.success(state.id ? t('common.saved') : t('courses.itemCreated'));
    },
    onError: reportError,
  });

  const remove = useMutation({
    mutationFn: async ({ kind, id }: { kind: EntityKind; id: string }) =>
      api.delete(`/courses/${kind}s/${id}`),
    onSuccess: async () => {
      setPendingDelete(null);
      await invalidate();
      toast.success(t('courses.itemDeleted'));
    },
    onError: reportError,
  });

  const togglePublish = useMutation({
    mutationFn: async ({
      kind,
      id,
      isPublished,
    }: {
      kind: 'module' | 'lesson';
      id: string;
      isPublished: boolean;
    }) => api.patch(`/courses/${kind}s/${id}`, { isPublished }),
    onSuccess: invalidate,
    onError: reportError,
  });

  const reorder = useMutation({
    mutationFn: async ({
      entity,
      orderedIds,
      parentId,
    }: {
      entity: EntityKind;
      orderedIds: string[];
      parentId?: string;
    }) => api.post('/courses/reorder', { entity, orderedIds, ...(parentId ? { parentId } : {}) }),
    onSuccess: invalidate,
    onError: reportError,
  });

  /** Elementni ro'yxat ichida bir pog'ona siljitadi va yangi tartibni yuboradi. */
  function move<T extends { id: string }>(
    entity: EntityKind,
    items: T[],
    index: number,
    direction: -1 | 1,
    parentId?: string,
  ) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;

    const next = [...items];
    const moved = next[index] as T;
    next[index] = next[target] as T;
    next[target] = moved;

    reorder.mutate({ entity, orderedIds: next.map((item) => item.id), parentId });
  }

  /** Resurs alohida endpoint bilan o'chiriladi (dars ichidagi element). */
  const removeResource = useMutation({
    mutationFn: async (id: string) => api.delete(`/courses/resources/${id}`),
    onSuccess: async () => {
      toast.success(t('common.deleted'));
      setPendingResourceDelete(null);
      await invalidate();
    },
    onError: (error: unknown) =>
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal')),
  });

  const openCreate = (kind: EntityKind, parentId?: string) =>
    setEditor({
      kind,
      parentId,
      title: {},
      isPublished: false,
      durationMinutes: kind === 'lesson' ? 45 : 0,
    });

  const openEdit = (kind: EntityKind, item: BuilderModule | BuilderTopic | BuilderLesson) =>
    setEditor({
      kind,
      id: item.id,
      title: (item.title ?? {}) as LocalizedText,
      isPublished: 'isPublished' in item ? item.isPublished : false,
      durationMinutes: 'durationMinutes' in item ? item.durationMinutes : 0,
    });

  return (
    <div className="space-y-3">
      {modules.length === 0 ? (
        <EmptyState
          icon={<BookOpen className="size-8" />}
          title={t('courses.structureEmpty')}
          description={t('courses.builderHint')}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => openCreate('module')}>
                <Plus className="size-4" aria-hidden="true" />
                {t('courses.addModule')}
              </Button>
              <Button variant="outline" onClick={() => setImporting(true)}>
                <PackageOpen className="size-4" aria-hidden="true" />
                {t('courses.importCartridge')}
              </Button>
            </div>
          }
        />
      ) : (
        modules.map((module, moduleIndex) => (
          <Card key={module.id}>
            {/* `data-testid`: e2e testi modul qatorini aniq topishi uchun */}
            <div
              data-testid="module-row"
              className="flex flex-wrap items-start justify-between gap-2 border-b border-border p-4"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-medium">{localize(module.title, locale)}</h2>
                  {module.isPublished ? (
                    <Badge variant="success">{t('courses.PUBLISHED')}</Badge>
                  ) : (
                    <Badge variant="warning">{t('courses.DRAFT')}</Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {module.topics.length} {t('courses.topics').toLowerCase()} ·{' '}
                  {module.topics.reduce((sum, topic) => sum + topic.lessons.length, 0)}{' '}
                  {t('courses.lessons').toLowerCase()}
                </p>
              </div>

              <RowActions
                onMoveUp={
                  moduleIndex > 0
                    ? () => move('module', modules, moduleIndex, -1, courseId)
                    : undefined
                }
                onMoveDown={
                  moduleIndex < modules.length - 1
                    ? () => move('module', modules, moduleIndex, 1, courseId)
                    : undefined
                }
                onToggle={() =>
                  togglePublish.mutate({
                    kind: 'module',
                    id: module.id,
                    isPublished: !module.isPublished,
                  })
                }
                isPublished={module.isPublished}
                onEdit={() => openEdit('module', module)}
                onDelete={() => setPendingDelete({ kind: 'module', id: module.id })}
              />
            </div>

            <CardContent className="space-y-3 p-4">
              {module.topics.map((topic, topicIndex) => (
                <div key={topic.id} className="rounded-md border border-border/70">
                  <div
                    data-testid="topic-row"
                    className="flex flex-wrap items-center justify-between gap-2 bg-muted/40 px-3 py-2"
                  >
                    <h3 className="text-sm font-medium">{localize(topic.title, locale)}</h3>
                    <RowActions
                      compact
                      onMoveUp={
                        topicIndex > 0
                          ? () => move('topic', module.topics, topicIndex, -1, module.id)
                          : undefined
                      }
                      onMoveDown={
                        topicIndex < module.topics.length - 1
                          ? () => move('topic', module.topics, topicIndex, 1, module.id)
                          : undefined
                      }
                      onEdit={() => openEdit('topic', topic)}
                      onDelete={() => setPendingDelete({ kind: 'topic', id: topic.id })}
                    />
                  </div>

                  <ul className="divide-y divide-border/60">
                    {topic.lessons.map((lesson, lessonIndex) => (
                      <li
                        key={lesson.id}
                        data-testid="lesson-row"
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <FileText
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/courses/${courseId}/lessons/${lesson.id}/edit` as '/courses'}
                            className="truncate text-sm hover:underline"
                          >
                            {localize(lesson.title, locale)}
                          </Link>
                          <Badge variant="outline">{t('activities.lesson')}</Badge>
                          {!lesson.isPublished ? (
                            <Badge variant="warning">{t('courses.DRAFT')}</Badge>
                          ) : null}
                          {lesson.durationMinutes > 0 ? (
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {lesson.durationMinutes} {t('courses.minutes')}
                            </span>
                          ) : null}
                        </div>

                        <RowActions
                          compact
                          onMoveUp={
                            lessonIndex > 0
                              ? () => move('lesson', topic.lessons, lessonIndex, -1, topic.id)
                              : undefined
                          }
                          onMoveDown={
                            lessonIndex < topic.lessons.length - 1
                              ? () => move('lesson', topic.lessons, lessonIndex, 1, topic.id)
                              : undefined
                          }
                          onToggle={() =>
                            togglePublish.mutate({
                              kind: 'lesson',
                              id: lesson.id,
                              isPublished: !lesson.isPublished,
                            })
                          }
                          isPublished={lesson.isPublished}
                          onEdit={() => openEdit('lesson', lesson)}
                          onDelete={() => setPendingDelete({ kind: 'lesson', id: lesson.id })}
                        />

                        {lesson.resources.length > 0 ? (
                          <ul className="ml-6 w-full space-y-0.5 border-l border-border pl-3">
                            {lesson.resources.map((resource) => (
                              <li
                                key={resource.id}
                                data-testid="resource-row"
                                className="flex items-center justify-between gap-2 py-1 text-sm text-muted-foreground"
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <Paperclip className="size-3.5 shrink-0" aria-hidden="true" />
                                  <span className="truncate">
                                    {localize(resource.title, locale)}
                                  </span>
                                  <Badge variant="outline">{t('activities.resource')}</Badge>
                                </div>
                                {/* Resurs tartibi dars sahifasida boshqariladi —
                                    bu yerda faqat tahrirlash va o'chirish */}
                                <div className="flex shrink-0 items-center gap-0.5">
                                  <IconButton
                                    label={t('common.edit')}
                                    onClick={() => setEditingResource(resource)}
                                  >
                                    <Pencil className="size-3.5" aria-hidden="true" />
                                  </IconButton>
                                  <IconButton
                                    label={t('common.delete')}
                                    destructive
                                    onClick={() => setPendingResourceDelete(resource.id)}
                                  >
                                    <Trash2 className="size-3.5" aria-hidden="true" />
                                  </IconButton>
                                </div>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}

                    {/* Topshiriq va testlar ham shu mavzuda ko'rinadi (Moodle uslubi).
                        Ular alohida sahifalarda sozlanadi, shuning uchun tartiblash
                        va nashr tugmalari o'rniga to'g'ridan-to'g'ri havola. */}
                    {topic.assignments.map((assignment) => (
                      <li
                        key={assignment.id}
                        data-testid="assignment-row"
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ClipboardList
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/assignments/${assignment.id}/settings` as '/assignments'}
                            className="truncate text-sm hover:underline"
                          >
                            {localize(assignment.title, locale)}
                          </Link>
                          <Badge variant="outline">{t('activities.assignment')}</Badge>
                          {!assignment.isPublished ? (
                            <Badge variant="warning">{t('courses.DRAFT')}</Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}

                    {topic.quizzes.map((quiz) => (
                      <li
                        key={quiz.id}
                        data-testid="quiz-row"
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <ListChecks
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-hidden="true"
                          />
                          <Link
                            href={`/quizzes/${quiz.id}/questions` as '/quizzes'}
                            className="truncate text-sm hover:underline"
                          >
                            {localize(quiz.title, locale)}
                          </Link>
                          <Badge variant="outline">{t('activities.quiz')}</Badge>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {quiz._count.questions} {t('quizzes.question').toLowerCase()}
                          </span>
                          {!quiz.isPublished ? (
                            <Badge variant="warning">{t('courses.DRAFT')}</Badge>
                          ) : null}
                        </div>
                      </li>
                    ))}

                    {topic.forumThreads.map((forum) => (
                      <li
                        key={forum.id}
                        data-testid="forum-row"
                        className="flex flex-wrap items-center gap-2 px-3 py-2"
                      >
                        <MessageSquare
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Link
                          href={`/courses/${courseId}/forum/${forum.id}` as '/courses'}
                          className="truncate text-sm hover:underline"
                        >
                          {forum.title}
                        </Link>
                        <Badge variant="outline">{t('activities.forum')}</Badge>
                      </li>
                    ))}

                    {topic.meetings.map((meeting) => (
                      <li
                        key={meeting.id}
                        data-testid="meeting-row"
                        className="flex flex-wrap items-center gap-2 px-3 py-2"
                      >
                        <Video
                          className="size-4 shrink-0 text-muted-foreground"
                          aria-hidden="true"
                        />
                        <Link href="/classroom" className="truncate text-sm hover:underline">
                          {meeting.title}
                        </Link>
                        <Badge variant="outline">{t('activities.meeting')}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {meeting.durationMinutes} {t('courses.minutes')}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="flex flex-wrap gap-1 px-3 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openCreate('lesson', topic.id)}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t('courses.addLesson')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setChooserTopicId(topic.id)}>
                      <LayoutGrid className="size-4" aria-hidden="true" />
                      {t('activities.addActivity')}
                    </Button>
                  </div>
                </div>
              ))}

              <Button size="sm" variant="outline" onClick={() => openCreate('topic', module.id)}>
                <ListPlus className="size-4" aria-hidden="true" />
                {t('courses.addTopic')}
              </Button>
            </CardContent>
          </Card>
        ))
      )}

      {modules.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => openCreate('module')}>
            <FolderPlus className="size-4" aria-hidden="true" />
            {t('courses.addModule')}
          </Button>
          <Button variant="ghost" onClick={() => setImporting(true)}>
            <PackageOpen className="size-4" aria-hidden="true" />
            {t('courses.importCartridge')}
          </Button>
          <Button
            variant="ghost"
            loading={exportCartridge.isPending}
            onClick={() => exportCartridge.mutate()}
          >
            <Download className="size-4" aria-hidden="true" />
            {t('courses.exportCartridge')}
          </Button>
        </div>
      ) : null}

      {importing ? (
        <CartridgeImportDialog
          courseId={courseId}
          onClose={() => setImporting(false)}
          onImported={() => void invalidate()}
        />
      ) : null}

      {/* --- Yaratish / tahrirlash oynasi --- */}
      <Dialog open={editor !== null} onOpenChange={(open) => !open && setEditor(null)}>
        {editor ? (
          <DialogContent closeLabel={t('common.close')}>
            <DialogHeader>
              <DialogTitle>
                {editor.id ? t('common.edit') : t('common.add')} ·{' '}
                {t(`courses.entity_${editor.kind}`)}
              </DialogTitle>
              <DialogDescription>{t('courses.localizedHint')}</DialogDescription>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <LocalizedField
                idPrefix="builder-title"
                label={t('common.title')}
                value={editor.title}
                required
                moreLabel={t('common.otherLanguages')}
                onChange={(title) => setEditor({ ...editor, title })}
              />

              {editor.kind === 'lesson' ? (
                <div className="space-y-1.5">
                  <label htmlFor="lesson-duration" className="text-sm font-medium">
                    {t('courses.durationMinutes')}
                  </label>
                  <Input
                    id="lesson-duration"
                    type="number"
                    min={0}
                    max={600}
                    value={editor.durationMinutes}
                    onChange={(event) =>
                      setEditor({ ...editor, durationMinutes: Number(event.target.value) })
                    }
                  />
                </div>
              ) : null}

              {editor.kind !== 'topic' ? (
                <SwitchField
                  id="builder-published"
                  label={t('courses.published')}
                  description={t('courses.publishedHint')}
                  checked={editor.isPublished}
                  onCheckedChange={(isPublished) => setEditor({ ...editor, isPublished })}
                />
              ) : null}
            </DialogBody>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setEditor(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                loading={save.isPending}
                disabled={!editor.title['uz-Latn']?.trim()}
                onClick={() => save.mutate(editor)}
              >
                {t('common.save')}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* --- Element tanlash (Moodle: activity chooser) --- */}
      <ActivityChooser
        open={chooserTopicId !== null}
        onOpenChange={(open) => !open && setChooserTopicId(null)}
        scope="topic"
        onSelect={(action) => {
          const topicId = chooserTopicId;
          if (!topicId) return;

          // Oddiy dars uchun alohida forma shart emas — mavjud oynani ochamiz
          if (action.type === 'lesson') {
            openCreate('lesson', topicId);
            return;
          }
          setPendingAction({ action, topicId });
        }}
      />

      {pendingAction ? (
        <ActivityForm
          action={pendingAction.action}
          courseId={courseId}
          topicId={pendingAction.topicId}
          lessonId={firstLessonOf(modules, pendingAction.topicId)}
          onClose={() => setPendingAction(null)}
          onCreated={() => void invalidate()}
        />
      ) : null}

      {editingResource ? (
        <ResourceEditDialog
          resource={editingResource}
          courseId={courseId}
          onClose={() => setEditingResource(null)}
          onSaved={() => invalidate()}
        />
      ) : null}

      <Dialog
        open={pendingResourceDelete !== null}
        onOpenChange={(open) => !open && setPendingResourceDelete(null)}
      >
        {pendingResourceDelete ? (
          <DialogContent size="sm" closeLabel={t('common.close')}>
            <DialogHeader>
              <DialogTitle>{t('courses.deleteTitle')}</DialogTitle>
              <DialogDescription>{t('courses.deleteWarning_resource')}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setPendingResourceDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                loading={removeResource.isPending}
                onClick={() => removeResource.mutate(pendingResourceDelete)}
              >
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>

      {/* --- O'chirishni tasdiqlash --- */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        {pendingDelete ? (
          <DialogContent size="sm" closeLabel={t('common.close')}>
            <DialogHeader>
              <DialogTitle>{t('courses.deleteTitle')}</DialogTitle>
              <DialogDescription>
                {t(`courses.deleteWarning_${pendingDelete.kind}`)}
              </DialogDescription>
            </DialogHeader>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                loading={remove.isPending}
                onClick={() => remove.mutate(pendingDelete)}
              >
                {t('common.delete')}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </div>
  );
}

/**
 * Resurs DARSGA biriktiriladi, mavzuga emas. Mavzu darajasida resurs
 * tanlanganda uni mavzudagi birinchi darsga qo'shamiz; dars bo'lmasa
 * forma resurs turini qabul qilmaydi va o'qituvchi avval dars yaratadi.
 */
function firstLessonOf(modules: BuilderModule[], topicId: string): string | undefined {
  for (const module of modules) {
    const topic = module.topics.find((item) => item.id === topicId);
    if (topic) return topic.lessons[0]?.id;
  }
  return undefined;
}

/** Element yonidagi amallar to'plami — barchasi klaviatura bilan ishlaydi. */
function RowActions({
  compact = false,
  onMoveUp,
  onMoveDown,
  onToggle,
  isPublished,
  onEdit,
  onDelete,
}: {
  compact?: boolean;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onToggle?: () => void;
  isPublished?: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const size = compact ? 'size-3.5' : 'size-4';

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <IconButton label={t('common.moveUp')} onClick={onMoveUp} disabled={!onMoveUp}>
        <ChevronUp className={size} aria-hidden="true" />
      </IconButton>
      <IconButton label={t('common.moveDown')} onClick={onMoveDown} disabled={!onMoveDown}>
        <ChevronDown className={size} aria-hidden="true" />
      </IconButton>

      {onToggle ? (
        <IconButton
          label={isPublished ? t('courses.unpublish') : t('courses.publish')}
          onClick={onToggle}
        >
          {isPublished ? (
            <Eye className={cn(size, 'text-success')} aria-hidden="true" />
          ) : (
            <EyeOff className={size} aria-hidden="true" />
          )}
        </IconButton>
      ) : null}

      <IconButton label={t('common.edit')} onClick={onEdit}>
        <Pencil className={size} aria-hidden="true" />
      </IconButton>
      <IconButton label={t('common.delete')} onClick={onDelete} destructive>
        <Trash2 className={size} aria-hidden="true" />
      </IconButton>
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  destructive,
  children,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={cn(
        'rounded-md p-1.5 text-muted-foreground transition-colors',
        'hover:bg-accent hover:text-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        'disabled:pointer-events-none disabled:opacity-30',
        destructive && 'hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      {children}
    </button>
  );
}
