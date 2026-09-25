{{--
    "Notify me when a match starts" for livestream viewers. Spread into a
    component: `...pingPongMatchAlerts()`, then call `initMatchAlerts()` from
    its init. The host component must provide `csrf`. No player is involved:
    the browser opts in on its own.

    Everything is best-effort. A browser without push, a server without VAPID
    keys, or a push service that can't be reached just means no banner — never
    a broken watch page.
--}}
<script>
window.pingPongMatchAlerts = () => ({
    matchAlertsAvailable: false,
    matchAlertsOn: false,
    matchAlertsDismissed: localStorage.getItem('ping_pong_match_alerts_dismissed') === '1',
    matchAlertsBusy: false,
    matchAlertsMessage: '',
    matchAlertsVapidKey: null,

    get showMatchAlertsBanner() {
        return this.matchAlertsAvailable && !this.matchAlertsOn && !this.matchAlertsDismissed;
    },

    async initMatchAlerts() {
        if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
        if (Notification.permission === 'denied') return;

        try {
            const res = await fetch('{{ url('/push/config') }}', { headers: { Accept: 'application/json' } });
            if (!res.ok) return;
            const config = await res.json();
            if (!config.configured || !config.public_key) return;
            this.matchAlertsVapidKey = config.public_key;

            // A browser subscription alone doesn't mean match alerts are on —
            // it may only be registered for challenges at /notifications — so
            // the local flag says which of the two this browser opted into.
            const registration = await navigator.serviceWorker.ready;
            const existing = await registration.pushManager.getSubscription();
            this.matchAlertsOn = Boolean(existing) && localStorage.getItem('ping_pong_match_alerts') === '1';
            this.matchAlertsAvailable = true;
        } catch (err) {
            console.warn('Match alerts unavailable:', err);
        }
    },

    async enableMatchAlerts() {
        if (this.matchAlertsBusy) return;
        this.matchAlertsBusy = true;
        this.matchAlertsMessage = '';

        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                if (permission === 'denied') this.matchAlertsAvailable = false;
                throw new Error('Notifications were not allowed.');
            }

            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription()
                || await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: matchAlertsKeyToBytes(this.matchAlertsVapidKey),
                });

            const payload = subscription.toJSON();
            await this.postMatchAlerts('{{ url('/push/match-starts/subscribe') }}', {
                endpoint: payload.endpoint,
                keys: payload.keys,
            });

            localStorage.setItem('ping_pong_match_alerts', '1');
            this.matchAlertsOn = true;
        } catch (err) {
            this.matchAlertsMessage = err.name === 'AbortError'
                ? "Your browser couldn't reach its push service — try Chrome."
                : (err.message || 'Could not turn on match alerts.');
        } finally {
            this.matchAlertsBusy = false;
        }
    },

    async disableMatchAlerts() {
        if (this.matchAlertsBusy) return;
        this.matchAlertsBusy = true;
        this.matchAlertsMessage = '';

        try {
            const registration = await navigator.serviceWorker.ready;
            const subscription = await registration.pushManager.getSubscription();

            if (subscription) {
                const result = await this.postMatchAlerts('{{ url('/push/match-starts/unsubscribe') }}', {
                    endpoint: subscription.endpoint,
                });

                // Only drop the browser's subscription when nothing else rides
                // on it; a player's challenge pushes share the same endpoint.
                if (result.deleted) await subscription.unsubscribe();
            }

            localStorage.removeItem('ping_pong_match_alerts');
            this.matchAlertsOn = false;
        } catch (err) {
            this.matchAlertsMessage = err.message || 'Could not turn off match alerts.';
        } finally {
            this.matchAlertsBusy = false;
        }
    },

    dismissMatchAlerts() {
        this.matchAlertsDismissed = true;
        localStorage.setItem('ping_pong_match_alerts_dismissed', '1');
    },

    async postMatchAlerts(url, body) {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-CSRF-TOKEN': this.csrf,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) throw new Error('The server rejected that (' + response.status + ').');

        return response.json();
    },
});

/** PushManager wants the URL-safe base64 VAPID key as raw bytes. */
function matchAlertsKeyToBytes(base64String) {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const raw = window.atob((base64String + padding).replace(/-/g, '+').replace(/_/g, '/'));

    return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
</script>
