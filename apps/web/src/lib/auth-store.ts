/**
 * Maqsad: autentifikatsiya holati (Zustand) — ADR-013.
 *
 * Client state faqat UI holati uchun ishlatiladi; server ma'lumotlari
 * TanStack Query orqali olinadi. Foydalanuvchi profili shu ikkovining
 * chegarasida turadi, shuning uchun u shu yerda saqlanadi va sahifa
 * yangilanganda `/auth/refresh` orqali qayta tiklanadi.
 */

import { create } from 'zustand';
import type { AuthenticatedUser, PermissionKey } from '@lms/shared';
import { hasPermission } from '@lms/shared';
import { api, setAccessToken } from './api-client';

interface AuthState {
  user: AuthenticatedUser | null;
  status: 'idle' | 'loading' | 'authenticated' | 'anonymous';

  signIn: (input: {
    login: string;
    password: string;
    totpCode?: string;
    rememberMe?: boolean;
  }) => Promise<AuthenticatedUser>;
  signOut: () => Promise<void>;
  /** Sahifa yuklanganda sessiyani tiklash. */
  restore: () => Promise<void>;
  setUser: (user: AuthenticatedUser | null) => void;

  /** UI elementlarini yashirish uchun — backenddagi bilan bir xil mantiq. */
  can: (permission: PermissionKey) => boolean;
  hasRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  status: 'idle',

  async signIn(input) {
    set({ status: 'loading' });

    try {
      const { data } = await api.post<{
        tokens: { accessToken: string };
        user: AuthenticatedUser;
      }>('/auth/login', input, { skipRefresh: true });

      setAccessToken(data.tokens.accessToken);
      set({ user: data.user, status: 'authenticated' });
      return data.user;
    } catch (error) {
      set({ status: 'anonymous' });
      throw error;
    }
  },

  async signOut() {
    try {
      await api.post('/auth/logout');
    } finally {
      // Server javob bermasa ham mahalliy holat tozalanadi
      clearSessionHint();
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
    }
  },

  async restore() {
    if (get().status === 'loading') return;

    // Sessiya-belgisi yo'q bo'lsa server bilan gaplashish shart emas: anonim
    // foydalanuvchida har sahifa yuklanishida keraksiz 401 so'rov ketmaydi.
    if (!hasSessionHint()) {
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
      return;
    }

    set({ status: 'loading' });

    try {
      const { data } = await api.post<{
        tokens: { accessToken: string };
        user: AuthenticatedUser;
      }>('/auth/refresh', {}, { skipRefresh: true });

      setAccessToken(data.tokens.accessToken);
      set({ user: data.user, status: 'authenticated' });
    } catch {
      // Belgi bor edi, lekin sessiya yaroqsiz — belgini olib tashlaymiz,
      // aks holda har yuklanishda bitta ortiqcha so'rov takrorlanaveradi.
      clearSessionHint();
      setAccessToken(null);
      set({ user: null, status: 'anonymous' });
    }
  },

  setUser(user) {
    set({ user, status: user ? 'authenticated' : 'anonymous' });
  },

  can(permission) {
    const user = get().user;
    if (!user) return false;
    return hasPermission(user.permissions as PermissionKey[], permission);
  },

  hasRole(role) {
    return get().user?.roles.includes(role) ?? false;
  },
}));

/** Rolga qarab boshlang'ich sahifani aniqlaydi. */
export function defaultRouteForRoles(roles: readonly string[]): string {
  if (roles.includes('STUDENT')) return '/my-courses';
  if (roles.includes('TEACHER') || roles.includes('EXTERNAL_EXPERT')) return '/courses';
  if (roles.includes('TUTOR')) return '/attendance';
  if (roles.includes('METHODIST')) return '/curriculum';
  if (roles.includes('DEPARTMENT_HEAD') || roles.includes('DEANERY')) return '/analytics';
  if (roles.includes('SUPER_ADMIN') || roles.includes('INSTITUTION_ADMIN')) return '/admin/users';
  return '/dashboard';
}

/**
 * Sessiya-belgisi cookie (`lms_session`) sirni saqlamaydi — u faqat "refresh
 * cookie mavjud bo'lishi mumkin" degan ishora. Haqiqiy token `httpOnly` bo'lgani
 * uchun JS uni o'qiy olmaydi.
 */
function hasSessionHint(): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split(';').some((part) => part.trim().startsWith('lms_session='));
}

/** Sessiya-belgisini o'chiradi (chiqishda yoki sessiya yaroqsiz bo'lganda). */
function clearSessionHint(): void {
  if (typeof document === 'undefined') return;
  document.cookie = 'lms_session=; Max-Age=0; path=/';
}
