<?php

use App\Games\OfficeFps\Controllers\OfficeFpsController;
use Illuminate\Support\Facades\Route;

Route::get('/games/office-fps', [OfficeFpsController::class, 'show']);
