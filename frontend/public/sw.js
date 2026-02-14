const CACHE_NAME = 'trafikinfo-cache-v26.2.76';
const ASSETS = [
    '/',
    '/index.html',
    '/icon-192.png',
    '/icon-512.png',
    '/notification-icon.png',
    '/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Network first for HTML, assets and manifest to avoid stale/auth issues
    // EXPLICITLY ignore /api/ to ensure no caching for live data/SSE
    if (event.request.mode === 'navigate' ||
        event.request.url.includes('/assets/') ||
        event.request.url.includes('manifest.json') ||
        event.request.url.includes('/api/')) {
        event.respondWith(
            fetch(event.request)
                .catch(() => caches.match(event.request))
        );
        return;
    }

    // Cache first for other assets (logo, etc)
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});

self.addEventListener('push', (event) => {
    const promise = (async () => {
        try {
            const data = event.data.json();
            const title = data.title || 'Trafikinfo Flux';
            const options = {
                body: data.message,
                icon: data.icon || '/icon-192.png',
                badge: '/notification-icon.png',
                image: data.image, // Big picture
                data: {
                    url: data.url
                },
                tag: data.url,
                renotify: true
            };

            await self.registration.showNotification(title, options);
        } catch (e) {
            console.error('Push data error:', e);
            // Fallback notification to satisfy "user visible only" requirement
            // and ensure process isn't killed prematurely if data is malformed
            await self.registration.showNotification('Trafikinfo Flux', {
                body: 'Ny trafikuppdatering tillgänglig',
                icon: '/icon-192.png',
                badge: '/notification-icon.png'
            });
        }
    })();

    event.waitUntil(promise);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data.url || '/';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url === urlToOpen && 'focus' in client) {
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
