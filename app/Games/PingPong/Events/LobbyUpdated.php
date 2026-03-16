<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongLobby;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class LobbyUpdated implements ShouldBroadcastNow
{
    public array $lobby;

    public function __construct(PingPongLobby $lobby)
    {
        $lobby->load('participants.player');

        $this->lobby = [
            'code' => $lobby->code,
            'mode' => $lobby->mode,
            'status' => $lobby->status,
            'participants' => $lobby->participants->map(fn ($p) => [
                'id' => $p->id,
                'player_id' => $p->player_id,
                'player_name' => $p->player->name,
                'side' => $p->side,
            ])->values()->toArray(),
        ];
    }

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.lobby.' . $this->lobby['code'])];
    }

    public function broadcastAs(): string
    {
        return 'lobby.updated';
    }
}
