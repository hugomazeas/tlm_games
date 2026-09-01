<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Buro Integration
    |--------------------------------------------------------------------------
    |
    | Buro is the seat-booking app that knows who is in which office today.
    | Both apps sit on the shared `proxy` Docker network in production, so the
    | default base URL is the container name rather than a public hostname.
    |
    */

    'buro' => [
        'base_url' => env('BURO_BASE_URL', 'http://buro:3000'),
        'token' => env('BURO_INTEGRATION_TOKEN'),
        'timeout' => (int) env('BURO_TIMEOUT', 5),
    ],

    /*
    |--------------------------------------------------------------------------
    | Matchmaking
    |--------------------------------------------------------------------------
    |
    | The hourly draw is opt-in twice over: a Buro user must carry the opt-in
    | flag, and their office must have matchmaking enabled. The per-day cap
    | keeps an eight-slot day from turning into eight notifications for the
    | same unlucky pair. Hours live on each office row, not here.
    |
    */

    'matchmaking' => [
        'opt_in_flag' => env('PINGPONG_OPT_IN_FLAG', 'Ping Pong'),

        // A challenge is dead before the next hourly draw fires.
        'challenge_ttl_minutes' => (int) env('PINGPONG_CHALLENGE_TTL', 50),

        // Don't pick the same player again for this many hours.
        'player_cooldown_hours' => (int) env('PINGPONG_PLAYER_COOLDOWN_HOURS', 24),

        // Hard ceiling per player per office-local day.
        'max_challenges_per_day' => (int) env('PINGPONG_MAX_CHALLENGES_PER_DAY', 1),
    ],

    /*
    |--------------------------------------------------------------------------
    | Web Push (VAPID)
    |--------------------------------------------------------------------------
    |
    | Generate a key pair once with `php artisan pingpong:vapid-keys` and put
    | the result in .env. Rotating these invalidates every existing browser
    | subscription, so everyone would have to re-enable notifications.
    |
    */

    'webpush' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        'subject' => env('VAPID_SUBJECT', 'mailto:games@tlmgo.com'),
        'ttl' => (int) env('VAPID_TTL', 1800),
    ],

];
