<?php

namespace App\Games\HotPotato\Providers;

use App\Games\HotPotato\Services\Leaderboards\SurvivalsProvider;
use App\Services\LeaderboardService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

class HotPotatoServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        Route::middleware('web')->group(__DIR__.'/../routes.php');
        Route::group([], __DIR__.'/../internal-routes.php');

        $leaderboard = $this->app->make(LeaderboardService::class);
        $leaderboard->register(new SurvivalsProvider());
    }
}
