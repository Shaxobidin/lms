/**
 * Maqsad: IMS Common Cartridge paketini kursga import qilish oynasi (F-05, §10).
 *
 * Ikki bosqich: paket yuklanadi va `dryRun` bilan REJA ko'rsatiladi (nechta
 * modul/mavzu/dars, fayllar, havolalar, muhokamalar, testlar; nima o'tkazib
 * yuboriladi) — keyin o'qituvchi tasdiqlaydi. Import mavjud tuzilmaga
 * QO'SHILADI, hech narsa o'chirilmaydi.
 */

'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { PackageOpen, Upload } from 'lucide-react';
import { api, ApiClientError } from '@/lib/api-client';
import { uploadFile } from '@/lib/upload';
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

interface CartridgePlan {
  title: string;
  schemaVersion: string;
  fileName: string;
  imported: boolean;
  modules: number;
  counts: {
    modules: number;
    topics: number;
    lessons: number;
    files: number;
    links: number;
    discussions: number;
    quizzes: number;
    questions: number;
  };
  outline: Array<{
    title: string;
    topics: Array<{ title: string; lessons: Array<{ title: string; kinds: string[] }> }>;
  }>;
  skipped: Array<{ title: string; reason: string; detail?: string }>;
  questionIssues: Array<{ line: number; reason: string; detail?: string }>;
}

export function CartridgeImportDialog({
  courseId,
  onClose,
  onImported,
}: {
  courseId: string;
  onClose: () => void;
  onImported: () => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const [file, setFile] = useState<File | null>(null);
  const [fileObjectId, setFileObjectId] = useState<string | null>(null);
  const [plan, setPlan] = useState<CartridgePlan | null>(null);

  const analyze = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('no_file');
      const uploaded = await uploadFile(file, {
        purpose: 'COURSE_CONTENT',
        courseId,
        mimeType: 'application/zip',
      });
      const { data } = await api.post<CartridgePlan>('/content/cc/import', {
        courseId,
        fileObjectId: uploaded.fileObjectId,
        locale,
        dryRun: true,
      });
      return { fileObjectId: uploaded.fileObjectId, plan: data };
    },
    onSuccess: (result) => {
      setFileObjectId(result.fileObjectId);
      setPlan(result.plan);
    },
    onError: (error) => toast.error(describeError(error, t)),
  });

  const commit = useMutation({
    mutationFn: async () => {
      if (!fileObjectId) throw new Error('no_file');
      const { data } = await api.post<CartridgePlan>('/content/cc/import', {
        courseId,
        fileObjectId,
        locale,
        dryRun: false,
      });
      return data;
    },
    onSuccess: (result) => {
      toast.success(t('cc.done', { modules: result.counts.modules }));
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
          <DialogTitle>{t('cc.title')}</DialogTitle>
          <DialogDescription>{t('cc.hint')}</DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cc-file">{t('cc.file')}</Label>
            <input
              id="cc-file"
              type="file"
              accept=".imscc,.zip"
              disabled={pending}
              className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm file:font-medium"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPlan(null);
                setFileObjectId(null);
              }}
            />
            <p className="text-xs text-muted-foreground">{t('cc.fileHint')}</p>
          </div>

          {plan ? (
            <div className="space-y-3">
              <Alert
                variant={
                  plan.modules > 0 ? (plan.skipped.length ? 'warning' : 'success') : 'destructive'
                }
                title={
                  plan.title ? `${plan.title} (CC ${plan.schemaVersion || '?'})` : t('cc.planTitle')
                }
              >
                {t('cc.planSummary', {
                  modules: plan.counts.modules,
                  topics: plan.counts.topics,
                  lessons: plan.counts.lessons,
                })}
                {' · '}
                {t('cc.planContent', {
                  files: plan.counts.files,
                  links: plan.counts.links,
                  discussions: plan.counts.discussions,
                  quizzes: plan.counts.quizzes,
                  questions: plan.counts.questions,
                })}
              </Alert>

              {plan.outline.length > 0 ? (
                <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                  {plan.outline.map((module, moduleIndex) => (
                    <li key={moduleIndex}>
                      <span className="font-medium">{module.title}</span>
                      <ul className="ms-4 space-y-0.5">
                        {module.topics.map((topic, topicIndex) => (
                          <li key={topicIndex}>
                            {topic.title}
                            <span className="text-muted-foreground">
                              {' '}
                              · {topic.lessons.length} {t('courses.lessons').toLowerCase()}
                            </span>
                            <span className="ms-2 inline-flex flex-wrap gap-1">
                              {Array.from(
                                new Set(topic.lessons.flatMap((lesson) => lesson.kinds)),
                              ).map((kind) => (
                                <Badge key={kind} variant="outline">
                                  {t(`cc.kind_${kind}`)}
                                </Badge>
                              ))}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : null}

              {plan.skipped.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">
                    {t('cc.skipped', { count: plan.skipped.length })}
                  </p>
                  <ul className="max-h-32 space-y-0.5 overflow-y-auto text-sm text-muted-foreground">
                    {plan.skipped.slice(0, 50).map((entry, index) => (
                      <li key={index}>
                        {entry.title || '—'}: {t(`cc.${entry.reason.replace(/^cc\./, '')}`)}
                        {entry.detail ? ` (${entry.detail})` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {plan.questionIssues.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t('cc.questionIssues', { count: plan.questionIssues.length })}
                </p>
              ) : null}
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            {t('common.cancel')}
          </Button>
          {plan ? (
            <Button
              loading={commit.isPending}
              disabled={plan.modules === 0 || pending}
              onClick={() => commit.mutate()}
            >
              <Upload className="size-4" />
              {t('cc.confirm', { modules: plan.counts.modules })}
            </Button>
          ) : (
            <Button
              loading={analyze.isPending}
              disabled={!file || pending}
              onClick={() => analyze.mutate()}
            >
              <PackageOpen className="size-4" />
              {t('cc.analyze')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function describeError(error: unknown, t: ReturnType<typeof useTranslations>): string {
  if (error instanceof ApiClientError) {
    const key = error.messageKey.replace(/^errors\./, '');
    return t.has(`errors.${key}`) ? t(`errors.${key}`) : t('common.somethingWentWrong');
  }
  return t('common.somethingWentWrong');
}
