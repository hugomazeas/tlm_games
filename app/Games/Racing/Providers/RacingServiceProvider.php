<?php

namespace App\Games\Racing\Providers;

use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * The racing game: its tracks and pages, and the internal endpoints the game
 * server's lobbies use to look drivers and tracks up and save results.
 */
class RacingServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::middleware('web')->group(__DIR__.'/../routes.php');
        Route::group([], __DIR__.'/../internal-routes.php');
    }
}
