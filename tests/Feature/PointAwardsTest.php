<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Games\PingPong\Services\PointAwardsService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PointAwardsTest extends TestCase
{
    use RefreshDatabase;

    private int $seq = 0;

    /** Create $count points on $side of $match with the given tag attrs. Scores are dummies (awards ignore them). */
    private function points(PingPongMatch $match, string $side, int $count, array $attrs = []): void
    {
        for ($i = 0; $i < $count; $i++) {
            $this->seq++;
            PingPongPoint::create(array_merge([
                'match_id' => $match->id,
                'scoring_side' => $side,
                'point_number' => $this->seq,
                'left_score_after' => $this->seq,
                'right_score_after' => $this->seq,
            ], $attrs));
        }
    }

    private function match(int $leftId, int $rightId, ?Carbon $endedAt = null): PingPongMatch
    {
        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $leftId,
            'player_right_id' => $rightId,
            'first_server_id' => $leftId,
            'player_left_score' => 11,
            'player_right_score' => 9,
            'started_at' => now(),
            'ended_at' => $endedAt ?? now(),
            'winner_id' => $leftId,
        ]);
    }

    /** @return array<string, array> keyed by award key */
    private function awardsByKey(string $window = 'all'): array
    {
        $awards = app(PointAwardsService::class)->getAwards($window);
        return collect($awards)->keyBy('key')->all();
    }

    public function test_each_award_goes_to_the_expected_holder(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);
        $cy = Player::create(['name' => 'Cy']);

        // --- Match 1: Ann (left) vs Bob (right) ---
        $m1 = $this->match($ann->id, $bob->id);
        // Ann winners: 12 forehand + 6 backhand
        $this->points($m1, 'left', 12, ['point_cause' => 'winner', 'shot_type' => 'forehand']);
        $this->points($m1, 'left', 6, ['point_cause' => 'winner', 'shot_type' => 'backhand']);
        // Ann wins by Bob's error (decisive side = Bob) -> Bob's gift count
        $this->points($m1, 'left', 2, ['point_cause' => 'opponent_error']);
        // Bob winners: 7 plain + 5 lucky (net edge)
        $this->points($m1, 'right', 7, ['point_cause' => 'winner']);
        $this->points($m1, 'right', 5, ['point_cause' => 'winner', 'net_edge' => true]);
        // Bob wins by Ann's error (decisive side = Ann) -> Ann's gift count (untyped errors)
        $this->points($m1, 'right', 8, ['point_cause' => 'opponent_error']);

        // --- Match 2: Cy (left) vs Ann (right) ---
        $m2 = $this->match($cy->id, $ann->id);
        // Cy winners: 8 backhand + 3 forehand
        $this->points($m2, 'left', 8, ['point_cause' => 'winner', 'shot_type' => 'backhand']);
        $this->points($m2, 'left', 3, ['point_cause' => 'winner', 'shot_type' => 'forehand']);
        // Ann wins by Cy's net error (decisive side = Cy) -> Cy's net-dumper count
        $this->points($m2, 'right', 4, ['point_cause' => 'opponent_error', 'error_type' => 'net']);

        $a = $this->awardsByKey();

        // Sniper: Ann 18/24=75% (eligible >=15), Bob 12/20=60%, Cy 11 points ineligible -> Ann
        $this->assertSame($ann->id, $a['sniper']['holder_player_id']);
        $this->assertSame(75, (int) $a['sniper']['value']);

        // Lucky Charm: Bob 5 -> Bob
        $this->assertSame($bob->id, $a['lucky_charm']['holder_player_id']);
        $this->assertSame(5, (int) $a['lucky_charm']['value']);

        // Forehand Cannon: Ann 12 vs Cy 3 -> Ann
        $this->assertSame($ann->id, $a['forehand_cannon']['holder_player_id']);
        $this->assertSame(12, (int) $a['forehand_cannon']['value']);

        // Backhand Wizard: Cy 8 vs Ann 6 -> Cy
        $this->assertSame($cy->id, $a['backhand_wizard']['holder_player_id']);
        $this->assertSame(8, (int) $a['backhand_wizard']['value']);

        // Gift Giver: Ann 8 vs Cy 4 vs Bob 2 (>=5) -> Ann
        $this->assertSame($ann->id, $a['gift_giver']['holder_player_id']);
        $this->assertSame(8, (int) $a['gift_giver']['value']);

        // Net Dumper: Cy 4 -> Cy
        $this->assertSame($cy->id, $a['net_dumper']['holder_player_id']);
        $this->assertSame(4, (int) $a['net_dumper']['value']);
    }

    public function test_award_is_unclaimed_when_no_one_meets_threshold(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);
        $m = $this->match($ann->id, $bob->id);
        // Only 1 lucky point (threshold is 2) and nothing else taggable.
        $this->points($m, 'left', 1, ['point_cause' => 'winner', 'net_edge' => true]);

        $a = $this->awardsByKey();

        $this->assertNull($a['lucky_charm']['holder_player_id']);
        $this->assertNull($a['lucky_charm']['value_label']);
        // Structure is still present (grid stays stable).
        $this->assertArrayHasKey('lucky_charm', $a);
        $this->assertSame('Lucky Charm', $a['lucky_charm']['title']);
    }

    public function test_returns_full_award_roster_even_with_no_data(): void
    {
        $a = $this->awardsByKey();
        $this->assertCount(6, $a);
        foreach (['sniper', 'lucky_charm', 'forehand_cannon', 'backhand_wizard', 'gift_giver', 'net_dumper'] as $key) {
            $this->assertArrayHasKey($key, $a);
            $this->assertNull($a[$key]['holder_player_id']);
        }
    }

    public function test_month_window_excludes_older_points(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);

        // Old match (last month, but after the tagging floor): Ann 4 lucky points
        $old = $this->match($ann->id, $bob->id, now()->startOfMonth()->subDays(3));
        $this->points($old, 'left', 4, ['point_cause' => 'winner', 'net_edge' => true]);

        // This month: Bob 3 lucky points
        $recent = $this->match($ann->id, $bob->id, now());
        $this->points($recent, 'right', 3, ['point_cause' => 'winner', 'table_edge' => true]);

        // All-time: Ann leads lucky (4 > 3)
        $all = $this->awardsByKey('all');
        $this->assertSame($ann->id, $all['lucky_charm']['holder_player_id']);

        // This month: only Bob's 3 count
        $month = $this->awardsByKey('month');
        $this->assertSame($bob->id, $month['lucky_charm']['holder_player_id']);
        $this->assertSame(3, (int) $month['lucky_charm']['value']);
    }

    public function test_includes_runner_up(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);
        $m = $this->match($ann->id, $bob->id);
        $this->points($m, 'left', 5, ['point_cause' => 'winner', 'net_edge' => true]); // Ann 5
        $this->points($m, 'right', 3, ['point_cause' => 'winner', 'net_edge' => true]); // Bob 3

        $a = $this->awardsByKey();
        $this->assertSame($ann->id, $a['lucky_charm']['holder_player_id']);
        $this->assertSame('Bob', $a['lucky_charm']['runner_up_name']);
    }

    public function test_each_award_carries_its_formula(): void
    {
        $a = $this->awardsByKey();
        $this->assertNotEmpty($a['sniper']['formula']);
        $this->assertNotEmpty($a['forehand_cannon']['formula']);
    }

    // ---- Award detail (top-3 + compute transparency) ----

    public function test_award_detail_ranks_top_three_and_excludes_below_threshold(): void
    {
        $p1 = Player::create(['name' => 'P1']);
        $p2 = Player::create(['name' => 'P2']);
        $p3 = Player::create(['name' => 'P3']);
        $p4 = Player::create(['name' => 'P4']);
        $opp = Player::create(['name' => 'Opp']);

        // Forehand winners: P1=10, P2=7, P3=4, P4=2 (below min of 3)
        foreach ([[$p1, 10], [$p2, 7], [$p3, 4], [$p4, 2]] as [$pl, $n]) {
            $m = $this->match($pl->id, $opp->id);
            $this->points($m, 'left', $n, ['point_cause' => 'winner', 'shot_type' => 'forehand']);
        }

        $detail = app(PointAwardsService::class)->getAwardDetail('forehand_cannon', 'all');

        $this->assertSame('forehand_cannon', $detail['key']);
        $this->assertNotEmpty($detail['formula']);
        $this->assertCount(3, $detail['entries']);

        $this->assertSame(1, $detail['entries'][0]['rank']);
        $this->assertSame($p1->id, $detail['entries'][0]['player_id']);
        $this->assertSame(10, $detail['entries'][0]['value']);
        $this->assertSame($p3->id, $detail['entries'][2]['player_id']);

        // P4 (2 forehand winners) is below the threshold of 3 and must not appear.
        $ids = array_column($detail['entries'], 'player_id');
        $this->assertNotContains($p4->id, $ids);

        // Breakdown exposes the raw inputs that produced the value.
        $labels = array_column($detail['entries'][0]['breakdown'], 'label');
        $this->assertContains('Points won', $labels);
    }

    public function test_award_detail_shows_division_calc_for_rate_award(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $opp = Player::create(['name' => 'Opp']);
        $m = $this->match($ann->id, $opp->id);
        // 15 forehand winners + 5 wins by opponent error => 15 winners / 20 points won = 75%
        $this->points($m, 'left', 15, ['point_cause' => 'winner', 'shot_type' => 'forehand']);
        $this->points($m, 'left', 5, ['point_cause' => 'opponent_error']);

        $detail = app(PointAwardsService::class)->getAwardDetail('sniper', 'all');

        $this->assertCount(1, $detail['entries']);
        $entry = $detail['entries'][0];
        $this->assertSame(75, $entry['value']);
        // The concrete calculation string makes the math auditable.
        $this->assertStringContainsString('15', $entry['calc']);
        $this->assertStringContainsString('20', $entry['calc']);
        $this->assertStringContainsString('75', $entry['calc']);
    }

    public function test_award_detail_returns_null_for_invalid_key(): void
    {
        $this->assertNull(app(PointAwardsService::class)->getAwardDetail('not_a_real_award', 'all'));
    }
}
