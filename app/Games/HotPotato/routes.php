<?php

use App\Games\HotPotato\Controllers\HotPotatoController;
use Illuminate\Support\Facades\Route;

// The live game (WebSocket and the page's script) is served by the sidecar
// under /games/hot-potato/live/, which nginx sends straight to it.
Route::get('/games/hot-potato', [HotPotatoController::class, 'play']);
Route::post('/push/hot-potato/subscribe', [HotPotatoController::class, 'subscribe']);
Route::post('/push/hot-potato/unsubscribe', [HotPotatoController::class, 'unsubscribe']);
