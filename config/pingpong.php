<?php

return [

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

        // RFC 8030 urgency: very-low | low | normal | high. Anything below
        // "high" lets Android hold the push in Doze until the handset next
        // wakes, which turned a match invitation into a ten-minute-late
        // notification in practice.
        'urgency' => env('VAPID_URGENCY', 'high'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Match Recording Audio
    |--------------------------------------------------------------------------
    |
    | ALSA capture device for the webcam microphone (see `arecord -L`). Use a
    | plughw: device so ALSA resamples to whatever the mic supports. Empty
    | records video only. If the device fails, recording falls back to video.
    |
    */

    'recording_audio_device' => env('RECORDING_AUDIO_DEVICE', 'plughw:CARD=C920,DEV=0'),

];
