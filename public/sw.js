// Minimal service worker — exists only to satisfy PWA install criteria.
// No caching, no offline handling. See design spec for rationale.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through. Letting fetch fall through to network without responding
    // keeps the SW from interfering with normal request handling.
});
