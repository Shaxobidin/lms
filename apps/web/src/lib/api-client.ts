/**
 * Maqsad: API bilan ishlash uchun yagona mijoz (ADR-005, ADR-011).
 *
 * Xususiyatlari:
 *  - access token faqat XOTIRADA saqlanadi (A-23) — XSS orqali o'g'irlanmaydi;
 *  - 401 kelganda avtomatik refresh (bir marta, parallel so'rovlar navbatda kutadi);
 *  - xatoliklar `ApiError` sifatida `messageKey` bilan qaytadi — UI i18n katalogidan
 *    matn oladi (P7).
 */

import type { ApiEnvelope, ApiError, ApiMeta } from '@lms/shared';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api/v1';

/** Server komponentlaridan chaqirilganda ichki manzil ishlatiladi. */
const INTERNAL_API_URL = process.env.INTERNAL_API_URL ?? API_URL;

export class ApiClientError extends Error {
  readonly code: string;
  readonly messageKey: string;
  readonly status: number;
  readonly details?: ApiError['details'];
  readonly traceId?: string;
  readonly retryAfterSeconds?: number;

  constructor(status: number, error: ApiError) {
    super(error.messageKey);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = error.code;
    this.messageKey = error.messageKey;
    this.details = error.details;
    this.traceId = error.traceId;
    this.retryAfterSeconds = error.retryAfterSeconds;
  }

  /** UI uchun i18n kaliti (`errors.*`). */
  get translationKey(): string {
    return this.messageKey.startsWith('errors.')
      ? this.messageKey
      : `errors.${this.code.toLowerCase()}`;
  }
}

// --- Token boshqaruvi -------------------------------------------------------

let accessToken: string | null = null;
let refreshPromise: Promise<boolean> | null = null;
const listeners = new Set<(token: string | null) => void>();

export function setAccessToken(token: string | null): void {
  accessToken = token;
  for (const listener of listeners) listener(token);
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function onTokenChange(listener: (token: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Tokenni yangilash. Bir vaqtda bir nechta 401 kelsa ham refresh
 * FAQAT BIR MARTA bajariladi — qolganlari shu va'daga ulanadi.
 */
async function refreshAccessToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        setAccessToken(null);
        return false;
      }

      const payload = (await response.json()) as ApiEnvelope<{
        tokens: { accessToken: string };
      }>;

      if (payload.success && payload.data) {
        setAccessToken(payload.data.tokens.accessToken);
        return true;
      }

      setAccessToken(null);
      return false;
    } catch {
      setAccessToken(null);
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

// --- So'rov yuborish --------------------------------------------------------

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  /** Server komponentidan chaqirilganda token qo'lda uzatiladi. */
  token?: string;
  /** POST so'rovlarini takrorlanishdan himoya qilish (§8). */
  idempotencyKey?: string;
  /** 401 da avtomatik yangilashni o'chirish (login endpointi uchun). */
  skipRefresh?: boolean;
  /** Server tomonida ishlatiladigan bazaviy manzil. */
  serverSide?: boolean;
}

export interface ApiResult<T> {
  data: T;
  meta: ApiMeta | null;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResult<T>> {
  const { body, token, idempotencyKey, skipRefresh, serverSide, ...init } = options;
  const base = serverSide ? INTERNAL_API_URL : API_URL;
  const bearer = token ?? accessToken;

  const send = async (): Promise<Response> =>
    fetch(`${base}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        ...(init.headers ?? {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

  let response: Response;
  try {
    response = await send();
  } catch {
    throw new ApiClientError(0, {
      code: 'DEPENDENCY_UNAVAILABLE',
      messageKey: 'errors.network',
      message: {},
    });
  }

  // Token muddati o'tgan bo'lsa — yangilab, bir marta qayta urinamiz
  if (response.status === 401 && !skipRefresh && !token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await fetch(`${base}${path}`, {
        ...init,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
          ...(init.headers ?? {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    }
  }

  // 204 — tana yo'q
  if (response.status === 204) {
    return { data: null as T, meta: null };
  }

  let payload: ApiEnvelope<T> | null = null;
  try {
    payload = (await response.json()) as ApiEnvelope<T>;
  } catch {
    payload = null;
  }

  if (!response.ok || !payload?.success) {
    throw new ApiClientError(
      response.status,
      payload?.error ?? {
        code: 'INTERNAL_ERROR',
        messageKey: 'errors.internal',
        message: {},
      },
    );
  }

  return { data: payload.data as T, meta: payload.meta };
}

/** Qulaylik uchun qisqa yordamchilar. */
export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'GET' }),

  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'POST', body }),

  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PATCH', body }),

  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'PUT', body }),

  delete: <T>(path: string, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: 'DELETE' }),
};

export { API_URL };
