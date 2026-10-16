<?php

namespace Tests\Feature;

use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Games\HotPotato\Services\Leaderboards\InfectionProvider;
use App\Games\HotPotato\Services\Leaderboards\SurvivalsProvider;
use App\Models\Player;
use Database\Seeders\GameTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Infection games as the sidecar saves them, and their leaderboard. */
class HotPotatoInfectionTest extends TestCase
{
    use RefreshDatabase;

    public function test_results_are_stored_in_the_infection_mode(): void
    {
        config(['games.hot_potato.internal_secret' => 'test-secret']);
        [$alice, $bob, $carol] = collect(['Alice', 'Bob', 'Carol'])->map(fn ($name) => Player::create(['name' => $name]));

        $this->postJson('/internal/hot-potato/results', [
            'mode' => 'infection',
            'seed' => 1, 'theme' => 'library', 'duration_seconds' => 120,
            'started_at' => '2026-10-16T15:00:00Z', 'ended_at' => '2026-10-16T15:02:00Z',
            'players' => [
                ['player_id' => $alice->id, 'position' => 1, 'survived' => true, 'eliminated_at_ms' => null, 'hold_ms' => 120000, 'passes' => 0],
                ['player_id' => $bob->id, 'position' => 2, 'survived' => false, 'eliminated_at_ms' => 80000, 'hold_ms' => 80000, 'passes' => 0],
                ['player_id' => $carol->id, 'position' => 3, 'survived' => false, 'eliminated_at_ms' => 0, 'hold_ms' => 0, 'passes' => 1],
            ],
        ], ['X-Internal-Secret' => 'test-secret'])->assertCreated();

        $game = HotPotatoGame::sole();
        $this->assertSame(HotPotatoGame::MODE_INFECTION, $game->mode);
        $this->assertSame('🦠 Infection', $game->modeLabel());
    }

    public function test_the_infection_board_ranks_by_games_stayed_clean_then_how_often(): void
    {
        [$alice, $bob, $carol] = collect(['Alice', 'Bob', 'Carol'])->map(fn ($name) => Player::create(['name' => $name]));

        // Alice and Bob stayed clean once each; Alice played fewer games, so her rate is higher.
        $this->infectionGame([[$alice, true, 0], [$bob, false, 2], [$carol, false, 1]]);
        $this->infectionGame([[$bob, true, 0], [$carol, false, 2]]);
        $this->infectionGame([[$carol, true, 0], [$bob, false, 0]]);

        $board = (new InfectionProvider)->getLeaderboard();

        $this->assertSame(['Alice', 'Bob', 'Carol'], $board->pluck('player_name')->all());
        $this->assertSame(100, $board[0]['survival_pct']);
        $this->assertSame(
            ['Stayed clean' => 1, 'Clean %' => 33, 'Games' => 3, 'Infected others' => 2],
            (new InfectionProvider)->getPlayerStats($bob->id)
        );
        $this->assertNull((new InfectionProvider)->getPlayerStats(Player::create(['name' => 'New'])->id));
        // An Infection game never counts as a survival in the classic board.
        $this->assertNull((new SurvivalsProvider)->getPlayerStats($alice->id));
    }

    public function test_the_leaderboard_page_has_the_infection_board(): void
    {
        $this->seed(GameTypeSeeder::class);
        $alice = Player::create(['name' => 'Alice']);
        $this->infectionGame([[$alice, true, 0]]);

        $this->get('/leaderboards/hot-potato')->assertOk()->assertSee('Infection');
        $this->get('/leaderboards/hot-potato/infection')->assertOk()->assertSee('Stayed clean')->assertSee('Alice');
        $this->get('/players/'.$alice->id)->assertOk()->assertSee('Infected others');
    }

    /** @param  array<int, array{0: Player, 1: bool, 2: int}>  $rows  player, stayed clean, people infected */
    private function infectionGame(array $rows): void
    {
        $game = HotPotatoGame::create([
            'mode' => HotPotatoGame::MODE_INFECTION,
            'seed' => 1, 'theme' => 'gym', 'duration_seconds' => 60,
            'started_at' => now(), 'ended_at' => now(),
        ]);

        foreach ($rows as $i => [$player, $clean, $infected]) {
            HotPotatoGamePlayer::create([
                'hot_potato_game_id' => $game->id,
                'player_id' => $player->id,
                'position' => $clean ? 1 : $i + 2,
                'survived' => $clean,
                'hold_ms' => 0,
                'passes' => $infected,
            ]);
        }
    }
}
