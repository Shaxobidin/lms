/**
 * Maqsad: sayt boshqaruvidagi OCHIQ sozlamalar (`isPublic`) — brend, modul
 * kalitlari, kirishdan keyingi sahifa, mobil ko'rinish (F-17).
 *
 * Autentifikatsiyasiz `GET /admin/settings/public` dan olinadi, TanStack Query
 * bilan 60 s keshlanadi. Qiymat bo'lmasa `@lms/shared` reestridagi standart
 * qaytadi — sahifa API'siz ham to'g'ri chiziladi.
 */

'use client';

import { useQuery } from '@tanstack/react-query';
import { SITE_SETTING_DEFAULTS } from '@lms/shared';
import { api } from '@/lib/api-client';

export type PublicSettings = Record<string, unknown>;

export function usePublicSettings() {
  const query = useQuery({
    queryKey: ['public-settings'],
    queryFn: async () => (await api.get<PublicSettings>('/admin/settings/public')).data,
    staleTime: 60_000,
    retry: 1,
  });

  const get = <T>(key: string): T => {
    const value = query.data?.[key];
    return (value === undefined ? SITE_SETTING_DEFAULTS[key] : value) as T;
  };

  return {
    ...query,
    get,
    /** Modul/kanal kaliti — sozlama yo'q bo'lsa `true` (hech narsa yashirilmaydi). */
    enabled: (key: string) => {
      const value = get<unknown>(key);
      return typeof value === 'boolean' ? value : true;
    },
  };
}
