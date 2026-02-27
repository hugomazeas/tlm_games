<?php

namespace App\Games\Archery\Providers;

use App\Games\Archery\Services\Leaderboards\WeeklyBestProvider;
use App\Services\LeaderboardService;
use Illuminate\Support\ServiceProvider;

class ArcheryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->loadRoutesFrom(__DIR__ . '/../routes.php');

        $leaderboard = $this->app->make(LeaderboardService::class);
        $leaderboard->register(new WeeklyBestProvider());
    }
}
