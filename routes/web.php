<?php

use App\Http\Controllers\BroadcastAuthController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\LeaderboardController;
use App\Http\Controllers\OfficeController;
use App\Http\Controllers\PlayerController;
use Illuminate\Support\Facades\Route;

Route::post('/broadcasting/auth', [BroadcastAuthController::class, 'authenticate']);

Route::get('/', [HomeController::class, 'index']);

Route::get('/offices', [OfficeController::class, 'index']);
Route::post('/offices', [OfficeController::class, 'store']);
Route::get('/offices/{office}/edit', [OfficeController::class, 'edit']);
Route::put('/offices/{office}', [OfficeController::class, 'update']);

Route::get('/players', [PlayerController::class, 'index']);
Route::post('/players', [PlayerController::class, 'store']);
Route::get('/players/{player}', [PlayerController::class, 'show']);
Route::get('/players/{player}/edit', [PlayerController::class, 'edit']);
Route::put('/players/{player}', [PlayerController::class, 'update']);
Route::delete('/players/{player}', [PlayerController::class, 'destroy']);

Route::get('/leaderboards', [LeaderboardController::class, 'index']);
Route::get('/leaderboards/{gameType:slug}', [LeaderboardController::class, 'show']);
Route::get('/leaderboards/{gameType:slug}/{modeSlug}', [LeaderboardController::class, 'mode']);
