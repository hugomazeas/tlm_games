<?php

namespace Tests\Feature;

use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Games\HotPotato\Services\Leaderboards\InfectionProvider;
use App\Games\HotPotato\Services\Leaderboards\KillerProvider;
use App\Games\HotPotato\Services\Leaderboards\SurvivalsProvider;
use App\Games\HotPotato\Services\RecentGames;
use App\Models\Player;
use Database\Seeders\GameTypeSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Killer Potato games as the sidecar saves them: their leaderboard and how the recent games name the winner. */
class HotPotatoKillerTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_killer_board_ranks_by_games_survived_then_catches(): void
    {
        [$alice, $bob, $carol] = collect(['Alice', 'Bob', 'Carol'])->map(fn ($name) => Player::create(['name' => $name]));

        // Alice and Bob survived once each; Bob also caught two people while hunting.
        $this->killerGame([[$alice, 2, true, 0], [$carol, 3, false, 0]]);
        $this->killerGame([[$bob, 2, true, 0], [$carol, 3, false, 0]]);
        $this->killerGame([[$bob, 1, false, 2], [$alice, 2, false, 0], [$carol, 3, false, 0]]);

        $board = (new KillerProvider)->getLeaderboard();

        $this->assertSame(['Bob', 'Alice', 'Carol'], $board->pluck('player_name')->all());
        $this->assertSame(
            ['player_id' => $bob->id, 'player_name' => 'Bob', 'survivals' => 1, 'catches' => 2, 'games_played' => 2],
            $board[0]
        );
        $this->assertSame(['Survived' => 1, 'Catches' => 2, 'Games' => 2], (new KillerProvider)->getPlayerStats($bob->id));
        $this->assertSame(['Survived' => 0, 'Catches' => 0, 'Games' => 3], (new KillerProvider)->getPlayerStats($carol->id));
        $this->assertNull((new KillerProvider)->getPlayerStats(Player::create(['name' => 'New'])->id));
    }

    public function test_only_killer_games_count_on_the_killer_board(): void
    {
        $alice = Player::create(['name' => 'Alice']);
        $this->game(HotPotatoGame::MODE_INFECTION, [[$alice, 1, true, 3]]);
        $this->game(HotPotatoGame::MODE_SURVIVAL, [[$alice, 1, true, 5]]);

        $this->assertNull((new KillerProvider)->getPlayerStats($alice->id));
        $this->assertTrue((new KillerProvider)->getLeaderboard()->isEmpty());

        // And a Killer game counts on no other board.
        $bob = Player::create(['name' => 'Bob']);
        $this->killerGame([[$bob, 1, true, 0]]);
        $this->assertNull((new SurvivalsProvider)->getPlayerStats($bob->id));
        $this->assertNull((new InfectionProvider)->getPlayerStats($bob->id));
    }

    public function test_the_leaderboard_page_has_the_killer_board(): void
    {
        $this->seed(GameTypeSeeder::class);
        $alice = Player::create(['name' => 'Alice']);
        $this->killerGame([[$alice, 1, false, 2]]);

        $this->get('/leaderboards/hot-potato')->assertOk()->assertSee('Killer Potato');
        $this->get('/leaderboards/hot-potato/killer')->assertOk()->assertSee('Catches')->assertSee('Alice');
        $this->get('/players/'.$alice->id)->assertOk()->assertSee('Catches');
    }

    public function test_a_killer_game_nobody_survived_is_won_by_the_person_who_hunted(): void
    {
        [$alice, $bob] = collect(['Alice', 'Bob'])->map(fn ($name) => Player::create(['name' => $name]));
        $this->killerGame([[$bob, 2, false, 0], [$alice, 1, false, 1]]);

        $this->assertSame('Alice', app(RecentGames::class)->forPlayer($bob)->sole()['winners']);
    }

    public function test_a_hunter_who_caught_nobody_is_still_named_by_first_place(): void
    {
        $alice = Player::create(['name' => 'Alice']);
        $this->killerGame([[$alice, 1, false, 0]]);

        $this->assertSame('Alice', app(RecentGames::class)->forPlayer($alice)->sole()['winners']);
    }

    public function test_a_killer_game_nobody_survived_with_an_ai_hunter_says_so(): void
    {
        [$alice, $bob] = collect(['Alice', 'Bob'])->map(fn ($name) => Player::create(['name' => $name]));
        $this->killerGame([[$alice, 2, false, 0], [$bob, 3, false, 0]]);

        $this->assertSame('An AI hunter', app(RecentGames::class)->forPlayer($alice)->sole()['winners']);
    }

    public function test_a_killer_game_with_survivors_names_them_and_other_modes_keep_nobody(): void
    {
        [$alice, $bob, $carol] = collect(['Alice', 'Bob', 'Carol'])->map(fn ($name) => Player::create(['name' => $name]));
        $this->killerGame([[$alice, 2, true, 0], [$bob, 3, false, 0], [$carol, 4, false, 1]]);
        $this->assertSame('Alice', app(RecentGames::class)->forPlayer($bob)->sole()['winners']);

        $dave = Player::create(['name' => 'Dave']);
        $this->game(HotPotatoGame::MODE_SURVIVAL, [[$dave, 1, false, 0]]);
        $this->assertSame('Nobody', app(RecentGames::class)->forPlayer($dave)->sole()['winners']);
    }

    /** @param  array<int, array{0: Player, 1: int, 2: bool, 3: int}>  $rows  player, position, survived, passes */
    private function killerGame(array $rows): void
    {
        $this->game(HotPotatoGame::MODE_KILLER, $rows);
    }

    /** @param  array<int, array{0: Player, 1: int, 2: bool, 3: int}>  $rows  player, position, survived, passes */
    private function game(string $mode, array $rows): void
    {
        $game = HotPotatoGame::create([
            'mode' => $mode,
            'seed' => 1, 'theme' => 'gym', 'duration_seconds' => 60,
            'started_at' => now(), 'ended_at' => now(),
        ]);

        foreach ($rows as [$player, $position, $survived, $passes]) {
            HotPotatoGamePlayer::create([
                'hot_potato_game_id' => $game->id,
                'player_id' => $player->id,
                'position' => $position,
                'survived' => $survived,
                'hold_ms' => 0,
                'passes' => $passes,
            ]);
        }
    }
}
