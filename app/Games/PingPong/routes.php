<?php

use App\Games\PingPong\Controllers\PingPongController;
use App\Games\PingPong\Controllers\PingPongApiController;
use Illuminate\Support\Facades\Route;

Route::get('/games/ping-pong', [PingPongController::class, 'play']);
Route::get('/games/ping-pong/players/{id}', [PingPongController::class, 'playerStats']);

Route::get('/games/ping-pong/api/players', [PingPongApiController::class, 'players']);
Route::get('/games/ping-pong/api/leaderboard', [PingPongApiController::class, 'leaderboard']);
Route::post('/games/ping-pong/api/matches', [PingPongApiController::class, 'createMatch']);
Route::patch('/games/ping-pong/api/matches/{id}', [PingPongApiController::class, 'updateScore']);
Route::post('/games/ping-pong/api/matches/{id}/connect', [PingPongApiController::class, 'connectRemote']);
Route::post('/games/ping-pong/api/matches/{id}/rematch', [PingPongApiController::class, 'rematch']);
Route::get('/games/ping-pong/api/players/{id}/stats', [PingPongApiController::class, 'playerStatsApi']);
Route::get('/games/ping-pong/api/players/{id}/elo-history', [PingPongApiController::class, 'eloHistory']);
Route::get('/games/ping-pong/api/players/{id}/matches', [PingPongApiController::class, 'playerMatches']);
Route::get('/games/ping-pong/api/players/{id}/head-to-head', [PingPongApiController::class, 'headToHead']);
Route::get('/games/ping-pong/api/matches/{id}', [PingPongApiController::class, 'getMatch']);
Route::get('/games/ping-pong/remote/{id}/{side}', [PingPongController::class, 'remote']);
