<?php

use App\Games\Archery\Controllers\ArcheryController;
use App\Games\Archery\Controllers\ArcheryApiController;
use Illuminate\Support\Facades\Route;

Route::get('/games/archery', [ArcheryController::class, 'play']);
Route::get('/games/archery/players/{id}', [ArcheryController::class, 'playerStats']);

Route::post('/games/archery/api/games', [ArcheryApiController::class, 'submitGame']);
Route::get('/games/archery/api/leaderboard/weekly', [ArcheryApiController::class, 'weeklyLeaderboard']);
Route::get('/games/archery/api/players', [ArcheryApiController::class, 'players']);
Route::get('/games/archery/api/bonuses', [ArcheryApiController::class, 'bonuses']);
Route::get('/games/archery/api/players/{id}/games', [ArcheryApiController::class, 'playerGames']);
Route::get('/games/archery/api/players/{id}/top-bonuses', [ArcheryApiController::class, 'playerTopBonuses']);
Route::get('/games/archery/api/players/{id}/weekly-averages', [ArcheryApiController::class, 'playerWeeklyAverages']);
Route::get('/games/archery/api/players/{id}/weekly-precision', [ArcheryApiController::class, 'playerWeeklyPrecision']);
