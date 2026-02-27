<?php

namespace App\Http\Controllers;

use App\Models\GameType;
use App\Models\Player;

class HomeController extends Controller
{
    public function index()
    {
        return view('home', [
            'gameTypes' => GameType::all(),
            'playerCount' => Player::count(),
            'activeGameCount' => GameType::active()->count(),
        ]);
    }
}
