/**
 * Maqsad: kursga LTI 1.3 orqali bog'langan tashqi platformalar paneli (§10).
 *
 * Faqat kursga kamida bitta resurs havolasi (launch) bog'langanda ko'rinadi:
 * platforma nomi, AGS (baho qaytarish) va NRPS (a'zolar) imkoniyatlari,
 * "Baholarni yuborish" va "A'zolarni sinxronlash" tugmalari.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plug, Send, Users } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/primitives';

interface ResourceLink {
  id: string;
  resourceLinkId: string;
  title: string | null;
  contextTitle: string | null;
  lineItemUrl: string | null;
  lineItemsUrl: string | null;
  lineItems: Array<{
    id: string;
    label: string;
    quizId: string | null;
    assignmentId: string | null;
    scoreMaximum: string | number;
  }>;
  membershipsUrl: string | null;
  scopes: string[];
  platform: { id: string; name: string };
}

interface Member {
  subject: string;
  name: string;
  email: string | null;
  isInstructor: boolean;
  userId: string | null;
  enrolled: boolean;
}

export function LtiCoursePanel({ courseId }: { courseId: string }) {
  const t = useTranslations();
  const [members, setMembers] = useState<Member[] | null>(null);

  const links = useQuery({
    queryKey: ['lti-links', courseId],
    queryFn: async () => (await api.get<ResourceLink[]>(`/lti/courses/${courseId}/links`)).data,
  });

  const describe = (error: unknown) => {
    if (error instanceof ApiClientError) {
      const key = error.messageKey.replace(/^errors\./, '');
      return t.has(`errors.${key}`) ? t(`errors.${key}`) : t('common.somethingWentWrong');
    }
    return t('common.somethingWentWrong');
  };

  const push = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ users: number; pushed: number; skipped: string[] }>(
          `/lti/courses/${courseId}/grades/push`,
          {},
        )
      ).data,
    onSuccess: (result) =>
      toast.success(t('lti.gradesPushed', { pushed: result.pushed, users: result.users })),
    onError: (error) => toast.error(describe(error)),
  });

  const fetchMembers = useMutation({
    mutationFn: async () =>
      (await api.get<{ platform: string; members: Member[] }>(`/lti/courses/${courseId}/members`))
        .data,
    onSuccess: (result) => setMembers(result.members),
    onError: (error) => toast.error(describe(error)),
  });

  const sync = useMutation({
    mutationFn: async () =>
      (
        await api.post<{ members: number; created: number; enrolled: number }>(
          `/lti/courses/${courseId}/members/sync`,
          {},
        )
      ).data,
    onSuccess: (result) => {
      toast.success(t('lti.membersSynced', { enrolled: result.enrolled, created: result.created }));
      fetchMembers.mutate();
    },
    onError: (error) => toast.error(describe(error)),
  });

  if (!links.data || links.data.length === 0) return null;

  const hasAgs = links.data.some((link) => link.lineItemUrl || link.lineItemsUrl);
  const hasNrps = links.data.some((link) => link.membershipsUrl);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Plug className="size-4 text-primary" aria-hidden="true" />
          {t('lti.coursePanelTitle')}
        </CardTitle>
        <CardDescription>{t('lti.coursePanelHint')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="space-y-1 text-sm">
          {links.data.map((link) => (
            <li key={link.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{link.platform.name}</span>
              <span className="text-muted-foreground">
                {link.contextTitle ?? link.title ?? link.resourceLinkId}
              </span>
              {link.lineItemUrl || link.lineItemsUrl ? <Badge variant="outline">AGS</Badge> : null}
              {link.membershipsUrl ? <Badge variant="outline">NRPS</Badge> : null}
              {link.lineItems.length > 0 ? (
                <span
                  className="text-xs text-muted-foreground"
                  title={link.lineItems.map((item) => item.label).join(', ')}
                >
                  {t('lti.lineItems', { count: link.lineItems.length })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        {hasAgs ? <p className="text-xs text-muted-foreground">{t('lti.lineItemsHint')}</p> : null}

        <div className="flex flex-wrap gap-2">
          {hasAgs ? (
            <Button
              size="sm"
              variant="outline"
              loading={push.isPending}
              onClick={() => push.mutate()}
            >
              <Send className="size-4" aria-hidden="true" />
              {t('lti.pushGrades')}
            </Button>
          ) : null}
          {hasNrps ? (
            <>
              <Button
                size="sm"
                variant="outline"
                loading={fetchMembers.isPending}
                onClick={() => fetchMembers.mutate()}
              >
                <Users className="size-4" aria-hidden="true" />
                {t('lti.fetchMembers')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={sync.isPending}
                onClick={() => sync.mutate()}
              >
                {t('lti.syncMembers')}
              </Button>
            </>
          ) : null}
        </div>

        {members ? (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
            {members.length === 0 ? (
              <li className="text-muted-foreground">{t('lti.noMembers')}</li>
            ) : null}
            {members.map((member) => (
              <li key={member.subject} className="flex flex-wrap items-center gap-2">
                <span>{member.name}</span>
                {member.email ? (
                  <span className="text-muted-foreground">{member.email}</span>
                ) : null}
                <Badge variant={member.isInstructor ? 'secondary' : 'muted'}>
                  {member.isInstructor ? t('roles.TEACHER') : t('roles.STUDENT')}
                </Badge>
                {member.enrolled ? (
                  <Badge variant="success">{t('courses.enrolled')}</Badge>
                ) : member.userId ? (
                  <Badge variant="outline">{t('lti.linkedNotEnrolled')}</Badge>
                ) : (
                  <Badge variant="warning">{t('lti.notLinked')}</Badge>
                )}
              </li>
            ))}
          </ul>
        ) : null}
      </CardContent>
    </Card>
  );
}
