<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TagPointTest extends TestCase
{
    use RefreshDatabase;

    private function makePoint(array $pointAttrs = []): PingPongPoint
    {
        $left = Player::create(['name' => 'Left']);
        $right = Player::create(['name' => 'Right']);
        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
            'player_left_score' => 1,
            'player_right_score' => 0,
            'started_at' => now(),
        ]);
        return PingPongPoint::create(array_merge([
            'match_id' => $match->id,
            'scoring_side' => 'left',
            'point_number' => 1,
            'left_score_after' => 1,
            'right_score_after' => 0,
        ], $pointAttrs));
    }

    public function test_tags_error_type_serve_point_and_body_hit(): void
    {
        $point = $this->makePoint();

        $res = $this->patchJson("/games/ping-pong/api/points/{$point->id}", [
            'point_cause' => 'opponent_error',
            'shot_type' => 'backhand',
            'error_type' => 'net',
            'serve_point' => true,
            'body_hit' => true,
        ]);

        $res->assertOk()
            ->assertJson([
                'point_cause' => 'opponent_error',
                'shot_type' => 'backhand',
                'error_type' => 'net',
                'serve_point' => true,
                'body_hit' => true,
            ]);
    }

    public function test_wing_is_kept_on_opponent_error(): void
    {
        $point = $this->makePoint(['shot_type' => 'forehand', 'net_edge' => true]);

        $res = $this->patchJson("/games/ping-pong/api/points/{$point->id}", [
            'point_cause' => 'opponent_error',
        ]);

        $res->assertOk()->assertJson(['shot_type' => 'forehand', 'net_edge' => true]);
    }

    public function test_error_type_is_cleared_when_cause_is_winner(): void
    {
        $point = $this->makePoint(['error_type' => 'net']);

        $res = $this->patchJson("/games/ping-pong/api/points/{$point->id}", [
            'point_cause' => 'winner',
        ]);

        $res->assertOk()->assertJson(['point_cause' => 'winner', 'error_type' => null]);
    }
}
