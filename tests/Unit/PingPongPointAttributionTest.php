<?php

namespace Tests\Unit;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Models\Player;
use Tests\TestCase;

class PingPongPointAttributionTest extends TestCase
{
    private function point(array $attrs, array $matchAttrs = []): PingPongPoint
    {
        $match = new PingPongMatch(array_merge([
            'mode' => '1v1',
            'player_left_id' => 1,
            'player_right_id' => 2,
            'first_server_id' => 1,
        ], $matchAttrs));
        $match->player_left_id = $matchAttrs['player_left_id'] ?? 1;
        $match->player_right_id = $matchAttrs['player_right_id'] ?? 2;
        $match->first_server_id = $matchAttrs['first_server_id'] ?? 1;

        $point = new PingPongPoint($attrs);
        $point->scoring_side = $attrs['scoring_side'];
        $point->point_number = $attrs['point_number'];
        $point->left_score_after = $attrs['left_score_after'];
        $point->right_score_after = $attrs['right_score_after'];
        $point->point_cause = $attrs['point_cause'] ?? null;
        $point->setRelation('match', $match);
        return $point;
    }

    public function test_decisive_side_is_scoring_side_on_winner(): void
    {
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 1, 'left_score_after' => 1, 'right_score_after' => 0, 'point_cause' => 'winner']);
        $this->assertSame('left', $p->decisiveSide());
    }

    public function test_decisive_side_is_opposite_on_opponent_error(): void
    {
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 1, 'left_score_after' => 1, 'right_score_after' => 0, 'point_cause' => 'opponent_error']);
        $this->assertSame('right', $p->decisiveSide());
    }

    public function test_server_side_first_two_points_belong_to_first_server(): void
    {
        $p1 = $this->point(['scoring_side' => 'left', 'point_number' => 1, 'left_score_after' => 1, 'right_score_after' => 0]);
        $p2 = $this->point(['scoring_side' => 'right', 'point_number' => 2, 'left_score_after' => 1, 'right_score_after' => 1]);
        $this->assertSame('left', $p1->serverSide());
        $this->assertSame('left', $p2->serverSide());
    }

    public function test_server_side_switches_every_two_points(): void
    {
        $p3 = $this->point(['scoring_side' => 'left', 'point_number' => 3, 'left_score_after' => 2, 'right_score_after' => 1]);
        $this->assertSame('right', $p3->serverSide());
    }

    public function test_server_side_alternates_every_point_in_deuce(): void
    {
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 21, 'left_score_after' => 11, 'right_score_after' => 10]);
        $this->assertSame('left', $p->serverSide());
    }

    public function test_server_side_second_deuce_point(): void
    {
        // before this point left=11, right=11 -> deuce total 22, interval 1, index 0 -> first server (left)
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 23, 'left_score_after' => 12, 'right_score_after' => 11]);
        $this->assertSame('left', $p->serverSide());
    }

    /**
     * Build a completed 1v1 match (left wins, winner_id=1) with the given tagged points.
     *
     * @param  array<int, array{cause: string, side: string}>  $points
     */
    private function matchWith(array $points, string $mode = '1v1'): PingPongMatch
    {
        $match = new PingPongMatch(['mode' => $mode]);
        $match->player_left_id = 1;
        $match->player_right_id = 2;
        $match->winner_id = 1;
        $left = new Player(['name' => 'Alice']);
        $left->id = 1;
        $right = new Player(['name' => 'Bob']);
        $right->id = 2;
        $match->setRelation('winner', $left);
        $match->setRelation('playerLeft', $left);
        $match->setRelation('playerRight', $right);

        $collection = collect($points)->map(function ($p, $i) {
            return new PingPongPoint([
                'point_cause' => $p['cause'],
                'scoring_side' => $p['side'],
                'point_number' => $i + 1,
            ]);
        });
        $match->setRelation('points', $collection);

        return $match;
    }

    /**
     * @param  int  $errors  loser errors gifted to the winner (left)
     * @param  int  $earned  winning shots earned by the winner (left)
     * @return array<int, array{cause: string, side: string}>
     */
    private function points(int $errors, int $earned): array
    {
        $out = [];
        for ($i = 0; $i < $errors; $i++) {
            $out[] = ['cause' => 'opponent_error', 'side' => 'left'];
        }
        for ($i = 0; $i < $earned; $i++) {
            $out[] = ['cause' => 'winner', 'side' => 'left'];
        }

        return $out;
    }

    public function test_result_attribution_lost_when_errors_dominate(): void
    {
        // 9 errors + 2 earned = 11 tagged: gift 82% (>=64 p75), earned 18% (<28) -> lost by loser (id 2)
        $match = $this->matchWith($this->points(errors: 9, earned: 2));
        $a = $match->resultAttribution();
        $this->assertSame('lost', $a['verdict']);
        $this->assertSame(2, $a['player']->id);
    }

    public function test_result_attribution_won_when_earned_dominate(): void
    {
        // 8 earned + 3 errors = 11 tagged: earned 73% (excess +0.45), gift 27% (excess -0.37) -> won by winner (id 1)
        $match = $this->matchWith($this->points(errors: 3, earned: 8));
        $a = $match->resultAttribution();
        $this->assertSame('won', $a['verdict']);
        $this->assertSame(1, $a['player']->id);
    }

    public function test_result_attribution_contested_when_neither_exceptional(): void
    {
        // 7 errors + 4 earned = 11 winner-side: gift 64% (<.82), earned 36% (<.46) -> both below p75.
        $a = $this->matchWith($this->points(errors: 7, earned: 4))->resultAttribution();
        $this->assertSame('contested', $a['verdict']);
        $this->assertNull($a['player']);
    }

    public function test_result_attribution_ignores_loser_side_points(): void
    {
        // Only winner-side points count toward the denominator; loser-side tagged points are noise.
        $points = array_merge(
            $this->points(errors: 9, earned: 2),
            [['cause' => 'opponent_error', 'side' => 'right'], ['cause' => 'winner', 'side' => 'right']],
        );
        $a = $this->matchWith($points)->resultAttribution();
        $this->assertSame('lost', $a['verdict']);
        $this->assertSame(11, $a['tagged']);
    }

    public function test_result_attribution_null_when_too_few_tagged(): void
    {
        $this->assertNull($this->matchWith($this->points(errors: 3, earned: 1))->resultAttribution());
    }

    public function test_result_attribution_null_for_doubles(): void
    {
        $this->assertNull($this->matchWith($this->points(errors: 9, earned: 2), mode: '2v2')->resultAttribution());
    }
}
