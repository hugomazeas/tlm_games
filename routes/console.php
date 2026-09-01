<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
|--------------------------------------------------------------------------
| Ping pong matchmaking
|--------------------------------------------------------------------------
|
| Fires every hour on the half hour, all day, every day. The window (09:30 to
| 16:30 by default) and the weekday check are applied per office inside the
| command, against the office's own local clock as reported by Buro — so a
| second office in another timezone needs no change here.
|
| Requires a running scheduler: `docker/supervisor/supervisord.conf` starts
| `php artisan schedule:work` alongside php-fpm, nginx and reverb.
|
*/
Schedule::command('pingpong:matchmake')
    ->hourlyAt(30)
    ->withoutOverlapping()
    ->runInBackground();
