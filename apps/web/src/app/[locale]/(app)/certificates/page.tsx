/**
 * Maqsad: sertifikatlar reestri va yuklab olish (F-12).
 */

'use client';

import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Award, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api-client';
import { formatDate, localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives';

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

export default function CertificatesPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['certificates'],
    queryFn: async () => (await api.get<CertificateRow[]>('/certificates/registry')).data,
  });

  const download = async (fileId: string) => {
    try {
      const { data: file } = await api.get<{ url: string }>(`/content/files/${fileId}/download`);
      window.open(file.url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error(t('errors.internal'));
    }
  };

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('certificates.title')}</h1>
      </header>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-36" />
          ))}
        </div>
      ) : isError ? (
        <ErrorState
          title={t('common.somethingWentWrong')}
          onRetry={() => void refetch()}
          retryLabel={t('common.retry')}
        />
      ) : (data ?? []).length === 0 ? (
        <EmptyState
          icon={<Award className="size-8" />}
          title={t('certificates.emptyTitle')}
          description={t('certificates.emptyDescription')}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {data?.map((certificate) => (
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

                <p className="text-xs text-muted-foreground">
                  {t('certificates.issuedAt')}: {formatDate(certificate.issuedAt, locale)}
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
                  ) : (
                    <Badge variant="muted">{t('documents.generating')}</Badge>
                  )}

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
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
