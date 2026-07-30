<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongClip;
use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Turns the completed 1v1 history between two players into lane-chart data.
 *
 * Every point row is stored as left/right relative to its match, but a player
 * swaps sides between matches. Everything this service emits is normalised to
 * "a" (the first player) and "b", so a positive margin always means player A is
 * ahead regardless of which side they physically played on.
 */
class MatchupAnalysisService
{
    /**
     * Lanes charted per request. Real matchups run into the hundreds of games,
     * which is far more than fits on screen at a readable lane height.
     */
    public const DEFAULT_GAME_LIMIT = 30;

    public const MAX_GAME_LIMIT = 100;

    /**
     * Full payload for a matchup: record over every completed 1v1 between the
     * two players, plus lanes for a window of the most recent games that have
     * point-by-point data.
     *
     * @return array<string, mixed>
     */
    public function forPlayers(
        Player $playerA,
        Player $playerB,
        int $limit = self::DEFAULT_GAME_LIMIT,
        int $offset = 0,
    ): array {
        $base = $this->completedSinglesBetween($playerA->id, $playerB->id);

        $record = $this->record((clone $base)->get(['id', 'winner_id']), $playerA->id);

        $charted = (clone $base)->whereHas('points');
        $totalCharted = (clone $charted)->count();

        $window = $charted
            ->orderByDesc('ended_at')
            ->orderByDesc('id')
            ->offset($offset)
            ->limit($limit)
            ->with(['points' => fn ($query) => $query->orderBy('point_number')->orderBy('id')])
            ->get()
            ->reverse()
            ->values();

        $clipIds = $this->clipIdsByPointId($window);

        $lanes = [];
        foreach ($window as $match) {
            // serverSide() reads the point's match relation. Wiring it by hand
            // keeps that from firing one query per point.
            foreach ($match->points as $point) {
                $point->setRelation('match', $match);
            }

            $lane = $this->buildLane($match, $playerA->id, $clipIds);
            if ($lane !== null) {
                $lanes[] = $lane;
            }
        }

        return [
            'player_a' => ['id' => $playerA->id, 'name' => $playerA->name],
            'player_b' => ['id' => $playerB->id, 'name' => $playerB->name],
            'record' => $record,
            'games_with_points' => $totalCharted,
            'window' => ['limit' => $limit, 'offset' => $offset, 'total' => $totalCharted],
            'lanes' => $lanes,
            'summary' => $this->summarise($lanes),
        ];
    }

    /** @return Builder<PingPongMatch> */
    private function completedSinglesBetween(int $playerAId, int $playerBId): Builder
    {
        return PingPongMatch::query()
            ->where('mode', '1v1')
            ->whereNotNull('ended_at')
            ->where(function ($query) use ($playerAId, $playerBId) {
                $query
                    ->where(fn ($q) => $q->where('player_left_id', $playerAId)->where('player_right_id', $playerBId))
                    ->orWhere(fn ($q) => $q->where('player_left_id', $playerBId)->where('player_right_id', $playerAId));
            });
    }

    /**
     * @param  Collection<int, PingPongMatch>  $matches
     * @return array<int, int>
     */
    private function clipIdsByPointId(Collection $matches): array
    {
        $pointIds = $matches->flatMap(fn (PingPongMatch $match) => $match->points->pluck('id'))->all();

        if ($pointIds === []) {
            return [];
        }

        return PingPongClip::query()
            ->whereIn('ping_pong_point_id', $pointIds)
            ->pluck('id', 'ping_pong_point_id')
            ->all();
    }

    /**
     * Build one game's lane. Returns null when the match has no point-by-point
     * rows, which is the case for matches logged before the points table existed.
     *
     * @param  array<int, int>  $clipIdsByPointId  Clip id keyed by point id, for rallies that have video
     * @return array{match_id: int, played_at: ?string, score_a: int, score_b: int, winner: string, point_count: int, duration_seconds: int, reached_deuce: bool, elo_delta_a: ?int, dots: list<array<string, mixed>>}|null
     */
    public function buildLane(PingPongMatch $match, int $playerAId, array $clipIdsByPointId = []): ?array
    {
        $points = $match->points->values();

        if ($points->isEmpty()) {
            return null;
        }

        $aIsLeft = $match->player_left_id === $playerAId;
        $sideOfA = $aIsLeft ? 'left' : 'right';

        $dots = [];
        $previousAt = null;
        $reachedDeuce = false;
        $lastIndex = $points->count() - 1;

        // The clock starts at the first rally, not at started_at: the gap between
        // them is lobby and setup time, which would otherwise pad every lane.
        $origin = $points->first()->created_at;

        foreach ($points as $index => $point) {
            $scoreA = $aIsLeft ? $point->left_score_after : $point->right_score_after;
            $scoreB = $aIsLeft ? $point->right_score_after : $point->left_score_after;

            if ($scoreA >= 10 && $scoreB >= 10) {
                $reachedDeuce = true;
            }

            $serverSide = $point->serverSide();

            $dots[] = [
                'n' => $index + 1,
                'margin' => $scoreA - $scoreB,
                'score_a' => $scoreA,
                'score_b' => $scoreB,
                'scorer' => $point->scoring_side === $sideOfA ? 'a' : 'b',
                'server' => $serverSide === $sideOfA ? 'a' : 'b',
                'held_serve' => $serverSide === $point->scoring_side,
                'cause' => $point->point_cause,
                'error_type' => $point->error_type,
                'shot_type' => $point->shot_type,
                'body_hit' => (bool) $point->body_hit,
                'net_edge' => (bool) $point->net_edge,
                'table_edge' => (bool) $point->table_edge,
                'pace_seconds' => $previousAt === null ? null : (int) $previousAt->diffInSeconds($point->created_at),
                't_seconds' => (int) $origin->diffInSeconds($point->created_at),
                'is_final' => $index === $lastIndex,
                'clip_id' => $clipIdsByPointId[$point->id] ?? null,
            ];

            $previousAt = $point->created_at;
        }

        $finalA = $aIsLeft ? $match->player_left_score : $match->player_right_score;
        $finalB = $aIsLeft ? $match->player_right_score : $match->player_left_score;

        return [
            'match_id' => $match->id,
            'played_at' => $match->ended_at?->toIso8601String(),
            'score_a' => $finalA,
            'score_b' => $finalB,
            'winner' => $finalA > $finalB ? 'a' : 'b',
            'point_count' => $points->count(),
            'duration_seconds' => (int) $origin->diffInSeconds($points->last()->created_at),
            'reached_deuce' => $reachedDeuce,
            'elo_delta_a' => $this->eloDeltaFor($match, $aIsLeft),
            'dots' => $dots,
        ];
    }

