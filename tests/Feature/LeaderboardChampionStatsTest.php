<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRatingChange;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class LeaderboardChampionStatsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Create a completed 1v1 match where $winnerId beats the other player.
     */
    private function match(int $leftId, int $rightId, int $winnerId, Carbon $endedAt): PingPongMatch
    {
        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $leftId,
            'player_right_id' => $rightId,
            'first_server_id' => $leftId,
            'player_left_score' => $winnerId === $leftId ? 11 : 9,
            'player_right_score' => $winnerId === $rightId ? 11 : 9,
            'started_at' => $endedAt->copy()->subMinutes(15),
            'ended_at' => $endedAt,
            'winner_id' => $winnerId,
        ]);
    }

    /**
     * Record the ELO deltas produced by a match for the two participants.
     */
    private function rating(PingPongMatch $match, int $playerId, int $delta): void
    {
        PingPongRatingChange::create([
            'player_id' => $playerId,
            'match_id' => $match->id,
            'mode' => '1v1',
            'type' => 'match',
            'rating_change' => $delta,
        ]);
    }

    /** @return array<int, array> leaderboard entries keyed by player_id */
    private function leaderboardByPlayer(): array
    {
        $response = $this->getJson('/games/ping-pong/api/leaderboard?mode=1v1');
        $response->assertOk();

        return collect($response->json())->keyBy('player_id')->all();
    }

    public function test_champion_beats_and_title_defenses_follow_the_reigning_number_one(): void
    {
        $alice = Player::create(['name' => 'Alice']);
        $bob = Player::create(['name' => 'Bob']);
        $carla = Player::create(['name' => 'Carla']);

        // M1: Alice beats Bob. No champion existed yet -> neither stat moves.
        // After: Alice 1230, Bob 1170 -> Alice is champion.
        $m1 = $this->match($alice->id, $bob->id, $alice->id, now()->subDays(6));
        $this->rating($m1, $alice->id, 30);
        $this->rating($m1, $bob->id, -30);

        // M2: Bob beats reigning champion Alice -> Bob +1 champion beat.
        // After: Bob 1210, Alice 1190 -> Bob is champion.
        $m2 = $this->match($alice->id, $bob->id, $bob->id, now()->subDays(5));
        $this->rating($m2, $bob->id, 40);
        $this->rating($m2, $alice->id, -40);

        // M3: Champion Bob beats newcomer Carla -> Bob +1 title defense.
        // After: Bob 1220, Carla 1190.
        $m3 = $this->match($bob->id, $carla->id, $bob->id, now()->subDays(4));
        $this->rating($m3, $bob->id, 10);
        $this->rating($m3, $carla->id, -10);

        // M4: Carla beats reigning champion Bob -> Carla +1 champion beat.
        $m4 = $this->match($bob->id, $carla->id, $carla->id, now()->subDays(1));
        $this->rating($m4, $carla->id, 40);
        $this->rating($m4, $bob->id, -40);

        $entries = $this->leaderboardByPlayer();

        $this->assertSame(0, $entries[$alice->id]['champion_beats']);
        $this->assertSame(0, $entries[$alice->id]['title_defenses']);

        $this->assertSame(1, $entries[$bob->id]['champion_beats']);
        $this->assertSame(1, $entries[$bob->id]['title_defenses']);

        $this->assertSame(1, $entries[$carla->id]['champion_beats']);
        $this->assertSame(0, $entries[$carla->id]['title_defenses']);
    }

    public function test_a_tie_at_the_top_yields_no_champion(): void
    {
        $dave = Player::create(['name' => 'Dave']);
        $eve = Player::create(['name' => 'Eve']);

        // Both players stay at 1200 (no rating changes recorded), so there is
        // never a unique #1 -> beating the "leader" counts for nobody.
        $this->match($dave->id, $eve->id, $dave->id, now()->subDays(3));
        $this->match($dave->id, $eve->id, $eve->id, now()->subDays(1));

        $entries = $this->leaderboardByPlayer();

        $this->assertSame(0, $entries[$dave->id]['champion_beats']);
        $this->assertSame(0, $entries[$dave->id]['title_defenses']);
        $this->assertSame(0, $entries[$eve->id]['champion_beats']);
        $this->assertSame(0, $entries[$eve->id]['title_defenses']);
    }

    public function test_lifetime_and_one_month_win_rates_are_reported_separately(): void
    {
        $dave = Player::create(['name' => 'Dave']);
        $eve = Player::create(['name' => 'Eve']);

        // Two old wins (outside the 30-day window) ...
        $this->match($dave->id, $eve->id, $dave->id, now()->subDays(40));
        $this->match($dave->id, $eve->id, $dave->id, now()->subDays(35));
        // ... and a recent split (inside the window, also keeps them active).
        $this->match($dave->id, $eve->id, $dave->id, now()->subDays(5));
        $this->match($dave->id, $eve->id, $eve->id, now()->subDays(2));

        $entries = $this->leaderboardByPlayer();

        // Dave: lifetime 3W-1L = 75%, last 30 days 1W-1L = 50%.
        $this->assertSame(75, $entries[$dave->id]['win_rate']);
        $this->assertSame(50, $entries[$dave->id]['win_rate_30d']);

        // Eve: lifetime 1W-3L = 25%, last 30 days 1W-1L = 50%.
        $this->assertSame(25, $entries[$eve->id]['win_rate']);
        $this->assertSame(50, $entries[$eve->id]['win_rate_30d']);
    }
}
