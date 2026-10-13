<?php

use App\Games\HotPotato\Http\RequireInternalSecret;
use App\Games\Racing\Controllers\RacingInternalController;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Route;

// For the game server's racing lobbies: no session, no CSRF, the game server's shared secret instead.
Route::middleware([RequireInternalSecret::class, SubstituteBindings::class])->prefix('internal/racing')->group(function () {
    Route::get('/drivers/{player}', [RacingInternalController::class, 'driver']);
    Route::get('/tracks/{track}', [RacingInternalController::class, 'track']);
    Route::post('/results', [RacingInternalController::class, 'results']);
});
