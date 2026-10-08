<?php

namespace App\Games\Typing\Services;

use App\Games\Typing\Events\RaceUpdated;
use App\Games\Typing\Models\TypingRace;
use App\Games\Typing\Models\TypingTest;
use Illuminate\Support\Facades\DB;

class RaceFinisher
{
    public function __construct(private TypingScorer $scorer) {}

    public function finishIfOverdue(TypingRace $race): void
    {
        if ($race->isOverdue()) {
            $this->finish($race);
        }
    }

    /**
     * Ends a running race and writes one result per racer. Safe to call twice:
     * only the call that flips the status writes results.
     */
    public function finish(TypingRace $race): void
    {
        DB::transaction(function () use ($race) {
            $flipped = TypingRace::whereKey($race->id)->where('status', 'running')->update(['status' => 'finished']);

            if ($flipped === 0) {
                return;
            }

            $race->status = 'finished';
            $capMs = TypingRace::CAP_SECONDS * 1000;

            foreach ($race->racers()->get() as $racer) {
                $finished = $racer->finish_ms !== null;
                $ms = $finished ? $racer->finish_ms : $capMs;
                $typed = $racer->typed ?? '';

                TypingTest::create([
                    'player_id' => $racer->player_id,
                    'typing_race_id' => $race->id,
                    'language' => $race->language,
                    'source' => $race->source,
                    'text' => $race->text,
                    'typed' => $typed,
                    'wpm' => $this->scorer->wpm($finished ? mb_strlen($race->text) : $racer->progress_chars, $ms),
                    'raw_wpm' => $this->scorer->wpm(mb_strlen($typed), $ms),
                    'accuracy' => $this->scorer->accuracy($racer->keystrokes, $racer->errors, $race->text, $typed),
                    'duration_ms' => $ms,
                    'issued_at' => $race->starts_at,
                    'submitted_at' => now(),
                ]);
            }
        });

        if ($race->status === 'finished') {
            broadcast(new RaceUpdated($race->fresh()));
        }
    }
}
