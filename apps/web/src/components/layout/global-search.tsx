/**
 * Maqsad: global qidiruv (Ctrl+K) — kurslar, foydalanuvchilar va fanlar bo'yicha (§9).
 *
 * Qidiruv kirill va lotin yozuvlarida bir xil ishlaydi: backend so'rovni
 * normallashtiradi (ADR-015), shuning uchun "Математика" ham, "Matematika" ham
 * bir xil natija beradi.
 */

'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { BookOpen, Search, Users, X } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useAuthStore } from '@/lib/auth-store';
import { localize } from '@/lib/utils';
import { Link, type AppLocale } from '@/i18n/routing';
import { Input, Spinner } from '@/components/ui/primitives';

interface CourseHit {
  id: string;
  code: string;
  title: unknown;
}

interface UserHit {
  id: string;
  fullName: string;
  email: string;
}

export function GlobalSearch({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations();
  const locale = useLocale() as AppLocale;
  const can = useAuthStore((state) => state.can);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  // Har bir bosilishda so'rov yubormaymiz — 250 ms kutamiz (NF-01)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const canReadUsers = can('user:read:all') || can('user:read:own_faculty');

  const { data: courses, isFetching: coursesLoading } = useQuery({
    queryKey: ['search', 'courses', debounced],
    queryFn: async () =>
      (await api.get<CourseHit[]>(`/courses?search=${encodeURIComponent(debounced)}&limit=6`)).data,
    enabled: open && debounced.length >= 2,
  });

  const { data: users, isFetching: usersLoading } = useQuery({
    queryKey: ['search', 'users', debounced],
    queryFn: async () =>
      (await api.get<UserHit[]>(`/users?search=${encodeURIComponent(debounced)}&limit=6`)).data,
    enabled: open && debounced.length >= 2 && canReadUsers,
  });

  // Escape bilan yopish
  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onOpenChange]);

  if (!open) return null;

  const loading = coursesLoading || usersLoading;
  const hasResults = (courses?.length ?? 0) > 0 || (users?.length ?? 0) > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={t('common.search')}
      onClick={() => onOpenChange(false)}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-lg border border-border bg-popover shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-border px-3">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('common.search')}
            className="border-0 shadow-none focus-visible:ring-0"
            aria-label={t('common.search')}
          />
          {loading ? <Spinner className="size-4 text-muted-foreground" /> : null}
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label={t('common.close')}
            className="rounded p-1 text-muted-foreground hover:bg-accent"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-96 overflow-y-auto p-2">
          {debounced.length < 2 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t('common.searchPlaceholder')}
            </p>
          ) : !hasResults && !loading ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              {t('common.noResults')}
            </p>
          ) : (
            <>
              {(courses?.length ?? 0) > 0 ? (
                <section aria-label={t('nav.courses')}>
                  <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
                    {t('nav.courses')}
                  </p>
                  <ul>
                    {courses?.map((course) => (
                      <li key={course.id}>
                        <Link
                          href={`/courses/${course.id}` as '/courses'}
                          onClick={() => onOpenChange(false)}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <BookOpen className="size-4 text-muted-foreground" aria-hidden="true" />
                          <span className="truncate">{localize(course.title, locale)}</span>
                          <span className="ml-auto text-xs text-muted-foreground">
                            {course.code}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              {(users?.length ?? 0) > 0 ? (
                <section aria-label={t('nav.users')} className="mt-2">
                  <p className="px-2 py-1 text-xs font-medium uppercase text-muted-foreground">
                    {t('nav.users')}
                  </p>
                  <ul>
                    {users?.map((item) => (
                      <li key={item.id}>
                        <Link
                          href={`/admin/users/${item.id}` as '/admin/users'}
                          onClick={() => onOpenChange(false)}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        >
                          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
                          <span className="truncate">{item.fullName}</span>
                          <span className="ml-auto truncate text-xs text-muted-foreground">
                            {item.email}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
