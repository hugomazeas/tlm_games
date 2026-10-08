<?php

namespace App\Games\Typing\Providers;

use App\Games\Typing\Services\Leaderboards\AverageWpmProvider;
use App\Services\LeaderboardService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class TypingServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::middleware('web')->group(__DIR__.'/../routes.php');

        $leaderboard = $this->app->make(LeaderboardService::class);
        $leaderboard->register(new AverageWpmProvider);
    }
}
