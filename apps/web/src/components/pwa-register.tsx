/**
 * Maqsad: service worker ni ro'yxatdan o'tkazish (F-16).
 *
 * Faqat ishlab chiqarish qurilmasida yoqiladi: dev rejimida SW kesh
 * o'zgarishlarni ko'rsatmay qolishi mumkin.
 */

'use client';

import { useEffect } from 'react';

export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = async () => {
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      } catch {
        // SW ro'yxatdan o'tmasa ilova baribir ishlaydi — faqat offline rejim yo'q
      }
    };

    // Sahifa to'liq yuklangandan keyin ro'yxatdan o'tkazamiz (LCP ga ta'sir qilmasin)
    if (document.readyState === 'complete') void register();
    else window.addEventListener('load', () => void register(), { once: true });
  }, []);

  return null;
}
