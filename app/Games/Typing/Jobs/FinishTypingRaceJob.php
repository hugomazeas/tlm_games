<?php

namespace App\Games\Typing\Jobs;

use App\Games\Typing\Models\TypingRace;
use App\Games\Typing\Services\RaceFinisher;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Dispatched when a race starts, delayed to its 2-minute cap. Does nothing
 * if the race already ended (everyone finished) or the cap isn't reached.
 */
class FinishTypingRaceJob implements ShouldQueue
{
    use Queueable;

    public function __construct(public int $raceId) {}

    public function handle(RaceFinisher $finisher): void
    {
        $race = TypingRace::find($this->raceId);

        if ($race) {
            $finisher->finishIfOverdue($race);
        }
    }
}
