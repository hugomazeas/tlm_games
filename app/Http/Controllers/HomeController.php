<?php

namespace App\Http\Controllers;

use App\Models\GameType;
use App\Models\Player;

class HomeController extends Controller
{
    public function index()
    {
        return view('home')
            ->with('gameTypes', GameType::all())
            ->with('playerCount', Player::count())
            ->with('activeGameCount', GameType::active()->count());
    }
}
