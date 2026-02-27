<?php

namespace App\Games\PingPong\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Player;

class PingPongController extends Controller
{
    public function play()
    {
        return view('games.ping-pong.play');
    }

    public function playerStats(int $id)
    {
        $player = Player::findOrFail($id);

        return view('games.ping-pong.player', compact('player'));
    }
}
