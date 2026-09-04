<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Models\PingPongLobby;
use App\Jobs\SendChallengeNotificationJob;
use App\Models\Office;
use App\Models\Player;
use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Tests\TestCase;

/**
 * Covers who gets told about a challenge, and what they're told.
 *
 * `WebPushSender` is swapped for a recorder rather than faked at the HTTP
 * layer: the payload shape and the audience split are the behaviour worth
 * pinning, and the real sender's transport is exercised by its own contract
 * with minishlink/web-push.
 */
class PingPongChallengeNotificationTest extends TestCase
{
    use RefreshDatabase;

    private RecordingWebPushSender $sender;

    protected function setUp(): void
    {
        parent::setUp();

        $this->sender = new RecordingWebPushSender;
        $this->app->instance(WebPushSender::class, $this->sender);
    }

    private function player(string $name, bool $withPush = true): Player
    {
        $player = Player::create(['name' => $name, 'email' => strtolower($name).'@tlmgo.com']);

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

    private function challenge(Player $one, Player $two, array $audience = [], array $overrides = []): PingPongChallenge
    {
        $office = Office::create(['name' => 'Quebec', 'buro_office_id' => 'buro-quebec']);

        $lobby = PingPongLobby::create([
            'code' => 'AB12',
            'mode' => '1v1',
            'host_token' => str_repeat('h', 64),
            'status' => 'waiting',
            'expires_at' => Carbon::now()->addMinutes(50),
        ]);

        return PingPongChallenge::create(array_merge([
            'office_id' => $office->id,
            'player_one_id' => $one->id,
            'player_two_id' => $two->id,
            'lobby_id' => $lobby->id,
            'status' => PingPongChallenge::STATUS_PENDING,
            'audience_player_ids' => $audience,
            'scheduled_for' => Carbon::now(),
            'expires_at' => Carbon::now()->addMinutes(50),
        ], $overrides));
    }

    public function test_each_player_is_told_who_their_opponent_is(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $titles = array_column($this->sender->sends, 'payload');

        $this->assertStringContainsString('Bo', $titles[0]['title']);
        $this->assertStringContainsString('Ada', $titles[1]['title']);
    }

    public function test_players_get_accept_and_decline_actions_bound_by_a_token(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $payload = $this->sender->sends[0]['payload'];

        $this->assertEquals(['accept', 'decline'], array_column($payload['actions'], 'action'));
        $this->assertEquals($ada->id, $payload['playerId']);
        $this->assertEquals($challenge->responseTokenFor($ada->id), $payload['responseToken']);
        $this->assertStringContainsString('/challenges/'.$challenge->id.'/respond', $payload['respondUrl']);
        $this->assertStringContainsString('/lobby/AB12', $payload['url']);
    }

    public function test_the_rest_of_the_office_is_told_who_is_playing(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');
        $di = $this->player('Di');

        $challenge = $this->challenge($ada, $bo, audience: [$cy->id, $di->id]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $announcement = end($this->sender->sends);

        $this->assertEquals('🏓 Ada vs Bo', $announcement['payload']['title']);
        $this->assertStringContainsString('Quebec', $announcement['payload']['body']);
        $this->assertCount(2, $announcement['subscriptions'], 'Cy and Di should both be told.');
        // Spectators go to the watch screen; the 1v1 lobby is already full.
        $this->assertStringEndsWith('/games/ping-pong/watch', $announcement['payload']['url']);
    }

    public function test_the_announcement_carries_no_response_actions(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');

        $challenge = $this->challenge($ada, $bo, audience: [$cy->id]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $announcement = end($this->sender->sends);

        $this->assertArrayNotHasKey('actions', $announcement['payload']);
        $this->assertArrayNotHasKey('responseToken', $announcement['payload']);
    }

    public function test_the_two_players_are_never_double_notified_by_the_announcement(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $cy = $this->player('Cy');

        // A stale audience list that wrongly includes the players themselves.
        $challenge = $this->challenge($ada, $bo, audience: [$ada->id, $bo->id, $cy->id]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $announcement = end($this->sender->sends);

        $this->assertCount(1, $announcement['subscriptions'], 'Only Cy should be announced to.');
    }

    public function test_it_skips_the_announcement_when_nobody_else_is_in(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo, audience: []);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $this->assertCount(2, $this->sender->sends, 'Only the two personal notifications.');
    }

    public function test_the_ttl_is_capped_to_the_remaining_challenge_window(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        // Twenty minutes left, not the default half hour.
        $challenge = $this->challenge($ada, $bo, overrides: [
            'expires_at' => Carbon::now()->addMinutes(20),
        ]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $ttl = $this->sender->sends[0]['options']['TTL'];

        // Waking a phone to "the table is free" after the challenge died is
        // worse than staying quiet, so the push service must drop it by then.
        $this->assertEqualsWithDelta(20 * 60, $ttl, 5);
    }

    public function test_it_stamps_notified_at(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $this->assertNotNull($challenge->fresh()->notified_at);
    }

    public function test_it_sends_nothing_when_challenges_are_disabled(): void
    {
        config(['pingpong.challenges_enabled' => false]);

        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo, audience: [$this->player('Cy')->id]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $this->assertSame([], $this->sender->sends);
        $this->assertNull($challenge->fresh()->notified_at);
    }

    public function test_it_sends_nothing_for_an_expired_challenge(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo, overrides: [
            'expires_at' => Carbon::now()->subMinute(),
        ]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $this->assertSame([], $this->sender->sends);
    }

    public function test_it_sends_nothing_once_the_challenge_is_declined(): void
    {
        $ada = $this->player('Ada');
        $bo = $this->player('Bo');
        $challenge = $this->challenge($ada, $bo, overrides: [
            'status' => PingPongChallenge::STATUS_DECLINED,
        ]);

        (new SendChallengeNotificationJob($challenge->id))->handle($this->sender);

        $this->assertSame([], $this->sender->sends);
    }
}

/** Captures what would have been pushed, instead of pushing it. */
class RecordingWebPushSender extends WebPushSender
{
    /** @var list<array{subscriptions: array<int, mixed>, payload: array<string, mixed>}> */
    public array $sends = [];

    public function isConfigured(): bool
    {
        return true;
    }

    public function send(Collection $subscriptions, array $payload, array $options = []): int
    {
        if ($subscriptions->isEmpty()) {
            return 0;
        }

        $this->sends[] = [
            'subscriptions' => $subscriptions->all(),
            'payload' => $payload,
            'options' => $options,
        ];

        return $subscriptions->count();
    }
}
