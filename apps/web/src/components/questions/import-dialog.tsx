/**
 * Maqsad: savollarni fayldan import qilish oynasi (F-07, §10 QTI, §12).
 *
 * Ikki bosqich: (1) fayl yuklanadi va `dryRun` bilan tahlil qilinadi —
 * o'qituvchi nechta savol topilgani va qaysi qatorlarda muammo borligini
 * ko'radi; (2) tasdiqlasa, xuddi shu fayl bazaga yoziladi. Muammoli qatorlar
 * yutilmaydi — ular ro'yxatda qator raqami bilan ko'rsatiladi (§16).
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileUp, Upload } from 'lucide-react';
import { QUESTION_IMPORT_FORMATS, type QuestionImportFormat } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { uploadFile } from '@/lib/upload';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, Badge, Button, Label } from '@/components/ui/primitives';
import { Select } from '@/components/ui/form-controls';

interface ImportIssue {
  line: number;
  reason: string;
  detail?: string;
}

interface ImportResult {
  format: QuestionImportFormat;
  fileName: string;
  total: number;
  imported: number;
  issues: ImportIssue[];
  preview: Array<{
    index: number;
    type: string;
    text: Record<string, string | undefined>;
    defaultScore: number;
    tags: string[];
  }>;
}

const ACCEPT: Record<QuestionImportFormat, string> = {
  QTI_3: '.xml,.zip',
  AIKEN: '.txt',
  GIFT: '.txt,.gift',
  CSV: '.csv',
};

/** Brauzer `.gift`/`.xml` uchun MIME bermasligi mumkin — kengaytmadan aniqlaymiz. */
function mimeFor(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith('.zip')) return 'application/zip';
  if (name.endsWith('.xml')) return 'text/xml';
  if (name.endsWith('.csv')) return 'text/csv';
  return 'text/plain';
}

export function ImportQuestionsDialog({
  bankId,
  onClose,
  onImported,
}: {
  bankId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [format, setFormat] = useState<QuestionImportFormat>('QTI_3');
  const [file, setFile] = useState<File | null>(null);
  const [fileObjectId, setFileObjectId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);

  const analyze = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('no_file');
      const uploaded = await uploadFile(file, {
        purpose: 'QUESTION_IMPORT',
        mimeType: mimeFor(file),
      });
      const { data } = await api.post<ImportResult>('/questions/import', {
        bankId,
        format,
        fileObjectId: uploaded.fileObjectId,
        locale,
        dryRun: true,
      });
      return { fileObjectId: uploaded.fileObjectId, result: data };
    },
    onSuccess: ({ fileObjectId: id, result }) => {
      setFileObjectId(id);
      setPreview(result);
    },
    onError: (error) => toast.error(describeError(error, t)),
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!fileObjectId) throw new Error('no_file');
      const { data } = await api.post<ImportResult>('/questions/import', {
        bankId,
        format,
        fileObjectId,
        locale,
        dryRun: false,
      });
      return data;
    },
    onSuccess: (result) => {
      toast.success(t('quizzes.importDone', { count: result.imported }));
      onImported();
      onClose();
    },
    onError: (error) => toast.error(describeError(error, t)),
  });

  const pending = analyze.isPending || commit.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent closeLabel={t('common.close')} className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('quizzes.importQuestions')}</DialogTitle>
          <DialogDescription>{t('quizzes.importHint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="import-format">{t('quizzes.importFormat')}</Label>
              <Select
                id="import-format"
                value={format}
                disabled={pending}
                onChange={(event) => {
                  setFormat(event.target.value as QuestionImportFormat);
                  setFile(null);
                  setPreview(null);
                  setFileObjectId(null);
                }}
              >
                {QUESTION_IMPORT_FORMATS.map((value) => (
                  <option key={value} value={value}>
                    {t(`quizzes.format_${value}`)}
                  </option>
                ))}
              </Select>
              <p className="text-xs text-muted-foreground">{t(`quizzes.formatHint_${format}`)}</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="import-file">{t('quizzes.importFile')}</Label>
              <input
                id="import-file"
                type="file"
                accept={ACCEPT[format]}
                disabled={pending}
                className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setFileObjectId(null);
                }}
              />
              <p className="text-xs text-muted-foreground">
                {t('quizzes.importLocaleHint', { locale })}
              </p>
            </div>
          </div>

          {preview ? (
            <div className="space-y-3">
              <Alert
                variant={
                  preview.total > 0
                    ? preview.issues.length
                      ? 'warning'
                      : 'success'
                    : 'destructive'
                }
                title={t('quizzes.importPreviewTitle', { total: preview.total })}
              >
                {preview.issues.length > 0
                  ? t('quizzes.importIssuesCount', { count: preview.issues.length })
                  : t('quizzes.importNoIssues')}
              </Alert>

              {preview.preview.length > 0 ? (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                  {preview.preview.map((row) => (
                    <li key={row.index} className="flex items-start gap-2 text-sm">
                      <span className="w-6 shrink-0 tabular-nums text-muted-foreground">
                        {row.index}.
                      </span>
                      <Badge variant="outline" className="shrink-0">
                        {t(`quizzes.${row.type}`)}
                      </Badge>
                      {/* Matn HTML bo'lishi mumkin — oldindan ko'rishda faqat matn ko'rsatiladi */}
                      <span className="line-clamp-2 min-w-0 flex-1">
                        {stripTags(localize(row.text, locale, ''))}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {preview.issues.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{t('quizzes.importIssues')}</p>
                  <ul className="max-h-40 space-y-1 overflow-y-auto text-sm text-muted-foreground">
                    {preview.issues.slice(0, 100).map((issue, index) => (
                      <li key={`${issue.line}-${index}`}>
                        {issue.line > 0 ? `${t('quizzes.importLine')} ${issue.line}: ` : ''}
                        {t(`import.${issue.reason.replace(/^import\./, '')}`)}
                        {issue.detail ? ` (${issue.detail})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          {preview ? (
            <Button
              loading={commit.isPending}
              disabled={preview.total === 0 || pending}
              onClick={() => commit.mutate()}
            >
              <Upload className="size-4" />
              {t('quizzes.importConfirm', { count: preview.total })}
            </Button>
          ) : (
            <Button
              loading={analyze.isPending}
              disabled={!file || pending}
              onClick={() => analyze.mutate()}
            >
              <FileUp className="size-4" />
              {t('quizzes.importAnalyze')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function stripTags(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function describeError(error: unknown, t: ReturnType<typeof useTranslations>): string {
  if (error instanceof ApiClientError) {
    const key = error.messageKey.replace(/^errors\./, '');
    return t.has(`errors.${key}`) ? t(`errors.${key}`) : t('common.somethingWentWrong');
  }
  return t('common.somethingWentWrong');
}
