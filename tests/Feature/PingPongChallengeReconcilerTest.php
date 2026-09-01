<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\ChallengeReconciler;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * A challenge is about getting two people to the table, not about the lobby.
 * If they play each other by any route, the challenge is satisfied.
 */
class PingPongChallengeReconcilerTest extends TestCase
{
    use RefreshDatabase;

    private Office $office;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-03-04 15:30:00', 'UTC'));
        $this->office = Office::create(['name' => 'Quebec']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function player(string $name): Player
    {
        return Player::create(['name' => $name]);
    }

    private function challenge(Player $one, Player $two, array $overrides = []): PingPongChallenge
    {
        return PingPongChallenge::create(array_merge([
            'office_id' => $this->office->id,
            'player_one_id' => $one->id,
            'player_two_id' => $two->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'scheduled_for' => Carbon::now(),
            'expires_at' => Carbon::now()->addMinutes(50),
        ], $overrides));
    }

    private function match(Player $left, Player $right, array $overrides = []): PingPongMatch
    {
        return PingPongMatch::create(array_merge([
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'started_at' => Carbon::now()->addMinutes(2),
            'last_score_activity_at' => Carbon::now()->addMinutes(2),
        ], $overrides));
    }

    public function test_a_match_between_the_pair_closes_the_challenge(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo);

        $match = $this->match($ada, $bo);

        $challenge->refresh();
        $this->assertEquals(PingPongChallenge::STATUS_PLAYED, $challenge->status);
        $this->assertEquals($match->id, $challenge->match_id);
    }

    public function test_it_closes_the_challenge_regardless_of_which_side_they_took(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo);

        // Sides reversed relative to how the lobby seated them.
        $match = $this->match($bo, $ada);

        $this->assertEquals(PingPongChallenge::STATUS_PLAYED, $challenge->fresh()->status);
        $this->assertEquals($match->id, $challenge->fresh()->match_id);
    }

    public function test_a_match_against_someone_else_leaves_the_challenge_open(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $challenge = $this->challenge($ada, $bo);

        // Ada playing a quick game with Cy is no reason to call off a
        // challenge that still has most of its window left.
        $this->match($ada, $cy);

        $this->assertEquals(PingPongChallenge::STATUS_PENDING, $challenge->fresh()->status);
    }

    public function test_it_does_not_touch_a_challenge_that_is_already_resolved(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo, ['status' => PingPongChallenge::STATUS_DECLINED]);

        $this->match($ada, $bo);

        $this->assertEquals(PingPongChallenge::STATUS_DECLINED, $challenge->fresh()->status);
    }

    public function test_a_doubles_match_containing_both_players_closes_the_challenge(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');
        $challenge = $this->challenge($ada, $bo);

        $this->match($ada, $cy, [
            'mode' => '2v2',
            'team_left_player2_id' => $di->id,
            'team_right_player2_id' => $bo->id,
        ]);

        $this->assertEquals(PingPongChallenge::STATUS_PLAYED, $challenge->fresh()->status);
    }

    public function test_the_sweep_closes_a_challenge_the_observer_missed(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');

        // A match recorded with no challenge in place yet — as happens for a
        // game played while the app was mid-deploy.
        $match = $this->match($ada, $bo);
        $challenge = $this->challenge($ada, $bo, [
            'scheduled_for' => Carbon::now()->subMinute(),
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_PENDING])->save();

        $closed = app(ChallengeReconciler::class)->reconcilePending();

        $this->assertEquals(1, $closed);
        $this->assertEquals(PingPongChallenge::STATUS_PLAYED, $challenge->fresh()->status);
        $this->assertEquals($match->id, $challenge->fresh()->match_id);
    }

    public function test_the_sweep_ignores_a_match_that_predates_the_challenge(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');

        $this->match($ada, $bo, ['started_at' => Carbon::now()->subHours(2)]);
        $challenge = $this->challenge($ada, $bo);
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_PENDING])->save();

        $this->assertEquals(0, app(ChallengeReconciler::class)->reconcilePending());
        $this->assertEquals(PingPongChallenge::STATUS_PENDING, $challenge->fresh()->status);
    }

    public function test_the_sweep_ignores_a_match_started_after_the_window_closed(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');

        $challenge = $this->challenge($ada, $bo);
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_PENDING])->save();
        $this->match($ada, $bo, ['started_at' => Carbon::now()->addHours(3)]);

        $this->assertEquals(0, app(ChallengeReconciler::class)->reconcilePending());
        $this->assertEquals(PingPongChallenge::STATUS_PENDING, $challenge->fresh()->status);
    }

    public function test_the_hourly_command_closes_played_challenges_before_expiring_them(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');

        // Played inside the window, but the window has since closed — this
        // must be recorded as played, never as expired.
        $challenge = $this->challenge($ada, $bo, [
            'scheduled_for' => Carbon::now()->subHours(2),
            'expires_at' => Carbon::now()->subHour(),
        ]);
        $this->match($ada, $bo, ['started_at' => Carbon::now()->subHours(2)->addMinutes(3)]);
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_PENDING])->save();

        $this->artisan('pingpong:matchmake')->assertExitCode(0);

        $this->assertEquals(PingPongChallenge::STATUS_PLAYED, $challenge->fresh()->status);
    }
}
