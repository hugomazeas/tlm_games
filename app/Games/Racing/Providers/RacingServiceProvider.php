<?php

namespace App\Games\Racing\Providers;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The racing game: its tracks and pages. No leaderboard yet: race results
 * come with multiplayer.
 */
class RacingServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::middleware('web')->group(__DIR__.'/../routes.php');
    }
}
