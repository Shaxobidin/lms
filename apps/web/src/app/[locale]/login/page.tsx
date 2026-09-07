/**
 * Maqsad: tizimga kirish sahifasi (F-01).
 *
 * Xususiyatlari: inline validatsiya (zod + react-hook-form, ADR-011),
 * 2FA bosqichi, xatoliklar i18n kaliti bo'yicha ko'rsatiladi (P7).
 */

'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { GraduationCap, Lock } from 'lucide-react';
import { loginSchema, type LoginInput } from '@lms/shared';
import { useRouter, Link } from '@/i18n/routing';
import { defaultRouteForRoles, useAuthStore } from '@/lib/auth-store';
import { usePublicSettings } from '@/lib/public-settings';
import { ApiClientError } from '@/lib/api-client';
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

export default function LoginPage() {
  const t = useTranslations();
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);

  const [formError, setFormError] = useState<string | null>(null);
  const [needsTwoFactor, setNeedsTwoFactor] = useState(false);

  const siteSettings = usePublicSettings();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { login: '', password: '', rememberMe: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);

    try {
      const user = await signIn(values);
      // Sayt boshqaruvi → Bosh sahifa: kirgan foydalanuvchi uchun standart sahifa (F-17)
      const preferred = siteSettings.get<string>('frontpage.loggedInDefault');
      const target =
        preferred === 'my-courses' || preferred === 'courses'
          ? `/${preferred}`
          : defaultRouteForRoles(user.roles);
      router.replace(target as '/dashboard');
    } catch (error) {
      if (error instanceof ApiClientError) {
        if (error.code === 'TWO_FACTOR_REQUIRED') {
          setNeedsTwoFactor(true);
          return;
        }
        // Backend faqat kalit qaytaradi — matn shu yerda tanlanadi (P7)
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
            <CardTitle>{t('auth.signInTitle')}</CardTitle>
            <CardDescription>{t('auth.signInSubtitle')}</CardDescription>
          </CardHeader>

          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {formError ? <Alert variant="destructive">{formError}</Alert> : null}

              <div className="space-y-1.5">
                <Label htmlFor="login" required>
                  {t('auth.login')}
                </Label>
                <Input
                  id="login"
                  autoComplete="username"
                  placeholder={t('auth.loginPlaceholder')}
                  aria-invalid={Boolean(errors.login)}
                  aria-describedby={errors.login ? 'login-error' : undefined}
                  {...register('login')}
                />
                <FieldError
                  id="login-error"
                  message={
                    errors.login ? t(`validation.${normalizeKey(errors.login.message)}`) : undefined
                  }
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="password" required>
                  {t('auth.password')}
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  {...register('password')}
                />
                <FieldError
                  id="password-error"
                  message={
                    errors.password
                      ? t(`validation.${normalizeKey(errors.password.message)}`)
                      : undefined
                  }
                />
              </div>

              {needsTwoFactor ? (
                <div className="space-y-1.5 rounded-md border border-border bg-muted/40 p-3">
                  <Label htmlFor="totpCode" required>
                    {t('auth.twoFactorCode')}
                  </Label>
                  <Input
                    id="totpCode"
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    placeholder="000000"
                    {...register('totpCode')}
                  />
                  <p className="text-xs text-muted-foreground">{t('auth.twoFactorHint')}</p>
                </div>
              ) : null}

              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    className="size-3.5 rounded border-input"
                    {...register('rememberMe')}
                  />
                  {t('auth.rememberMe')}
                </label>

                <Link href="/forgot-password" className="text-sm text-primary hover:underline">
                  {t('auth.forgotPassword')}
                </Link>
              </div>

              <Button type="submit" className="w-full" loading={isSubmitting}>
                <Lock className="size-4" aria-hidden="true" />
                {t('auth.signIn')}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">{t('auth.demoHint')}</p>
      </div>
    </main>
  );
}

/**
 * zod xabari `validation.xxx` ko'rinishida keladi — i18n uchun prefiksni olib tashlaymiz.
 * Kalit topilmasa `required` ishlatiladi.
 */
function normalizeKey(message: string | undefined): string {
  if (!message) return 'required';
  return message.startsWith('validation.') ? message.slice('validation.'.length) : 'required';
}
