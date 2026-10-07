<?php

use App\Games\HotPotato\Controllers\HotPotatoInternalController;
use App\Games\HotPotato\Http\RequireInternalSecret;
use Illuminate\Routing\Middleware\SubstituteBindings;
use Illuminate\Support\Facades\Route;

// Machine-to-machine, for the sidecar: no session, no CSRF, the shared secret instead.
Route::middleware([RequireInternalSecret::class, SubstituteBindings::class])->prefix('internal/hot-potato')->group(function () {
    Route::get('/players/{player}', [HotPotatoInternalController::class, 'player']);
    Route::post('/sessions/opened', [HotPotatoInternalController::class, 'sessionOpened']);
    Route::post('/results', [HotPotatoInternalController::class, 'results']);
});
