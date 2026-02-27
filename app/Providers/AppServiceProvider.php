<?php

namespace App\Providers;

use App\Services\LeaderboardService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(LeaderboardService::class);

        // Register game module service providers from config
        foreach (config('games.modules', []) as $provider) {
            $this->app->register($provider);
        }
    }

    public function boot(): void
    {
        //
    }
}
