<?php

use App\Games\HotPotato\Http\RequireInternalSecret;
use App\Games\OfficeFps\Controllers\OfficeFpsInternalController;
use Illuminate\Support\Facades\Route;

// Machine-to-machine, for the game server: no session, no CSRF, the shared secret instead.
Route::middleware([RequireInternalSecret::class])->prefix('internal/office-fps')->group(function () {
    Route::post('/results', [OfficeFpsInternalController::class, 'results']);
});
