<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Singles results typed in after the games were played, for offices without a
 * scoring screen. Each game becomes a finished, ranked match with no points, run through
 * the same ELO as a live one, in the order typed. Nothing is broadcast, filmed
 * or pushed: these games are over.
 */
class LoggedResultService
{
    public function __construct(private EloService $eloService) {}

    /**
     * Log a run of singles games between the same two players. The last game ended
     * at $endedAt, the ones before it a second apart, so streaks follow the order typed.
     *
     * @param  list<array{left: int, right: int}>  $games  Scores, $leftId's first
     * @return Collection<int, PingPongMatch>
     */
    public function log(int $leftId, int $rightId, array $games, CarbonInterface $endedAt): Collection
    {
        $mode = '1v1';

        foreach ($games as $index => $game) {
            if (! PingPongMatch::isFinalScore($game['left'], $game['right'])) {
                throw ValidationException::withMessages([
                    "games.{$index}" => "{$game['left']}–{$game['right']} isn't a final score: first to 11, win by 2.",
                ]);
            }
        }

        $endedAt = $endedAt->copy()->utc();
        $firstEndedAt = $endedAt->copy()->subSeconds(count($games) - 1);
        $this->assertPlayable($mode, [$leftId, $rightId], $firstEndedAt, $endedAt);

        return DB::transaction(function () use ($mode, $leftId, $rightId, $games, $firstEndedAt): Collection {
            $loggedAt = now();

            return collect($games)->values()->map(function (array $game, int $index) use ($mode, $leftId, $rightId, $firstEndedAt, $loggedAt): PingPongMatch {
                $playedAt = $firstEndedAt->copy()->addSeconds($index);

                $match = PingPongMatch::create([
                    'mode' => $mode,
                    'player_left_id' => $leftId,
                    'player_right_id' => $rightId,
                    'player_left_score' => $game['left'],
                    'player_right_score' => $game['right'],
                    'winner_id' => $game['left'] > $game['right'] ? $leftId : $rightId,
                    'started_at' => $playedAt,
                    'last_score_activity_at' => $playedAt,
                    'ended_at' => $playedAt,
                    'logged_at' => $loggedAt,
                ]);

                $this->eloService->applyMatchResult($match);

                return $match->fresh();
            });
        });
    }

    /**
     * Take a logged match back, ELO and all, while it's fresh and nobody in it has
     * played a ranked match since (that one's streaks were built on this one).
     */
    public function undo(PingPongMatch $match): void
    {
        if (! $match->isLogged()) {
            throw ValidationException::withMessages(['match' => 'Only a logged result can be undone.']);
        }

        $minutes = config('pingpong.logged_undo_minutes');
        if ($match->logged_at->lt(now()->subMinutes($minutes))) {
            throw ValidationException::withMessages(['match' => "A logged result can only be undone in its first {$minutes} minutes."]);
        }

        $later = $this->rankedMatchesOf($match->mode, $this->playerIdsOf($match))
            ->where('id', '!=', $match->id)
            ->where(function ($query) use ($match): void {
                $query->where('ended_at', '>', $match->ended_at)
                    ->orWhere(fn ($tie) => $tie->where('ended_at', $match->ended_at)->where('id', '>', $match->id));
            })
            ->exists();

        if ($later) {
            throw ValidationException::withMessages(['match' => 'Someone in this game has played since: undo the later games first.']);
        }

        DB::transaction(function () use ($match): void {
            $this->eloService->revertMatchResult($match);
            $match->delete();
        });
    }

    /**
     * Same day in the offices' timezone, not in the future, and after every
     * player's last ranked match, so ELO is applied in the order games were played.
     *
     * @param  list<int>  $playerIds
     */
    private function assertPlayable(string $mode, array $playerIds, CarbonInterface $firstEndedAt, CarbonInterface $lastEndedAt): void
    {
        $timezone = config('pingpong.offices_timezone');

        if ($lastEndedAt->gt(now()->addMinute())) {
            throw ValidationException::withMessages(['played_at' => "That time hasn't happened yet."]);
        }

        if ($firstEndedAt->lt(now()->setTimezone($timezone)->startOfDay())) {
            throw ValidationException::withMessages(['played_at' => 'Only games played today can be logged.']);
        }

        $latest = $this->rankedMatchesOf($mode, $playerIds)
            ->where('ended_at', '>=', $firstEndedAt)
            ->orderByDesc('ended_at')
            ->first();

        if ($latest) {
            $names = Player::whereIn('id', array_intersect($playerIds, $this->playerIdsOf($latest)))->orderBy('name')->pluck('name')->join(', ', ' and ');
            $time = $latest->ended_at->copy()->setTimezone($timezone)->format('H:i');

            throw ValidationException::withMessages([
                'played_at' => "{$names} already played a game that ended at {$time}: pick a later time.",
            ]);
        }
    }

    /**
     * Finished ranked matches in the mode that involve any of the players.
     *
     * @param  list<int>  $playerIds
     */
    private function rankedMatchesOf(string $mode, array $playerIds): Builder
    {
        return PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where('free_play', false)
            ->where(function ($query) use ($playerIds): void {
                $query->whereIn('player_left_id', $playerIds)
                    ->orWhereIn('player_right_id', $playerIds)
                    ->orWhereIn('team_left_player2_id', $playerIds)
                    ->orWhereIn('team_right_player2_id', $playerIds);
            });
    }

    /**
     * @return list<int>
     */
    private function playerIdsOf(PingPongMatch $match): array
    {
        return array_values(array_filter([
            $match->player_left_id,
            $match->team_left_player2_id,
            $match->player_right_id,
            $match->team_right_player2_id,
        ]));
    }
}
