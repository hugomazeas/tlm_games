<?php

namespace Tests\Unit;

use App\Games\PingPong\Services\EloService;
use App\Games\PingPong\Services\WinProbabilityService;
use ReflectionMethod;
use Tests\TestCase;

/**
 * Exercises the pure score-projection math directly (no DB): given a pre-match
 * prior p0 and a current score, P(left wins) must obey the sanity properties of
 * a to-11, win-by-2 game.
 */
class WinProbabilityServiceTest extends TestCase
{
    private function project(float $p0, int $left, int $right): float
    {
        $service = new WinProbabilityService(new EloService());
        $method = new ReflectionMethod($service, 'matchWinProbability');
        $method->setAccessible(true);

        return $method->invoke($service, $p0, $left, $right);
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
}
