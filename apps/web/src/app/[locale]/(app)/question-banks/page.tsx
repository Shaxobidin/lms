/**
 * Maqsad: savollar banklari ro'yxati va yangi bank yaratish (F-07).
 *
 * Bank kursga yoki fanga bog'lanadi. Fanga bog'langan bank kafedra ichida
 * ulashilishi mumkin — bir xil fanni o'qitadigan o'qituvchilar savollarni
 * qayta ishlatadi (§4 F-07: "kontent kutubxonasi va qayta ishlatish").
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Library, Plus } from 'lucide-react';
import { toast } from 'sonner';
import type { LocalizedText } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
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
import { LocalizedField, Select, SwitchField } from '@/components/ui/form-controls';

interface BankRow {
  id: string;
  title: unknown;
  isShared: boolean;
  courseId: string | null;
  subject: { id: string; code: string; name: unknown } | null;
  _count: { questions: number };
}

interface CourseOption {
  id: string;
  code: string;
  title: unknown;
}

export default function QuestionBanksPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const [creating, setCreating] = useState(false);

  const canManage = can('questionbank:manage:own_course');

  const banks = useQuery({
    queryKey: ['question-banks'],
    queryFn: async () => (await api.get<BankRow[]>('/question-banks')).data,
  });

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('quizzes.questionBank')}</h1>
          <p className="text-sm text-muted-foreground">{t('quizzes.questionBankHint')}</p>
        </div>

        {canManage ? (
          <Button onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            {t('quizzes.createBank')}
          </Button>
        ) : null}
      </header>

      {banks.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      ) : banks.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void banks.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (banks.data ?? []).length === 0 ? (
        <EmptyState
          icon={<Library className="size-8" />}
          title={t('quizzes.noBanksTitle')}
          description={t('quizzes.noBanksDescription')}
          action={
            canManage ? (
              <Button onClick={() => setCreating(true)}>{t('quizzes.createBank')}</Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-2">
          {banks.data?.map((bank) => (
            <Card key={bank.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <h2 className="font-medium">{localize(bank.title, locale)}</h2>
                  <p className="text-xs text-muted-foreground">
                    {bank.subject
                      ? `${bank.subject.code} · ${localize(bank.subject.name, locale, '')}`
                      : t('quizzes.courseBank')}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {bank.isShared ? <Badge variant="outline">{t('quizzes.shared')}</Badge> : null}
                  <Badge variant="muted">
                    {bank._count.questions} {t('quizzes.question').toLowerCase()}
                  </Badge>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/question-banks/${bank.id}`}>{t('common.open')}</Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {creating ? (
        <CreateBankDialog
          onClose={() => setCreating(false)}
          onCreated={() => void banks.refetch()}
        />
      ) : null}
    </div>
  );
}

/** Yangi bank: kurs yoki fan tanlanadi (server ikkalasi ham bo'sh bo'lishini rad etadi). */
function CreateBankDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [title, setTitle] = useState<LocalizedText>({});
  const [courseId, setCourseId] = useState('');
  const [isShared, setIsShared] = useState(false);

  const courses = useQuery({
    queryKey: ['courses', 'for-bank'],
    queryFn: async () => (await api.get<CourseOption[]>('/courses?limit=100')).data,
  });

  const create = useMutation({
    mutationFn: async () =>
      api.post('/question-banks', { title, courseId: courseId || null, isShared }),
    onSuccess: () => {
      toast.success(t('quizzes.bankCreated'));
      onCreated();
      onClose();
    },
    onError: (error: unknown) => {
      const key = error instanceof ApiClientError ? error.translationKey : 'errors.internal';
      toast.error(t(key));
    },
  });

  const canSubmit = Object.values(title).some(Boolean) && courseId !== '';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent closeLabel={t('common.close')}>
        <DialogHeader>
          <DialogTitle>{t('quizzes.createBank')}</DialogTitle>
          <DialogDescription>{t('quizzes.createBankHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <LocalizedField
            idPrefix="bank-title"
            label={t('common.title')}
            value={title}
            onChange={setTitle}
            required
            moreLabel={t('common.otherLanguages')}
          />

          <div className="space-y-1.5">
            <label className="text-sm font-medium" htmlFor="bank-course">
              {t('nav.courses')}
            </label>
            <Select
              id="bank-course"
              value={courseId}
              disabled={courses.isLoading}
              onChange={(event) => setCourseId(event.target.value)}
            >
              <option value="">{t('common.none')}</option>
              {courses.data?.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.code} · {localize(course.title, locale, '')}
                </option>
              ))}
            </Select>
          </div>

          <SwitchField
            id="bank-shared"
            label={t('quizzes.shared')}
            description={t('quizzes.sharedHint')}
            checked={isShared}
            onCheckedChange={setIsShared}
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
