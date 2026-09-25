<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Jobs\SendMatchStartedNotificationJob;
use App\Models\Player;
use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * Covers the "a match just started" push that livestream viewers opt into
 * from the watch page, independently of the challenge matchmaker.
 */
class PingPongMatchStartNotificationTest extends TestCase
{
    use RefreshDatabase;

    private MatchStartRecordingSender $sender;

    protected function setUp(): void
    {
        parent::setUp();

        $this->sender = new MatchStartRecordingSender;
        $this->app->instance(WebPushSender::class, $this->sender);

        // Starting a match also tries to start ffmpeg; that is not what these
        // tests are about.
        $this->mock(VideoRecordingService::class)->shouldIgnoreMissing();
    }

    private function subscription(?Player $player, bool $notifyMatchStarts, string $suffix): PushSubscription
    {
        $endpoint = 'https://push.example.test/'.$suffix;

        return PushSubscription::create([
            'player_id' => $player?->id,
            'endpoint' => $endpoint,
            'endpoint_hash' => PushSubscription::hashEndpoint($endpoint),
            'public_key' => 'p256dh-key',
            'auth_token' => 'auth-token',
            'notify_match_starts' => $notifyMatchStarts,
        ]);
    }

    private function singlesMatch(): PingPongMatch
    {
        $ada = Player::create(['name' => 'Ada']);
        $bo = Player::create(['name' => 'Bo']);

        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'first_server_id' => $ada->id,
            'current_server_id' => $ada->id,
            'serve_count' => 0,
            'started_at' => now(),
        ]);
    }

    public function test_only_browsers_that_opted_in_are_told(): void
    {
        $match = $this->singlesMatch();
        $optedIn = $this->subscription(null, true, 'anon');
        $optedInPlayer = $this->subscription(Player::create(['name' => 'Cy']), true, 'cy');
        $this->subscription(Player::create(['name' => 'Di']), false, 'di');

        (new SendMatchStartedNotificationJob($match->id))->handle($this->sender);

        $this->assertCount(1, $this->sender->sends);
        $this->assertEqualsCanonicalizing(
            [$optedIn->id, $optedInPlayer->id],
            collect($this->sender->sends[0]['subscriptions'])->pluck('id')->all()
        );
    }

    public function test_the_notification_names_the_players_and_links_to_the_stream(): void
    {
        $match = $this->singlesMatch();
        $this->subscription(null, true, 'anon');

        (new SendMatchStartedNotificationJob($match->id))->handle($this->sender);

        $payload = $this->sender->sends[0]['payload'];
        $this->assertSame('🏓 Ada vs Bo', $payload['title']);
        $this->assertSame('pingpong-match-'.$match->id, $payload['tag']);
        $this->assertSame(url('/games/ping-pong/watch'), $payload['url']);
        $this->assertArrayNotHasKey('actions', $payload);
        $this->assertSame(600, $this->sender->sends[0]['options']['TTL']);
    }

    public function test_a_doubles_match_names_both_teams(): void
    {
        [$a, $b, $c, $d] = collect(['Ada', 'Bo', 'Cy', 'Di'])
            ->map(fn (string $name) => Player::create(['name' => $name]))
            ->all();

        $match = PingPongMatch::create([
            'mode' => '2v2',
            'player_left_id' => $a->id,
            'team_left_player2_id' => $c->id,
            'player_right_id' => $b->id,
            'team_right_player2_id' => $d->id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'first_server_id' => $a->id,
            'current_server_id' => $a->id,
            'serve_count' => 0,
            'started_at' => now(),
        ]);
        $this->subscription(null, true, 'anon');

        (new SendMatchStartedNotificationJob($match->id))->handle($this->sender);

        $this->assertSame('🏓 Ada & Cy vs Bo & Di', $this->sender->sends[0]['payload']['title']);
    }

    public function test_nothing_is_sent_when_nobody_opted_in(): void
    {
        $match = $this->singlesMatch();
        $this->subscription(Player::create(['name' => 'Cy']), false, 'cy');

        (new SendMatchStartedNotificationJob($match->id))->handle($this->sender);

        $this->assertSame([], $this->sender->sends);
    }

    public function test_a_missing_match_sends_nothing(): void
    {
        $this->subscription(null, true, 'anon');

        (new SendMatchStartedNotificationJob(9999))->handle($this->sender);

        $this->assertSame([], $this->sender->sends);
    }

    public function test_starting_a_match_directly_queues_the_notification(): void
    {
        Queue::fake();
        $ada = Player::create(['name' => 'Ada']);
        $bo = Player::create(['name' => 'Bo']);

        $response = $this->postJson('/games/ping-pong/api/matches', [
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'first_server_id' => $ada->id,
        ])->assertCreated();

        Queue::assertPushed(
            SendMatchStartedNotificationJob::class,
            fn (SendMatchStartedNotificationJob $job) => $job->matchId === $response->json('id')
        );
    }

    public function test_starting_a_match_from_a_lobby_queues_the_notification(): void
    {
        Queue::fake();
        $ada = Player::create(['name' => 'Ada']);
        $bo = Player::create(['name' => 'Bo']);

        $lobby = PingPongLobby::create([
            'code' => 'AB12',
            'mode' => '1v1',
            'host_token' => str_repeat('h', 64),
            'status' => 'waiting',
            'expires_at' => now()->addHour(),
        ]);
        PingPongLobbyParticipant::create(['lobby_id' => $lobby->id, 'player_id' => $ada->id, 'side' => 'left', 'session_token' => 'left-token']);
        PingPongLobbyParticipant::create(['lobby_id' => $lobby->id, 'player_id' => $bo->id, 'side' => 'right', 'session_token' => 'right-token']);

        $response = $this->postJson('/games/ping-pong/api/lobbies/AB12/start', [
            'host_token' => str_repeat('h', 64),
        ])->assertOk();

        Queue::assertPushed(
            SendMatchStartedNotificationJob::class,
            fn (SendMatchStartedNotificationJob $job) => $job->matchId === $response->json('match.id')
        );
    }
}

class MatchStartRecordingSender extends WebPushSender
{
    /** @var list<array{subscriptions: array<int, mixed>, payload: array<string, mixed>, options: array<string, mixed>}> */
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
