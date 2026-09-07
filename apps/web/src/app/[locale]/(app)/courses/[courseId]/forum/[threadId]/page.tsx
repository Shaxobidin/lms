/**
 * Maqsad: forum mavzusi — ichma-ich javoblar, javob yozish, eng yaxshi javobni
 * belgilash va moderatsiya (F-10).
 *
 * Server postlarni TEKIS ro'yxatda `parentId` bilan qaytaradi (rekursiv SQL dan
 * tezroq) — daraxt shu yerda quriladi. Chuqurlik serverda cheklangan, shuning
 * uchun chekinish (indent) ham cheklangan: mobil ekranda matn qisilib qolmaydi.
 */

'use client';

import { use, useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CheckCircle2, Lock, Pin, Reply } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { cn, formatDateTime, initials } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  ErrorState,
  Skeleton,
  Textarea,
} from '@/components/ui/primitives';

interface ForumPost {
  id: string;
  parentId: string | null;
  contentHtml: string;
  depth: number;
  isAnswer: boolean;
  likeCount: number;
  createdAt: string;
  author: {
    id: string;
    profile: { firstName: string; lastName: string; avatarFileId: string | null } | null;
  };
}

interface ThreadDetail {
  id: string;
  title: string;
  courseId: string;
  isQuestion: boolean;
  isLocked: boolean;
  createdAt: string;
  author: { id: string; profile: { firstName: string; lastName: string } | null };
  posts: ForumPost[];
}

/** Tekis ro'yxatdan daraxt quradi; tartib serverdan kelgan (createdAt asc) saqlanadi. */
function buildTree(posts: ForumPost[]): Array<{ post: ForumPost; level: number }> {
  const children = new Map<string | null, ForumPost[]>();
  for (const post of posts) {
    const list = children.get(post.parentId) ?? [];
    list.push(post);
    children.set(post.parentId, list);
  }

  const result: Array<{ post: ForumPost; level: number }> = [];
  const walk = (parentId: string | null, level: number) => {
    for (const post of children.get(parentId) ?? []) {
      result.push({ post, level });
      walk(post.id, level + 1);
    }
  };
  walk(null, 0);
  return result;
}

function authorName(
  profile: { firstName: string; lastName: string } | null,
  fallback: string,
): string {
  if (!profile) return fallback;
  return [profile.lastName, profile.firstName].filter(Boolean).join(' ') || fallback;
}

