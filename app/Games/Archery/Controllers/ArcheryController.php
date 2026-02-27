<?php

namespace App\Games\Archery\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Player;

class ArcheryController extends Controller
{
    public function play()
    {
        return view('games.archery.play');
    }

    public function playerStats(int $id)
    {
        $player = Player::findOrFail($id);
        return view('games.archery.player', compact('player'));
    }
}
