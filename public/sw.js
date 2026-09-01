// Service worker for the Games Hub PWA.
//
// Beyond satisfying the install criteria it handles Web Push: the hourly ping
// pong matchmaker sends a payload, this shows it, and tapping an action either
// opens the lobby or declines the challenge. No caching and no offline
// handling — fetch stays a pass-through so the SW never interferes with
// ordinary requests.

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
        // of stacking a second one for the same challenge.
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

    if (event.action === 'decline') {
        event.waitUntil(respond(data, 'declined'));
        return;
    }

    // Any other tap — the body, or the explicit accept action — counts as
    // accepting, then lands the person in the lobby.
    event.waitUntil(
        respond(data, 'accepted').then(() => openLobby(data.url || '/games/ping-pong'))
    );
});

/**
 * Answers the challenge from the background.
 *
 * There is no CSRF token available here, so the request is authorised by the
 * per-player HMAC that travelled inside the push payload. Failures are
 * swallowed: a lost decline is not worth breaking the tap-to-open flow over.
 */
function respond(data, response) {
    if (!data.respondUrl || !data.playerId || !data.responseToken) {
        return Promise.resolve();
    }

    return fetch(data.respondUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            player_id: data.playerId,
            response: response,
            token: data.responseToken,
        }),
    }).catch(() => undefined);
}

/** Focuses an already-open Games Hub tab when there is one, else opens it. */
function openLobby(url) {
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
