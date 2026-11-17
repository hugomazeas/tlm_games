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

    /*
    |--------------------------------------------------------------------------
    | Wide Camera (second angle)
    |--------------------------------------------------------------------------
    |
    | The Anker PowerConf C200, filmed by the same ffmpeg as the C920 so both
    | angles share one clock. `device` is the path inside the container
    | (docker-compose.camera-wide.yml maps the host's camera there); when it
    | is missing, matches are filmed by the C920 alone, as before. `filter`
    | is an ffmpeg -vf chain for the way it is mounted (e.g. "hflip,vflip"),
    | empty for none. `latency_ms` is how much later the wide camera delivers
    | the same moment than the C920 (clap in front of both, compare): the
    | players shift the wide angle by it, live and recorded.
    |
    */

    'wide_camera' => [
        'device' => env('RECORDING_WIDE_DEVICE', '/dev/video-wide'),
        'video_size' => env('RECORDING_WIDE_VIDEO_SIZE', '2560x1440'),
        'filter' => env('RECORDING_WIDE_FILTER', ''),
        'latency_ms' => (int) env('RECORDING_WIDE_LATENCY_MS', 0),
    ],

    /*
    |--------------------------------------------------------------------------
    | Match Recording Tail
    |--------------------------------------------------------------------------
    |
    | Seconds the camera keeps rolling after the winning point, so the stream
    | (which runs ~10s behind the table) and the saved video still show the
    | end of the rally. A match starting inside this window cuts the tail
    | short and takes the camera over.
    |
    */

    'recording_tail_seconds' => (int) env('RECORDING_TAIL_SECONDS', 20),

    /*
    |--------------------------------------------------------------------------
    | Match Video Upload
    |--------------------------------------------------------------------------
    |
    | Every finished match video is POSTed here as multipart, field "file",
    | named {match_id}.mp4. Empty disables the upload.
    |
    */

    'video_upload_url' => env('VIDEO_UPLOAD_URL', 'http://192.168.1.141:8000/api/videos'),

    /*
    |--------------------------------------------------------------------------
    | Logged Results
    |--------------------------------------------------------------------------
    |
    | Offices without a scoring screen type their final scores in afterwards
    | (/games/ping-pong/log). A result can be logged for earlier the same day
    | in the offices' timezone, and undone for `logged_undo_minutes` after,
    | as long as nobody in it has played a ranked match since.
    |
    */

    'offices_timezone' => env('PINGPONG_OFFICES_TIMEZONE', 'America/Toronto'),

    'logged_undo_minutes' => (int) env('PINGPONG_LOGGED_UNDO_MINUTES', 15),

];
