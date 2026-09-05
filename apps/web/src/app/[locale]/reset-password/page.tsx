/**
 * Maqsad: emaildagi havola orqali yangi parol o'rnatish sahifasi (F-01).
 *
 * Token URL query'dan olinadi (`?token=...`) — backend uni bir marta ishlatadi
 * va muddati o'tgan bo'lsa xatolik kalitini qaytaradi (P7: matn faqat shu yerda).
 */

'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, GraduationCap, KeyRound } from 'lucide-react';
import { resetPasswordSchema, type ResetPasswordInput } from '@lms/shared';
import { Link, useRouter } from '@/i18n/routing';
import { api, ApiClientError } from '@/lib/api-client';
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
  Skeleton,
} from '@/components/ui/primitives';

export default function ResetPasswordPage() {
  const t = useTranslations();

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10"
    >
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="flex size-11 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <GraduationCap className="size-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-semibold">{t('app.institution')}</h1>
            <p className="text-sm text-muted-foreground">{t('app.tagline')}</p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('auth.resetPassword')}</CardTitle>
            <CardDescription>{t('auth.resetPasswordSubtitle')}</CardDescription>
          </CardHeader>

          <CardContent>
            {/* `useSearchParams` Suspense chegarasini talab qiladi (Next.js 15) */}
            <Suspense fallback={<Skeleton className="h-40 w-full" />}>
              <ResetPasswordForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

function ResetPasswordForm() {
  const t = useTranslations();
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';

  const [formError, setFormError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: '', passwordConfirm: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await api.post('/auth/reset-password', values);
      setDone(true);
      // Foydalanuvchi xabarni o'qishga ulgursin, so'ng kirish sahifasiga o'tkaziladi
      setTimeout(() => router.replace('/login'), 2500);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(t(error.translationKey));
        return;
      }
      setFormError(t('errors.internal'));
    }
  });

  if (!token) {
    return (
      <div className="space-y-4">
        <Alert variant="destructive">{t('auth.resetTokenMissing')}</Alert>
        <Button asChild variant="outline" className="w-full">
          <Link href="/forgot-password">
            <ArrowLeft className="size-4" aria-hidden="true" />
            {t('auth.forgotPassword')}
          </Link>
        </Button>
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success">{t('auth.resetPasswordDone')}</Alert>
        <Button asChild className="w-full">
          <Link href="/login">{t('auth.signIn')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      {formError ? <Alert variant="destructive">{formError}</Alert> : null}

      <input type="hidden" {...register('token')} />

      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          {t('auth.newPassword')}
        </Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.password)}
          aria-describedby={errors.password ? 'password-error' : 'password-hint'}
          {...register('password')}
        />
        <p id="password-hint" className="text-xs text-muted-foreground">
          {t('auth.passwordPolicyHint')}
        </p>
        <FieldError
          id="password-error"
          message={
            errors.password ? t(`validation.${normalizeKey(errors.password.message)}`) : undefined
          }
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="passwordConfirm" required>
          {t('auth.passwordConfirm')}
        </Label>
        <Input
          id="passwordConfirm"
          type="password"
          autoComplete="new-password"
          aria-invalid={Boolean(errors.passwordConfirm)}
          aria-describedby={errors.passwordConfirm ? 'password-confirm-error' : undefined}
          {...register('passwordConfirm')}
        />
        <FieldError
          id="password-confirm-error"
          message={
            errors.passwordConfirm
              ? t(`validation.${normalizeKey(errors.passwordConfirm.message)}`)
              : undefined
          }
        />
      </div>

      <Button type="submit" className="w-full" loading={isSubmitting}>
        <KeyRound className="size-4" aria-hidden="true" />
        {t('auth.resetPassword')}
      </Button>

      <Link href="/login" className="block text-center text-sm text-primary hover:underline">
        {t('auth.backToSignIn')}
      </Link>
    </form>
  );
}

/** zod xabari `validation.xxx` ko'rinishida keladi — i18n uchun prefiks olib tashlanadi. */
function normalizeKey(message: string | undefined): string {
  if (!message) return 'required';
  return message.startsWith('validation.') ? message.slice('validation.'.length) : 'required';
}
