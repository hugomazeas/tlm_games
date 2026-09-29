// Service worker for the Games Hub PWA.
//
// Beyond satisfying the install criteria it handles Web Push: this shows the
// payload (e.g. a "match started" alert) and tapping it opens its url. No
// offline handling: the only thing cached is the QR scanner's decoder (see
// below); every other request falls straight through to the network.

// The QR scanner's decoder: the barcode-detector module plus the ~1MB zxing
// .wasm it downloads. Both are pinned-version CDN files, so they never change
// under a given URL. Without this, iOS home-screen apps re-fetched them on
// almost every page load and the scanner sat on a black frame for seconds.
// Keep the versions in step with resources/views/components/camera-fab.blade.php.
const DECODER_CACHE = 'qr-decoder-v1';
const DECODER_URL_PATTERN = /\/(barcode-detector@3\.2\.2|zxing-wasm@3\.1\.3)\//;

self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((key) => key.startsWith('qr-decoder-') && key !== DECODER_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    if (request.method !== 'GET' || !DECODER_URL_PATTERN.test(request.url)) {
        // Pass-through. Not responding lets the browser handle it as usual.
        return;
    }

    event.respondWith(
        caches.open(DECODER_CACHE).then((cache) =>
            cache.match(request).then((cached) => {
                if (cached) {
                    return cached;
                }

                return fetch(request).then((response) => {
                    if (response.ok) {
                        cache.put(request, response.clone());
                    }

                    return response;
                });
            })
        )
    );
});

self.addEventListener('push', (event) => {
    let payload = {};

    try {
        payload = event.data ? event.data.json() : {};
    } catch (err) {
        payload = {};
    }

    const title = payload.title || 'Games Hub';
    const options = {
        body: payload.body || '',
        // A repeat push with the same tag replaces the previous banner instead
        // of stacking a second one for the same event.
        tag: payload.tag || 'games-hub',
        renotify: Boolean(payload.tag),
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: payload,
        actions: (payload.actions || []).slice(0, 2),
    };

    // waitUntil keeps the SW alive until the banner is actually on screen;
    // without it the browser may kill the worker first and show nothing.
    event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
    const data = event.notification.data || {};
    event.notification.close();

    event.waitUntil(openUrl(data.url || '/games/ping-pong'));
});

/** Focuses an already-open Games Hub tab when there is one, else opens it. */
function openUrl(url) {
    return self.clients
        .matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
            for (const client of clientList) {
                if ('focus' in client && 'navigate' in client) {
                    return client.focus().then(() => client.navigate(url));
                }
            }

            return self.clients.openWindow(url);
        })
        .catch(() => self.clients.openWindow(url));
}
