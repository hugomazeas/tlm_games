<?php

use App\Games\Racing\Controllers\RacingGarageController;
use App\Games\Racing\Controllers\RacingTrackController;
use Illuminate\Support\Facades\Route;

Route::get('/games/racing', [RacingTrackController::class, 'index']);
Route::get('/games/racing/roam', [RacingTrackController::class, 'roam']);
Route::get('/games/racing/tracks/create', [RacingTrackController::class, 'create']);
Route::post('/games/racing/tracks', [RacingTrackController::class, 'store']);
Route::get('/games/racing/tracks/{track}/edit', [RacingTrackController::class, 'edit']);
Route::put('/games/racing/tracks/{track}', [RacingTrackController::class, 'update']);
Route::delete('/games/racing/tracks/{track}', [RacingTrackController::class, 'destroy']);
Route::get('/games/racing/tracks/{track}/play', [RacingTrackController::class, 'play']);
Route::get('/games/racing/tracks/{track}/records', [RacingTrackController::class, 'records']);

Route::post('/games/racing/drivers', [RacingGarageController::class, 'createDriver']);
Route::get('/games/racing/garage/{player}', [RacingGarageController::class, 'show']);
Route::put('/games/racing/garage/{player}', [RacingGarageController::class, 'update']);
