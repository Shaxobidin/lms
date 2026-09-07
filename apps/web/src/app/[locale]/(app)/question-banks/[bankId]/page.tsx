/**
 * Maqsad: bankdagi savollar — filtrlash, yaratish, tahrirlash va sifat
 * hisoboti (F-07, §12 "item analysis").
 *
 * Sahifa §15 ning "o'qituvchi test tuzadi" mezonining birinchi yarmini yopadi:
 * savollar shu yerda tayyorlanadi, keyin test konstruktorida testga biriktiriladi
 * (`/quizzes/[quizId]/questions`).
 */

'use client';

import { use, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BarChart3, Download, FileUp, HelpCircle, Plus } from 'lucide-react';
import type { QuestionPayload, QuestionType } from '@lms/shared';
import { QUESTION_TYPES } from '@lms/shared';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { cn, localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { QuestionEditor, type EditableQuestion } from '@/components/questions/question-editor';
import { ImportQuestionsDialog } from '@/components/questions/import-dialog';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  Skeleton,
} from '@/components/ui/primitives';
import { Select } from '@/components/ui/form-controls';

interface QuestionRow {
  id: string;
  type: QuestionType;
  text: unknown;
  payload: QuestionPayload;
  defaultScore: string;
  bloomLevel: string | null;
  difficulty: string;
  tags: string[];
  facilityIndex: string | null;
  discriminationIndex: string | null;
  usageCount: number;
  explanation: unknown;
}

interface QualityReport {
  total: number;
  needsReview: number;
  distribution: { easy: number; medium: number; hard: number };
}

