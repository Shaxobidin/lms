/**
 * Maqsad: fanning sillabusi — mazmun, versiyalar tarixi va tasdiqlash oqimi (F-03).
 *
 * Oqim: DRAFT → REVIEW → APPROVED | REJECTED → (yangi versiya) DRAFT ...
 * Tugmalar joriy holat va ruxsatga qarab chiqadi; holat mashinasi serverda
 * (`TRANSITIONS`), interfeys faqat mumkin bo'lgan amallarni ko'rsatadi.
 *
 * Vazifalar ajratilishi (§3): metodist (R5) yozadi va tasdiqlashga yuboradi,
 * kafedra mudiri (R4) / dekanat (R3) tasdiqlaydi yoki qaytaradi.
 */

'use client';

import { use, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { FileText, History, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { SyllabusContent } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { SyllabusEditor, type GradingPolicy } from '@/components/curriculum/syllabus-editor';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Label,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

interface SubjectRow {
  id: string;
  code: string;
  name: unknown;
  credits: number;
  departmentId: string;
  department: { id: string; name: unknown };
}

interface SyllabusVersion {
  id: string;
  version: number;
  status: string;
  content: Partial<SyllabusContent>;
  gradingPolicy: GradingPolicy;
  changeNote: string | null;
  rejectReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

interface SyllabusDetail {
  id: string;
  status: string;
  currentVersion: number;
  subject: { id: string; code: string; name: unknown; credits: number };
  department: { id: string; name: unknown };
  versions: SyllabusVersion[];
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'destructive' | 'muted' | 'default'> =
  {
    DRAFT: 'muted',
    REVIEW: 'warning',
    APPROVED: 'success',
    REJECTED: 'destructive',
    ARCHIVED: 'muted',
  };

export default function SyllabusPage({ params }: { params: Promise<{ subjectId: string }> }) {
  const { subjectId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const canAuthor =
    can('syllabus:create:own_faculty') ||
    can('syllabus:update:own_faculty') ||
    can('syllabus:update:own_department');
  const canApprove = can('syllabus:approve:own_department') || can('syllabus:approve:own_faculty');
  // Yuborish — muallif yoki tasdiqlovchi (server ham shu ro'yxatni qabul qiladi)
  const canSubmit = can('syllabus:update:own_faculty') || canApprove;

  const [editing, setEditing] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  // Fan ma'lumoti fanlar ro'yxatidan olinadi — alohida `GET /subjects/:id` yo'q
  const subject = useQuery({
    queryKey: ['subjects', 'one', subjectId],
    queryFn: async () =>
      (await api.get<SubjectRow[]>('/subjects')).data.find((row) => row.id === subjectId) ?? null,
  });

  const syllabus = useQuery({
    queryKey: ['syllabus', subjectId],
    queryFn: async () => (await api.get<SyllabusDetail>(`/syllabi/by-subject/${subjectId}`)).data,
    // 404 — sillabus hali yaratilmagan; bu xato emas, "yaratish" holati
    retry: (count, error) =>
      !(error instanceof ApiClientError && error.status === 404) && count < 2,
  });

  const notFound = syllabus.error instanceof ApiClientError && syllabus.error.status === 404;
  const detail = notFound ? null : syllabus.data;
  const current = detail?.versions.find((row) => row.version === detail.currentVersion) ?? null;

  const transition = useMutation({
    mutationFn: async (input: { action: string; comment?: string }) =>
      api.post(`/syllabi/${detail?.id}/transition`, input),
    onSuccess: () => {
      toast.success(t('common.saved'));
      setRejecting(false);
      void syllabus.refetch();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  if (subject.isError || (syllabus.isError && !notFound)) {
    return (
      <ErrorState
        title={t('common.somethingWentWrong')}
        onRetry={() => {
          void subject.refetch();
          void syllabus.refetch();
        }}
        retryLabel={t('common.retry')}
      />
    );
  }

  const status = detail?.status ?? null;

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/curriculum">{t('curriculum.title')}</Link>
        </Button>

        {subject.isLoading || syllabus.isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">
                {subject.data ? localize(subject.data.name, locale) : t('curriculum.syllabus')}
              </h1>
              <p className="text-sm text-muted-foreground">
                {subject.data?.code}
                {subject.data
                  ? ` · ${subject.data.credits} ${t('courses.credits').toLowerCase()}`
                  : ''}
                {subject.data ? ` · ${localize(subject.data.department.name, locale, '')}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {status ? (
                <Badge variant={STATUS_VARIANT[status] ?? 'muted'}>
                  {t(`curriculum.${status}`)} · v{detail?.currentVersion}
                </Badge>
              ) : null}

              {/* --- Amallar: holat + ruxsat --- */}
              {!detail && canAuthor && subject.data ? (
                <Button onClick={() => setEditing(true)}>
                  <Plus className="size-4" />
                  {t('curriculum.createSyllabus')}
                </Button>
              ) : null}

              {detail && canAuthor && status !== 'REVIEW' ? (
                <Button variant="outline" onClick={() => setEditing(true)}>
                  <Plus className="size-4" />
                  {t('curriculum.newVersion')}
                </Button>
              ) : null}

              {detail && canSubmit && (status === 'DRAFT' || status === 'REJECTED') ? (
                <Button
                  loading={transition.isPending}
                  onClick={() => transition.mutate({ action: 'SUBMIT' })}
                >
                  {t('curriculum.submitForReview')}
                </Button>
              ) : null}

              {detail && canApprove && status === 'REVIEW' ? (
                <>
                  <Button
                    loading={transition.isPending}
                    onClick={() => transition.mutate({ action: 'APPROVE' })}
                  >
                    {t('curriculum.approve')}
                  </Button>
                  <Button variant="destructive" onClick={() => setRejecting(true)}>
                    {t('curriculum.reject')}
                  </Button>
                </>
              ) : null}

              {detail && canApprove && status === 'APPROVED' ? (
                <Button
                  variant="ghost"
                  loading={transition.isPending}
                  onClick={() => transition.mutate({ action: 'ARCHIVE' })}
                >
                  {t('curriculum.archive')}
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {syllabus.isLoading ? (
        <Skeleton className="h-64" />
      ) : !detail ? (
        <EmptyState
          icon={<FileText className="size-8" />}
          title={t('curriculum.noSyllabusTitle')}
          description={t('curriculum.noSyllabusDescription')}
          action={
            canAuthor && subject.data ? (
              <Button onClick={() => setEditing(true)}>{t('curriculum.createSyllabus')}</Button>
            ) : undefined
          }
        />
      ) : current ? (
        <>
          {current.rejectReason && status === 'REJECTED' ? (
            <Card className="border-destructive/40">
              <CardContent className="p-4 text-sm">
                <span className="font-medium text-destructive">
                  {t('curriculum.rejectReason')}:{' '}
                </span>
                {current.rejectReason}
              </CardContent>
            </Card>
          ) : null}

          <div className="grid gap-4 lg:grid-cols-3">
            {/* --- Mazmun --- */}
            <div className="space-y-4 lg:col-span-2">
              <Section title={t('curriculum.goal')}>
                <p className="whitespace-pre-line text-sm">
                  {localize(current.content.goal, locale)}
                </p>
              </Section>

              {(current.content.objectives ?? []).length > 0 ? (
                <Section title={t('curriculum.objectives')}>
                  <ol className="list-decimal space-y-1 ps-5 text-sm">
                    {current.content.objectives?.map((item, index) => (
                      <li key={index}>{localize(item, locale)}</li>
                    ))}
                  </ol>
                </Section>
              ) : null}

              {(current.content.learningOutcomes ?? []).length > 0 ? (
                <Section title={t('curriculum.learningOutcomes')}>
                  <ul className="space-y-1.5 text-sm">
                    {current.content.learningOutcomes?.map((item, index) => (
                      <li key={index} className="flex flex-wrap items-baseline gap-2">
                        <span>{localize(item.text, locale)}</span>
                        <Badge variant="outline">{t(`curriculum.${item.bloomLevel}`)}</Badge>
                        {item.competencyCode ? (
                          <Badge variant="muted">{item.competencyCode}</Badge>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}

              {(current.content.topics ?? []).length > 0 ? (
                <Section title={t('curriculum.topics')}>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>#</TableHead>
                        <TableHead>{t('common.title')}</TableHead>
                        <TableHead className="text-center">
                          {t('curriculum.lectureHours')}
                        </TableHead>
                        <TableHead className="text-center">
                          {t('curriculum.practiceHours')}
                        </TableHead>
                        <TableHead className="text-center">{t('curriculum.labHours')}</TableHead>
                        <TableHead className="text-center">
                          {t('curriculum.independentHours')}
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {current.content.topics?.map((topic, index) => (
                        <TableRow key={index}>
                          <TableCell className="tabular-nums text-muted-foreground">
                            {index + 1}
                          </TableCell>
                          <TableCell>{localize(topic.title, locale)}</TableCell>
                          <TableCell className="text-center tabular-nums">
                            {topic.lectureHours}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {topic.practiceHours}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {topic.labHours}
                          </TableCell>
                          <TableCell className="text-center tabular-nums">
                            {topic.independentHours}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </Section>
              ) : null}

              {(current.content.literature ?? []).length > 0 ? (
                <Section title={t('curriculum.literature')}>
                  <ol className="list-decimal space-y-1 ps-5 text-sm">
                    {current.content.literature?.map((item, index) => (
                      <li key={index}>
                        <Badge variant="outline" className="me-1.5">
                          {t(`curriculum.literature_${item.type}`)}
                        </Badge>
                        {item.citation}
                        {item.url ? (
                          <a
                            href={item.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ms-1 text-primary hover:underline"
                          >
                            ↗
                          </a>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                </Section>
              ) : null}

              {current.content.policy && Object.values(current.content.policy).some(Boolean) ? (
                <Section title={t('curriculum.studentPolicy')}>
                  <p className="whitespace-pre-line text-sm">
                    {localize(current.content.policy, locale)}
                  </p>
                </Section>
              ) : null}
            </div>

            {/* --- Baholash siyosati + versiyalar --- */}
            <div className="space-y-4">
              <Section title={t('curriculum.gradingPolicy')}>
                <dl className="space-y-1 text-sm">
                  {(['JN', 'ON', 'YN'] as const).map((key) => (
                    <div key={key} className="flex justify-between">
                      <dt className="text-muted-foreground">{t(`grades.${key}`)}</dt>
                      <dd className="tabular-nums">{current.gradingPolicy.weights[key]}%</dd>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-border pt-1">
                    <dt className="text-muted-foreground">{t('curriculum.passingScore')}</dt>
                    <dd className="tabular-nums">{current.gradingPolicy.passingScore}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('curriculum.finalExamThreshold')}</dt>
                    <dd className="tabular-nums">{current.gradingPolicy.finalExamThreshold}</dd>
                  </div>
                </dl>
              </Section>

              <Section title={t('curriculum.versions')} icon={<History className="size-4" />}>
                <ul className="space-y-2 text-sm">
                  {detail.versions.map((version) => (
                    <li key={version.id} className="rounded-md border border-border p-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">v{version.version}</span>
                        <Badge variant={STATUS_VARIANT[version.status] ?? 'muted'}>
                          {t(`curriculum.${version.status}`)}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(version.createdAt, locale)}
                        {version.approvedAt ? ` · ✓ ${formatDate(version.approvedAt, locale)}` : ''}
                      </p>
                      {version.changeNote ? (
                        <p className="mt-1 text-xs">{version.changeNote}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </Section>
            </div>
          </div>
        </>
      ) : null}

      {editing && subject.data ? (
        <SyllabusEditor
          subjectId={subjectId}
          departmentId={subject.data.departmentId}
          syllabusId={detail?.id}
          initialContent={current?.content ?? null}
          initialPolicy={current?.gradingPolicy ?? null}
          onClose={() => setEditing(false)}
          onSaved={() => void syllabus.refetch()}
        />
      ) : null}

      {rejecting && detail ? (
        <RejectDialog
          pending={transition.isPending}
          onClose={() => setRejecting(false)}
          onConfirm={(comment) => transition.mutate({ action: 'REJECT', comment })}
        />
      ) : null}
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** Qaytarish — sabab majburiy (server `validation.required_on_reject`). */
function RejectDialog({
  pending,
  onClose,
  onConfirm,
}: {
  pending: boolean;
  onClose: () => void;
  onConfirm: (comment: string) => void;
}) {
  const t = useTranslations();
  const [comment, setComment] = useState('');

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="sm">
        <DialogHeader>
          <DialogTitle>{t('curriculum.reject')}</DialogTitle>
          <DialogDescription>{t('curriculum.rejectHint')}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-1.5">
          <Label htmlFor="reject-reason" required>
            {t('curriculum.rejectReason')}
          </Label>
          <Textarea
            id="reject-reason"
            rows={3}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={pending}
            disabled={comment.trim().length === 0}
            onClick={() => onConfirm(comment.trim())}
          >
            {t('curriculum.rejectConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
