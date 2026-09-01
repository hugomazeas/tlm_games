<?php

use App\Http\Controllers\DeployController;
use App\Http\Controllers\HomeController;
use App\Http\Controllers\LeaderboardController;
use App\Http\Controllers\NotificationController;
use App\Http\Controllers\OfficeController;
use App\Http\Controllers\PlayerController;
use App\Http\Controllers\PushSubscriptionController;
use Illuminate\Support\Facades\Route;

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

Route::get('/notifications', [NotificationController::class, 'index']);
Route::get('/push/config', [PushSubscriptionController::class, 'index']);
Route::post('/push/subscribe', [PushSubscriptionController::class, 'store']);
Route::post('/push/unsubscribe', [PushSubscriptionController::class, 'destroy']);
Route::post('/push/test', [PushSubscriptionController::class, 'test']);

Route::get('/leaderboards', [LeaderboardController::class, 'index']);
Route::get('/leaderboards/{gameType:slug}', [LeaderboardController::class, 'show']);
Route::get('/leaderboards/{gameType:slug}/{modeSlug}', [LeaderboardController::class, 'mode']);

Route::post('/deploy', DeployController::class)->withoutMiddleware([
    \Illuminate\Foundation\Http\Middleware\VerifyCsrfToken::class,
]);
