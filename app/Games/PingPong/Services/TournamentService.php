<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongTournament;
use App\Games\PingPong\Models\PingPongTournamentMatch;
use Illuminate\Support\Facades\DB;

/**
 * Single-elimination singles brackets. Players are seeded by current 1v1 ELO
 * so byes (when the field isn't a power of two) go to the top seeds.
 */
class TournamentService
{
    /**
     * @param  array<int, int>  $playerIds
     */
    public function create(string $name, array $playerIds): PingPongTournament
    {
        $ratings = PingPongRating::where('mode', '1v1')
            ->whereIn('player_id', $playerIds)
            ->pluck('elo_rating', 'player_id');

        // Highest ELO first; unrated players keep their picked order at the bottom.
        $seeded = collect($playerIds)
            ->values()
            ->sortBy(fn (int $id, int $index) => [-($ratings[$id] ?? 0), $index])
            ->values();

        $size = 2 ** (int) ceil(log($seeded->count(), 2));
        $rounds = (int) log($size, 2);

        return DB::transaction(function () use ($name, $seeded, $size, $rounds) {
            $tournament = PingPongTournament::create(['name' => $name]);

            foreach (array_chunk($this->seedOrder($size), 2) as $position => [$leftSeed, $rightSeed]) {
                PingPongTournamentMatch::create([
                    'tournament_id' => $tournament->id,
                    'round' => 1,
                    'position' => $position,
                    'player_left_id' => $seeded[$leftSeed - 1] ?? null,
                    'player_right_id' => $seeded[$rightSeed - 1] ?? null,
                ]);
            }

            for ($round = 2; $round <= $rounds; $round++) {
                for ($position = 0; $position < $size / (2 ** $round); $position++) {
                    PingPongTournamentMatch::create([
                        'tournament_id' => $tournament->id,
                        'round' => $round,
                        'position' => $position,
                    ]);
                }
            }

            // Byes: the lone player in a first-round slot walks through.
            $tournament->bracket()->where('round', 1)->get()
                ->filter(fn (PingPongTournamentMatch $slot) => ! $slot->player_left_id || ! $slot->player_right_id)
                ->each(fn (PingPongTournamentMatch $slot) => $this->advance($slot, $slot->player_left_id ?? $slot->player_right_id));

            return $tournament;
        });
    }

    /**
     * The next slot to play: lowest round first, top of the bracket first.
     */
    public function nextSlot(PingPongTournament $tournament): ?PingPongTournamentMatch
    {
        return $tournament->bracket()
            ->whereNotNull('player_left_id')
            ->whereNotNull('player_right_id')
            ->whereNull('winner_id')
            ->first();
    }

    /**
     * Called when a tournament match ends: move the winner up the bracket.
     */
    public function recordResult(PingPongMatch $match): void
    {
        $slot = PingPongTournamentMatch::where('match_id', $match->id)->first();

        if ($slot && ! $slot->winner_id) {
            $this->advance($slot, $match->winner_id);
        }
    }

    private function advance(PingPongTournamentMatch $slot, int $winnerId): void
    {
        $slot->update(['winner_id' => $winnerId]);

        $next = PingPongTournamentMatch::where('tournament_id', $slot->tournament_id)
            ->where('round', $slot->round + 1)
            ->where('position', intdiv($slot->position, 2))
            ->first();

        if (! $next) {
            $slot->tournament->update(['status' => 'completed', 'winner_id' => $winnerId]);

            return;
        }

        $next->update([$slot->position % 2 === 0 ? 'player_left_id' : 'player_right_id' => $winnerId]);
    }

    /**
     * Standard bracket order, e.g. 8 → [1, 8, 4, 5, 2, 7, 3, 6], so seed 1
     * and seed 2 can only meet in the final.
     *
     * @return array<int, int>
     */
    private function seedOrder(int $size): array
    {
        $order = [1];

        while (count($order) < $size) {
            $sum = count($order) * 2 + 1;
            $order = collect($order)->flatMap(fn (int $seed) => [$seed, $sum - $seed])->all();
        }

        return $order;
    }
}
