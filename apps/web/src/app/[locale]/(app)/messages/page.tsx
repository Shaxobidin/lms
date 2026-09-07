/**
 * Maqsad: xabarlar va e'lonlar (F-10).
 */

'use client';

import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Inbox, Megaphone, PenLine, Reply, Send } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
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
import { Select } from '@/components/ui/form-controls';

interface MessageRow {
  id: string;
  subject: string | null;
  body: string;
  readAt: string | null;
  createdAt: string;
  sender: { id: string; profile: { firstName: string; lastName: string } | null };
  recipient: { id: string; profile: { firstName: string; lastName: string } | null };
}

interface Contact {
  id: string;
  firstName: string;
  lastName: string;
  roles: string[];
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
  const can = useAuthStore((state) => state.can);
  const [box, setBox] = useState<'inbox' | 'sent'>('inbox');
  /** `null` — oyna yopiq; obyekt — javob rejimi (qabul qiluvchi oldindan tanlangan). */
  const [composing, setComposing] = useState<{ to?: Contact; replyToId?: string } | null>(null);

  const canSend = can('message:create:own');

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
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.messages')}</h1>

        {canSend ? (
          <Button onClick={() => setComposing({})}>
            <PenLine className="size-4" />
            {t('messaging.compose')}
          </Button>
        ) : null}
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

                    <div className="flex items-center gap-1">
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

                      {canSend && box === 'inbox' ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setComposing({
                              to: {
                                id: message.sender.id,
                                firstName: message.sender.profile?.firstName ?? '',
                                lastName: message.sender.profile?.lastName ?? '',
                                roles: [],
                              },
                              replyToId: message.id,
                            })
                          }
                        >
                          <Reply className="size-3.5" />
                          {t('messaging.reply')}
                        </Button>
                      ) : null}
                    </div>
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

      {composing ? (
        <ComposeDialog
          initial={composing}
          onClose={() => setComposing(null)}
          onSent={() => {
            void queryClient.invalidateQueries({ queryKey: ['messages'] });
            setBox('sent');
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Xabar yozish oynasi.
 *
 * Qabul qiluvchilar ro'yxati SERVERDA cheklangan: faqat umumiy kursi bor
 * kishilar qaytariladi. Global foydalanuvchilar ro'yxati ochilmaydi (§11).
 * Javob rejimida qabul qiluvchi tayyor keladi va o'zgartirilmaydi.
 */
function ComposeDialog({
  initial,
  onClose,
  onSent,
}: {
  initial: { to?: Contact; replyToId?: string };
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useTranslations();
  const [recipientId, setRecipientId] = useState(initial.to?.id ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const isReply = Boolean(initial.replyToId);

  const contacts = useQuery({
    queryKey: ['message-contacts'],
    queryFn: async () => (await api.get<Contact[]>('/messages/contacts')).data,
    enabled: !isReply,
  });

  const send = useMutation({
    mutationFn: async () =>
      api.post('/messages', {
        recipientId,
        ...(subject.trim() ? { subject } : {}),
        // Matn serverda sanitizatsiya qilinadi; bu yerda faqat teglar ekranlanadi
        body: `<p>${body.trim().replace(/</g, '&lt;')}</p>`,
        ...(initial.replyToId ? { replyToId: initial.replyToId } : {}),
      }),
    onSuccess: () => {
      toast.success(t('messaging.messageSent'));
      onSent();
      onClose();
    },
    onError: (error) => {
      toast.error(error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'));
    },
  });

  const canSubmit = recipientId !== '' && body.trim().length > 0;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{isReply ? t('messaging.reply') : t('messaging.compose')}</DialogTitle>
          <DialogDescription>{t('messaging.composeHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="message-recipient" required>
              {t('messaging.recipient')}
            </Label>

            {isReply && initial.to ? (
              <Input
                id="message-recipient"
                readOnly
                value={[initial.to.lastName, initial.to.firstName].filter(Boolean).join(' ')}
              />
            ) : (
              <>
                <Select
                  id="message-recipient"
                  value={recipientId}
                  disabled={contacts.isLoading}
                  onChange={(event) => setRecipientId(event.target.value)}
                >
                  <option value="">{t('common.none')}</option>
                  {contacts.data?.map((contact) => (
                    <option key={contact.id} value={contact.id}>
                      {[contact.lastName, contact.firstName].filter(Boolean).join(' ')}
                    </option>
                  ))}
                </Select>
                {!contacts.isLoading && (contacts.data ?? []).length === 0 ? (
                  <p className="text-xs text-muted-foreground">{t('messaging.noContacts')}</p>
                ) : null}
              </>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message-subject">{t('messaging.subject')}</Label>
            <Input
              id="message-subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="message-body" required>
              {t('messaging.messageBody')}
            </Label>
            <Textarea
              id="message-body"
              rows={5}
              value={body}
              onChange={(event) => setBody(event.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={send.isPending} disabled={!canSubmit} onClick={() => send.mutate()}>
            {t('messaging.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
