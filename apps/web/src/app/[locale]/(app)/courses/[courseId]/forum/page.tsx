/**
 * Maqsad: kurs forumi — mavzular ro'yxati (F-10).
 *
 * Mavzular qadalganlar (pinned) yuqorida, so'ng oxirgi javob vaqti bo'yicha
 * tartiblanadi — serverdagi tartib shunday, mijoz uni o'zgartirmaydi.
 */

'use client';

import { use, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { MessageSquare, Pin, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDateTime } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SwitchField } from '@/components/ui/form-controls';

interface ThreadRow {
  id: string;
  title: string;
  isQuestion: boolean;
  isPinned: boolean;
  isLocked: boolean;
  postCount: number;
  viewCount: number;
  lastPostAt: string;
  createdAt: string;
  author: { id: string; profile: { firstName: string; lastName: string } | null };
}

export default function CourseForumPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const canPost = can('forum:create:own') || can('forum:manage:own_course');
  const [creating, setCreating] = useState(false);

  const threads = useQuery({
    queryKey: ['forum', courseId],
    queryFn: async () => (await api.get<ThreadRow[]>(`/courses/${courseId}/forum`)).data,
  });

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href={`/courses/${courseId}`}>{t('courses.backToCourse')}</Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('messaging.forum')}</h1>
            <p className="text-sm text-muted-foreground">
              {threads.data?.length ?? 0} {t('messaging.threads').toLowerCase()}
            </p>
          </div>

          {canPost ? (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" />
              {t('messaging.newThread')}
            </Button>
          ) : null}
        </div>
      </header>

      {threads.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : threads.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void threads.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (threads.data ?? []).length === 0 ? (
        <EmptyState
          icon={<MessageSquare className="size-8" />}
          title={t('messaging.noThreadsTitle')}
          description={t('messaging.noThreadsDescription')}
          action={
            canPost ? (
              <Button onClick={() => setCreating(true)}>{t('messaging.newThread')}</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {threads.data?.map((thread) => (
            <li key={thread.id}>
              <Card className="transition-colors hover:border-primary/40">
                <Link href={`/courses/${courseId}/forum/${thread.id}`}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <h2 className="flex items-center gap-2 font-medium">
                        {thread.isPinned ? (
                          <Pin
                            className="size-4 shrink-0 text-primary"
                            aria-label={t('messaging.pinned')}
                          />
                        ) : null}
                        {thread.title}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {thread.author.profile
                          ? [thread.author.profile.lastName, thread.author.profile.firstName]
                              .filter(Boolean)
                              .join(' ')
                          : t('common.none')}{' '}
                        · {formatDateTime(thread.lastPostAt, locale)}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                      {thread.isQuestion ? (
                        <Badge variant="outline">{t('messaging.question')}</Badge>
                      ) : null}
                      {thread.isLocked ? (
                        <Badge variant="muted">{t('messaging.locked')}</Badge>
                      ) : null}
                      <Badge variant="muted">
                        {thread.postCount} {t('messaging.posts').toLowerCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {creating ? (
        <NewThreadDialog
          courseId={courseId}
          onClose={() => setCreating(false)}
          onCreated={() => void threads.refetch()}
        />
      ) : null}
    </div>
  );
}

/** Yangi mavzu: sarlavha, matn va savol-javob rejimi. */
function NewThreadDialog({
  courseId,
  onClose,
  onCreated,
}: {
  courseId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const t = useTranslations();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [isQuestion, setIsQuestion] = useState(false);

  const create = useMutation({
    mutationFn: async () => api.post('/forum/threads', { courseId, title, body, isQuestion }),
    onSuccess: () => {
      toast.success(t('messaging.threadCreated'));
      onCreated();
      onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const canSubmit = title.trim().length >= 3 && body.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('messaging.newThread')}</DialogTitle>
          <DialogDescription>{t('messaging.newThreadHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="thread-title" required>
              {t('common.title')}
            </Label>
            <Input
              id="thread-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="thread-body" required>
              {t('messaging.messageBody')}
            </Label>
            <Textarea
              id="thread-body"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>

          <SwitchField
            id="thread-question"
            label={t('messaging.questionMode')}
            description={t('messaging.questionModeHint')}
            checked={isQuestion}
            onCheckedChange={setIsQuestion}
          />
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={create.isPending} disabled={!canSubmit} onClick={() => create.mutate()}>
            {t('common.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
