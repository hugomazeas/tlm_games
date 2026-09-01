<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongMatch;
use Illuminate\Support\Carbon;

/**
 * Closes challenges that the two players satisfied on their own.
 *
 * The notification deep-links into a pre-seated lobby, but nobody is obliged
 * to use it — the far more likely thing is that the two of them just walk to
 * the table and start a match the normal way. That game is the point of the
 * challenge, so it counts: the challenge is marked played and linked to the
 * match rather than being left to rot until it expires.
 *
 * Deliberately narrow: only a match containing *both* challenged players
 * fulfils a challenge. One of them playing someone else does not cancel it —
 * a five-minute game against a third person is no reason to call off a
 * challenge that still has forty minutes to run.
 */
class ChallengeReconciler
{
    /**
     * Columns holding a match participant, singles and doubles alike.
     *
     * @var list<string>
     */
    private const PARTICIPANT_COLUMNS = [
        'player_left_id',
        'team_left_player2_id',
        'player_right_id',
        'team_right_player2_id',
    ];

    /**
     * Marks any pending challenge that this match fulfils.
     *
     * Called from the model observer, so it fires no matter which code path
     * created the match — the lobby, the scoring API, or a rematch.
     *
     * @return int Number of challenges closed.
     */
    public function reconcileMatch(PingPongMatch $match): int
    {
        $participants = $this->participantIds($match);

        if (count($participants) < 2) {
            return 0;
        }

        // Same window rule as the sweep, so it makes no difference whether a
        // challenge is closed here or an hour later: the match has to have
        // started while the challenge was actually live.
        $startedAt = $match->started_at ?? Carbon::now();
        $closed = 0;

        $candidates = PingPongChallenge::query()
            ->pending()
            ->whereIn('player_one_id', $participants)
            ->whereIn('player_two_id', $participants)
            ->where('scheduled_for', '<=', $startedAt)
            ->where('expires_at', '>=', $startedAt)
            ->get();

        foreach ($candidates as $challenge) {
            $challenge->forceFill([
                'status' => PingPongChallenge::STATUS_PLAYED,
                'match_id' => $match->id,
            ])->save();

            $closed++;
        }

        return $closed;
    }

    /**
     * Sweeps pending challenges against matches that already happened.
     *
     * The observer covers everything created from now on; this catches the
     * gaps — a match recorded while the app was mid-deploy, or one that
     * predates this feature. Runs at the top of every hourly draw, before
     * stale challenges are expired, so a challenge the pair actually honoured
     * is never filed as expired.
     *
     * @return int Number of challenges closed.
     */
    public function reconcilePending(?Carbon $now = null): int
    {
        $now ??= Carbon::now();
        $closed = 0;

        $pending = PingPongChallenge::query()->pending()->get();

        foreach ($pending as $challenge) {
            $match = $this->findFulfillingMatch($challenge, $now);

            if (! $match) {
                continue;
            }

            $challenge->forceFill([
                'status' => PingPongChallenge::STATUS_PLAYED,
                'match_id' => $match->id,
            ])->save();

            $closed++;
        }

        return $closed;
    }

    /**
     * The earliest match involving both players that started during the
     * challenge's window.
     *
     * Bounded at both ends on purpose: a match that started before the draw
     * cannot have been prompted by it, and one that started after the window
     * closed belongs to whatever came next, not to this challenge.
     */
    private function findFulfillingMatch(PingPongChallenge $challenge, Carbon $now): ?PingPongMatch
    {
        [$one, $two] = $challenge->playerIds();

        return PingPongMatch::query()
            ->whereNotNull('started_at')
            ->where('started_at', '>=', $challenge->scheduled_for)
            ->where('started_at', '<=', $challenge->expires_at)
            ->where(fn ($query) => $this->whereParticipant($query, $one))
            ->where(fn ($query) => $this->whereParticipant($query, $two))
            ->orderBy('started_at')
            ->first();
    }

    private function whereParticipant($query, int $playerId)
    {
        foreach (self::PARTICIPANT_COLUMNS as $column) {
            $query->orWhere($column, $playerId);
        }

        return $query;
    }

    /**
     * @return array<int, int>
     */
    private function participantIds(PingPongMatch $match): array
    {
        return collect(self::PARTICIPANT_COLUMNS)
            ->map(fn (string $column) => $match->{$column})
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->unique()
            ->values()
            ->all();
    }
}
