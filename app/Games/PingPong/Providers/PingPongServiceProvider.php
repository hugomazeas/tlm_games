<?php

namespace App\Games\PingPong\Providers;

use App\Games\PingPong\Console\Commands\GenerateVapidKeysCommand;
use App\Games\PingPong\Console\Commands\MatchmakeCommand;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Observers\PingPongMatchObserver;
use App\Games\PingPong\Services\Leaderboards\DoublesEloRankingProvider;
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
        $this->loadRoutesFrom(__DIR__.'/../routes.php');

        // Laravel only auto-discovers commands in app/Console/Commands, so a
        // game module has to register its own.
        if ($this->app->runningInConsole()) {
            $this->commands([
                MatchmakeCommand::class,
                GenerateVapidKeysCommand::class,
            ]);
        }

        // Closes a challenge the moment the two players start a match, no
        // matter which code path created it.
        PingPongMatch::observe(PingPongMatchObserver::class);

        $leaderboard = $this->app->make(LeaderboardService::class);
        $leaderboard->register(new EloRankingProvider);
        $leaderboard->register(new DoublesEloRankingProvider);
    }
}
