<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongMatch;
use App\Http\Controllers\Controller;
use App\Models\Player;

class PingPongController extends Controller
{
    public function play()
    {
        return view('games.ping-pong.play');
    }

    public function lobbyJoin(string $code)
    {
        $lobby = PingPongLobby::where('code', $code)->firstOrFail();

        return view('games.ping-pong.join', [
            'lobbyCode' => $lobby->code,
            'lobbyMode' => $lobby->mode,
            'remoteUrl' => config('games.remote_url'),
        ]);
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
            'remoteUrl' => config('games.remote_url'),
        ]);
    }
}
