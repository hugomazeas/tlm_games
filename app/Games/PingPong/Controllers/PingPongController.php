<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongMatch;
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

    public function remote(int $id, string $side)
    {
        abort_unless(in_array($side, ['left', 'right']), 404);

        $match = PingPongMatch::findOrFail($id);

        return view('games.ping-pong.remote', [
            'matchId' => $match->id,
            'side' => $side,
        ]);
    }
}
