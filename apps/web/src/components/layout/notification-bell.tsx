/**
 * Maqsad: bildirishnomalar qo'ng'irog'i — SSE orqali real vaqtda yangilanadi (ADR-010).
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { api, API_URL, getAccessToken } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { Badge, Button } from '@/components/ui/primitives';
import { Link } from '@/i18n/routing';

interface NotificationItem {
  id: string;
  templateKey: string;
  params: Record<string, unknown>;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
}

export function NotificationBell() {
  const t = useTranslations();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const user = useAuthStore((state) => state.user);

  const { data: unread } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: async () => (await api.get<{ total: number }>('/notifications/unread-count')).data,
    enabled: Boolean(user),
    refetchInterval: 120_000,
  });

  const { data: notifications } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: async () =>
      (await api.get<NotificationItem[]>('/notifications?unreadOnly=false')).data,
    enabled: Boolean(user) && open,
  });

  /**
   * SSE oqimi: server hodisa yuborganda ro'yxat darhol yangilanadi.
   * `EventSource` sarlavha qo'shishni qo'llab-quvvatlamagani uchun token
   * so'rov parametrida uzatiladi (bu endpoint faqat o'qish uchun).
   */
  useEffect(() => {
    if (!user) return;
    const token = getAccessToken();
    if (!token) return;

    const source = new EventSource(`${API_URL}/stream?access_token=${encodeURIComponent(token)}`);

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as { type: string };
        void queryClient.invalidateQueries({ queryKey: ['notifications'] });

        if (payload.type === 'notification.created') {
          toast(t('nav.notifications'));
        }
      } catch {
        // Buzuq hodisa oqimni to'xtatmasligi kerak
      }
    };

    source.onerror = () => {
      // Brauzer avtomatik qayta ulanadi; qo'shimcha ish talab qilinmaydi
      source.close();
    };

    return () => source.close();
  }, [user, queryClient, t]);

  const count = unread?.total ?? 0;

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setOpen((value) => !value)}
        aria-label={t('a11y.notificationsCount', { count })}
        aria-expanded={open}
      >
        <Bell />
        {count > 0 ? (
          <span className="absolute right-1 top-1 flex size-4 items-center justify-center rounded-full bg-destructive text-[10px] font-medium text-destructive-foreground">
            {count > 9 ? '9+' : count}
          </span>
        ) : null}
      </Button>

      {open ? (
        <div className="absolute right-0 top-11 z-30 w-80 overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <p className="text-sm font-medium">{t('nav.notifications')}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await api.patch('/notifications/read', { ids: [] });
                void queryClient.invalidateQueries({ queryKey: ['notifications'] });
              }}
            >
              {t('messaging.markAllRead')}
            </Button>
          </div>

          <ul className="max-h-80 overflow-y-auto">
            {(notifications ?? []).length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-muted-foreground">
                {t('messaging.emptyDescription')}
              </li>
            ) : (
              (notifications ?? []).map((item) => (
                <li key={item.id} className="border-b border-border last:border-0">
                  <Link
                    href={(item.linkUrl ?? '/dashboard') as '/dashboard'}
                    className="block px-3 py-2 hover:bg-accent"
                    onClick={() => setOpen(false)}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm">{translateTemplate(t, item.templateKey)}</p>
                      {!item.readAt ? <Badge variant="default">•</Badge> : null}
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Bildirishnoma kalitini matnga aylantiradi.
 * Backend faqat kalit yuboradi (P7), matn shu yerda hosil bo'ladi.
 */
function translateTemplate(t: ReturnType<typeof useTranslations>, templateKey: string): string {
  const map: Record<string, string> = {
    'notification.announcement': 'nav.announcements',
    'notification.forum_reply': 'messaging.postReply',
    'notification.new_message': 'messaging.compose',
    'notification.report_ready': 'analytics.exportReport',
    'notification.syllabus_approve': 'curriculum.approve',
    'notification.syllabus_reject': 'curriculum.reject',
  };

  const key = map[templateKey];
  return key ? t(key) : templateKey;
}
