<?php

use App\Games\Typing\Controllers\TypingController;
use App\Games\Typing\Controllers\TypingRaceController;
use Illuminate\Support\Facades\Route;

Route::get('/games/typing', [TypingController::class, 'play']);
Route::post('/games/typing/tests', [TypingController::class, 'issue']);
Route::post('/games/typing/tests/{test}/submit', [TypingController::class, 'submit']);

Route::get('/games/typing/race', [TypingRaceController::class, 'show']);
Route::post('/games/typing/race', [TypingRaceController::class, 'join']);
Route::post('/games/typing/race/{race}/leave', [TypingRaceController::class, 'leave']);
Route::post('/games/typing/race/{race}/start', [TypingRaceController::class, 'start']);
Route::post('/games/typing/race/{race}/progress', [TypingRaceController::class, 'progress']);
