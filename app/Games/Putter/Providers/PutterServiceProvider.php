<?php

namespace App\Games\Putter\Providers;

use App\Games\Putter\Services\Leaderboards\CareerMakePercentageProvider;
use App\Services\LeaderboardService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class PutterServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Route::middleware('web')->group(__DIR__.'/../routes.php');

        $leaderboard = $this->app->make(LeaderboardService::class);
        $leaderboard->register(new CareerMakePercentageProvider());
    }
}
