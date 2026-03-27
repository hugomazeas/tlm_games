<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongMatch;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class LiveMatchStarted implements ShouldBroadcastNow
{
    public array $match;

    public function __construct(PingPongMatch $match)
    {
        $match->load(['playerLeft', 'playerRight', 'teamLeftPlayer2', 'teamRightPlayer2', 'recording']);

        $data = $match->toArray();

        if ($match->recording) {
            $data['recording'] = [
                'status' => $match->recording->status,
                'hls_url' => $match->recording->hls_url,
            ];
        }

        $this->match = $data;
    }

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.live')];
    }

    public function broadcastAs(): string
    {
        return 'match.started';
    }
}
