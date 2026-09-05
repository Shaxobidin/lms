/**
 * Maqsad: mijoz tomonidagi provayderlar — server holati, mavzu, bildirishnomalar.
 */

'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { Toaster } from 'sonner';
import { useAuthStore } from '@/lib/auth-store';
import { ApiClientError } from '@/lib/api-client';
import { PwaRegister } from './pwa-register';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Past tezlikdagi internetda ortiqcha so'rovlarni kamaytiramiz (RSK-08)
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error) => {
              // Avtorizatsiya va validatsiya xatoliklarida qayta urinish ma'nosiz
              if (error instanceof ApiClientError) {
                if ([400, 401, 403, 404, 422].includes(error.status)) return false;
              }
              return failureCount < 2;
            },
          },
          mutations: { retry: false },
        },
      }),
  );

  const restore = useAuthStore((state) => state.restore);

  useEffect(() => {
    // Sahifa yangilanganda sessiyani refresh cookie orqali tiklaymiz (ADR-005)
    void restore();
  }, [restore]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        {children}
        <PwaRegister />
        <Toaster
          position="top-right"
          richColors
          closeButton
          // Skrin-riderlar uchun bildirishnomalar e'lon qilinadi (NF-05)
          toastOptions={{ className: 'text-sm' }}
        />
      </ThemeProvider>
    </QueryClientProvider>
  );
}
