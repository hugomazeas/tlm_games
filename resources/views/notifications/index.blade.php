@extends('layouts.app')

@section('title', 'Notifications - Games Hub')

@section('content')
    <div class="max-w-lg" x-data="pushSetup()" x-init="init()">
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">Match notifications</h1>
        <p class="text-white/50 text-sm mb-8">
            Every weekday at half past the hour, two people who are in the office get drawn for a game.
            Turn this on to be one of them.
        </p>

        @if(! $pushConfigured)
            <div class="bg-amber-500/20 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-lg text-sm mb-6">
                Push notifications aren't configured on this server yet. An admin needs to run
                <code class="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded">php artisan pingpong:vapid-keys</code>
                and set the result in <code class="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded">.env</code>.
            </div>
        @endif

        <div x-show="!supported" x-cloak
             class="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm mb-6">
            This browser doesn't support push notifications. On iPhone, add Games Hub to your home screen
            first — Safari only allows notifications from an installed app.
        </div>

        <div x-show="denied" x-cloak
             class="bg-red-500/20 border border-red-500/30 text-red-300 px-4 py-3 rounded-lg text-sm mb-6">
            Notifications are blocked for this site. Re-allow them in your browser settings, then reload.
        </div>

        <div x-show="pushServiceBroken" x-cloak
             class="bg-amber-500/20 border border-amber-500/30 text-amber-200 px-4 py-3 rounded-lg text-sm mb-6">
            This browser couldn't reach its own push service, so it can't receive notifications.
            That's a known problem with <strong>Firefox on Android</strong> — open
            <span class="font-mono text-xs bg-black/30 px-1.5 py-0.5 rounded">games.tlmhub.space/notifications</span>
            in Chrome instead and enable it there.
        </div>

        <div class="bg-white/5 border border-white/10 rounded-xl p-5 sm:p-6 space-y-5">
            <div>
                <label for="player" class="block text-sm font-medium text-white/70 mb-2">Who are you?</label>
                <select id="player" x-model="playerId" :disabled="subscribed"
                        class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50">
                    <option value="">Select your name…</option>
                    @foreach($players as $player)
                        <option value="{{ $player->id }}">{{ $player->name }}</option>
                    @endforeach
                </select>
                <p class="text-xs text-white/40 mt-2">
                    Not in the list? <a href="{{ url('/players') }}" class="text-indigo-400 hover:text-indigo-300">Add yourself</a> first.
                </p>
            </div>

            <div class="flex flex-wrap gap-3">
                <button type="button" x-show="!subscribed" @click="enable()"
                        :disabled="!playerId || busy || !supported || denied || !configured"
                        class="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white text-sm font-semibold px-6 py-2 rounded-lg transition">
                    <span x-text="busy ? 'Working…' : 'Enable notifications'"></span>
                </button>

                <button type="button" x-show="subscribed" x-cloak @click="disable()" :disabled="busy"
                        class="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
                    Turn off
                </button>

                <button type="button" x-show="subscribed" x-cloak @click="sendTest()" :disabled="busy"
                        class="bg-white/10 hover:bg-white/20 disabled:opacity-40 text-white text-sm font-medium px-6 py-2 rounded-lg transition">
                    Send a test
                </button>
            </div>

            <p x-show="message" x-cloak x-text="message"
               class="text-sm" :class="error ? 'text-red-300' : 'text-emerald-300'"></p>
        </div>

        <div class="mt-8 text-sm text-white/50 space-y-2">
            <p class="font-semibold text-white/70">You'll only be drawn when all of these are true:</p>
            <ul class="list-disc list-inside space-y-1">
                <li>Your office has matchmaking switched on.</li>
                <li>You booked a desk in Buro for today.</li>
                <li>Your Buro profile carries the <span class="font-mono text-xs bg-white/10 px-1.5 py-0.5 rounded">{{ config('pingpong.matchmaking.opt_in_flag') }}</span> flag.</li>
                <li>You turned notifications on right here.</li>
            </ul>
            <p class="pt-2">At most {{ config('pingpong.matchmaking.max_challenges_per_day') }} challenge per day, and never twice within {{ config('pingpong.matchmaking.player_cooldown_hours') }} hours.</p>
        </div>
    </div>

    <script>
        function pushSetup() {
            return {
                supported: false,
                configured: @json($pushConfigured),
                vapidKey: @json($vapidPublicKey),
                denied: false,
                subscribed: false,
                pushServiceBroken: false,
                busy: false,
                message: '',
                error: false,
                playerId: '',
                csrf: document.querySelector('meta[name="csrf-token"]').content,

                async init() {
                    this.supported = 'serviceWorker' in navigator && 'PushManager' in window;
                    if (!this.supported) return;

                    this.denied = Notification.permission === 'denied';

                    // Reflect a subscription this browser already holds, so the
                    // page doesn't offer to enable something that is already on.
                    //
                    // Everything here is best-effort. getSubscription() rejects
                    // outright on some browsers when the push service can't be
                    // reached — Firefox for Android throws AbortError — and an
                    // unhandled rejection in init() takes the whole component
                    // down, leaving a page that can neither explain itself nor
                    // let anyone retry. Failing to read existing state must
                    // never be worse than having no state.
                    try {
                        const registration = await navigator.serviceWorker.ready;
                        const existing = await registration.pushManager.getSubscription();
                        if (existing) {
                            this.subscribed = true;
                            const stored = localStorage.getItem('pingpong-player-id');
                            if (stored) this.playerId = stored;
                        }
                    } catch (err) {
                        this.pushServiceBroken = err.name === 'AbortError';
                        console.warn('Could not read the existing push subscription:', err);
                    }
                },

                async enable() {
                    this.busy = true;
                    this.error = false;
                    this.message = '';

                    try {
                        const permission = await Notification.requestPermission();
                        if (permission !== 'granted') {
                            this.denied = permission === 'denied';
                            throw new Error('Notifications were not allowed.');
                        }

                        const registration = await navigator.serviceWorker.ready;
                        const subscription = await registration.pushManager.subscribe({
                            userVisibleOnly: true,
                            applicationServerKey: urlBase64ToUint8Array(this.vapidKey),
                        });

                        const payload = subscription.toJSON();
                        await this.post('{{ url('/push/subscribe') }}', {
                            player_id: this.playerId,
                            endpoint: payload.endpoint,
                            keys: payload.keys,
                        });

                        localStorage.setItem('pingpong-player-id', this.playerId);
                        this.subscribed = true;
                        this.pushServiceBroken = false;
                        this.message = "You're in. We'll ping you when you're drawn.";
                    } catch (err) {
                        this.error = true;

                        // AbortError means the browser could not register with
                        // its own push service. Nothing on our side can fix
                        // that, so say so plainly rather than surfacing a raw
                        // "Error retrieving push subscription."
                        if (err.name === 'AbortError') {
                            this.pushServiceBroken = true;
                            this.message = "Your browser couldn't reach its push service. "
                                + 'This is a known problem with Firefox on Android — try Chrome instead.';
                        } else {
                            this.message = err.message || 'Could not enable notifications.';
                        }
                    } finally {
                        this.busy = false;
                    }
                },

                async disable() {
                    this.busy = true;
                    this.error = false;
                    this.message = '';

                    try {
                        const registration = await navigator.serviceWorker.ready;
                        const subscription = await registration.pushManager.getSubscription();

                        if (subscription) {
                            await this.post('{{ url('/push/unsubscribe') }}', { endpoint: subscription.endpoint });
                            await subscription.unsubscribe();
                        }

                        this.subscribed = false;
                        this.message = 'Notifications turned off.';
                    } catch (err) {
                        this.error = true;
                        this.message = err.message || 'Could not turn notifications off.';
                    } finally {
                        this.busy = false;
                    }
                },

                async sendTest() {
                    this.busy = true;
                    this.error = false;
                    this.message = '';

                    try {
                        const result = await this.post('{{ url('/push/test') }}', { player_id: this.playerId });
                        this.message = result.delivered > 0
                            ? 'Test sent — check your notifications.'
                            : 'Nothing was delivered. Try turning notifications off and on again.';
                        this.error = result.delivered === 0;
                    } catch (err) {
                        this.error = true;
                        this.message = err.message || 'Could not send a test.';
                    } finally {
                        this.busy = false;
                    }
                },

                async post(url, body) {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Accept': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify(body),
                    });

                    if (!response.ok) {
                        throw new Error('The server rejected that (' + response.status + ').');
                    }

                    return response.json();
                },
            };
        }

        /**
         * PushManager wants the VAPID key as raw bytes, but it travels as a
         * URL-safe base64 string, so pad it back out and decode.
         */
        function urlBase64ToUint8Array(base64String) {
            const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
            const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
            const raw = window.atob(base64);
            const output = new Uint8Array(raw.length);

            for (let i = 0; i < raw.length; ++i) {
                output[i] = raw.charCodeAt(i);
            }

            return output;
        }
    </script>
@endsection
