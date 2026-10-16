<?php

namespace App\Games\HotPotato\Providers;

use App\Games\HotPotato\Services\BundleVersion;
use App\Games\HotPotato\Services\Leaderboards\InfectionProvider;
use App\Games\HotPotato\Services\Leaderboards\KillerProvider;
use App\Games\HotPotato\Services\Leaderboards\KingProvider;
use App\Games\HotPotato\Services\Leaderboards\SurvivalsProvider;
use App\Games\HotPotato\Services\RecentGames;
use App\Models\Player;
use App\Services\LeaderboardService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\View;
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
        $leaderboard->register(new SurvivalsProvider);
        $leaderboard->register(new KingProvider);
        $leaderboard->register(new InfectionProvider);
        $leaderboard->register(new KillerProvider);

        // The sidecar's bundles load with a version in their URL, so a deploy is never hidden by a cache.
        View::composer(['games.hot-potato.play', 'games.hot-potato.replay'], function ($view) {
            $view->with('bundleVersion', $this->app->make(BundleVersion::class)->current());
        });

        // A player's profile lists their recent games, each with its replay while it lasts.
        View::composer('players.show', function ($view) {
            $player = $view->getData()['player'] ?? null;
            if ($player instanceof Player) {
                $view->with('hotPotatoGames', $this->app->make(RecentGames::class)->forPlayer($player));
            }
        });
    }
}
