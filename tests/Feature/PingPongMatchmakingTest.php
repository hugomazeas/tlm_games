<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\MatchmakingResult;
use App\Games\PingPong\Services\MatchmakingService;
use App\Models\Office;
use App\Models\Player;
use App\Models\PushSubscription;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PingPongMatchmakingTest extends TestCase
{
    use RefreshDatabase;

    private const BURO_OFFICE = 'buro-office-quebec';

    /**
     * Wednesday 2026-03-04, 15:30 UTC — 10:30 in America/Toronto, mid-window.
     *
     * The clock is frozen because eligibility mixes two clocks: the office
     * local time Buro reports, and this app's own now() for cooldowns. They
     * have to describe the same instant or the daily-cap window drifts.
     */
    private const FROZEN_UTC = '2026-03-04 15:30:00';

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse(self::FROZEN_UTC, 'UTC'));

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

    private function office(array $overrides = []): Office
    {
        return Office::create(array_merge([
            'name' => 'Quebec',
            'buro_office_id' => self::BURO_OFFICE,
            'matchmaking_enabled' => true,
            'matchmaking_start' => '09:30',
            'matchmaking_end' => '16:30',
        ], $overrides));
    }

    /** Creates a player who is fully eligible: linked by email and push-enabled. */
    private function player(string $name, string $email, bool $withPush = true): Player
    {
        $player = Player::create(['name' => $name, 'email' => $email]);

        if ($withPush) {
            PushSubscription::create([
                'player_id' => $player->id,
                'endpoint' => 'https://push.example.test/'.$player->id,
                'endpoint_hash' => PushSubscription::hashEndpoint('https://push.example.test/'.$player->id),
                'public_key' => 'p256dh-key',
                'auth_token' => 'auth-token',
            ]);
        }

        return $player;
    }

    /**
     * @param  list<array{id: string, name: string, email: string, flags: list<string>}>  $users
     */
    private function fakeBuro(array $users, array $overrides = []): void
    {
        Http::fake([
            'buro:3000/api/integrations/presence*' => Http::response(array_merge([
                'date' => '2026-03-04',
                'localTime' => '10:30',
                'weekday' => 3,
                'office' => [
                    'id' => self::BURO_OFFICE,
                    'name' => 'Quebec',
                    'timezone' => 'America/Toronto',
                ],
                'users' => $users,
            ], $overrides)),
        ]);
    }

    /**
     * @return array{id: string, name: string, email: string, flags: list<string>}
     */
    private function buroUser(string $id, string $name, string $email, array $flags = ['Ping Pong']): array
    {
        return ['id' => $id, 'name' => $name, 'email' => $email, 'flags' => $flags];
    }

    public function test_it_draws_a_pair_and_creates_a_ready_lobby(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created);
        $this->assertNotNull($result->challenge);

        $challenge = $result->challenge->fresh(['lobby.participants']);
        $this->assertEquals(PingPongChallenge::STATUS_PENDING, $challenge->status);
        $this->assertEqualsCanonicalizing([$ada->id, $bo->id], $challenge->playerIds());

        $participants = $challenge->lobby->participants;
        $this->assertCount(2, $participants);
        $this->assertEqualsCanonicalizing(['left', 'right'], $participants->pluck('side')->all());
        $this->assertEquals('1v1', $challenge->lobby->mode);
    }

    public function test_it_caches_the_buro_user_id_on_the_player_it_matched_by_email(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals('buro-1', $ada->fresh()->buro_user_id);
    }

    public function test_it_skips_an_office_with_matchmaking_disabled(): void
    {
        $office = $this->office(['matchmaking_enabled' => false]);
        Http::fake();

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertFalse($result->created);
        $this->assertEquals(MatchmakingResult::OFFICE_DISABLED, $result->reason);
        Http::assertNothingSent();
    }

    public function test_it_skips_an_office_with_no_buro_link(): void
    {
        $office = $this->office(['buro_office_id' => null]);
        Http::fake();

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::OFFICE_DISABLED, $result->reason);
        Http::assertNothingSent();
    }

    public function test_it_skips_quietly_when_buro_is_unreachable(): void
    {
        $office = $this->office();
        Http::fake(['buro:3000/*' => Http::response(null, 500)]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertFalse($result->created);
        $this->assertEquals(MatchmakingResult::BURO_UNAVAILABLE, $result->reason);
        $this->assertDatabaseCount('ping_pong_challenges', 0);
    }

    public function test_it_skips_the_weekend(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ], ['weekday' => 6]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::WEEKEND, $result->reason);
    }

    public static function outsideHoursProvider(): array
    {
        return [
            'before the first draw' => ['08:30'],
            'after the last draw' => ['17:30'],
        ];
    }

    #[DataProvider('outsideHoursProvider')]
    public function test_it_skips_outside_the_office_window(string $localTime): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ], ['localTime' => $localTime]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::OUTSIDE_HOURS, $result->reason);
    }

    public function test_the_window_boundaries_are_inclusive(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        foreach (['09:30', '16:30'] as $localTime) {
            PingPongChallenge::query()->delete();

            $this->fakeBuro([
                $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
                $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            ], ['localTime' => $localTime]);

            $result = app(MatchmakingService::class)->drawForOffice($office);

            $this->assertTrue($result->created, "Expected a draw at {$localTime}");
        }
    }

    public function test_it_ignores_users_without_the_opt_in_flag(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com', ['Fire Warden']),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com', []),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::NO_OPT_INS, $result->reason);
    }

    /**
     * The kill switch is asked first, before Buro is even called: with the
     * feature off the draw must cost nothing and touch nothing.
     */
    public function test_it_draws_nothing_when_challenges_are_disabled(): void
    {
        config(['pingpong.challenges_enabled' => false]);

        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertFalse($result->created);
        $this->assertEquals(MatchmakingResult::CHALLENGES_DISABLED, $result->reason);
        $this->assertDatabaseCount('ping_pong_challenges', 0);
        Http::assertNothingSent();
    }

    /**
     * Push is how someone is told they were drawn, not a condition of being
     * drawn.
     */
    public function test_it_draws_players_who_never_enabled_push(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com', withPush: false);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created, 'Reason: '.$result->reason);
        $this->assertEquals(2, $result->eligibleCount);
    }

    /**
     * The draw that went missing: a four-person office where the pair drawn an
     * hour ago is still at the table, and of the two left standing only one had
     * push enabled. Gating on push emptied the hat and skipped the hour.
     */
    public function test_a_mid_match_pair_still_leaves_a_draw_for_those_without_push(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $cy = $this->player('Cy', 'cy@tlmgo.com', withPush: false);
        $di = $this->player('Di', 'di@tlmgo.com');

        PingPongMatch::create([
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'started_at' => Carbon::now()->subMinutes(4),
            'last_score_activity_at' => Carbon::now(),
        ]);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
            $this->buroUser('buro-4', 'Di', 'di@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created, 'Reason: '.$result->reason);
        $this->assertEquals(2, $result->eligibleCount);
        $this->assertEqualsCanonicalizing([$cy->id, $di->id], $result->challenge->playerIds());
    }

    public function test_it_ignores_buro_users_with_no_matching_player(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Stranger', 'stranger@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::NOT_ENOUGH_PLAYERS, $result->reason);
        $this->assertEquals(1, $result->eligibleCount);
    }

    public function test_it_matches_players_by_email_case_insensitively(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ADA@TLMGO.COM'),
            $this->buroUser('buro-2', 'Bo', 'Bo@Tlmgo.Com'),
        ]);

        $this->assertTrue(app(MatchmakingService::class)->drawForOffice($office)->created);
    }

    public function test_it_leaves_players_who_are_mid_match_alone(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $this->player('Cy', 'cy@tlmgo.com');

        PingPongMatch::create([
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'started_at' => Carbon::now()->subMinutes(5),
            'last_score_activity_at' => Carbon::now(),
        ]);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::NOT_ENOUGH_PLAYERS, $result->reason);
        $this->assertEquals(1, $result->eligibleCount);
    }

    public function test_an_abandoned_match_stops_blocking_its_players_after_an_hour(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');

        PingPongMatch::create([
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'started_at' => Carbon::now()->subHours(3),
            'last_score_activity_at' => Carbon::now()->subHours(3),
        ]);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $this->assertTrue(app(MatchmakingService::class)->drawForOffice($office)->created);
    }

    public function test_it_respects_the_player_cooldown(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $cy = $this->player('Cy', 'cy@tlmgo.com');

        PingPongChallenge::create([
            'office_id' => $office->id,
            'player_one_id' => $ada->id,
            'player_two_id' => $bo->id,
            'status' => PingPongChallenge::STATUS_DECLINED,
            'scheduled_for' => Carbon::now()->subHour(),
            'expires_at' => Carbon::now()->subMinutes(10),
        ]);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertEquals(MatchmakingResult::NOT_ENOUGH_PLAYERS, $result->reason);
        $this->assertEquals(1, $result->eligibleCount, 'Only Cy should remain eligible.');
        $this->assertNotNull($cy->fresh());
    }

    public function test_the_cooldown_lapses(): void
    {
        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');

        PingPongChallenge::create([
            'office_id' => $office->id,
            'player_one_id' => $ada->id,
            'player_two_id' => $bo->id,
            'status' => PingPongChallenge::STATUS_PLAYED,
            'scheduled_for' => Carbon::now()->subDays(3),
            'expires_at' => Carbon::now()->subDays(3),
        ]);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $this->assertTrue(app(MatchmakingService::class)->drawForOffice($office)->created);
    }

    /**
     * Production runs with the cooldown and the daily cap switched off, so the
     * only thing standing between someone and two draws in a row is this gate.
     */
    private function withoutCooldowns(): void
    {
        config([
            'pingpong.matchmaking.player_cooldown_hours' => 0,
            'pingpong.matchmaking.max_challenges_per_day' => 0,
        ]);
    }

    private function pastChallenge(Office $office, Player $one, Player $two, string $ago, string $status = PingPongChallenge::STATUS_EXPIRED): PingPongChallenge
    {
        return PingPongChallenge::create([
            'office_id' => $office->id,
            'player_one_id' => $one->id,
            'player_two_id' => $two->id,
            'status' => $status,
            'scheduled_for' => Carbon::parse(self::FROZEN_UTC, 'UTC')->sub($ago),
            'expires_at' => Carbon::parse(self::FROZEN_UTC, 'UTC')->sub($ago)->addMinutes(50),
        ]);
    }

    public function test_it_does_not_draw_the_same_people_two_draws_running(): void
    {
        $this->withoutCooldowns();

        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $cy = $this->player('Cy', 'cy@tlmgo.com');
        $di = $this->player('Di', 'di@tlmgo.com');

        $this->pastChallenge($office, $ada, $bo, '1 hour');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
            $this->buroUser('buro-4', 'Di', 'di@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created);
        $this->assertEquals(2, $result->eligibleCount, 'Last hour\'s pair should have been set aside.');
        $this->assertEqualsCanonicalizing([$cy->id, $di->id], $result->challenge->playerIds());
    }

    public function test_the_gap_lasts_exactly_one_draw(): void
    {
        $this->withoutCooldowns();

        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $cy = $this->player('Cy', 'cy@tlmgo.com');
        $di = $this->player('Di', 'di@tlmgo.com');

        // Ada and Bo played two draws ago, Cy and Di last time round: it is
        // Ada and Bo's turn again.
        $this->pastChallenge($office, $ada, $bo, '2 hours');
        $this->pastChallenge($office, $cy, $di, '1 hour');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
            $this->buroUser('buro-4', 'Di', 'di@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created);
        $this->assertEquals(2, $result->eligibleCount, 'Only last round\'s pair should have been set aside.');
        $this->assertEqualsCanonicalizing([$ada->id, $bo->id], $result->challenge->playerIds());
    }

    public function test_a_small_office_repeats_someone_rather_than_skipping_the_draw(): void
    {
        $this->withoutCooldowns();

        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $cy = $this->player('Cy', 'cy@tlmgo.com');

        $this->pastChallenge($office, $ada, $bo, '1 hour');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
        ]);

        // Setting both aside would leave only Cy, so a repeat beats no game.
        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created, 'Reason: '.$result->reason);
        $this->assertEquals(3, $result->eligibleCount);
        $this->assertCount(2, $result->challenge->playerIds());
    }

    public function test_a_superseded_draw_is_not_the_one_to_step_around(): void
    {
        $this->withoutCooldowns();

        $office = $this->office();
        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');
        $cy = $this->player('Cy', 'cy@tlmgo.com');
        $di = $this->player('Di', 'di@tlmgo.com');

        // Cy and Di were the last pair who actually stood: the draw naming Ada
        // and Bo was re-rolled minutes ago and never happened.
        $this->pastChallenge($office, $cy, $di, '1 hour');
        $this->pastChallenge($office, $ada, $bo, '5 minutes', PingPongChallenge::STATUS_SUPERSEDED);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com'),
            $this->buroUser('buro-4', 'Di', 'di@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created);
        $this->assertEquals(2, $result->eligibleCount, 'Cy and Di should have been set aside, not Ada and Bo.');
        $this->assertEqualsCanonicalizing([$ada->id, $bo->id], $result->challenge->playerIds());
    }

    public function test_another_office_draw_does_not_gate_this_one(): void
    {
        $this->withoutCooldowns();

        $office = $this->office();
        $montreal = $this->office(['name' => 'Montreal', 'buro_office_id' => 'buro-office-montreal']);

        $ada = $this->player('Ada', 'ada@tlmgo.com');
        $bo = $this->player('Bo', 'bo@tlmgo.com');

        // Quebec has drawn nobody yet today; Montreal's last draw is none of
        // its business.
        $this->pastChallenge($montreal, $ada, $bo, '1 hour');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created, 'Reason: '.$result->reason);
        $this->assertEqualsCanonicalizing([$ada->id, $bo->id], $result->challenge->playerIds());
    }

    public function test_the_announcement_audience_includes_people_who_opted_out_of_the_draw(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');
        $spectator = $this->player('Cy', 'cy@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            // No opt-in flag: Cy will never be drawn, but is in the office and
            // has push on, so should still hear that a match is happening.
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com', []),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertTrue($result->created);
        $this->assertEquals([$spectator->id], $result->challenge->audience_player_ids);
    }

    public function test_the_announcement_audience_excludes_people_without_push(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');
        $this->player('Cy', 'cy@tlmgo.com', withPush: false);

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
            $this->buroUser('buro-3', 'Cy', 'cy@tlmgo.com', []),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertSame([], $result->challenge->audience_player_ids);
    }

    public function test_the_announcement_audience_never_contains_the_two_players(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office);

        $this->assertSame([], $result->challenge->audience_player_ids);
    }

    public function test_a_dry_run_creates_nothing(): void
    {
        $office = $this->office();
        $this->player('Ada', 'ada@tlmgo.com');
        $this->player('Bo', 'bo@tlmgo.com');

        $this->fakeBuro([
            $this->buroUser('buro-1', 'Ada', 'ada@tlmgo.com'),
            $this->buroUser('buro-2', 'Bo', 'bo@tlmgo.com'),
        ]);

        $result = app(MatchmakingService::class)->drawForOffice($office, dryRun: true);

        $this->assertFalse($result->created);
        $this->assertEquals(MatchmakingResult::DRY_RUN, $result->reason);
        $this->assertEquals(2, $result->eligibleCount);
        $this->assertDatabaseCount('ping_pong_challenges', 0);
        $this->assertDatabaseCount('ping_pong_lobbies', 0);
    }

    public function test_it_sends_the_service_token_to_buro(): void
    {
        $office = $this->office();
        $this->fakeBuro([]);

        app(MatchmakingService::class)->drawForOffice($office);

        Http::assertSent(function ($request) {
            return str_contains($request->url(), 'officeId='.self::BURO_OFFICE)
                && $request->hasHeader('Authorization', 'Bearer test-token');
        });
    }
}
