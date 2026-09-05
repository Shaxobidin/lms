/**
 * Maqsad: kurs yaratish formasi (F-04).
 *
 * Validatsiya `@lms/shared` dagi zod sxemasi bilan — backend bilan aynan
 * bir xil qoidalar (ADR-011). Ko'p tilli maydonlar 4 tilda to'ldiriladi (F-18).
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { createCourseSchema, LOCALES, type CreateCourseInput } from '@lms/shared';
import { api, ApiClientError } from '@/lib/api-client';
import { localize } from '@/lib/utils';
import { useRouter, Link, type AppLocale } from '@/i18n/routing';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  FieldError,
  Input,
  Label,
  Textarea,
} from '@/components/ui/primitives';

interface DepartmentOption {
  id: string;
  code: string;
  name: unknown;
}

interface SemesterOption {
  id: string;
  number: number;
  academicYear: { name: string };
}

export default function NewCoursePage() {
  const t = useTranslations();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const departments = useQuery({
    queryKey: ['org', 'departments'],
    queryFn: async () => (await api.get<DepartmentOption[]>('/org/departments')).data,
  });

  const semester = useQuery({
    queryKey: ['org', 'current-semester'],
    queryFn: async () => (await api.get<SemesterOption | null>('/org/current-semester')).data,
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CreateCourseInput>({
    resolver: zodResolver(createCourseSchema),
    defaultValues: {
      code: '',
      title: {},
      description: {},
      type: 'ACADEMIC',
      deliveryMode: 'BLENDED',
      isPaid: false,
      priceUzs: 0,
      enrollmentLimit: 0,
      academicHours: 0,
      departmentId: '',
    },
  });

  const create = useMutation({
    mutationFn: async (input: CreateCourseInput) => api.post<{ id: string }>('/courses', input),
    onSuccess: ({ data }) => {
      toast.success(t('common.saved'));
      router.push(`/courses/${data.id}` as '/courses');
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiClientError ? t(error.translationKey) : t('errors.internal'),
      );
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    create.mutate({
      ...values,
      ...(semester.data?.id ? { semesterId: semester.data.id } : {}),
    });
  });

  const title = watch('title') as Record<string, string>;

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('courses.createCourse')}</h1>
          <p className="text-sm text-muted-foreground">{t('courses.emptyDescription')}</p>
        </div>
        <Button variant="ghost" asChild>
          <Link href="/courses">{t('common.back')}</Link>
        </Button>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t('courses.courseTitle')}</CardTitle>
          <CardDescription>{t('validation.at_least_one_locale_required')}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {formError ? <Alert variant="destructive">{formError}</Alert> : null}

            <div className="space-y-1.5">
              <Label htmlFor="code" required>
                {t('courses.courseCode')}
              </Label>
              <Input
                id="code"
                placeholder="INF201-2026-1"
                aria-invalid={Boolean(errors.code)}
                {...register('code')}
              />
              <FieldError message={errors.code ? t('validation.code_format') : undefined} />
            </div>

            {/* Ko'p tilli sarlavha */}
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('courses.courseTitle')}</legend>
              {LOCALES.map((locale) => (
                <div key={locale} className="flex items-center gap-2">
                  <span className="w-16 shrink-0 text-xs uppercase text-muted-foreground">
                    {locale}
                  </span>
                  <Input
                    value={title?.[locale] ?? ''}
                    onChange={(event) =>
                      setValue(
                        'title',
                        { ...title, [locale]: event.target.value },
                        { shouldValidate: true },
                      )
                    }
                    aria-label={`${t('courses.courseTitle')} (${locale})`}
                  />
                </div>
              ))}
              <FieldError
                message={errors.title ? t('validation.at_least_one_locale_required') : undefined}
              />
            </fieldset>

            <div className="space-y-1.5">
              <Label htmlFor="description">{t('common.description')}</Label>
              <Textarea
                id="description"
                rows={3}
                onChange={(event) => setValue('description', { 'uz-Latn': event.target.value })}
                aria-label={t('common.description')}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="departmentId" required>
                  {t('org.department')}
                </Label>
                <select
                  id="departmentId"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  aria-invalid={Boolean(errors.departmentId)}
                  {...register('departmentId')}
                >
                  <option value="">—</option>
                  {(departments.data ?? []).map((department) => (
                    <option key={department.id} value={department.id}>
                      {localize(department.name, 'uz-Latn' as AppLocale)}
                    </option>
                  ))}
                </select>
                <FieldError message={errors.departmentId ? t('validation.required') : undefined} />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deliveryMode">{t('courses.deliveryMode')}</Label>
                <select
                  id="deliveryMode"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register('deliveryMode')}
                >
                  <option value="BLENDED">{t('courses.BLENDED')}</option>
                  <option value="ONLINE">{t('courses.ONLINE')}</option>
                  <option value="CLASSIC">{t('courses.CLASSIC')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="type">{t('courses.type')}</Label>
                <select
                  id="type"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register('type')}
                >
                  <option value="ACADEMIC">{t('courses.ACADEMIC')}</option>
                  <option value="PROFESSIONAL_DEV">{t('courses.PROFESSIONAL_DEV')}</option>
                  <option value="OPEN">{t('courses.OPEN')}</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="academicHours">{t('courses.academicHours')}</Label>
                <Input id="academicHours" type="number" min={0} {...register('academicHours')} />
              </div>
            </div>

            <div className="flex gap-2">
              <Button type="submit" loading={isSubmitting || create.isPending}>
                <Plus className="size-4" aria-hidden="true" />
                {t('common.create')}
              </Button>
              <Button type="button" variant="ghost" asChild>
                <Link href="/courses">{t('common.cancel')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
