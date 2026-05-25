<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongPoint;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

class PlayerPointTagStatsService
{
    public const TAGS = ['forehand', 'backhand', 'net', 'opponent_error', 'untagged'];

    /** Matches before this date predate point tagging (migration added May 22, 2026). */
    private const TAGGING_STATS_SINCE = '2026-05-22';

    private const TAG_LABELS = [
        'forehand' => 'Forehand',
        'backhand' => 'Backhand',
        'net' => 'Net edge',
        'opponent_error' => 'Their error',
        'untagged' => 'Untagged',
    ];

    /**
     * Aggregate point tags for all points the player scored in completed matches.
     *
     * @return array{total: int, forehand: int, backhand: int, net: int, opponent_error: int, untagged: int, tagged: int, has_tags: bool}|null
     */
    public function getStats(int $playerId, string $mode = '1v1'): ?array
    {
        $points = $this->scoredPointsQuery($playerId, $mode)->get();

        if ($points->isEmpty()) {
            return null;
        }

        $breakdown = $this->breakdownFromPoints($points);

        if (!$breakdown['has_tags']) {
            return null;
        }

        return $breakdown;
    }

    /**
     * Weekly history for a single tag (1v1 only).
     *
     * @return array{tag: string, label: string, points: list<array{week_start: string, week_label: string, count: int, total: int, pct: float}>}|null
     */
    public function getTagHistory(int $playerId, string $tag): ?array
    {
        if (!in_array($tag, self::TAGS, true)) {
            return null;
        }

        $points = $this->scoredPointsQuery($playerId, '1v1')
            ->addSelect('ping_pong_matches.ended_at as match_ended_at')
            ->orderBy('ping_pong_matches.ended_at')
            ->get();

        if ($points->isEmpty()) {
            return null;
        }

        $byWeek = [];
        foreach ($points as $point) {
            $weekStart = Carbon::parse($point->match_ended_at)->startOfWeek();
            $weekKey = $weekStart->toDateString();

            if (!isset($byWeek[$weekKey])) {
                $byWeek[$weekKey] = [
                    'week_start' => $weekKey,
                    'week_label' => $weekStart->format('M j'),
                    'count' => 0,
                    'total' => 0,
                ];
            }

            $byWeek[$weekKey]['total']++;
            if ($this->pointMatchesTag($point, $tag)) {
                $byWeek[$weekKey]['count']++;
            }
        }

        ksort($byWeek);

        $series = [];
        foreach ($byWeek as $week) {
            $series[] = [
                'week_start' => $week['week_start'],
                'week_label' => $week['week_label'],
                'count' => $week['count'],
                'total' => $week['total'],
                'pct' => $week['total'] > 0
                    ? round(($week['count'] / $week['total']) * 100, 1)
                    : 0.0,
            ];
        }

        return [
            'tag' => $tag,
            'label' => self::TAG_LABELS[$tag],
            'points' => $series,
        ];
    }

    /**
     * Weekly counts for every tag (1v1), aligned by week.
     *
     * @return array{weeks: list<array{week_start: string, week_label: string}>, series: list<array{tag: string, label: string, counts: list<int>}>}|null
     */
    public function getComparativeHistory(int $playerId): ?array
    {
        $points = $this->scoredPointsQuery($playerId, '1v1')
            ->addSelect('ping_pong_matches.ended_at as match_ended_at')
            ->orderBy('ping_pong_matches.ended_at')
            ->get();

        if ($points->isEmpty()) {
            return null;
        }

        $byWeek = [];
        foreach ($points as $point) {
            $weekStart = Carbon::parse($point->match_ended_at)->startOfWeek();
            $weekKey = $weekStart->toDateString();

            if (!isset($byWeek[$weekKey])) {
                $byWeek[$weekKey] = [
                    'week_start' => $weekKey,
                    'week_label' => $weekStart->format('M j'),
                    'tags' => array_fill_keys(self::TAGS, 0),
                ];
            }

            foreach (self::TAGS as $tag) {
                if ($this->pointMatchesTag($point, $tag)) {
                    $byWeek[$weekKey]['tags'][$tag]++;
                }
            }
        }

        ksort($byWeek);
        $weeks = array_values(array_map(
            fn (array $week) => [
                'week_start' => $week['week_start'],
                'week_label' => $week['week_label'],
            ],
            $byWeek
        ));

        $series = [];
        foreach (self::TAGS as $tag) {
            $series[] = [
                'tag' => $tag,
                'label' => self::TAG_LABELS[$tag],
                'counts' => array_values(array_map(fn (array $week) => $week['tags'][$tag], $byWeek)),
            ];
        }

        return [
            'weeks' => $weeks,
            'series' => $series,
        ];
    }

    public function isValidTag(string $tag): bool
    {
        return in_array($tag, self::TAGS, true);
    }

    private function scoredPointsQuery(int $playerId, string $mode)
    {
        return PingPongPoint::query()
            ->select('ping_pong_points.*')
            ->join('ping_pong_matches', 'ping_pong_matches.id', '=', 'ping_pong_points.match_id')
            ->whereNotNull('ping_pong_matches.ended_at')
            ->where('ping_pong_matches.ended_at', '>=', Carbon::parse(self::TAGGING_STATS_SINCE)->startOfDay())
            ->where('ping_pong_matches.mode', $mode)
            ->where(function ($q) use ($playerId) {
                $q->where(function ($q2) use ($playerId) {
                    $q2->where(function ($q3) use ($playerId) {
                        $q3->where('ping_pong_matches.player_left_id', $playerId)
                            ->orWhere('ping_pong_matches.team_left_player2_id', $playerId);
                    })->where('ping_pong_points.scoring_side', 'left');
                })->orWhere(function ($q2) use ($playerId) {
                    $q2->where(function ($q3) use ($playerId) {
                        $q3->where('ping_pong_matches.player_right_id', $playerId)
                            ->orWhere('ping_pong_matches.team_right_player2_id', $playerId);
                    })->where('ping_pong_points.scoring_side', 'right');
                });
            });
    }

    private function pointMatchesTag(PingPongPoint $point, string $tag): bool
    {
        return match ($tag) {
            'forehand' => $point->shot_type === 'forehand',
            'backhand' => $point->shot_type === 'backhand',
            'net' => (bool) $point->net_edge,
            'opponent_error' => $point->point_cause === 'opponent_error',
            'untagged' => !$point->shot_type && !$point->net_edge && !$point->point_cause,
            default => false,
        };
    }

    /**
     * @param  Collection<int, PingPongPoint>  $points
     * @return array{total: int, forehand: int, backhand: int, net: int, opponent_error: int, untagged: int, tagged: int, has_tags: bool}
     */
    private function breakdownFromPoints(Collection $points): array
    {
        $forehand = $points->where('shot_type', 'forehand')->count();
        $backhand = $points->where('shot_type', 'backhand')->count();
        $net = $points->where('net_edge', true)->count();
        $opponentError = $points->where('point_cause', 'opponent_error')->count();
        $untagged = $points->filter(
            fn (PingPongPoint $p) => !$p->shot_type && !$p->net_edge && !$p->point_cause
        )->count();
        $tagged = $points->filter(
            fn (PingPongPoint $p) => $p->shot_type || $p->net_edge || $p->point_cause
        )->count();

        return [
            'total' => $points->count(),
            'forehand' => $forehand,
            'backhand' => $backhand,
            'net' => $net,
            'opponent_error' => $opponentError,
            'untagged' => $untagged,
            'tagged' => $tagged,
            'has_tags' => $tagged > 0,
        ];
    }
}
