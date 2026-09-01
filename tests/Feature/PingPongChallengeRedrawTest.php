<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Services\MatchmakingResult;
use App\Games\PingPong\Services\MatchmakingService;
use App\Jobs\SendChallengeNotificationJob;
use App\Models\Office;
use App\Models\Player;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Buro knows who booked a desk this morning, not who left at three. The
 * re-roll is how a human corrects that without waiting an hour.
 */
class PingPongChallengeRedrawTest extends TestCase
{
    use RefreshDatabase;

    private const BURO_OFFICE = 'buro-office-quebec';

    private const FROZEN_UTC = '2026-03-04 15:30:00';

    private Office $office;

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
            'pingpong.matchmaking.player_cooldown_hours' => 0,
            'pingpong.matchmaking.max_challenges_per_day' => 0,
            'pingpong.matchmaking.away_hours' => 8,
        ]);

        $this->office = Office::create([
            'name' => 'Quebec',
            'buro_office_id' => self::BURO_OFFICE,
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
        $player = Player::create(['name' => $name, 'email' => strtolower($name).'@tlmgo.com']);

        PushSubscription::create([
            'player_id' => $player->id,
            'endpoint' => 'https://push.example.test/'.$player->id,
            'endpoint_hash' => PushSubscription::hashEndpoint('https://push.example.test/'.$player->id),
            'public_key' => 'p256dh-key',
            'auth_token' => 'auth-token',
        ]);

        return $player;
    }

    /**
     * @param  array<int, Player>  $players
     */
    private function fakeBuro(array $players): void
    {
        Http::fake([
            'buro:3000/api/integrations/presence*' => Http::response([
                'date' => '2026-03-04',
                'localTime' => '10:30',
                'weekday' => 3,
                'office' => ['id' => self::BURO_OFFICE, 'name' => 'Quebec', 'timezone' => 'America/Toronto'],
                'users' => array_map(fn (Player $p) => [
                    'id' => 'buro-'.$p->id,
                    'name' => $p->name,
                    'email' => $p->email,
                    'flags' => ['Ping Pong'],
                ], $players),
            ]),
        ]);
    }

    private function challenge(Player $one, Player $two): PingPongChallenge
    {
        return PingPongChallenge::create([
            'office_id' => $this->office->id,
            'player_one_id' => $one->id,
            'player_two_id' => $two->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'scheduled_for' => Carbon::now(),
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);
    }

    public function test_it_supersedes_the_old_challenge_and_draws_a_new_one(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');
        $this->fakeBuro([$ada, $bo, $cy, $di]);

        $challenge = $this->challenge($ada, $bo);

        $result = app(MatchmakingService::class)->redraw($challenge, $ada->id);

        $this->assertTrue($result->created);
        $this->assertEquals(PingPongChallenge::STATUS_SUPERSEDED, $challenge->fresh()->status);
        $this->assertNotEquals($challenge->id, $result->challenge->id);
    }

    public function test_marking_someone_absent_keeps_them_out_of_the_new_draw(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');
        $this->fakeBuro([$ada, $bo, $cy, $di]);

        $challenge = $this->challenge($ada, $bo);

        $result = app(MatchmakingService::class)->redraw($challenge, $ada->id);

        $this->assertNotContains($ada->id, $result->challenge->playerIds());
        $this->assertTrue($ada->fresh()->isUnavailable());
    }

    public function test_absence_persists_into_later_draws(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $this->fakeBuro([$ada, $bo, $cy]);

        $challenge = $this->challenge($ada, $bo);
        app(MatchmakingService::class)->redraw($challenge, $ada->id);

        // An hour later the scheduled draw must not pick Ada up again.
        Carbon::setTestNow(Carbon::parse(self::FROZEN_UTC, 'UTC')->addHour());
        PingPongChallenge::query()->update(['status' => PingPongChallenge::STATUS_EXPIRED]);

        $later = app(MatchmakingService::class)->drawForOffice($this->office);

        $this->assertTrue($later->created);
        $this->assertNotContains($ada->id, $later->challenge->playerIds());
    }

    public function test_absence_lapses_after_the_away_window(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $this->fakeBuro([$ada, $bo]);

        $ada->markAway();
        $this->assertTrue($ada->fresh()->isUnavailable());

        Carbon::setTestNow(Carbon::parse(self::FROZEN_UTC, 'UTC')->addHours(9));

        $this->assertFalse($ada->fresh()->isUnavailable());
    }

    public function test_a_plain_reroll_avoids_the_same_pair_when_it_can(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');
        $this->fakeBuro([$ada, $bo, $cy, $di]);

        $challenge = $this->challenge($ada, $bo);

        $result = app(MatchmakingService::class)->redraw($challenge, null);

        $this->assertEqualsCanonicalizing([$cy->id, $di->id], $result->challenge->playerIds());
    }

    public function test_a_small_office_can_still_reroll_even_if_it_repeats_a_player(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $this->fakeBuro([$ada, $bo, $cy]);

        $challenge = $this->challenge($ada, $bo);

        // Excluding both would leave only Cy, so the exclusion is relaxed
        // rather than refusing to re-roll at all.
        $result = app(MatchmakingService::class)->redraw($challenge, null);

        $this->assertTrue($result->created);
        $this->assertCount(2, $result->challenge->playerIds());
    }

    public function test_it_refuses_to_redraw_a_resolved_challenge(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $this->fakeBuro([$ada, $bo]);

        $challenge = $this->challenge($ada, $bo);
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_PLAYED])->save();

        $result = app(MatchmakingService::class)->redraw($challenge, null);

        $this->assertFalse($result->created);
        $this->assertEquals(MatchmakingResult::NOT_REDRAWABLE, $result->reason);
        $this->assertEquals(PingPongChallenge::STATUS_PLAYED, $challenge->fresh()->status);
    }

    public function test_it_reports_when_nobody_is_left_to_play(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $this->fakeBuro([$ada, $bo]);

        $challenge = $this->challenge($ada, $bo);

        // With only two people in, marking one away leaves no possible pair.
        $result = app(MatchmakingService::class)->redraw($challenge, $ada->id);

        $this->assertFalse($result->created);
        $this->assertEquals(MatchmakingResult::NOT_ENOUGH_PLAYERS, $result->reason);
        $this->assertEquals(PingPongChallenge::STATUS_SUPERSEDED, $challenge->fresh()->status);
    }

    public function test_the_endpoint_redraws_and_queues_a_notification(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');
        $this->fakeBuro([$ada, $bo, $cy, $di]);

        $challenge = $this->challenge($ada, $bo);

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/redraw", [
            'absent_player_id' => $ada->id,
        ])->assertOk()->assertJsonPath('redrawn', true);

        Queue::assertPushed(SendChallengeNotificationJob::class, 1);
        $this->assertTrue($ada->fresh()->isUnavailable());
    }

    public function test_the_endpoint_rejects_an_already_resolved_challenge(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $this->fakeBuro([$ada, $bo]);

        $challenge = $this->challenge($ada, $bo);
        $challenge->forceFill(['status' => PingPongChallenge::STATUS_DECLINED])->save();

        $this->postJson("/games/ping-pong/api/challenges/{$challenge->id}/redraw")
            ->assertStatus(422);

        Queue::assertNothingPushed();
    }

    public function test_the_page_lists_the_pending_challenge_with_reroll_controls(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $this->challenge($ada, $bo);

        $this->get('/games/ping-pong/challenges')
            ->assertOk()
            ->assertSee('Match of the hour')
            ->assertSee('Ada is gone')
            ->assertSee('Bo is gone')
            ->assertSee('Just re-roll');
    }
}
