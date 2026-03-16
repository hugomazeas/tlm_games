<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongLobby;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class LobbyMatchStarted implements ShouldBroadcastNow
{
    public string $code;
    public int $matchId;
    public array $participants;

    public function __construct(PingPongLobby $lobby)
    {
        $lobby->load('participants.player');

        $this->code = $lobby->code;
        $this->matchId = $lobby->match_id;
        $this->participants = $lobby->participants->map(fn ($p) => [
            'player_id' => $p->player_id,
            'player_name' => $p->player->name,
            'side' => $p->side,
        ])->values()->toArray();
    }

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.lobby.' . $this->code)];
    }

    public function broadcastAs(): string
    {
        return 'lobby.match-started';
    }
}
