<?php

use App\Games\PingPong\Controllers\PingPongController;
use App\Games\PingPong\Controllers\PingPongApiController;
use App\Games\PingPong\Controllers\PingPongLobbyApiController;
use Illuminate\Support\Facades\Route;

Route::get('/games/ping-pong', [PingPongController::class, 'play']);
Route::get('/games/ping-pong/stats', [PingPongController::class, 'stats']);
Route::get('/games/ping-pong/players/{id}', [PingPongController::class, 'playerStats']);
Route::get('/games/ping-pong/lobby/{code}', [PingPongController::class, 'lobbyJoin']);

Route::get('/games/ping-pong/api/players', [PingPongApiController::class, 'players']);
Route::get('/games/ping-pong/api/offices', [PingPongApiController::class, 'offices']);
Route::get('/games/ping-pong/api/leaderboard', [PingPongApiController::class, 'leaderboard']);
Route::post('/games/ping-pong/api/matches', [PingPongApiController::class, 'createMatch']);
Route::patch('/games/ping-pong/api/matches/{id}', [PingPongApiController::class, 'updateScore']);
Route::post('/games/ping-pong/api/matches/{id}/connect', [PingPongApiController::class, 'connectRemote']);
Route::post('/games/ping-pong/api/matches/{id}/rematch', [PingPongApiController::class, 'rematch']);
Route::get('/games/ping-pong/api/players/{id}/stats', [PingPongApiController::class, 'playerStatsApi']);
Route::get('/games/ping-pong/api/players/{id}/elo-history', [PingPongApiController::class, 'eloHistory']);
Route::get('/games/ping-pong/api/players/{id}/matches', [PingPongApiController::class, 'playerMatches']);
Route::get('/games/ping-pong/api/players/{id}/head-to-head', [PingPongApiController::class, 'headToHead']);
Route::get('/games/ping-pong/api/matches/live', [PingPongApiController::class, 'liveMatches']);
Route::get('/games/ping-pong/api/matches/recent', [PingPongApiController::class, 'recentMatches']);
Route::get('/games/ping-pong/api/matches/{id}', [PingPongApiController::class, 'getMatch']);
Route::get('/games/ping-pong/matches/{id}', [PingPongController::class, 'matchDetail']);
Route::get('/games/ping-pong/watch', [PingPongController::class, 'watch']);
Route::get('/games/ping-pong/recordings', [PingPongController::class, 'recordings']);
Route::get('/games/ping-pong/remote/{id}/{side}', [PingPongController::class, 'remote']);

// Recording API
Route::get('/games/ping-pong/api/recordings/live', [PingPongApiController::class, 'liveRecording']);
Route::post('/games/ping-pong/api/recordings/start', [PingPongApiController::class, 'startRecording']);
Route::post('/games/ping-pong/api/recordings/stop', [PingPongApiController::class, 'stopRecording']);
Route::get('/games/ping-pong/api/recordings', [PingPongApiController::class, 'listRecordings']);
Route::delete('/games/ping-pong/api/recordings/{id}', [PingPongApiController::class, 'deleteRecording']);

// Lobby API
Route::post('/games/ping-pong/api/lobbies', [PingPongLobbyApiController::class, 'createLobby']);
Route::get('/games/ping-pong/api/lobbies/{code}', [PingPongLobbyApiController::class, 'getLobby']);
Route::post('/games/ping-pong/api/lobbies/{code}/join', [PingPongLobbyApiController::class, 'joinLobby']);
Route::patch('/games/ping-pong/api/lobbies/{code}/side', [PingPongLobbyApiController::class, 'switchSide']);
Route::delete('/games/ping-pong/api/lobbies/{code}/leave', [PingPongLobbyApiController::class, 'leaveLobby']);
Route::post('/games/ping-pong/api/lobbies/{code}/start', [PingPongLobbyApiController::class, 'startMatch']);
Route::delete('/games/ping-pong/api/lobbies/{code}', [PingPongLobbyApiController::class, 'closeLobby']);
