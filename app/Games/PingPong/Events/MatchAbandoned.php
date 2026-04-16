<?php

namespace App\Games\PingPong\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class MatchAbandoned implements ShouldBroadcastNow
{
    public int $matchId;

    public function __construct(int $matchId)
    {
        $this->matchId = $matchId;
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('ping-pong.match.' . $this->matchId),
            new Channel('ping-pong.live'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'match.abandoned';
    }
}
