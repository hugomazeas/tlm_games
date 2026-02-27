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

];
