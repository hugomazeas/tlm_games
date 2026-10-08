<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Registered Game Modules
    |--------------------------------------------------------------------------
    |
    | Each game module should be listed here with its service provider class.
    | The hub will register each provider, which in turn registers routes,
    | views, and a LeaderboardProvider with the LeaderboardService.
    |
    */

    'modules' => [
        App\Games\Archery\Providers\ArcheryServiceProvider::class,
        App\Games\PingPong\Providers\PingPongServiceProvider::class,
        App\Games\Putter\Providers\PutterServiceProvider::class,
        App\Games\HotPotato\Providers\HotPotatoServiceProvider::class,
        App\Games\Typing\Providers\TypingServiceProvider::class,
    ],

    /*
    |--------------------------------------------------------------------------
    | Hot Potato
    |--------------------------------------------------------------------------
    |
    | The live game runs in the `hot-potato` sidecar (game-server/), which
    | calls Laravel's /internal/hot-potato endpoints with this shared secret.
    | Both read it from the same .env. Unset closes those endpoints.
    |
    */

    'hot_potato' => [
        'internal_secret' => env('HOT_POTATO_INTERNAL_SECRET'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Remote URL
    |--------------------------------------------------------------------------
    |
    | The base URL used for QR codes that phones scan to access the remote
    | scoring interface. Set via APP_REMOTE_URL env var, defaults to APP_URL.
    |
    */

    'remote_url' => env('APP_REMOTE_URL', env('APP_URL', 'http://localhost:8080')),

];
