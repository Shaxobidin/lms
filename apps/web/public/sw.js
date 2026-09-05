/**
 * Maqsad: PWA service worker — offline kesh va background sync (F-16, RSK-08).
 *
 * Strategiyalar:
 *  - ilova qobig'i (HTML, statik): stale-while-revalidate;
 *  - API GET so'rovlari: network-first, offline'da keshdan;
 *  - API POST/PUT so'rovlari: offline bo'lsa navbatga qo'yiladi va tarmoq
 *    tiklanganda qayta yuboriladi (talaba javoblari yo'qolmaydi).
 *
 * Muhim: autentifikatsiya va to'lov so'rovlari HECH QACHON keshlanmaydi.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `lms-shell-${CACHE_VERSION}`;
const API_CACHE = `lms-api-${CACHE_VERSION}`;
const QUEUE_DB = 'lms-outbox';

/** Keshlanmaydigan yo'llar — xavfsizlik va to'g'rilik uchun. */
const NEVER_CACHE = ['/auth/', '/payments/', '/attempts/', '/stream'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        cache.addAll(['/manifest.webmanifest', '/icons/icon-192.png']).catch(() => undefined),
      ),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => !key.endsWith(CACHE_VERSION)).map((key) => caches.delete(key)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Boshqa domenlarga tegmaymiz
  if (url.origin !== self.location.origin && !url.pathname.startsWith('/api/')) return;

  if (NEVER_CACHE.some((path) => url.pathname.includes(path))) return;

  if (request.method === 'GET') {
    if (url.pathname.startsWith('/api/')) {
      event.respondWith(networkFirst(request));
    } else {
      event.respondWith(staleWhileRevalidate(request));
    }
    return;
  }

  // Yozish so'rovlari: offline bo'lsa navbatga
  if (['POST', 'PUT', 'PATCH'].includes(request.method) && url.pathname.startsWith('/api/')) {
    event.respondWith(networkWithQueue(request));
  }
});

/** Tarmoq birinchi, xatolikda keshdan. */
async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await caches.match(request);
    if (cached) return cached;
    throw error;
  }
}

/** Keshdan darhol, fonda yangilash. */
async function staleWhileRevalidate(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);

  return cached ?? network;
}

/**
 * Yozish so'rovi: tarmoq bo'lmasa IndexedDB navbatiga qo'yiladi.
 * Bu talabaning test javoblari uzilishda yo'qolmasligini ta'minlaydi.
 */
async function networkWithQueue(request) {
  try {
    return await fetch(request.clone());
  } catch (error) {
    await enqueueRequest(request.clone());
    // Mijozga aniq javob qaytaramiz — jimgina muvaffaqiyat ko'rsatmaymiz
    return new Response(
      JSON.stringify({
        success: false,
        data: null,
        meta: null,
        error: {
          code: 'DEPENDENCY_UNAVAILABLE',
          messageKey: 'errors.network',
          message: {},
        },
      }),
      { status: 503, headers: { 'Content-Type': 'application/json' } },
    );
  }
}

function openQueue() {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(QUEUE_DB, 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore('requests', { keyPath: 'id', autoIncrement: true });
    };
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(open.error);
  });
}

async function enqueueRequest(request) {
  const db = await openQueue();
  const body = await request.text();

  await new Promise((resolve, reject) => {
    const tx = db.transaction('requests', 'readwrite');
    tx.objectStore('requests').add({
      url: request.url,
      method: request.method,
      headers: [...request.headers.entries()],
      body,
      queuedAt: Date.now(),
    });
    tx.oncomplete = () => resolve(undefined);
    tx.onerror = () => reject(tx.error);
  });

  if ('sync' in self.registration) {
    await self.registration.sync.register('lms-outbox-sync').catch(() => undefined);
  }
}

/** Tarmoq tiklanganda navbatdagi so'rovlarni yuborish. */
self.addEventListener('sync', (event) => {
  if (event.tag === 'lms-outbox-sync') {
    event.waitUntil(flushQueue());
  }
});

async function flushQueue() {
  const db = await openQueue();

  const items = await new Promise((resolve, reject) => {
    const tx = db.transaction('requests', 'readonly');
    const req = tx.objectStore('requests').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: item.method,
        headers: new Headers(item.headers),
        body: item.body,
        credentials: 'include',
      });

      if (response.ok || response.status < 500) {
        await new Promise((resolve) => {
          const tx = db.transaction('requests', 'readwrite');
          tx.objectStore('requests').delete(item.id);
          tx.oncomplete = () => resolve(undefined);
        });
      }
    } catch {
      // Tarmoq hali tiklanmagan — keyingi sync da qayta urinamiz
      break;
    }
  }
}

/** Push bildirishnomalar (F-16). */
self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'QDU LMS', body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'QDU LMS', {
      body: payload.body ?? '',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url ?? '/' },
      tag: payload.tag,
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = event.notification.data?.url ?? '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.includes(target));
      if (existing) return existing.focus();
      return self.clients.openWindow(target);
    }),
  );
});
