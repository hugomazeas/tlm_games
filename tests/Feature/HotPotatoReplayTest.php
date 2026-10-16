<?php

namespace Tests\Feature;

use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Js;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

class HotPotatoReplayTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['games.hot_potato.internal_secret' => self::SECRET]);
        Storage::fake('local');
    }

    public function test_the_sidecar_attaches_a_gzipped_replay_to_a_saved_game(): void
    {
        $game = $this->game();

        $this->postReplay($game, $this->replay())->assertCreated()->assertJson(['id' => $game->id]);

        $game->refresh();
        $this->assertSame("hot-potato/replays/{$game->id}.json.gz", $game->replay_path);
        Storage::disk('local')->assertExists($game->replay_path);
        $this->assertSame($this->replay(), Storage::disk('local')->get($game->replay_path));
    }

    public function test_a_replay_needs_the_secret(): void
    {
        $game = $this->game();

        $this->postReplay($game, $this->replay(), 'wrong')->assertForbidden();
        $this->assertNull($game->refresh()->replay_path);
    }

    public function test_a_replay_that_is_not_gzip_or_is_too_large_is_refused(): void
    {
        $game = $this->game();

        $this->postReplay($game, '{"version":1}')->assertUnprocessable();
        $this->postReplay($game, "\x1f\x8b".str_repeat('x', 7 * 1024 * 1024))->assertStatus(413);
        $this->assertNull($game->refresh()->replay_path);
    }

    public function test_results_without_a_replay_still_save(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->postJson('/internal/hot-potato/results', [
            'seed' => 1, 'theme' => 'open_space', 'duration_seconds' => 60,
            'started_at' => '2026-10-16T15:00:00Z', 'ended_at' => '2026-10-16T15:01:00Z',
            'players' => [['player_id' => $player->id, 'position' => 1, 'survived' => true, 'eliminated_at_ms' => null, 'hold_ms' => 0, 'passes' => 0]],
        ], ['X-Internal-Secret' => self::SECRET])->assertCreated();

        $this->assertNull(HotPotatoGame::sole()->replay_path);
    }

    public function test_only_the_newest_replays_of_each_office_are_kept(): void
    {
        config(['games.hot_potato.replays_per_office' => 2]);
        $montreal = Office::create(['name' => 'Montréal']);
        $quebec = Office::create(['name' => 'Québec']);

        $old = $this->game($montreal);
        $quebecGame = $this->game($quebec);
        $middle = $this->game($montreal);
        $newest = $this->game($montreal);
        foreach ([$old, $quebecGame, $middle, $newest] as $game) {
            $this->postReplay($game, $this->replay())->assertCreated();
        }

        $this->assertNull($old->refresh()->replay_path);
        Storage::disk('local')->assertMissing(HotPotatoGame::replayPathFor($old->id));
        $this->assertNotNull($middle->refresh()->replay_path);
        $this->assertNotNull($newest->refresh()->replay_path);
        // Another office's replays never count against this one's.
        $this->assertNotNull($quebecGame->refresh()->replay_path);
        // The game itself stays, results and all.
        $this->assertCount(1, $old->players);
    }

    public function test_the_replay_page_loads_the_sidecar_player(): void
    {
        $game = $this->game();
        $this->postReplay($game, $this->replay());

        $this->get("/games/hot-potato/replays/{$game->id}")
            ->assertOk()
            ->assertSee('/games/hot-potato/live/replay.js', false)
            ->assertSee(Js::from(['dataUrl' => url("/games/hot-potato/replays/{$game->id}/data")])->toHtml(), false)
            ->assertSee('data-replay-controls', false)
            ->assertSee('Open Space');
    }

    public function test_a_game_without_its_replay_has_no_page(): void
    {
        $game = $this->game();

        $this->get("/games/hot-potato/replays/{$game->id}")->assertNotFound();
        $this->get("/games/hot-potato/replays/{$game->id}/data")->assertNotFound();
        $this->get('/games/hot-potato/replays/999')->assertNotFound();
    }

    public function test_the_recording_is_served_gzipped_for_the_browser_to_unzip(): void
    {
        $game = $this->game();
        $this->postReplay($game, $this->replay());

        $response = $this->get("/games/hot-potato/replays/{$game->id}/data")->assertOk();

        $this->assertSame('gzip', $response->headers->get('Content-Encoding'));
        $this->assertStringStartsWith('application/json', $response->headers->get('Content-Type'));
        $this->assertSame($this->replay(), $response->getContent());
    }

    public function test_a_replay_whose_file_went_missing_is_a_404(): void
    {
        $game = $this->game();
        $this->postReplay($game, $this->replay());
        Storage::disk('local')->delete($game->refresh()->replay_path);

        $this->get("/games/hot-potato/replays/{$game->id}/data")->assertNotFound();
    }

    public function test_the_hot_potato_page_lists_each_office_s_recent_games_with_watch_links(): void
    {
        $office = Office::create(['name' => 'Montréal']);
        $withReplay = $this->game($office);
        $this->postReplay($withReplay, $this->replay());
        $this->game($office);

        $this->get('/games/hot-potato')
            ->assertOk()
            ->assertSee('Recent games')
            ->assertSee("officeId === '{$office->id}'", false)
            ->assertSee("/games/hot-potato/replays/{$withReplay->id}", false)
            ->assertViewHas('recentGames', fn ($recent) => $recent->get($office->id)->count() === 2
                && $recent->get($office->id)->whereNotNull('replay_url')->count() === 1);
    }

    public function test_a_player_s_profile_lists_their_recent_games_and_where_they_finished(): void
    {
        $alice = Player::create(['name' => 'Alice']);
        $bob = Player::create(['name' => 'Bob']);
        $game = $this->game(null, [[$alice, 1, true], [$bob, 2, false]]);
        $this->postReplay($game, $this->replay());
        $this->game(null, [[$alice, 1, true], [$bob, 2, false]]);

        $this->get("/players/{$bob->id}")
            ->assertOk()
            ->assertSee('Recent hot potato games')
            ->assertSee("/games/hot-potato/replays/{$game->id}", false)
            ->assertViewHas('hotPotatoGames', fn ($games) => $games->count() === 2
                && $games->first()['position'] === 2
                && $games->first()['winners'] === 'Alice'
                && $games->first()['replay_url'] === null);
    }

    public function test_a_profile_with_no_hot_potato_games_has_no_such_section(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->get("/players/{$player->id}")->assertOk()->assertDontSee('Recent hot potato games');
    }

    /**
     * @param  array<int, array{0: Player, 1: int, 2: bool}>|null  $rows  player, position, survived
     */
    private function game(?Office $office = null, ?array $rows = null): HotPotatoGame
    {
        $game = HotPotatoGame::create([
            'office_id' => $office?->id,
            'seed' => 1, 'theme' => 'open_space', 'duration_seconds' => 60,
            'started_at' => now(), 'ended_at' => now(),
        ]);

        foreach ($rows ?? [[Player::create(['name' => 'P'.uniqid()]), 1, true]] as [$player, $position, $survived]) {
            HotPotatoGamePlayer::create([
                'hot_potato_game_id' => $game->id,
                'player_id' => $player->id,
                'position' => $position,
                'survived' => $survived,
                'hold_ms' => 0,
                'passes' => 0,
            ]);
        }

        return $game;
    }

    private function replay(): string
    {
        return gzencode(json_encode(['version' => 1, 'meta' => [], 'frames' => []]));
    }

    private function postReplay(HotPotatoGame $game, string $body, string $secret = self::SECRET): TestResponse
    {
        return $this->call('POST', "/internal/hot-potato/games/{$game->id}/replay", server: [
            'HTTP_X_INTERNAL_SECRET' => $secret,
            'HTTP_ACCEPT' => 'application/json',
            'CONTENT_TYPE' => 'application/gzip',
        ], content: $body);
    }
}
