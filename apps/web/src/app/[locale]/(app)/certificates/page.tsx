/**
 * Maqsad: sertifikatlar — reestr, yuklab olish, BERISH va bekor qilish (F-12).
 *
 * Uch qatlam bitta sahifada, ruxsatga qarab ochiladi:
 *  - talaba: o'z sertifikatlari va yuklab olish;
 *  - o'qituvchi (`certificate:create:own_course`): o'z kurslari bo'yicha berish
 *    va reestr;
 *  - dekanat/rektorat (`approve:own_faculty` / `read:all`): to'liq reestr va
 *    bekor qilish.
 *
 * PDF navbatda tayyorlanadi (worker), shuning uchun yangi berilgan sertifikat
 * dastlab "tayyorlanmoqda" holatida turadi — reestr qisqa oraliqda qayta
 * so'raladi, foydalanuvchi sahifani yangilashi shart emas.
 */

'use client';

import { useMemo, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Award, Download, ExternalLink, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { formatDate, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
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
import { Select } from '@/components/ui/form-controls';

interface CertificateRow {
  id: string;
  serialNumber: string;
  status: string;
  issuedAt: string;
  expiresAt: string | null;
  pdfFileId: string | null;
  verification: { code: string; viewCount: number } | null;
  course: { id: string; code: string; title: unknown };
  user: { id: string; profile: { firstName: string; lastName: string } | null };
}

interface CourseOption {
  id: string;
  code: string;
  title: unknown;
}

interface TemplateOption {
  id: string;
  name: unknown;
  orientation: string;
}

interface EnrollmentRow {
  id: string;
  status: string;
  user: { id: string; profile: { firstName: string; lastName: string } | null };
}

function holderName(row: { profile: { firstName: string; lastName: string } | null }): string {
  return [row.profile?.lastName, row.profile?.firstName].filter(Boolean).join(' ');
}

export default function CertificatesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const canIssue = can('certificate:create:own_course') || can('certificate:approve:own_faculty');
  const canRevoke = can('certificate:approve:own_faculty') || can('certificate:read:all');
  // Boshqalarning sertifikatlarini ko'ruvchi — egasi ustuni va filtrlar kerak
  const isRegistryView = canIssue || canRevoke;

  const [statusFilter, setStatusFilter] = useState('');
  const [courseFilter, setCourseFilter] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [revoking, setRevoking] = useState<CertificateRow | null>(null);

  const registry = useQuery({
    queryKey: ['certificates', statusFilter, courseFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (courseFilter) params.set('courseId', courseFilter);
      const suffix = params.toString();
      return (
        await api.get<CertificateRow[]>(`/certificates/registry${suffix ? `?${suffix}` : ''}`)
      ).data;
    },
    // PDF hali tayyor bo'lmagan yozuv bo'lsa — qayta so'raymiz (worker ishlayapti)
    refetchInterval: (query) =>
      (query.state.data ?? []).some((row) => row.status === 'ISSUED' && !row.pdfFileId)
        ? 4000
        : false,
  });

  const courses = useQuery({
    queryKey: ['courses', 'for-certificates'],
    queryFn: async () => (await api.get<CourseOption[]>('/courses?limit=100')).data,
    enabled: isRegistryView,
  });

  const download = async (fileId: string) => {
    try {
      const { data: file } = await api.get<{ url: string }>(`/content/files/${fileId}/download`);
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('errors.internal'));
    }
  };

  const rows = registry.data ?? [];

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isRegistryView ? t('certificates.registry') : t('certificates.title')}
          </h1>
          {isRegistryView ? <p className="text-sm text-muted-foreground">{rows.length}</p> : null}
        </div>

        {canIssue ? (
          <Button onClick={() => setIssuing(true)}>
            <Plus className="size-4" />
            {t('certificates.issue')}
          </Button>
        ) : null}
      </header>

      {/* --- Filtrlar: faqat reestr ko'rinishida --- */}
      {isRegistryView ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select
            value={courseFilter}
            aria-label={t('nav.courses')}
            disabled={courses.isLoading}
            onChange={(event) => setCourseFilter(event.target.value)}
          >
            <option value="">{t('certificates.allCourses')}</option>
            {courses.data?.map((course) => (
              <option key={course.id} value={course.id}>
                {course.code} · {localize(course.title, locale, '')}
              </option>
            ))}
          </Select>
          <Select
            value={statusFilter}
            aria-label={t('common.status')}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">{t('certificates.allStatuses')}</option>
            <option value="ISSUED">{t('certificates.valid')}</option>
            <option value="REVOKED">{t('certificates.revoked')}</option>
          </Select>
        </div>
      ) : null}

      {registry.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : registry.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void registry.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Award className="size-8" />}
          title={t('certificates.emptyTitle')}
          description={t('certificates.emptyDescription')}
          action={
            canIssue ? (
              <Button onClick={() => setIssuing(true)}>{t('certificates.issue')}</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((certificate) => (
            <Card key={certificate.id}>
              <CardContent className="space-y-2 p-4">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-mono text-xs text-muted-foreground">
                    {certificate.serialNumber}
                  </span>
                  <Badge variant={certificate.status === 'ISSUED' ? 'success' : 'destructive'}>
                    {certificate.status === 'ISSUED'
                      ? t('certificates.valid')
                      : t('certificates.revoked')}
                  </Badge>
                </div>

                <h2 className="font-medium leading-snug">
                  {localize(certificate.course.title, locale)}
                </h2>

                {isRegistryView ? (
                  <p className="text-sm">
                    <span className="text-muted-foreground">{t('certificates.holder')}: </span>
                    {holderName(certificate.user) || '—'}
                  </p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  {t('certificates.issuedAt')}: {formatDate(certificate.issuedAt, locale)}
                  {' · '}
                  {t('certificates.expiresAt')}:{' '}
                  {certificate.expiresAt
                    ? formatDate(certificate.expiresAt, locale)
                    : t('certificates.noExpiry')}
                  {certificate.verification && certificate.verification.viewCount > 0
                    ? ` · ${t('certificates.views', { count: certificate.verification.viewCount })}`
                    : ''}
                </p>

                <div className="flex flex-wrap gap-2 pt-1">
                  {certificate.pdfFileId ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void download(certificate.pdfFileId as string)}
                    >
                      <Download className="size-3.5" aria-hidden="true" />
                      {t('common.download')}
                    </Button>
                  ) : certificate.status === 'ISSUED' ? (
                    <Badge variant="muted">{t('documents.generating')}</Badge>
                  ) : null}

                  {certificate.verification ? (
                    <Button size="sm" variant="ghost" asChild>
                      <a
                        href={`/${locale}/verify/${certificate.verification.code}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        {t('certificates.verify')}
                      </a>
                    </Button>
                  ) : null}

                  {canRevoke && certificate.status === 'ISSUED' ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setRevoking(certificate)}
                    >
                      {t('certificates.revoke')}
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {issuing ? (
        <IssueDialog
          courses={courses.data ?? []}
          onClose={() => setIssuing(false)}
          onIssued={() => void registry.refetch()}
        />
      ) : null}

      {revoking ? (
        <RevokeDialog
          certificate={revoking}
          onClose={() => setRevoking(null)}
          onRevoked={() => void registry.refetch()}
        />
      ) : null}
    </div>
  );
}

/**
 * Sertifikat berish oynasi.
 *
 * Ikki rejim: "kursni tugatgan hammaga" (server `COMPLETED` yozilishlarni
 * o'zi topadi) yoki aniq talabalar. Ikkinchisida ro'yxat kurs yozilishlaridan
 * keladi, tugatganlar oldindan belgilanadi, allaqachon sertifikati borlar
 * o'chirilgan holda ko'rsatiladi — ikki marta berib bo'lmasligi ko'rinib tursin.
 */
function IssueDialog({
  courses,
  onClose,
  onIssued,
}: {
  courses: CourseOption[];
  onClose: () => void;
  onIssued: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [courseId, setCourseId] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [mode, setMode] = useState<'completed' | 'selected'>('completed');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expiresAt, setExpiresAt] = useState('');

  const templates = useQuery({
    queryKey: ['certificate-templates'],
    queryFn: async () => (await api.get<TemplateOption[]>('/certificates/templates')).data,
  });

  // Birinchi shablon avtomatik tanlanadi — odatda bitta standart shablon bo'ladi
  const effectiveTemplateId = templateId || templates.data?.[0]?.id || '';

  const enrollments = useQuery({
    queryKey: ['enrollments', courseId, 'for-certificates'],
    queryFn: async () =>
      (await api.get<EnrollmentRow[]>(`/courses/${courseId}/enrollments?limit=100`)).data,
    enabled: courseId !== '' && mode === 'selected',
  });

  const existing = useQuery({
    queryKey: ['certificates', 'issued-for', courseId],
    queryFn: async () =>
      (await api.get<CertificateRow[]>(`/certificates/registry?courseId=${courseId}`)).data,
    enabled: courseId !== '' && mode === 'selected',
  });

  const issuedUserIds = useMemo(
    () => new Set((existing.data ?? []).filter((r) => r.status === 'ISSUED').map((r) => r.user.id)),
    [existing.data],
  );

  const pickCourse = (id: string) => {
    setCourseId(id);
    setSelected(new Set());
  };

  const toggle = (userId: string) =>
    setSelected((state) => {
      const next = new Set(state);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });

  const issue = useMutation({
    mutationFn: async () =>
      api.post<{ issued: number; certificateIds: string[] }>('/certificates/issue', {
        courseId,
        templateId: effectiveTemplateId,
        userIds: mode === 'selected' ? Array.from(selected) : [],
        ...(expiresAt ? { expiresAt: new Date(expiresAt).toISOString() } : {}),
      }),
    onSuccess: ({ data }) => {
      if (data.issued > 0) toast.success(t('certificates.issued', { count: data.issued }));
      else toast.info(t('certificates.issuedNone'));
      onIssued();
      onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const canSubmit =
    courseId !== '' && effectiveTemplateId !== '' && (mode === 'completed' || selected.size > 0);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="lg">
        <DialogHeader>
          <DialogTitle>{t('certificates.issue')}</DialogTitle>
          <DialogDescription>{t('certificates.issueHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="issue-course" required>
                {t('nav.courses')}
              </Label>
              <Select
                id="issue-course"
                value={courseId}
                onChange={(event) => pickCourse(event.target.value)}
              >
                <option value="">{t('common.none')}</option>
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.code} · {localize(course.title, locale, '')}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="issue-template" required>
                {t('certificates.template')}
              </Label>
              <Select
                id="issue-template"
                value={effectiveTemplateId}
                disabled={templates.isLoading}
                onChange={(event) => setTemplateId(event.target.value)}
              >
                {templates.data?.map((template) => (
                  <option key={template.id} value={template.id}>
                    {localize(template.name, locale, '')}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t('certificates.recipients')}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="issue-mode"
                className="size-4 accent-[hsl(var(--primary))]"
                checked={mode === 'completed'}
                onChange={() => setMode('completed')}
              />
              {t('certificates.allCompleted')}
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="issue-mode"
                className="size-4 accent-[hsl(var(--primary))]"
                checked={mode === 'selected'}
                onChange={() => setMode('selected')}
              />
              {t('certificates.selectedStudents')}
            </label>
          </fieldset>

          {mode === 'selected' && courseId ? (
            enrollments.isLoading ? (
              <Skeleton className="h-32" />
            ) : (enrollments.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('certificates.noEnrollments')}</p>
            ) : (
              <ul className="max-h-64 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {enrollments.data?.map((row) => {
                  const done = issuedUserIds.has(row.user.id);
                  return (
                    <li key={row.id}>
                      <label className="flex items-center gap-2 rounded px-1 py-1 text-sm hover:bg-muted">
                        <input
                          type="checkbox"
                          className="size-4 accent-[hsl(var(--primary))]"
                          disabled={done}
                          checked={selected.has(row.user.id)}
                          onChange={() => toggle(row.user.id)}
                        />
                        <span className="min-w-0 flex-1 truncate">
                          {holderName(row.user) || row.user.id}
                        </span>
                        {done ? (
                          <Badge variant="muted">{t('certificates.alreadyIssued')}</Badge>
                        ) : (
                          <Badge variant={row.status === 'COMPLETED' ? 'success' : 'outline'}>
                            {row.status}
                          </Badge>
                        )}
                      </label>
                    </li>
                  );
                })}
              </ul>
            )
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="issue-expires">{t('certificates.expiresAt')}</Label>
            <Input
              id="issue-expires"
              type="date"
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t('certificates.noExpiry')}</p>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button loading={issue.isPending} disabled={!canSubmit} onClick={() => issue.mutate()}>
            {t('certificates.issue')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Bekor qilish — sabab majburiy (kamida 5 belgi), amal qaytarilmaydi. */
function RevokeDialog({
  certificate,
  onClose,
  onRevoked,
}: {
  certificate: CertificateRow;
  onClose: () => void;
  onRevoked: () => void;
}) {
  const t = useTranslations();
  const [reason, setReason] = useState('');

  const revoke = useMutation({
    mutationFn: async () => api.post(`/certificates/${certificate.id}/revoke`, { reason }),
    onSuccess: () => {
      toast.success(t('certificates.revokedDone'));
      onRevoked();
      onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')} size="sm">
        <DialogHeader>
          <DialogTitle>{t('certificates.revoke')}</DialogTitle>
          <DialogDescription>{certificate.serialNumber}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('certificates.revokeWarning')}</p>
          <div className="space-y-1.5">
            <Label htmlFor="revoke-reason" required>
              {t('certificates.revokeReason')}
            </Label>
            <Textarea
              id="revoke-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            loading={revoke.isPending}
            disabled={reason.trim().length < 5}
            onClick={() => revoke.mutate()}
          >
            {t('certificates.revokeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
