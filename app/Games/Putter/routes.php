<?php

use App\Games\Putter\Controllers\PutterController;
use Illuminate\Support\Facades\Route;

Route::get('/games/putter', [PutterController::class, 'play']);
Route::post('/games/putter', [PutterController::class, 'submit']);
