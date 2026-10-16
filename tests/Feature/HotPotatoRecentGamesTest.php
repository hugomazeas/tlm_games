<?php

namespace Tests\Feature;

use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class HotPotatoRecentGamesTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_the_office_s_list_is_rendered_with_watch_links_for_the_page_to_swap_in(): void
    {
        $office = Office::create(['name' => 'Montréal']);
        $withReplay = $this->game($office, HotPotatoGame::MODE_KILLER);
        $withReplay->forceFill(['replay_path' => HotPotatoGame::replayPathFor($withReplay->id)])->save();
        Storage::disk('local')->put($withReplay->replay_path, gzencode('{}'));
        $this->game($office);

        $response = $this->get("/games/hot-potato/recent/{$office->id}")
            ->assertOk()
            ->assertSee('data-recent-games', false)
            ->assertSee($withReplay->modeLabel())
            ->assertSee('data-watch-replay', false)
            ->assertSee("/games/hot-potato/replays/{$withReplay->id}", false);

        $this->assertSame(2, substr_count($response->getContent(), '<li'));
        $this->assertSame(1, substr_count($response->getContent(), 'data-watch-replay'));
    }

    public function test_only_that_office_s_games_are_listed(): void
    {
        $montreal = Office::create(['name' => 'Montréal']);
        $quebec = Office::create(['name' => 'Québec']);
        $this->game($montreal);
        $this->game($quebec);
        $this->game($quebec);

        $response = $this->get("/games/hot-potato/recent/{$montreal->id}")->assertOk();

        $this->assertSame(1, substr_count($response->getContent(), '<li'));
    }

    public function test_an_office_with_no_games_gets_an_empty_answer(): void
    {
        $office = Office::create(['name' => 'Montréal']);

        $this->get("/games/hot-potato/recent/{$office->id}")->assertNoContent();
    }

    public function test_an_unknown_office_is_a_404(): void
    {
        $this->get('/games/hot-potato/recent/999')->assertNotFound();
    }

    public function test_the_page_has_a_section_for_every_office_hidden_while_it_has_no_games(): void
    {
        $empty = Office::create(['name' => 'Montréal']);
        $busy = Office::create(['name' => 'Québec']);
        $this->game($busy);

        $content = $this->get('/games/hot-potato')
            ->assertOk()
            ->assertSee('recentGames', false)
            ->getContent();

        $this->assertMatchesRegularExpression("/data-recent-games-office=\"{$empty->id}\"\\s+hidden/", $content);
        $this->assertMatchesRegularExpression("/data-recent-games-office=\"{$busy->id}\"\\s*>/", $content);
    }

    private function game(Office $office, string $mode = HotPotatoGame::MODE_SURVIVAL): HotPotatoGame
    {
        $game = HotPotatoGame::create([
            'office_id' => $office->id,
            'mode' => $mode,
            'seed' => 1, 'theme' => 'open_space', 'duration_seconds' => 60,
            'started_at' => now(), 'ended_at' => now(),
        ]);

        HotPotatoGamePlayer::create([
            'hot_potato_game_id' => $game->id,
            'player_id' => Player::create(['name' => 'P'.uniqid()])->id,
            'position' => 1,
            'survived' => true,
            'hold_ms' => 0,
            'passes' => 0,
        ]);

        return $game;
    }
}