export default function ForumThreadPage({
  params,
}: {
  params: Promise<{ courseId: string; threadId: string }>;
}) {
  const { courseId, threadId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const user = useAuthStore((state) => state.user);

  const canPost = can('forum:create:own') || can('forum:manage:own_course');
  const canModerate = can('forum:manage:own_course');

  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const thread = useQuery({
    queryKey: ['forum-thread', threadId],
    queryFn: async () => (await api.get<ThreadDetail>(`/forum/threads/${threadId}`)).data,
  });

  const tree = useMemo(() => buildTree(thread.data?.posts ?? []), [thread.data]);
  // Mavzuning birinchi posti — uning matni; qolganlari javoblar
  const rootPostId = tree[0]?.post.id ?? null;

  const reset = () => {
    setDraft('');
    setReplyTo(null);
  };

  const post = useMutation({
    mutationFn: async () =>
      api.post('/forum/posts', {
        threadId,
        parentId: replyTo,
        contentHtml: `<p>${draft.trim().replace(/</g, '&lt;')}</p>`,
      }),
    onSuccess: () => {
      toast.success(t('messaging.replySent'));
      reset();
      void thread.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const markAnswer = useMutation({
    mutationFn: async (postId: string) => api.post(`/forum/posts/${postId}/mark-answer`, {}),
    onSuccess: () => {
      toast.success(t('messaging.answerMarked'));
      void thread.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const moderate = useMutation({
    mutationFn: async (patch: { isPinned?: boolean; isLocked?: boolean }) =>
      api.patch(`/forum/threads/${threadId}/moderate`, patch),
    onSuccess: () => {
      toast.success(t('common.saved'));
      void thread.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  if (thread.isError) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => void thread.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const detail = thread.data;
  // Savol muallifi va o'qituvchi eng yaxshi javobni belgilay oladi
  const canMarkAnswer =
    Boolean(detail?.isQuestion) && (canModerate || detail?.author.id === user?.id);

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href={`/courses/${courseId}/forum`}>{t('messaging.forum')}</Link>
        </Button>

        {thread.isLoading || !detail ? (
          <Skeleton className="h-14" />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{detail.title}</h1>
              <p className="text-sm text-muted-foreground">
                {authorName(detail.author.profile, t('common.none'))} ·{' '}
                {formatDateTime(detail.createdAt, locale)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {detail.isQuestion ? (
                <Badge variant="outline">{t('messaging.question')}</Badge>
              ) : null}
              {detail.isLocked ? (
                <Badge variant="muted">
                  <Lock className="me-1 size-3" aria-hidden="true" />
                  {t('messaging.locked')}
                </Badge>
              ) : null}

              {canModerate ? (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={moderate.isPending}
                    onClick={() => moderate.mutate({ isPinned: true })}
                  >
                    <Pin className="size-4" />
                    {t('messaging.pin')}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    loading={moderate.isPending}
                    onClick={() => moderate.mutate({ isLocked: !detail.isLocked })}
                  >
                    {detail.isLocked ? t('messaging.unlock') : t('messaging.lock')}
                  </Button>
                </>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {thread.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
          ))}
        </div>
      ) : (
        <ul className="space-y-2">
          {tree.map(({ post: item, level }) => (
            <li
              key={item.id}
              // Chekinish 4 daraja bilan cheklangan — mobil ekranda matn qisilmasin
              style={{ marginInlineStart: `${Math.min(level, 4) * 1.25}rem` }}
            >
              <Card className={cn(item.isAnswer && 'border-success')}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-medium"
                      >
                        {initials(authorName(item.author.profile, '?'))}
                      </span>
                      <div>
                        <p className="text-sm font-medium">
                          {authorName(item.author.profile, t('common.none'))}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatDateTime(item.createdAt, locale)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {item.isAnswer ? (
                        <Badge variant="success">
                          <CheckCircle2 className="me-1 size-3" aria-hidden="true" />
                          {t('messaging.bestAnswer')}
                        </Badge>
                      ) : null}

                      {canMarkAnswer && !item.isAnswer && item.id !== rootPostId ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={markAnswer.isPending && markAnswer.variables === item.id}
                          onClick={() => markAnswer.mutate(item.id)}
                        >
                          {t('messaging.markAnswer')}
                        </Button>
                      ) : null}

                      {canPost && !detail?.isLocked ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setReplyTo(replyTo === item.id ? null : item.id)}
                        >
                          <Reply className="size-4" />
                          {t('messaging.reply')}
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  {/* Matn serverda sanitizatsiya qilinadi (§11) */}
                  <div
                    className="prose-lms text-sm"
                    dangerouslySetInnerHTML={{ __html: item.contentHtml }}
                  />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {/* --- Javob yozish --- */}
      {canPost && detail && !detail.isLocked ? (
        <Card>
          <CardContent className="space-y-2 p-4">
            <label htmlFor="forum-reply" className="text-sm font-medium">
              {replyTo ? t('messaging.replyToPost') : t('messaging.replyToThread')}
            </label>
            <Textarea
              id="forum-reply"
              rows={3}
              value={draft}
              placeholder={t('messaging.replyPlaceholder')}
              onChange={(event) => setDraft(event.target.value)}
            />
            <div className="flex justify-end gap-2">
              {replyTo ? (
                <Button variant="ghost" size="sm" onClick={reset}>
                  {t('common.cancel')}
                </Button>
              ) : null}
              <Button
                size="sm"
                loading={post.isPending}
                disabled={draft.trim().length === 0}
                onClick={() => post.mutate()}
              >
                {t('messaging.send')}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : detail?.isLocked ? (
        <p className="text-sm text-muted-foreground">{t('messaging.lockedHint')}</p>
      ) : null}
    </div>
  );
}
