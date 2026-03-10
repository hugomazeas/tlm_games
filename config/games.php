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