export default function QuestionBankPage({ params }: { params: Promise<{ bankId: string }> }) {
  const { bankId } = use(params);
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);

  const canManage = can('questionbank:manage:own_course');

  const [type, setType] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<EditableQuestion | 'new' | null>(null);
  const [importing, setImporting] = useState(false);

  const exportBank = useMutation({
    mutationFn: async () =>
      (
        await api.post<{
          url: string;
          exported: number;
          skipped: Array<{ id: string; type: string }>;
        }>(`/question-banks/${bankId}/export`, { format: 'QTI_3', locale })
      ).data,
    onSuccess: (result) => {
      toast.success(t('quizzes.exportDone', { count: result.exported }));
      window.open(result.url, '_blank', 'noopener');
    },
    onError: () => toast.error(t('common.somethingWentWrong')),
  });

  const questions = useQuery({
    queryKey: ['questions', bankId, type, difficulty, search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (difficulty) params.set('difficulty', difficulty);
      if (search.trim()) params.set('search', search.trim());
      return (
        await api.get<QuestionRow[]>(`/question-banks/${bankId}/questions?${params.toString()}`)
      ).data;
    },
  });

  const quality = useQuery({
    queryKey: ['bank-quality', bankId],
    queryFn: async () => (await api.get<QualityReport>(`/question-banks/${bankId}/quality`)).data,
    // Sifat hisoboti faqat ishlatilgan savollar bo'yicha ma'noga ega
    enabled: canManage,
  });

  const refresh = () => {
    void questions.refetch();
    void quality.refetch();
  };

  return (
    <div className="space-y-5">
      <header className="space-y-2">
        <Button asChild variant="ghost" size="sm" className="-ms-3">
          <Link href="/question-banks">{t('quizzes.questionBank')}</Link>
        </Button>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('quizzes.questions')}</h1>
            <p className="text-sm text-muted-foreground">
              {questions.data?.length ?? 0} {t('quizzes.question').toLowerCase()}
            </p>
          </div>

          {canManage ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                loading={exportBank.isPending}
                disabled={(questions.data?.length ?? 0) === 0}
                onClick={() => exportBank.mutate()}
              >
                <Download className="size-4" />
                {t('quizzes.exportQti')}
              </Button>
              <Button variant="outline" onClick={() => setImporting(true)}>
                <FileUp className="size-4" />
                {t('quizzes.importQuestions')}
              </Button>
              <Button onClick={() => setEditing('new')}>
                <Plus className="size-4" />
                {t('quizzes.addQuestion')}
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      {/* --- Sifat hisoboti (item analysis) --- */}
      {canManage && quality.data && quality.data.total > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('quizzes.itemAnalysis')}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-2">
              <BarChart3 className="size-4 text-muted-foreground" aria-hidden="true" />
              {t('quizzes.analyzedQuestions')}: {quality.data.total}
            </span>
            <Badge variant={quality.data.needsReview > 0 ? 'warning' : 'success'}>
              {t('quizzes.needsReview')}: {quality.data.needsReview}
            </Badge>
            <span className="text-muted-foreground">
              {t('quizzes.EASY')}: {quality.data.distribution.easy} · {t('quizzes.MEDIUM')}:{' '}
              {quality.data.distribution.medium} · {t('quizzes.HARD')}:{' '}
              {quality.data.distribution.hard}
            </span>
          </CardContent>
        </Card>
      ) : null}

      {/* --- Filtrlar --- */}
      <div className="grid gap-2 sm:grid-cols-3">
        <Input
          value={search}
          placeholder={t('common.search')}
          aria-label={t('common.search')}
          onChange={(event) => setSearch(event.target.value)}
        />
        <Select
          value={type}
          aria-label={t('quizzes.questionType')}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="">{t('quizzes.allTypes')}</option>
          {QUESTION_TYPES.map((value) => (
            <option key={value} value={value}>
              {t(`quizzes.${value}`)}
            </option>
          ))}
        </Select>
        <Select
          value={difficulty}
          aria-label={t('quizzes.difficulty')}
          onChange={(event) => setDifficulty(event.target.value)}
        >
          <option value="">{t('common.all')}</option>
          {['EASY', 'MEDIUM', 'HARD'].map((value) => (
            <option key={value} value={value}>
              {t(`quizzes.${value}`)}
            </option>
          ))}
        </Select>
      </div>

      {/* --- Savollar --- */}
      {questions.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, index) => (
            <Skeleton key={index} className="h-16" />
          ))}
        </div>
      ) : questions.isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void questions.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (questions.data ?? []).length === 0 ? (
        <EmptyState
          icon={<HelpCircle className="size-8" />}
          title={t('quizzes.noQuestionsTitle')}
          description={t('quizzes.noQuestionsDescription')}
          action={
            canManage ? (
              <Button onClick={() => setEditing('new')}>{t('quizzes.addQuestion')}</Button>
            ) : undefined
          }
        />
      ) : (
        <ul className="space-y-2">
          {questions.data?.map((question) => (
            <li key={question.id}>
              <Card>
                <CardContent className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    {/* Savol matni HTML bo'lishi mumkin — server sanitizatsiya qiladi (§11) */}
                    <div
                      className="prose-lms line-clamp-2 text-sm"
                      dangerouslySetInnerHTML={{ __html: localize(question.text, locale, '') }}
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{t(`quizzes.${question.type}`)}</Badge>
                      <Badge variant="muted">{t(`quizzes.${question.difficulty}`)}</Badge>
                      {question.bloomLevel ? (
                        <Badge variant="muted">{t(`curriculum.${question.bloomLevel}`)}</Badge>
                      ) : null}
                      {question.tags.map((tag) => (
                        <Badge key={tag} variant="secondary">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="text-sm tabular-nums text-muted-foreground">
                      {Number(question.defaultScore)} {t('quizzes.score').toLowerCase()}
                    </span>

                    {question.usageCount > 0 ? (
                      <ItemStats
                        facility={question.facilityIndex}
                        discrimination={question.discriminationIndex}
                        usage={question.usageCount}
                      />
                    ) : null}

                    {canManage ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setEditing({
                            id: question.id,
                            type: question.type,
                            text: (question.text ?? {}) as EditableQuestion['text'],
                            payload: question.payload,
                            defaultScore: question.defaultScore,
                            difficulty: question.difficulty,
                            bloomLevel: question.bloomLevel,
                            tags: question.tags,
                            explanation: (question.explanation ??
                              {}) as EditableQuestion['explanation'],
                          })
                        }
                      >
                        {t('common.edit')}
                      </Button>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {importing ? (
        <ImportQuestionsDialog
          bankId={bankId}
          onClose={() => setImporting(false)}
          onImported={refresh}
        />
      ) : null}

      {editing ? (
        <QuestionEditor
          bankId={bankId}
          question={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={refresh}
        />
      ) : null}
    </div>
  );
}

/**
 * Item analysis ko'rsatkichlari.
 *
 * Diskriminatsiya indeksi 0.2 dan past bo'lsa savol kuchli va kuchsiz
 * talabalarni ajrata olmaydi — u qayta ko'rib chiqilishi kerak.
 */
function ItemStats({
  facility,
  discrimination,
  usage,
}: {
  facility: string | null;
  discrimination: string | null;
  usage: number;
}) {
  const t = useTranslations();
  const discriminationValue = Number(discrimination ?? 0);
  const weak = discriminationValue < 0.2;

  return (
    <span
      className={cn('text-xs tabular-nums', weak ? 'text-warning' : 'text-muted-foreground')}
      title={`${t('quizzes.facilityIndex')} / ${t('quizzes.discriminationIndex')}`}
    >
      p={Number(facility ?? 0).toFixed(2)} · D={discriminationValue.toFixed(2)} · n={usage}
    </span>
  );
}
