<?php

namespace App\Games\PingPong\Events;

use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * The match's HLS playlist exists, so viewers can attach a player to it.
 */
class LiveStreamReady implements ShouldBroadcastNow
{
    public function __construct(
        public int $matchId,
        public string $hlsUrl,
    ) {}

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.live')];
    }

    public function broadcastAs(): string
    {
        return 'stream.ready';
    }

    /**
     * @return array{match_id: int, hls_url: string}
     */
    public function broadcastWith(): array
    {
        return [
            'match_id' => $this->matchId,
            'hls_url' => $this->hlsUrl,
        ];
    }
}
