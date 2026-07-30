<?php

namespace Tests\Unit;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Games\PingPong\Services\MatchupAnalysisService;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Tests\TestCase;

class PingPongMatchupAnalysisTest extends TestCase
{
    private const PLAYER_A = 6;

    private const PLAYER_B = 13;

    private MatchupAnalysisService $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = new MatchupAnalysisService;
    }

    /**
     * Build an in-memory match with its points relation populated. No DB.
     *
     * @param  list<string>  $sides  Scoring side per rally, e.g. ['left', 'right', 'left']
     * @param  array<string, mixed>  $attrs  Overrides on the match
     * @param  array<int, array<string, mixed>>  $pointAttrs  Extra attributes keyed by 1-based point number
     */
    private function makeMatch(array $sides, array $attrs = [], array $pointAttrs = []): PingPongMatch
    {
        $match = new PingPongMatch;
        $match->id = $attrs['id'] ?? 1;
        $match->mode = '1v1';
        $match->player_left_id = $attrs['player_left_id'] ?? self::PLAYER_A;
        $match->player_right_id = $attrs['player_right_id'] ?? self::PLAYER_B;
        $match->first_server_id = $attrs['first_server_id'] ?? $match->player_left_id;
        $match->started_at = Carbon::parse($attrs['started_at'] ?? '2026-07-01 10:00:00');
        $match->ended_at = Carbon::parse($attrs['ended_at'] ?? '2026-07-01 10:12:00');
        $match->player_left_elo_before = $attrs['player_left_elo_before'] ?? 1000;
        $match->player_left_elo_after = $attrs['player_left_elo_after'] ?? 1012;
        $match->player_right_elo_before = $attrs['player_right_elo_before'] ?? 1000;
        $match->player_right_elo_after = $attrs['player_right_elo_after'] ?? 988;

        $left = 0;
        $right = 0;
        $clock = Carbon::parse($attrs['started_at'] ?? '2026-07-01 10:00:00');
        $points = new Collection;

        foreach ($sides as $index => $side) {
            $side === 'left' ? $left++ : $right++;
            $number = $index + 1;
            $extra = $pointAttrs[$number] ?? [];

            $point = new PingPongPoint;
            $point->id = $number;
            $point->match_id = $match->id;
            $point->scoring_side = $side;
            $point->point_number = $number;
            $point->left_score_after = $left;
            $point->right_score_after = $right;
            $point->shot_type = $extra['shot_type'] ?? null;
            $point->point_cause = $extra['point_cause'] ?? null;
            $point->error_type = $extra['error_type'] ?? null;
            $point->net_edge = $extra['net_edge'] ?? false;
            $point->table_edge = $extra['table_edge'] ?? false;
            $point->body_hit = $extra['body_hit'] ?? false;
            $point->serve_point = $extra['serve_point'] ?? false;
            $clock = $clock->copy()->addSeconds($extra['gap'] ?? 10);
            $point->created_at = $clock;
            $point->setRelation('match', $match);

            $points->push($point);
        }

        $match->player_left_score = $attrs['player_left_score'] ?? $left;
        $match->player_right_score = $attrs['player_right_score'] ?? $right;
        $match->winner_id = $attrs['winner_id'] ?? ($match->player_left_score > $match->player_right_score
            ? $match->player_left_id
            : $match->player_right_id);
        $match->setRelation('points', $points);

        return $match;
    }

    /**
     * @param  list<string>  $sides
     * @param  array<string, mixed>  $attrs
     * @return array<string, mixed>
     */
    private function lane(array $sides, array $attrs = []): array
    {
        return $this->service->buildLane($this->makeMatch($sides, $attrs), self::PLAYER_A);
    }

    public function test_margin_is_positive_when_player_a_leads_from_the_left_side(): void
    {
        $match = $this->makeMatch(['left', 'left', 'right'], ['player_left_id' => self::PLAYER_A]);

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame([1, 2, 1], array_column($lane['dots'], 'margin'));
    }

    public function test_margin_is_positive_when_player_a_leads_from_the_right_side(): void
    {
        $match = $this->makeMatch(
            ['right', 'right', 'left'],
            ['player_left_id' => self::PLAYER_B, 'player_right_id' => self::PLAYER_A]
        );

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame([1, 2, 1], array_column($lane['dots'], 'margin'));
    }

    public function test_scorer_is_normalised_to_player_letters_regardless_of_side(): void
    {
        $match = $this->makeMatch(
            ['left', 'right'],
            ['player_left_id' => self::PLAYER_B, 'player_right_id' => self::PLAYER_A]
        );

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame(['b', 'a'], array_column($lane['dots'], 'scorer'));
    }

    public function test_lane_reports_normalised_final_score_and_winner(): void
    {
        $match = $this->makeMatch(
            array_merge(array_fill(0, 11, 'right'), array_fill(0, 4, 'left')),
            ['player_left_id' => self::PLAYER_B, 'player_right_id' => self::PLAYER_A]
        );

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame(11, $lane['score_a']);
        $this->assertSame(4, $lane['score_b']);
        $this->assertSame('a', $lane['winner']);
    }

    public function test_only_the_last_dot_is_flagged_final(): void
    {
        $match = $this->makeMatch(['left', 'left', 'right']);

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame([false, false, true], array_column($lane['dots'], 'is_final'));
    }

    public function test_serve_is_normalised_and_hold_is_derived(): void
    {
        // A serves points 1-2 (first server, left side): wins #1 (hold), loses #2 (break).
        $match = $this->makeMatch(['left', 'right'], ['first_server_id' => self::PLAYER_A]);

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame(['a', 'a'], array_column($lane['dots'], 'server'));
        $this->assertSame([true, false], array_column($lane['dots'], 'held_serve'));
    }

    public function test_pace_is_the_gap_from_the_previous_point_and_null_for_the_first(): void
    {
        $match = $this->makeMatch(
            ['left', 'right', 'left'],
            [],
            [2 => ['gap' => 25], 3 => ['gap' => 4]]
        );

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertNull($lane['dots'][0]['pace_seconds']);
        $this->assertSame(25, $lane['dots'][1]['pace_seconds']);
        $this->assertSame(4, $lane['dots'][2]['pace_seconds']);
    }

    public function test_dots_carry_elapsed_seconds_measured_from_the_first_point(): void
    {
        // Lead-in from started_at to the first rally is lobby/setup time, not play,
        // so the clock starts at the first point.
        $match = $this->makeMatch(
            ['left', 'right', 'left'],
            [],
            [1 => ['gap' => 45], 2 => ['gap' => 25], 3 => ['gap' => 4]]
        );

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame([0, 25, 29], array_column($lane['dots'], 't_seconds'));
    }

    public function test_lane_duration_is_the_span_between_its_first_and_last_point(): void
    {
        $match = $this->makeMatch(
            ['left', 'right', 'left'],
            [],
            [1 => ['gap' => 45], 2 => ['gap' => 25], 3 => ['gap' => 4]]
        );

        $this->assertSame(29, $this->service->buildLane($match, self::PLAYER_A)['duration_seconds']);
    }

    public function test_lane_carries_point_detail_for_the_tooltip(): void
    {
        $match = $this->makeMatch(['left'], [], [1 => [
            'shot_type' => 'fh',
            'point_cause' => 'winner',
            'body_hit' => true,
            'net_edge' => true,
        ]]);

        $dot = $this->service->buildLane($match, self::PLAYER_A)['dots'][0];

        $this->assertSame('fh', $dot['shot_type']);
        $this->assertSame('winner', $dot['cause']);
        $this->assertTrue($dot['body_hit']);
        $this->assertTrue($dot['net_edge']);
        $this->assertFalse($dot['table_edge']);
    }

    public function test_lane_elo_delta_follows_player_a_side(): void
    {
        $match = $this->makeMatch(
            ['right'],
            [
                'player_left_id' => self::PLAYER_B,
                'player_right_id' => self::PLAYER_A,
                'player_right_elo_before' => 1200,
                'player_right_elo_after' => 1215,
            ]
        );

        $lane = $this->service->buildLane($match, self::PLAYER_A);

        $this->assertSame(15, $lane['elo_delta_a']);
    }

    public function test_lane_flags_games_that_reached_deuce(): void
    {
        $alternating = [];
        for ($i = 0; $i < 10; $i++) {
            $alternating[] = 'left';
            $alternating[] = 'right';
        }
        $deuceMatch = $this->makeMatch(array_merge($alternating, ['left', 'left']));
        $straightMatch = $this->makeMatch(array_merge(array_fill(0, 11, 'left'), array_fill(0, 5, 'right')));

        $this->assertTrue($this->service->buildLane($deuceMatch, self::PLAYER_A)['reached_deuce']);
        $this->assertFalse($this->service->buildLane($straightMatch, self::PLAYER_A)['reached_deuce']);
    }

    public function test_match_without_point_rows_yields_no_lane(): void
    {
        $match = $this->makeMatch([], ['player_left_score' => 11, 'player_right_score' => 7]);

        $this->assertNull($this->service->buildLane($match, self::PLAYER_A));
    }

    public function test_dots_carry_clip_ids_for_rallies_that_have_video(): void
    {
        $match = $this->makeMatch(['left', 'right', 'left']);

        $lane = $this->service->buildLane($match, self::PLAYER_A, [2 => 99]);

        $this->assertNull($lane['dots'][0]['clip_id']);
        $this->assertSame(99, $lane['dots'][1]['clip_id']);
        $this->assertNull($lane['dots'][2]['clip_id']);
    }

    public function test_summary_totals_points_won_by_each_player(): void
    {
        $lanes = [
            $this->lane(['left', 'left', 'left', 'right']),
            $this->lane(['left', 'right', 'right'], ['id' => 2]),
        ];

        $summary = $this->service->summarise($lanes);

        $this->assertSame(4, $summary['points_won_a']);
        $this->assertSame(3, $summary['points_won_b']);
    }

    public function test_summary_averages_the_signed_final_margin(): void
    {
        $lanes = [
            $this->lane(array_merge(array_fill(0, 11, 'left'), array_fill(0, 4, 'right'))),
            $this->lane(array_merge(array_fill(0, 5, 'left'), array_fill(0, 11, 'right')), ['id' => 2]),
        ];

        $summary = $this->service->summarise($lanes);

        $this->assertSame(0.5, $summary['avg_margin']);
    }

    public function test_summary_averages_game_duration(): void
    {
        $lanes = [
            $this->lane(['left', 'right', 'left']),
            $this->lane(['left', 'right', 'left', 'right', 'left'], ['id' => 2]),
        ];

        // Default helper gap is 10s per rally: spans of 20s and 40s.
        $this->assertSame(30, $this->service->summarise($lanes)['avg_duration_seconds']);
    }

    public function test_summary_finds_the_longest_point_run_across_games(): void
    {
        $lanes = [
            $this->lane(['left', 'left', 'left', 'right']),
            $this->lane(['right', 'right', 'right', 'right', 'left'], ['id' => 2]),
        ];

        $summary = $this->service->summarise($lanes);

        $this->assertSame('b', $summary['longest_run']['player']);
        $this->assertSame(4, $summary['longest_run']['length']);
        $this->assertSame(2, $summary['longest_run']['match_id']);
    }

    public function test_summary_finds_the_biggest_deficit_overcome_in_a_win(): void
    {
        $lanes = [
            // A trails 0-4, then wins 11-4.
            $this->lane(array_merge(array_fill(0, 4, 'right'), array_fill(0, 11, 'left'))),
            // B trails 0-2, then wins 11-2 — a smaller comeback.
            $this->lane(array_merge(array_fill(0, 2, 'left'), array_fill(0, 11, 'right')), ['id' => 2]),
        ];

        $summary = $this->service->summarise($lanes);

        $this->assertSame('a', $summary['biggest_comeback']['player']);
        $this->assertSame(4, $summary['biggest_comeback']['deficit']);
        $this->assertSame(1, $summary['biggest_comeback']['match_id']);
    }

    public function test_summary_has_no_comeback_when_no_winner_ever_trailed(): void
    {
        $lanes = [$this->lane(array_fill(0, 11, 'left'))];

        $this->assertNull($this->service->summarise($lanes)['biggest_comeback']);
    }

    public function test_summary_computes_serve_hold_rate_per_player(): void
    {
        // A serves points 1-2 and wins both; B serves 3-4 and wins only one.
        $lanes = [$this->lane(['left', 'left', 'right', 'left'], ['first_server_id' => self::PLAYER_A])];

        $summary = $this->service->summarise($lanes);

        $this->assertSame(1.0, $summary['serve_hold_a']);
        $this->assertSame(0.5, $summary['serve_hold_b']);
    }

    public function test_summary_counts_deuce_games_and_player_a_wins_in_them(): void
    {
        $alternating = [];
        for ($i = 0; $i < 10; $i++) {
            $alternating[] = 'left';
            $alternating[] = 'right';
        }
        $lanes = [
            $this->lane(array_merge($alternating, ['left', 'left'])),
            $this->lane(array_merge($alternating, ['right', 'right']), ['id' => 2]),
            $this->lane(array_fill(0, 11, 'left'), ['id' => 3]),
        ];

        $summary = $this->service->summarise($lanes);

        $this->assertSame(2, $summary['deuce_games']);
        $this->assertSame(1, $summary['deuce_wins_a']);
    }

    public function test_record_counts_wins_over_every_match_including_those_without_points(): void
    {
        $matches = new Collection([
            $this->makeMatch(['left', 'left']),
            $this->makeMatch(['right', 'right', 'right'], ['id' => 2]),
            // Legacy match with a score but no point rows: still counts toward the record.
            $this->makeMatch([], ['id' => 3, 'player_left_score' => 11, 'player_right_score' => 6]),
        ]);

        $record = $this->service->record($matches, self::PLAYER_A);

        $this->assertSame(2, $record['a_wins']);
        $this->assertSame(1, $record['b_wins']);
        $this->assertSame(3, $record['games_total']);
    }

    public function test_record_counts_wins_when_player_a_played_on_the_right(): void
    {
        $matches = new Collection([
            $this->makeMatch(['left'], ['player_left_id' => self::PLAYER_B, 'player_right_id' => self::PLAYER_A]),
        ]);

        $record = $this->service->record($matches, self::PLAYER_A);

        $this->assertSame(0, $record['a_wins']);
        $this->assertSame(1, $record['b_wins']);
    }

    public function test_summary_of_no_lanes_is_empty_rather_than_dividing_by_zero(): void
    {
        $summary = $this->service->summarise([]);

        $this->assertSame(0, $summary['points_won_a']);
        $this->assertNull($summary['avg_margin']);
        $this->assertNull($summary['avg_duration_seconds']);
        $this->assertNull($summary['longest_run']);
        $this->assertNull($summary['serve_hold_a']);
        $this->assertSame(0, $summary['deuce_games']);
    }
}
