/**
 * Maqsad: xabarlar va e'lonlar (F-10).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Megaphone, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { cn, formatDateTime, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@/components/ui/primitives';

interface MessageRow {
  id: string;
  subject: string | null;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender: { id: string; profile: { firstName: string; lastName: string } | null };
  recipient: { id: string; profile: { firstName: string; lastName: string } | null };
}

interface AnnouncementRow {
  id: string;
  title: unknown;
  body: unknown;
  isPinned: boolean;
  publishAt: string;
  course: { id: string; code: string; title: unknown } | null;
  author: { id: string; profile: { firstName: string; lastName: string } | null };
}

export default function MessagesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const queryClient = useQueryClient();
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');

  const messages = useQuery({
    queryKey: ['messages', box],
    queryFn: async () => (await api.get<MessageRow[]>(`/messages?box=${box}`)).data,
  });

  const announcements = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get<AnnouncementRow[]>('/announcements')).data,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => api.patch(`/messages/${id}/read`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['messages'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.messages')}</h1>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone className="size-4" aria-hidden="true" />
            {t('nav.announcements')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {announcements.isLoading ? (
            <Skeleton className="h-24" />
          ) : (announcements.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('messaging.emptyDescription')}
            </p>
          ) : (
            announcements.data?.map((item) => (
              <article
                key={item.id}
                className={cn(
                  'rounded-md border p-3',
                  item.isPinned ? 'border-primary/40 bg-primary/5' : 'border-border',
                )}
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <h3 className="font-medium">{localize(item.title, locale)}</h3>
                  {item.isPinned ? <Badge variant="default">{t('messaging.pinned')}</Badge> : null}
                  {item.course ? <Badge variant="outline">{item.course.code}</Badge> : null}
                </div>

                <div
                  className="prose-lms text-sm"
                  dangerouslySetInnerHTML={{ __html: localize(item.body, locale, '') }}
                />

                <p className="mt-1.5 text-xs text-muted-foreground">
                  {formatDateTime(item.publishAt, locale)}
                </p>
              </article>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="flex items-center gap-2">
            <Inbox className="size-4" aria-hidden="true" />
            {t('nav.messages')}
          </CardTitle>

          <div className="flex gap-1" role="tablist">
            <Button
              size="sm"
              role="tab"
              aria-selected={box === 'inbox'}
              variant={box === 'inbox' ? 'default' : 'ghost'}
              onClick={() => setBox('inbox')}
            >
              {t('messaging.inbox')}
            </Button>
            <Button
              size="sm"
              role="tab"
              aria-selected={box === 'sent'}
              variant={box === 'sent' ? 'default' : 'ghost'}
              onClick={() => setBox('sent')}
            >
              <Send className="size-3.5" aria-hidden="true" />
              {t('messaging.sent')}
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-2">
          {messages.isLoading ? (
            <Skeleton className="h-32" />
          ) : (messages.data ?? []).length === 0 ? (
            <EmptyState
              icon={<Inbox className="size-8" />}
              title={t('messaging.emptyTitle')}
              description={t('messaging.emptyDescription')}
            />
          ) : (
            messages.data?.map((message) => {
              const counterpart = box === 'inbox' ? message.sender : message.recipient;
              const name =
                [counterpart.profile?.lastName, counterpart.profile?.firstName]
                  .filter(Boolean)
                  .join(' ') || '—';

              return (
                <article
                  key={message.id}
                  className={cn(
                    'rounded-md border p-3',
                    !message.readAt && box === 'inbox'
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border',
                  )}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{message.subject ?? name}</p>
                      <p className="text-xs text-muted-foreground">
                        {name} · {formatDateTime(message.createdAt, locale)}
                      </p>
                    </div>

                    {!message.readAt && box === 'inbox' ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markRead.mutate(message.id)}
                        loading={markRead.isPending}
                      >
                        {t('messaging.markAsRead')}
                      </Button>
                    ) : null}
                  </div>

                  <div
                    className="prose-lms mt-2 text-sm"
                    dangerouslySetInnerHTML={{ __html: message.body }}
                  />
                </article>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
