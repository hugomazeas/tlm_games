<?php

namespace App\Games\Typing\Services;

use App\Games\Typing\Events\RaceUpdated;
use App\Games\Typing\Jobs\FinishTypingRaceJob;
use App\Games\Typing\Models\TypingRace;
use App\Games\Typing\Models\TypingRacePlayer;
use Illuminate\Support\Facades\DB;

/**
 * The single hub-wide race: lobby -> running (countdown until starts_at) -> finished.
 * Rule violations abort with 409/422 so the JSON endpoints answer directly.
 */
class TypingRaceService
{
    public const WORD_COUNT = 40;

    public const LOBBY_TTL_MINUTES = 10;

    public const COUNTDOWN_SECONDS = 3;

    public function __construct(
        private TypingContent $content,
        private TypingScorer $scorer,
        private RaceFinisher $finisher,
    ) {}

    /**
     * The open race, if any. Finishes overdue races first, so results get
     * written even when the queue worker missed the cap.
     */
    public function openRace(): ?TypingRace
    {
        TypingRace::where('status', 'running')->get()->each(fn (TypingRace $race) => $this->finisher->finishIfOverdue($race));

        return TypingRace::query()
            ->where(fn ($query) => $query
                ->where('status', 'running')
                ->orWhere(fn ($lobby) => $lobby
                    ->where('status', 'lobby')
                    ->where('created_at', '>', now()->subMinutes(self::LOBBY_TTL_MINUTES))))
            ->latest('id')
            ->first();
    }

    /**
     * Joins the open race, or creates one with this language and source.
     */
    public function join(int $playerId, string $language, string $source): TypingRace
    {
        $race = $this->openRace() ?? TypingRace::create([
            'language' => $language,
            'source' => $source,
            'text' => $this->content->text($language, $source, $source === 'quote' ? 1 : self::WORD_COUNT)['text'],
            'status' => 'lobby',
        ]);

        abort_if($race->status !== 'lobby', 409, 'The race has already started.');

        TypingRacePlayer::firstOrCreate(['typing_race_id' => $race->id, 'player_id' => $playerId]);

        broadcast(new RaceUpdated($race));

        return $race;
    }

    public function leave(TypingRace $race, int $playerId): ?TypingRace
    {
        abort_if($race->status !== 'lobby', 409, 'You can only leave before the race starts.');

        $race->racers()->where('player_id', $playerId)->delete();

        if (! $race->racers()->exists()) {
            $race->delete();
            broadcast(new RaceUpdated(null));

            return null;
        }

        broadcast(new RaceUpdated($race));

        return $race;
    }

    public function start(TypingRace $race, int $playerId): TypingRace
    {
        $this->racer($race, $playerId);
        abort_if($race->hostPlayerId() !== $playerId, 403, 'Only the player who created the race can start it.');
        abort_if($race->status !== 'lobby', 409, 'The race has already started.');
        abort_if($race->racers()->count() < 2, 422, 'A race needs at least 2 players.');

        // Whole seconds, so finish times measured against it are exact to the ms.
        $race->update([
            'status' => 'running',
            'starts_at' => now()->startOfSecond()->addSeconds(self::COUNTDOWN_SECONDS),
        ]);

        FinishTypingRaceJob::dispatch($race->id)->delay($race->starts_at->copy()->addSeconds(TypingRace::CAP_SECONDS));

        broadcast(new RaceUpdated($race));

        return $race;
    }

    public function progress(TypingRace $race, int $playerId, string $typed, int $keystrokes, int $errors): TypingRace
    {
        $this->finisher->finishIfOverdue($race);
        $race->refresh();

        abort_if($race->status !== 'running', 409, 'The race is not running.');
        abort_if(now()->lt($race->starts_at), 409, 'The race has not started yet.');

        $racer = $this->racer($race, $playerId);
        abort_if($racer->finish_ms !== null, 409, 'You already finished.');

        // ponytail: read-then-write place; SQLite serializes the transaction, fine at office scale.
        DB::transaction(function () use ($race, $racer, $typed, $keystrokes, $errors) {
            $racer->fill([
                'typed' => $typed,
                'progress_chars' => $this->scorer->prefixChars($race->text, $typed),
                'keystrokes' => $keystrokes,
                'errors' => $errors,
            ]);

            if ($typed === $race->text) {
                $finishMs = (int) $race->starts_at->diffInMilliseconds(now(), true);
                abort_if($this->scorer->wpm(mb_strlen($race->text), $finishMs) > TypingScorer::MAX_WPM, 422, 'That is faster than humanly plausible.');

                $racer->finish_ms = $finishMs;
                $racer->place = $race->racers()->whereNotNull('finish_ms')->count() + 1;
            }

            $racer->save();
        });

        if (! $race->racers()->whereNull('finish_ms')->exists()) {
            $this->finisher->finish($race);

            return $race->fresh();
        }

        broadcast(new RaceUpdated($race));

        return $race;
    }

    private function racer(TypingRace $race, int $playerId): TypingRacePlayer
    {
        $racer = $race->racers()->where('player_id', $playerId)->first();
        abort_if($racer === null, 403, 'You are not in this race.');

        return $racer;
    }
}
