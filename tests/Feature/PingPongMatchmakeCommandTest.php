<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Jobs\SendChallengeNotificationJob;
use App\Models\Office;
use App\Models\Player;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PingPongMatchmakeCommandTest extends TestCase
{
    use RefreshDatabase;

    /** Wednesday 2026-03-04, 15:30 UTC — 10:30 in America/Toronto. */
    private const FROZEN_UTC = '2026-03-04 15:30:00';

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse(self::FROZEN_UTC, 'UTC'));
        Queue::fake();

        config([
            'pingpong.buro.base_url' => 'http://buro:3000',
            'pingpong.buro.token' => 'test-token',
            'pingpong.matchmaking.opt_in_flag' => 'Ping Pong',
            'pingpong.matchmaking.challenge_ttl_minutes' => 50,
            'pingpong.matchmaking.player_cooldown_hours' => 24,
            'pingpong.matchmaking.max_challenges_per_day' => 1,
        ]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();

        parent::tearDown();
    }

    private function office(string $name, string $buroId, bool $enabled = true): Office
    {
        return Office::create([
            'name' => $name,
            'buro_office_id' => $buroId,
            'matchmaking_enabled' => $enabled,
            'matchmaking_start' => '09:30',
            'matchmaking_end' => '16:30',
        ]);
    }

    private function player(string $name, string $email): Player
    {
        $player = Player::create(['name' => $name, 'email' => $email]);

        PushSubscription::create([
            'player_id' => $player->id,
            'endpoint' => 'https://push.example.test/'.$player->id,
            'endpoint_hash' => PushSubscription::hashEndpoint('https://push.example.test/'.$player->id),
            'public_key' => 'p256dh-key',
            'auth_token' => 'auth-token',
        ]);

        return $player;
    }

    private function fakeBuroFor(string $buroOfficeId, array $emails): void
    {
        Http::fake([
            'buro:3000/api/integrations/presence?officeId='.$buroOfficeId.'*' => Http::response([
                'date' => '2026-03-04',
                'localTime' => '10:30',
                'weekday' => 3,
                'office' => ['id' => $buroOfficeId, 'name' => 'Office', 'timezone' => 'America/Toronto'],
                'users' => array_map(fn (string $email, int $i) => [
                    'id' => 'buro-'.$buroOfficeId.'-'.$i,
                    'name' => ucfirst(strstr($email, '@', true)),
                    'email' => $email,
                    'flags' => ['Ping Pong'],
                ], $emails, array_keys($emails)),
            ]),
            'buro:3000/*' => Http::response(['users' => []]),
        ]);
    }

    public function test_it_draws_and_queues_a_notification(): void
    {
        $this->office('Quebec', 'buro-quebec');
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');
        $this->fakeBuroFor('buro-quebec', ['ada@tlmgo.com', 'bo@tlmgo.com']);

        $this->artisan('pingpong:matchmake')
            ->assertExitCode(0)
            ->expectsOutputToContain('Quebec:');

        $this->assertDatabaseCount('ping_pong_challenges', 1);
        Queue::assertPushed(SendChallengeNotificationJob::class, 1);
    }

    public function test_it_draws_and_notifies_nothing_when_challenges_are_disabled(): void
    {
        config(['pingpong.challenges_enabled' => false]);

        $this->office('Quebec', 'buro-quebec');
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');
        $this->fakeBuroFor('buro-quebec', ['ada@tlmgo.com', 'bo@tlmgo.com']);

        $this->artisan('pingpong:matchmake')
            ->assertExitCode(0)
            ->expectsOutputToContain('challenges_disabled');

        $this->assertDatabaseCount('ping_pong_challenges', 0);
        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    public function test_it_reports_and_queues_nothing_when_no_office_participates(): void
    {
        $this->office('Quebec', 'buro-quebec', enabled: false);
        Http::fake();

        $this->artisan('pingpong:matchmake')
            ->assertExitCode(0)
            ->expectsOutput('No offices have matchmaking enabled.');

        Queue::assertNothingPushed();
        Http::assertNothingSent();
    }

    public function test_the_office_option_restricts_the_draw(): void
    {
        $quebec = $this->office('Quebec', 'buro-quebec');
        $this->office('Montreal', 'buro-montreal');
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');
        $this->fakeBuroFor('buro-quebec', ['ada@tlmgo.com', 'bo@tlmgo.com']);

        $this->artisan('pingpong:matchmake', ['--office' => $quebec->id])->assertExitCode(0);

        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'buro-montreal'));
        $this->assertDatabaseCount('ping_pong_challenges', 1);
    }

    public function test_dry_run_queues_nothing(): void
    {
        $this->office('Quebec', 'buro-quebec');
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');
        $this->fakeBuroFor('buro-quebec', ['ada@tlmgo.com', 'bo@tlmgo.com']);

        $this->artisan('pingpong:matchmake', ['--dry-run' => true])->assertExitCode(0);

        $this->assertDatabaseCount('ping_pong_challenges', 0);
        Queue::assertNothingPushed();
    }

    public function test_it_retires_challenges_whose_window_has_closed(): void
    {
        $office = $this->office('Quebec', 'buro-quebec', enabled: false);
        $ada = Player::create(['name' => 'Ada']);
        $bo = Player::create(['name' => 'Bo']);
        Http::fake();

        $stale = PingPongChallenge::create([
            'office_id' => $office->id,
            'player_one_id' => $ada->id,
            'player_two_id' => $bo->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'scheduled_for' => Carbon::now()->subHours(2),
            'expires_at' => Carbon::now()->subHour(),
        ]);

        $this->artisan('pingpong:matchmake')->assertExitCode(0);

        $this->assertEquals(PingPongChallenge::STATUS_EXPIRED, $stale->fresh()->status);
    }

    public function test_it_leaves_a_live_challenge_pending(): void
    {
        $office = $this->office('Quebec', 'buro-quebec', enabled: false);
        $ada = Player::create(['name' => 'Ada']);
        $bo = Player::create(['name' => 'Bo']);
        Http::fake();

        $live = PingPongChallenge::create([
            'office_id' => $office->id,
            'player_one_id' => $ada->id,
            'player_two_id' => $bo->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'scheduled_for' => Carbon::now(),
            'expires_at' => Carbon::now()->addMinutes(30),
        ]);

        $this->artisan('pingpong:matchmake')->assertExitCode(0);

        $this->assertEquals(PingPongChallenge::STATUS_PENDING, $live->fresh()->status);
    }

    public function test_it_survives_buro_being_down(): void
    {
        $this->office('Quebec', 'buro-quebec');
        $this->player('Ada', 'ada@tlmgo.com');
        Http::fake(['buro:3000/*' => Http::response(null, 503)]);

        $this->artisan('pingpong:matchmake')
            ->assertExitCode(0)
            ->expectsOutputToContain('buro_unavailable');

        Queue::assertNothingPushed();
    }
}
