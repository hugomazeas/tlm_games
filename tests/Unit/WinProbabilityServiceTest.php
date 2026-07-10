<?php

namespace Tests\Unit;

use App\Games\PingPong\Services\EloService;
use App\Games\PingPong\Services\WinProbabilityService;
use Illuminate\Support\Facades\Cache;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Exercises the pure score-projection math directly (no DB): given a pre-match
 * prior p0 and a current score, P(left wins) must obey the sanity properties of
 * a to-11, win-by-2 game. The historical "shape" tables are stubbed via cache so
 * these tests stay DB-free; the empirical blend and clutch nudge get their own
 * tests below with injected tables.
 */
class WinProbabilityServiceTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        // Empty shape tables -> matchWinProbability falls back to pure theory.
        Cache::put('pp.winprob.states', [], 60);
        Cache::put('pp.winprob.clutch', [], 60);
    }

    private function project(float $p0, int $left, int $right): float
    {
        // Re-prime empty tables so this stays pure regardless of call order after
        // a projectWith() has stashed shape data in the cache.
        Cache::put('pp.winprob.states', [], 60);
        Cache::put('pp.winprob.clutch', [], 60);

        $service = new WinProbabilityService(new EloService());
        $method = new ReflectionMethod($service, 'matchWinProbability');
        $method->setAccessible(true);

        // Player IDs 0/0 have no historical shape data, so this exercises the pure
        // theoretical race-DP (empirical blend and clutch both no-op).
        return $method->invoke($service, $p0, $left, $right, 0, 0);
    }

    /** Blend/clutch tests inject their own tables, so start each from empty. */
    private function projectWith(float $p0, int $left, int $right, int $leftId, int $rightId, array $states, array $clutch): float
    {
        Cache::put('pp.winprob.states', $states, 60);
        Cache::put('pp.winprob.clutch', $clutch, 60);

        $service = new WinProbabilityService(new EloService());
        $method = new ReflectionMethod($service, 'matchWinProbability');
        $method->setAccessible(true);

        return $method->invoke($service, $p0, $left, $right, $leftId, $rightId);
    }

    public function test_even_match_at_start_is_fifty_fifty(): void
    {
        $this->assertEqualsWithDelta(0.5, $this->project(0.5, 0, 0), 0.001);
    }

    public function test_prior_is_calibrated_to_display_at_zero_zero(): void
    {
        // Calibration means the 0-0 display equals the pre-match prior exactly.
        $this->assertEqualsWithDelta(0.70, $this->project(0.70, 0, 0), 0.005);
        $this->assertEqualsWithDelta(0.35, $this->project(0.35, 0, 0), 0.005);
    }

    public function test_leading_increases_win_probability(): void
    {
        $even = $this->project(0.5, 0, 0);
        $ahead = $this->project(0.5, 8, 3);
        $this->assertGreaterThan($even, $ahead);
        $this->assertGreaterThan(0.9, $ahead); // 8-3 in a to-11 game is a big lead
    }

    public function test_symmetry_even_prior(): void
    {
        // With an even prior, swapping the score must mirror the probability.
        $a = $this->project(0.5, 8, 3);
        $b = $this->project(0.5, 3, 8);
        $this->assertEqualsWithDelta(1.0, $a + $b, 0.001);
    }

    public function test_match_point_is_near_certain(): void
    {
        // 10-5, serving toward 11: left needs one point, right needs six.
        $this->assertGreaterThan(0.95, $this->project(0.5, 10, 5));
    }

    public function test_deuce_is_even_with_even_prior(): void
    {
        $this->assertEqualsWithDelta(0.5, $this->project(0.5, 10, 10), 0.001);
    }

    public function test_deuce_lead_beats_deuce_tie(): void
    {
        $tie = $this->project(0.5, 10, 10);
        $up = $this->project(0.5, 11, 10);
        $this->assertGreaterThan($tie, $up);
        $this->assertLessThan(1.0, $up); // not won yet, needs 2-point margin
    }

    public function test_terminal_win_is_certain(): void
    {
        $this->assertEqualsWithDelta(1.0, $this->project(0.5, 11, 9), 0.001);
        $this->assertEqualsWithDelta(0.0, $this->project(0.5, 9, 11), 0.001);
    }

    public function test_empirical_table_pulls_toward_observed_rate(): void
    {
        // Theory says ~70% at 4-2. Say history (plenty of games) shows leads at this
        // state actually convert 90% of the time -> the blend must read higher.
        $states = ['6:2' => [500, 450]]; // 500 games, 450 left wins = 90%
        $withHistory = $this->projectWith(0.5, 4, 2, 1, 2, $states, []);
        $pureTheory = $this->project(0.5, 4, 2);

        $this->assertGreaterThan($pureTheory, $withHistory);
    }

    public function test_empirical_table_ignored_below_min_games(): void
    {
        // Only 5 games observed -> below threshold -> pure theory, unchanged.
        $states = ['6:2' => [5, 5]];
        $withThin = $this->projectWith(0.5, 4, 2, 1, 2, $states, []);
        $this->assertEqualsWithDelta($this->project(0.5, 4, 2), $withThin, 0.001);
    }

    public function test_clutch_favors_the_stronger_deuce_player(): void
    {
        // At deuce with an even prior, a positive clutch delta for the left player
        // (and negative for the right) must push the probability above .500.
        $clutch = [1 => 0.5, 2 => -0.5];
        $p = $this->projectWith(0.5, 10, 10, 1, 2, [], $clutch);
        $this->assertGreaterThan(0.5, $p);

        // Mirror: swap the clutch and it must fall below .500.
        $pMirror = $this->projectWith(0.5, 10, 10, 1, 2, [], [1 => -0.5, 2 => 0.5]);
        $this->assertLessThan(0.5, $pMirror);
    }

    public function test_clutch_does_not_fire_before_deuce(): void
    {
        // Same clutch data, but not yet in deuce -> no effect.
        $clutch = [1 => 0.5, 2 => -0.5];
        $withClutch = $this->projectWith(0.5, 8, 8, 1, 2, [], $clutch);
        $this->assertEqualsWithDelta($this->project(0.5, 8, 8), $withClutch, 0.001);
    }
}
