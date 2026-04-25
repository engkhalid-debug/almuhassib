// ═══════════════════════════════════════════════
//  Service Worker — المحاسب PWA
//  يتيح العمل بدون إنترنت (Offline)
// ═══════════════════════════════════════════════

const CACHE_NAME    = 'almuhassib-v1.0';
const OFFLINE_PAGE  = './index.html';

// الملفات التي تُحفظ فوراً عند التثبيت
const PRECACHE_URLS = [
  './index.html',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Tajawal:wght@300;400;500;700;800;900&display=swap',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// ── Install: حفظ الملفات في الكاش ──────────────
self.addEventListener('install', event => {
  console.log('[SW] Installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Caching core files');
        // نحفظ index.html بكل الأحوال، والباقي نحاول
        return cache.add(OFFLINE_PAGE).then(() =>
          Promise.allSettled(
            PRECACHE_URLS.slice(1).map(url => cache.add(url))
          )
        );
      })
      .then(() => self.skipWaiting())
  );
});

// ── Activate: حذف الكاش القديم ──────────────────
self.addEventListener('activate', event => {
  console.log('[SW] Activating...');
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: استراتيجية Cache First ───────────────
self.addEventListener('fetch', event => {
  // تجاهل طلبات POST وغير HTTP
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith('http')) return;

  // طلبات Google Apps Script — دائماً من الشبكة
  if (event.request.url.includes('script.google.com') ||
      event.request.url.includes('googleapis.com/macros')) {
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({
          success: false,
          message: 'لا يوجد اتصال بالإنترنت. التطبيق يعمل في وضع غير متصل.'
        }), { headers: { 'Content-Type': 'application/json' } })
      )
    );
    return;
  }

  // بقية الطلبات: كاش أولاً، ثم شبكة
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request)
        .then(response => {
          // لا نخزّن إلا الاستجابات الصحيحة
          if (!response || response.status !== 200 || response.type === 'opaque') {
            return response;
          }
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseClone);
          });
          return response;
        })
        .catch(() => {
          // إذا فشل كل شيء — أرجع صفحة التطبيق
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match(OFFLINE_PAGE);
          }
        });
    })
  );
});

// ── Background Sync (للمزامنة عند عودة الإنترنت) ─
self.addEventListener('sync', event => {
  if (event.tag === 'sync-transactions') {
    console.log('[SW] Background sync triggered');
    // يمكن إضافة منطق المزامنة هنا لاحقاً
  }
});

// ── Push Notifications ───────────────────────────
self.addEventListener('push', event => {
  const data = event.data?.json() || {};
  const options = {
    body: data.body || 'إشعار من المحاسب',
    icon: './icons/icon-192.png',
    badge: './icons/icon-96.png',
    dir: 'rtl',
    lang: 'ar',
    vibrate: [200, 100, 200],
    data: { url: data.url || './' },
    actions: [
      { action: 'open', title: 'فتح التطبيق' },
      { action: 'close', title: 'إغلاق' }
    ]
  };
  event.waitUntil(
    self.registration.showNotification(data.title || 'المحاسب', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'open' || !event.action) {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || './')
    );
  }
});
