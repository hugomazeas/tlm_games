<?php

namespace App\Games\OfficeFps\Providers;

use App\Games\HotPotato\Services\BundleVersion;
use App\Games\OfficeFps\Services\OfficeFpsLeaderboardProvider;
use App\Games\OfficeFps\Services\OfficeFpsStats;
use App\Services\LeaderboardService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Facades\View;
use Illuminate\Support\ServiceProvider;

/**
 * The office FPS: its pages, its leaderboard, and the endpoint the game server posts matches to.
 * The game itself runs in the game server (game-server/src/fps), which serves the page's bundle
 * and WebSocket under /games/office-fps/live/.
 */
class OfficeFpsServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        Route::middleware('web')->group(__DIR__.'/../routes.php');
        Route::group([], __DIR__.'/../internal-routes.php');

        $this->app->make(LeaderboardService::class)
            ->register(new OfficeFpsLeaderboardProvider($this->app->make(OfficeFpsStats::class)));

        // The bundle loads with a version in its URL, so a deploy is never hidden by a cache.
        View::composer('games.office-fps.play', function ($view) {
            $view->with('bundleVersion', $this->app->make(BundleVersion::class)->current());
        });
    }
}
