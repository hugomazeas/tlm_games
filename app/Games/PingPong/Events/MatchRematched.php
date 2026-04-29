<?php

namespace App\Games\PingPong\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class MatchRematched implements ShouldBroadcastNow
{
    public int $matchId;
    public string $lobbyCode;
    public string $mode;

    public function __construct(int $matchId, string $lobbyCode, string $mode)
    {
        $this->matchId = $matchId;
        $this->lobbyCode = $lobbyCode;
        $this->mode = $mode;
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('ping-pong.match.' . $this->matchId),
        ];
    }

    public function broadcastAs(): string
    {
        return 'match.rematched';
    }
}
