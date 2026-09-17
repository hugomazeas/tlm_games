<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Services\EloService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PingPongEloPreviewTest extends TestCase
{
    use RefreshDatabase;

    private function inProgressSingles(int $leftId, int $rightId): PingPongMatch
    {
        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $leftId,
            'player_right_id' => $rightId,
            'first_server_id' => $leftId,
            'player_left_score' => 5,
            'player_right_score' => 3,
        ]);
    }

    public function test_preview_includes_current_ratings_for_both_players(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);
        PingPongRating::create(['player_id' => $ann->id, 'mode' => '1v1', 'elo_rating' => 1300]);
        PingPongRating::create(['player_id' => $bob->id, 'mode' => '1v1', 'elo_rating' => 1100]);

        $preview = app(EloService::class)->previewMatchResult(
            $this->inProgressSingles($ann->id, $bob->id)
        );

        $this->assertSame(1300, $preview['current_ratings'][$ann->id]);
        $this->assertSame(1100, $preview['current_ratings'][$bob->id]);
    }

    public function test_projected_elo_equals_current_plus_outcome_total(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);
        PingPongRating::create(['player_id' => $ann->id, 'mode' => '1v1', 'elo_rating' => 1300]);
        PingPongRating::create(['player_id' => $bob->id, 'mode' => '1v1', 'elo_rating' => 1100]);

        $preview = app(EloService::class)->previewMatchResult(
            $this->inProgressSingles($ann->id, $bob->id)
        );

        $annCurrent = $preview['current_ratings'][$ann->id];
        $annIfWins = $annCurrent + $preview['if_left_wins'][$ann->id]['total'];
        $annIfLoses = $annCurrent + $preview['if_right_wins'][$ann->id]['total'];

        // Winning must project a higher rating than losing (positive swing).
        $this->assertGreaterThan($annIfLoses, $annIfWins);
    }

    public function test_preview_endpoint_returns_current_ratings(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);
        $match = $this->inProgressSingles($ann->id, $bob->id);

        $this->getJson("/games/ping-pong/api/matches/{$match->id}/elo-preview")
            ->assertOk()
            ->assertJsonStructure([
                'current_ratings',
                'if_left_wins',
                'if_right_wins',
            ]);
    }
}