    /**
     * Aggregate the charted lanes into matchup-wide statistics.
     *
     * @param  list<array<string, mixed>>  $lanes
     * @return array{points_won_a: int, points_won_b: int, avg_margin: ?float, avg_duration_seconds: ?int, longest_run: ?array{player: string, length: int, match_id: int}, biggest_comeback: ?array{player: string, deficit: int, match_id: int}, serve_hold_a: ?float, serve_hold_b: ?float, deuce_games: int, deuce_wins_a: int}
     */
    public function summarise(array $lanes): array
    {
        $pointsWon = ['a' => 0, 'b' => 0];
        $served = ['a' => 0, 'b' => 0];
        $held = ['a' => 0, 'b' => 0];
        $marginSum = 0;
        $durationSum = 0;
        $deuceGames = 0;
        $deuceWinsA = 0;
        $longestRun = null;
        $biggestComeback = null;

        foreach ($lanes as $lane) {
            $marginSum += $lane['score_a'] - $lane['score_b'];
            $durationSum += $lane['duration_seconds'];

            if ($lane['reached_deuce']) {
                $deuceGames++;
                if ($lane['winner'] === 'a') {
                    $deuceWinsA++;
                }
            }

            $runPlayer = null;
            $runLength = 0;

            foreach ($lane['dots'] as $dot) {
                $pointsWon[$dot['scorer']]++;
                $served[$dot['server']]++;
                if ($dot['held_serve']) {
                    $held[$dot['server']]++;
                }

                if ($dot['scorer'] === $runPlayer) {
                    $runLength++;
                } else {
                    $runPlayer = $dot['scorer'];
                    $runLength = 1;
                }

                if ($longestRun === null || $runLength > $longestRun['length']) {
                    $longestRun = [
                        'player' => $runPlayer,
                        'length' => $runLength,
                        'match_id' => $lane['match_id'],
                    ];
                }

                $deficit = $lane['winner'] === 'a' ? -$dot['margin'] : $dot['margin'];

                if ($deficit > 0 && ($biggestComeback === null || $deficit > $biggestComeback['deficit'])) {
                    $biggestComeback = [
                        'player' => $lane['winner'],
                        'deficit' => $deficit,
                        'match_id' => $lane['match_id'],
                    ];
                }
            }
        }

        $laneCount = count($lanes);

        return [
            'points_won_a' => $pointsWon['a'],
            'points_won_b' => $pointsWon['b'],
            'avg_margin' => $laneCount === 0 ? null : round($marginSum / $laneCount, 2),
            'avg_duration_seconds' => $laneCount === 0 ? null : (int) round($durationSum / $laneCount),
            'longest_run' => $longestRun,
            'biggest_comeback' => $biggestComeback,
            'serve_hold_a' => $served['a'] === 0 ? null : round($held['a'] / $served['a'], 3),
            'serve_hold_b' => $served['b'] === 0 ? null : round($held['b'] / $served['b'], 3),
            'deuce_games' => $deuceGames,
            'deuce_wins_a' => $deuceWinsA,
        ];
    }

    /**
     * Win/loss record over every completed match, including legacy ones that
     * have no point rows and therefore never appear as a lane.
     *
     * @param  Collection<int, PingPongMatch>  $matches
     * @return array{a_wins: int, b_wins: int, games_total: int}
     */
    public function record(Collection $matches, int $playerAId): array
    {
        $aWins = $matches->where('winner_id', $playerAId)->count();

        return [
            'a_wins' => $aWins,
            'b_wins' => $matches->count() - $aWins,
            'games_total' => $matches->count(),
        ];
    }

    private function eloDeltaFor(PingPongMatch $match, bool $aIsLeft): ?int
    {
        $before = $aIsLeft ? $match->player_left_elo_before : $match->player_right_elo_before;
        $after = $aIsLeft ? $match->player_left_elo_after : $match->player_right_elo_after;

        if ($before === null || $after === null) {
            return null;
        }

        return $after - $before;
    }
}
