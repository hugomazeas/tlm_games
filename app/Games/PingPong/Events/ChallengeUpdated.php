<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongChallenge;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * A challenge was drawn, re-rolled, or answered.
 *
 * On its own channel rather than `ping-pong.live`, so the panel on the home
 * screen can report whether *its* feed is healthy. A screen that says "Live"
 * while quietly showing a pair who were re-rolled ten minutes ago is worse
 * than one that admits it is offline.
 */
class ChallengeUpdated implements ShouldBroadcastNow
{
    /** @var array<string, mixed> */
    public array $challenge;

    public function __construct(PingPongChallenge $challenge)
    {
        $challenge->loadMissing(['playerOne', 'playerTwo', 'lobby', 'office']);

        $this->challenge = $challenge->toApiArray();
    }

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.challenges')];
    }

    public function broadcastAs(): string
    {
        return 'challenge.updated';
    }
}
