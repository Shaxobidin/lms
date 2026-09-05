/**
 * Maqsad: parolni tiklash havolasini so'rash sahifasi (F-01).
 *
 * Xavfsizlik: server email mavjudligini OSHKOR QILMAYDI — javob har doim bir xil.
 * Shu sababli muvaffaqiyat xabari so'rov natijasiga bog'liq emas.
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, GraduationCap, Mail } from 'lucide-react';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@lms/shared';
import { Link } from '@/i18n/routing';
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
} from '@/components/ui/primitives';

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const [formError, setFormError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      await api.post('/auth/forgot-password', values);
      setSent(true);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFormError(t(error.translationKey));
        return;
      }
      setFormError(t('errors.internal'));
    }
  });

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
            <CardTitle>{t('auth.forgotPassword')}</CardTitle>
            <CardDescription>{t('auth.forgotPasswordSubtitle')}</CardDescription>
          </CardHeader>

          <CardContent>
            {sent ? (
              <div className="space-y-4">
                <Alert variant="success">{t('auth.resetPasswordSent')}</Alert>
                <Button asChild variant="outline" className="w-full">
                  <Link href="/login">
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    {t('auth.backToSignIn')}
                  </Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4" noValidate>
                {formError ? <Alert variant="destructive">{formError}</Alert> : null}

                <div className="space-y-1.5">
                  <Label htmlFor="email" required>
                    {t('auth.email')}
                  </Label>
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="ism@qdu.uz"
                    aria-invalid={Boolean(errors.email)}
                    aria-describedby={errors.email ? 'email-error' : undefined}
                    {...register('email')}
                  />
                  <FieldError
                    id="email-error"
                    message={
                      errors.email
                        ? t(`validation.${normalizeKey(errors.email.message)}`)
                        : undefined
                    }
                  />
                </div>

                <Button type="submit" className="w-full" loading={isSubmitting}>
                  <Mail className="size-4" aria-hidden="true" />
                  {t('auth.sendResetLink')}
                </Button>

                <Link
                  href="/login"
                  className="block text-center text-sm text-primary hover:underline"
                >
                  {t('auth.backToSignIn')}
                </Link>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

/** zod xabari `validation.xxx` ko'rinishida keladi — i18n uchun prefiks olib tashlanadi. */
function normalizeKey(message: string | undefined): string {
  if (!message) return 'required';
  return message.startsWith('validation.') ? message.slice('validation.'.length) : 'required';
}
