/**
 * Maqsad: tashkiliy tuzilma daraxti (F-02).
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { Building2, ChevronRight, Users } from 'lucide-react';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import {
  Badge,
  Card,
  CardContent,
  EmptyState,
  ErrorState,
  Skeleton,
} from '@/components/ui/primitives';

interface TreeGroup {
  id: string;
  name: string;
  admissionYear: number;
  educationForm: string;
}

interface TreeSpeciality {
  id: string;
  code: string;
  label: string;
  level: string;
  groups: TreeGroup[];
}

interface TreeDepartment {
  id: string;
  code: string;
  label: string;
  specialities: TreeSpeciality[];
}

interface TreeFaculty {
  id: string;
  code: string;
  label: string;
  departments: TreeDepartment[];
}

export default function StructurePage() {
  const t = useTranslations();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['org', 'tree'],
    queryFn: async () => (await api.get<TreeFaculty[]>('/org/tree')).data,
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('nav.structure')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('org.faculties')} → {t('org.departments')} → {t('org.specialities')} →{' '}
          {t('org.groups')}
        </p>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24" />
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
          icon={<Building2 className="size-8" />}
          title={t('org.emptyTitle')}
          description={t('org.emptyDescription')}
        />
      ) : (
        <div className="space-y-2">
          {data?.map((faculty) => (
            <FacultyNode key={faculty.id} faculty={faculty} />
          ))}
        </div>
      )}
    </div>
  );
}

function FacultyNode({ faculty }: { faculty: TreeFaculty }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);

  const groupCount = faculty.departments
    .flatMap((department) => department.specialities)
    .flatMap((speciality) => speciality.groups).length;

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 p-4 text-left"
      >
        <ChevronRight
          className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-90')}
          aria-hidden="true"
        />
        <Building2 className="size-4 text-primary" aria-hidden="true" />
        <span className="flex-1 font-medium">{faculty.label}</span>
        <Badge variant="outline">{faculty.code}</Badge>
        <Badge variant="muted">
          {faculty.departments.length} {t('org.departments').toLowerCase()}
        </Badge>
        <Badge variant="muted">
          {groupCount} {t('org.groups').toLowerCase()}
        </Badge>
      </button>

      {open ? (
        <CardContent className="space-y-3">
          {faculty.departments.map((department) => (
            <div key={department.id} className="rounded-md border border-border p-3">
              <p className="mb-2 text-sm font-medium">{department.label}</p>

              <div className="space-y-2 pl-3">
                {department.specialities.map((speciality) => (
                  <div key={speciality.id}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">{speciality.label}</span>
                      <Badge variant="outline">{speciality.code}</Badge>
                      <Badge variant="muted">{t(`org.${speciality.level}`)}</Badge>
                    </div>

                    {speciality.groups.length > 0 ? (
                      <div className="mt-1 flex flex-wrap gap-1 pl-3">
                        {speciality.groups.map((group) => (
                          <Badge key={group.id} variant="secondary">
                            <Users className="mr-1 size-3" aria-hidden="true" />
                            {group.name}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      ) : null}
    </Card>
  );
}
