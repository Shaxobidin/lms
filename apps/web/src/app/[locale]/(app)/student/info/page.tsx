/**
 * Maqsad: HEMIS "Ma'lumot" — shaxsiy va akademik ma'lumotlar, hujjatlar (F-14).
 */

'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Download, IdCard } from 'lucide-react';
import type { LocalizedText } from '@lms/shared';
import { api } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import type { AppLocale } from '@/i18n/routing';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@/components/ui/primitives';
import { StudentPage, formatDate } from '@/components/student/student-page';

interface Info {
  profile: {
    email: string;
    phone: string | null;
    firstName: string;
    lastName: string;
    middleName: string | null;
    birthDate: string | null;
    address: string | null;
    since: string;
  };
  group: string | null;
  admissionYear: number | null;
  speciality: { code: string; name: LocalizedText } | null;
  curriculumCode: string | null;
  currentSemesterNumber: number | null;
  gpa: number | null;
  transcripts: number;
  documents: Array<{
    id: string;
    templateKey: string;
    status: string;
    createdAt: string;
    fileObjectId: string | null;
  }>;
  requests: Record<string, number>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border py-1.5 text-sm last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium">{value ?? '—'}</dd>
    </div>
  );
}

export default function StudentInfoPage() {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const info = useQuery({
    queryKey: ['student-info'],
    queryFn: async () => (await api.get<Info>('/student/info')).data,
  });
  const download = async (fileObjectId: string) => {
    const response = await api.get<{ url: string }>(`/content/files/${fileObjectId}/download`);
    window.open(response.data.url, '_blank', 'noopener');
  };

  return (
    <StudentPage icon={IdCard} title={t('student.infoTitle')} hint={t('student.infoHint')}>
      {info.isLoading ? <Skeleton className="h-64 w-full" /> : null}
      {info.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>{t('student.personal')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row
                  label={t('student.fullName')}
                  value={[
                    info.data.profile.lastName,
                    info.data.profile.firstName,
                    info.data.profile.middleName,
                  ]
                    .filter(Boolean)
                    .join(' ')}
                />
                <Row label="E-mail" value={info.data.profile.email} />
                <Row label={t('student.phone')} value={info.data.profile.phone} />
                <Row
                  label={t('student.birthDate')}
                  value={formatDate(info.data.profile.birthDate, locale)}
                />
                <Row label={t('student.address')} value={info.data.profile.address} />
                <Row
                  label={t('student.since')}
                  value={formatDate(info.data.profile.since, locale)}
                />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('student.academic')}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl>
                <Row label={t('student.group')} value={info.data.group} />
                <Row
                  label={t('student.speciality')}
                  value={
                    info.data.speciality
                      ? `${localize(info.data.speciality.name, locale)} (${info.data.speciality.code})`
                      : null
                  }
                />
                <Row label={t('student.admissionYear')} value={info.data.admissionYear} />
                <Row label={t('student.curriculum')} value={info.data.curriculumCode} />
                <Row
                  label={t('nav.schedule')}
                  value={
                    info.data.currentSemesterNumber
                      ? t('student.semester', { number: info.data.currentSemesterNumber })
                      : null
                  }
                />
                <Row label={t('student.gpa')} value={info.data.gpa ?? null} />
              </dl>
            </CardContent>
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{t('student.documents')}</CardTitle>
            </CardHeader>
            <CardContent>
              {info.data.documents.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('student.noDocuments')}</p>
              ) : (
                <ul className="divide-y divide-border">
                  {info.data.documents.map((doc) => (
                    <li
                      key={doc.id}
                      className="flex items-center justify-between gap-3 py-2 text-sm"
                    >
                      <div>
                        <p className="font-medium">{t(`student.template_${doc.templateKey}`)}</p>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(doc.createdAt, locale)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={doc.status === 'FAILED' ? 'destructive' : 'muted'}>
                          {t(`student.docStatus_${doc.status}`)}
                        </Badge>
                        {doc.fileObjectId ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => download(doc.fileObjectId!)}
                          >
                            <Download className="size-4" aria-hidden="true" />
                            {t('student.download')}
                          </Button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </StudentPage>
  );
}
