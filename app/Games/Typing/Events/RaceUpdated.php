<?php

namespace App\Games\Typing\Events;

use App\Games\Typing\Models\TypingRace;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

/**
 * The whole race state, sent on every change (join, leave, start, progress,
 * finish). Null when the lobby was emptied. Small enough for an office.
 */
class RaceUpdated implements ShouldBroadcastNow
{
    public ?array $race;

    public function __construct(?TypingRace $race)
    {
        $this->race = $race?->toBroadcast();
    }

    public function broadcastOn(): array
    {
        return [new Channel('typing.race')];
    }

    public function broadcastAs(): string
    {
        return 'race.updated';
    }
}
