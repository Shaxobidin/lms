/**
 * Maqsad: server tomonida tozalangan dars HTML ini ko'rsatish va ichidagi
 * xususiy fayllarni (`data-file-id`) vaqtinchalik havolaga almashtirish.
 *
 * Kontent fayllari S3 da xususiy — to'g'ridan-to'g'ri URL yo'q. Import (IMS CC)
 * paytida `<img src="/lms-file/<id>" data-file-id="<id>">` yoziladi; bu yerda
 * har bir id uchun `/content/files/:id/download` chaqirilib, `src`/`href`
 * imzolangan havolaga almashtiriladi. Havolalar bitta sahifa ichida keshlanadi.
 */

'use client';

import { useEffect, useRef } from 'react';
import { api } from '@/lib/api-client';

const urlCache = new Map<string, Promise<string | null>>();

export function resolveFileUrl(fileId: string): Promise<string | null> {
  const cached = urlCache.get(fileId);
  if (cached) return cached;
  const promise = api
    .get<{ url: string }>(`/content/files/${fileId}/download`)
    .then((response) => response.data.url)
    .catch(() => null);
  urlCache.set(fileId, promise);
  return promise;
}

export function LessonHtml({ html, className }: { html: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let cancelled = false;

    // Belgi effekt ichida — StrictMode ikkinchi ishga tushirishda tugunlar qayta yechiladi
    const seen = new WeakSet<HTMLElement>();
    const resolveAll = () => {
      // `data-file-id` sanitizatsiyada tushib qolishi mumkin — `/lms-file/<id>` manzil ham tanib olinadi
      const nodes = Array.from(
        root.querySelectorAll<HTMLElement>(
          '[data-file-id], img[src^="/lms-file/"], a[href^="/lms-file/"], source[src^="/lms-file/"]',
        ),
      );
      for (const node of nodes) {
        if (seen.has(node)) continue;
        const attribute = node instanceof HTMLAnchorElement ? 'href' : 'src';
        const fileId =
          node.dataset.fileId ??
          /^\/lms-file\/([0-9a-f-]{36})/i.exec(node.getAttribute(attribute) ?? '')?.[1];
        if (!fileId) continue;
        seen.add(node);
        void resolveFileUrl(fileId).then((url) => {
          if (cancelled || !url) return;
          if (node instanceof HTMLImageElement) node.src = url;
          else if (node instanceof HTMLAnchorElement) {
            node.href = url;
            node.target = '_blank';
            node.rel = 'noopener';
          } else if (node instanceof HTMLSourceElement || node instanceof HTMLMediaElement) {
            node.src = url;
          }
        });
      }
    };

    resolveAll();
    // React `innerHTML` ni qayta o'rnatsa (qayta chizish), yangi tugunlar ham yechiladi
    const observer = new MutationObserver(resolveAll);
    observer.observe(root, { childList: true, subtree: true });

    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [html]);

  // Kontent server tomonida DOMPurify bilan tozalangan (§11)
  return <div ref={ref} className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
