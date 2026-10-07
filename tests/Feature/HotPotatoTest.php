<?php

namespace Tests\Feature;

use App\Games\HotPotato\Jobs\SendHotPotatoInviteJob;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Games\HotPotato\Services\Leaderboards\SurvivalsProvider;
use App\Models\Office;
use App\Models\Player;
use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class HotPotatoTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['games.hot_potato.internal_secret' => self::SECRET]);
    }

    private function internal(): array
    {
        return ['X-Internal-Secret' => self::SECRET, 'Accept' => 'application/json'];
    }

    public function test_the_page_lists_offices_and_players_and_loads_the_sidecar_script(): void
    {
        $office = Office::create(['name' => 'Montréal']);
        Player::create(['name' => 'Alice', 'office_id' => $office->id]);

        $this->get('/games/hot-potato')
            ->assertOk()
            ->assertSee('/games/hot-potato/live/client.js', false)
            ->assertViewHas('offices', fn ($offices) => $offices->pluck('name')->all() === ['Montréal'])
            ->assertViewHas('players', fn ($players) => $players->pluck('name')->all() === ['Alice']);
    }

    public function test_internal_endpoints_refuse_a_missing_or_wrong_secret(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->getJson("/internal/hot-potato/players/{$player->id}")->assertForbidden();
        $this->getJson("/internal/hot-potato/players/{$player->id}", ['X-Internal-Secret' => 'nope'])->assertForbidden();
        $this->postJson('/internal/hot-potato/results', [])->assertForbidden();
    }

    public function test_internal_endpoints_are_closed_when_no_secret_is_configured(): void
    {
        config(['games.hot_potato.internal_secret' => null]);
        $player = Player::create(['name' => 'Alice']);

        $this->getJson("/internal/hot-potato/players/{$player->id}", ['X-Internal-Secret' => ''])
            ->assertStatus(503);
    }

    public function test_the_sidecar_can_look_a_player_up(): void
    {
        $office = Office::create(['name' => 'Québec']);
        $player = Player::create(['name' => 'Alice', 'office_id' => $office->id]);

        $this->getJson("/internal/hot-potato/players/{$player->id}", $this->internal())
            ->assertOk()
            ->assertExactJson(['id' => $player->id, 'name' => 'Alice', 'office_id' => $office->id]);

        $this->getJson('/internal/hot-potato/players/999', $this->internal())->assertNotFound();
    }

    public function test_results_are_stored_with_every_player(): void
    {
        $office = Office::create(['name' => 'Montréal']);
        [$a, $b, $c] = collect(['Alice', 'Bob', 'Carol'])->map(fn ($name) => Player::create(['name' => $name]));

        $this->postJson('/internal/hot-potato/results', [
            'office_id' => $office->id,
            'seed' => 1234,
            'theme' => 'ice_rink',
            'duration_seconds' => 120,
            'started_at' => '2026-10-07T15:00:00.000Z',
            'ended_at' => '2026-10-07T15:02:00.000Z',
            'players' => [
                ['player_id' => $a->id, 'position' => 1, 'survived' => true, 'eliminated_at_ms' => null, 'hold_ms' => 5000, 'passes' => 3],
                ['player_id' => $b->id, 'position' => 1, 'survived' => true, 'eliminated_at_ms' => null, 'hold_ms' => 2000, 'passes' => 1],
                ['player_id' => $c->id, 'position' => 3, 'survived' => false, 'eliminated_at_ms' => 41000, 'hold_ms' => 22000, 'passes' => 0],
            ],
        ], $this->internal())->assertCreated();

        $game = HotPotatoGame::with('players')->sole();
        $this->assertSame('ice_rink', $game->theme);
        $this->assertSame(120, $game->duration_seconds);
        $this->assertCount(3, $game->players);
        $this->assertFalse($game->players->firstWhere('player_id', $c->id)->survived);
        $this->assertSame(41000, $game->players->firstWhere('player_id', $c->id)->eliminated_at_ms);
    }

    public function test_results_naming_an_unknown_player_are_rejected_whole(): void
    {
        $alice = Player::create(['name' => 'Alice']);

        $this->postJson('/internal/hot-potato/results', [
            'seed' => 1, 'theme' => 'open_space', 'duration_seconds' => 60,
            'started_at' => now()->toIso8601String(), 'ended_at' => now()->toIso8601String(),
            'players' => [
                ['player_id' => $alice->id, 'position' => 1, 'survived' => true, 'hold_ms' => 0, 'passes' => 0],
                ['player_id' => 999, 'position' => 2, 'survived' => false, 'hold_ms' => 0, 'passes' => 0],
            ],
        ], $this->internal())->assertUnprocessable();

        $this->assertSame(0, HotPotatoGame::count());
    }

    public function test_opening_a_session_queues_the_invite(): void
    {
        Queue::fake();
        $office = Office::create(['name' => 'Montréal']);
        $host = Player::create(['name' => 'Alice', 'office_id' => $office->id]);

        $this->postJson('/internal/hot-potato/sessions/opened', [
            'office_id' => $office->id,
            'host_player_id' => $host->id,
        ], $this->internal())->assertStatus(202);

        Queue::assertPushed(SendHotPotatoInviteJob::class, fn ($job) => $job->officeId === $office->id && $job->hostPlayerId === $host->id);
    }

    public function test_invites_reach_only_opted_in_players_of_that_office_never_the_host(): void
    {
        $here = Office::create(['name' => 'Montréal']);
        $there = Office::create(['name' => 'Québec']);
        $host = Player::create(['name' => 'Alice', 'office_id' => $here->id]);
        $colleague = Player::create(['name' => 'Bob', 'office_id' => $here->id]);
        $quiet = Player::create(['name' => 'Carol', 'office_id' => $here->id]);
        $elsewhere = Player::create(['name' => 'Dave', 'office_id' => $there->id]);

        $this->subscription($host, true);
        $wanted = $this->subscription($colleague, true);
        $this->subscription($quiet, false);
        $this->subscription($elsewhere, true);

        $sender = new class extends WebPushSender
        {
            public array $sent = [];

            public function send(Collection $subscriptions, array $payload, array $options = []): int
            {
                $this->sent[] = ['ids' => $subscriptions->pluck('id')->all(), 'payload' => $payload];

                return $subscriptions->count();
            }
        };

        (new SendHotPotatoInviteJob($here->id, $host->id))->handle($sender);

        $this->assertSame([$wanted->id], $sender->sent[0]['ids']);
        $this->assertStringContainsString('Alice', $sender->sent[0]['payload']['title']);
        $this->assertStringEndsWith('/games/hot-potato', $sender->sent[0]['payload']['url']);
    }

    public function test_a_browser_can_opt_in_and_out_of_invites(): void
    {
        $player = Player::create(['name' => 'Alice']);
        $endpoint = 'https://push.example.test/abc';

        $this->withoutMiddleware(ValidateCsrfToken::class)->postJson('/push/hot-potato/subscribe', [
            'player_id' => $player->id,
            'endpoint' => $endpoint,
            'keys' => ['p256dh' => 'key', 'auth' => 'auth'],
        ])->assertCreated();

        $row = PushSubscription::sole();
        $this->assertTrue($row->notify_hot_potato);
        $this->assertSame($player->id, $row->player_id);

        $this->withoutMiddleware(ValidateCsrfToken::class)
            ->postJson('/push/hot-potato/unsubscribe', ['endpoint' => $endpoint])
            ->assertOk();

        $this->assertFalse((bool) $row->fresh()->notify_hot_potato);
    }

    public function test_the_leaderboard_ranks_by_survivals_then_rate(): void
    {
        [$alice, $bob, $carol] = collect(['Alice', 'Bob', 'Carol'])->map(fn ($name) => Player::create(['name' => $name]));

        // Alice 2/2, Bob 2/3, Carol 0/2.
        $this->game([[$alice, true], [$bob, true], [$carol, false]]);
        $this->game([[$alice, true], [$bob, true], [$carol, false]]);
        $this->game([[$bob, false]]);

        $board = (new SurvivalsProvider)->getLeaderboard();

        $this->assertSame(['Alice', 'Bob', 'Carol'], $board->pluck('player_name')->all());
        $this->assertSame(100.0, $board[0]['survival_pct']);
        $this->assertSame(3, $board[1]['games_played']);
        $this->assertSame(
            ['Survivals' => 2, 'Survival %' => 66.7, 'Games' => 3, 'Passes' => 0],
            (new SurvivalsProvider)->getPlayerStats($bob->id)
        );
        $this->assertNull((new SurvivalsProvider)->getPlayerStats(Player::create(['name' => 'New'])->id));
    }

    private function subscription(Player $player, bool $hotPotato): PushSubscription
    {
        $endpoint = 'https://push.example.test/'.$player->id;

        return PushSubscription::create([
            'player_id' => $player->id,
            'endpoint' => $endpoint,
            'endpoint_hash' => PushSubscription::hashEndpoint($endpoint),
            'public_key' => 'key',
            'auth_token' => 'auth',
            'content_encoding' => 'aesgcm',
            'notify_hot_potato' => $hotPotato,
        ]);
    }

    /** @param  array<int, array{0: Player, 1: bool}>  $rows */
    private function game(array $rows): void
    {
        $game = HotPotatoGame::create([
            'seed' => 1, 'theme' => 'open_space', 'duration_seconds' => 60,
            'started_at' => now(), 'ended_at' => now(),
        ]);

        foreach ($rows as [$player, $survived]) {
            HotPotatoGamePlayer::create([
                'hot_potato_game_id' => $game->id,
                'player_id' => $player->id,
                'position' => $survived ? 1 : 2,
                'survived' => $survived,
                'hold_ms' => 0,
                'passes' => 0,
            ]);
        }
    }
}
