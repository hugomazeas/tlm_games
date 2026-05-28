<?php

namespace Tests\Unit;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
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
}
