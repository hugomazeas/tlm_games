<?php

namespace App\Games\PingPong\Providers;

use App\Games\PingPong\Services\Leaderboards\EloRankingProvider;
use App\Services\LeaderboardService;
use Illuminate\Support\ServiceProvider;

class PingPongServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        //
    }

    public function boot(): void
    {
        $this->loadRoutesFrom(__DIR__ . '/../routes.php');

        $leaderboard = $this->app->make(LeaderboardService::class);
        $leaderboard->register(new EloRankingProvider());
    }
}
