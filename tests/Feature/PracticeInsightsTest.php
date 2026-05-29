<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Games\PingPong\Services\PracticeInsightsService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PracticeInsightsTest extends TestCase
{
    use RefreshDatabase;

    public function test_aggregates_serve_wing_and_errors_for_player(): void
    {
        $left = Player::create(['name' => 'Hero']);   // target player, left side, first server
        $right = Player::create(['name' => 'Foe']);
        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
            'player_left_score' => 2,
            'player_right_score' => 1,
            'started_at' => now(),
            'ended_at' => now(),
            'winner_id' => $left->id,
        ]);

        // Point 1 (left serves): Hero wins with a forehand on serve.
        PingPongPoint::create(['match_id' => $match->id, 'scoring_side' => 'left', 'point_number' => 1,
            'left_score_after' => 1, 'right_score_after' => 0,
            'point_cause' => 'winner', 'shot_type' => 'forehand', 'serve_point' => true]);
        // Point 2 (left serves): Foe wins because Hero erred backhand into the net.
        PingPongPoint::create(['match_id' => $match->id, 'scoring_side' => 'right', 'point_number' => 2,
            'left_score_after' => 1, 'right_score_after' => 1,
            'point_cause' => 'opponent_error', 'shot_type' => 'backhand', 'error_type' => 'net']);
        // Point 3 (right serves): Hero wins, opponent error long/wide -> on Hero's return.
        PingPongPoint::create(['match_id' => $match->id, 'scoring_side' => 'left', 'point_number' => 3,
            'left_score_after' => 2, 'right_score_after' => 1,
            'point_cause' => 'opponent_error', 'shot_type' => 'forehand', 'serve_point' => true, 'error_type' => 'long_wide']);

        $insights = app(PracticeInsightsService::class)->forPlayer($left->id);

        // Serve points where Hero served: point 1 (won), point 2 (lost). Return: point 3 (won).
        $this->assertSame(1, $insights['serve']['serve_won']);
        $this->assertSame(1, $insights['serve']['serve_lost']);
        $this->assertSame(1, $insights['serve']['return_won']);
        $this->assertSame(0, $insights['serve']['return_lost']);

        // Wing for Hero's decisive shots: P1 fh winner; P2 Hero's bh error; P3 decisive side is right (Foe erred) -> not Hero.
        $this->assertSame(1, $insights['wing']['fh_win']);
        $this->assertSame(1, $insights['wing']['bh_err']);
        $this->assertSame(0, $insights['wing']['fh_err']);
        $this->assertSame(0, $insights['wing']['bh_win']);

        // Errors by Hero: P2 net. (P3 error is Foe's, not Hero's.)
        $this->assertSame(1, $insights['errors']['net']);
        $this->assertSame(0, $insights['errors']['long_wide']);

        $this->assertIsArray($insights['takeaways']);
    }

    public function test_returns_zeroed_structure_for_player_with_no_points(): void
    {
        $p = Player::create(['name' => 'Empty']);
        $insights = app(PracticeInsightsService::class)->forPlayer($p->id);
        $this->assertSame(0, $insights['serve']['serve_won']);
        $this->assertSame(0, $insights['wing']['fh_win']);
        $this->assertSame(0, $insights['errors']['net']);
    }
}
