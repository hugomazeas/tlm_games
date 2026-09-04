<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\ChallengeUpdated;
use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongLobby;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The challenge panel on the ping pong home screen.
 *
 * The screen by the table is where someone stands when they notice the drawn
 * player has gone home, so it needs to show the draw and offer the re-roll
 * without anybody navigating anywhere.
 */
class PingPongChallengePanelTest extends TestCase
{
    use RefreshDatabase;

    private Office $office;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-03-04 15:30:00', 'UTC'));

        $this->office = Office::create([
            'name' => 'Quebec',
            'buro_office_id' => 'buro-office-quebec',
            'matchmaking_enabled' => true,
            'matchmaking_start' => '09:30',
            'matchmaking_end' => '16:30',
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function player(string $name): Player
    {
        return Player::create(['name' => $name, 'email' => strtolower($name).'@tlmgo.com']);
    }

    private function challenge(Player $one, Player $two, string $status = PingPongChallenge::STATUS_PENDING, ?Carbon $expiresAt = null): PingPongChallenge
    {
        return PingPongChallenge::create([
            'office_id' => $this->office->id,
            'player_one_id' => $one->id,
            'player_two_id' => $two->id,
            'status' => $status,
            'scheduled_for' => Carbon::now(),
            'expires_at' => $expiresAt ?? Carbon::now()->addMinutes(50),
        ]);
    }

    public function test_it_lists_the_live_challenge_with_everything_the_panel_shows(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo);

        $lobby = PingPongLobby::create([
            'code' => 'ABCD',
            'mode' => '1v1',
            'status' => 'waiting',
            'host_token' => 'host-token',
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);
        $challenge->forceFill(['lobby_id' => $lobby->id])->save();

        $this->getJson('/games/ping-pong/api/challenges/current')
            ->assertOk()
            ->assertJsonCount(1, 'challenges')
            ->assertJsonPath('challenges.0.id', $challenge->id)
            ->assertJsonPath('challenges.0.status', PingPongChallenge::STATUS_PENDING)
            ->assertJsonPath('challenges.0.office', 'Quebec')
            ->assertJsonPath('challenges.0.lobby_code', 'ABCD')
            ->assertJsonPath('challenges.0.players.0.name', 'Ada')
            ->assertJsonPath('challenges.0.players.1.name', 'Bo')
            ->assertJsonPath('challenges.0.players.0.id', $ada->id)
            ->assertJsonStructure(['challenges' => [['scheduled_for', 'expires_at']]]);
    }

    public function test_it_omits_challenges_that_are_over(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');

        $this->challenge($ada, $bo, PingPongChallenge::STATUS_PLAYED);
        $this->challenge($ada, $cy, PingPongChallenge::STATUS_SUPERSEDED);
        $this->challenge($bo, $cy, PingPongChallenge::STATUS_DECLINED);

        // Still pending on paper, but its window has closed.
        $this->challenge($cy, $di, PingPongChallenge::STATUS_PENDING, Carbon::now()->subMinute());

        $this->getJson('/games/ping-pong/api/challenges/current')
            ->assertOk()
            ->assertJsonCount(0, 'challenges');
    }

    public function test_it_names_the_office_of_each_challenge_so_a_second_office_is_distinguishable(): void
    {
        $montreal = Office::create([
            'name' => 'Montreal',
            'buro_office_id' => 'buro-office-montreal',
            'matchmaking_enabled' => true,
            'matchmaking_start' => '09:30',
            'matchmaking_end' => '16:30',
        ]);

        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');

        $this->challenge($ada, $bo);

        PingPongChallenge::create([
            'office_id' => $montreal->id,
            'player_one_id' => $cy->id,
            'player_two_id' => $di->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'scheduled_for' => Carbon::now()->addMinute(),
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);

        $response = $this->getJson('/games/ping-pong/api/challenges/current')->assertOk();

        $response->assertJsonCount(2, 'challenges')
            ->assertJsonPath('challenges.0.office', 'Quebec')
            ->assertJsonPath('challenges.1.office', 'Montreal');
    }

    public function test_the_home_screen_carries_the_challenge_panel(): void
    {
        $this->get('/games/ping-pong')
            ->assertOk()
            ->assertSee('Match of the hour', false)
            ->assertSee('subscribeChallenges()', false)
            ->assertSee('redrawChallenge(', false)
            ->assertSee('/challenges/current', false);
    }

    /**
     * The channel name is a contract between the event and the screen's
     * Echo subscription; renaming one without the other fails silently.
     */
    public function test_the_announcement_and_the_screen_agree_on_the_channel(): void
    {
        $event = new ChallengeUpdated($this->challenge($this->player('Ada'), $this->player('Bo')));

        $this->assertEquals('ping-pong.challenges', $event->broadcastOn()[0]->name);
        $this->assertEquals('challenge.updated', $event->broadcastAs());

        $this->get('/games/ping-pong')
            ->assertOk()
            ->assertSee("channel('ping-pong.challenges')", false)
            ->assertSee("listen('.challenge.updated'", false);
    }
}
