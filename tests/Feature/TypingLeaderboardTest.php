<?php

namespace Tests\Feature;

use App\Games\Typing\Models\TypingTest;
use App\Games\Typing\Services\Leaderboards\AverageWpmProvider;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TypingLeaderboardTest extends TestCase
{
    use RefreshDatabase;

    public function test_ranks_by_average_wpm(): void
    {
        $alice = $this->playerWith(array_fill(0, 5, [72, 90]));
        $bob = $this->playerWith(array_fill(0, 5, [65, 99]));

        $board = (new AverageWpmProvider)->getLeaderboard();

        $this->assertSame([$alice->id, $bob->id], $board->pluck('player_id')->all());
        $this->assertSame(72.0, $board[0]['avg_wpm']);
        $this->assertSame(5, $board[0]['tests_count']);
    }

    public function test_equal_wpm_is_broken_by_accuracy(): void
    {
        $bob = $this->playerWith(array_fill(0, 5, [70, 94.3]));
        $alice = $this->playerWith(array_fill(0, 5, [70, 96.1]));

        $board = (new AverageWpmProvider)->getLeaderboard();

        $this->assertSame([$alice->id, $bob->id], $board->pluck('player_id')->all());
        $this->assertSame(96.1, $board[0]['avg_accuracy']);
    }

    public function test_one_test_is_enough_to_be_ranked(): void
    {
        $alice = $this->playerWith([[100, 100]]);

        $board = (new AverageWpmProvider)->getLeaderboard();

        $this->assertSame([$alice->id], $board->pluck('player_id')->all());
    }

    public function test_pending_tests_do_not_count(): void
    {
        $alice = $this->playerWith(array_fill(0, 4, [60, 95]));
        TypingTest::create(['player_id' => $alice->id, 'language' => 'en', 'source' => 'words', 'text' => 'x', 'issued_at' => now()]);

        $this->assertSame(4, (new AverageWpmProvider)->getLeaderboard()[0]['tests_count']);
    }

    public function test_race_and_solo_results_both_count(): void
    {
        $alice = $this->playerWith(array_fill(0, 3, [60, 95]));
        // Race results: a race id was set; the provider only cares that they're submitted.
        foreach ([80, 80] as $wpm) {
            $this->addResult($alice, $wpm, 95, 'en');
        }

        $board = (new AverageWpmProvider)->getLeaderboard();

        $this->assertSame(68.0, $board[0]['avg_wpm']);
        $this->assertSame(5, $board[0]['tests_count']);
    }

    public function test_favourite_language_is_the_most_played(): void
    {
        $alice = Player::create(['name' => 'Alice']);
        foreach (['fr', 'fr', 'fr', 'en', 'en'] as $language) {
            $this->addResult($alice, 60, 95, $language);
        }

        $this->assertSame('Français', (new AverageWpmProvider)->getLeaderboard()[0]['language']);
    }

    public function test_favourite_language_tie_goes_to_the_latest(): void
    {
        $alice = Player::create(['name' => 'Alice']);
        foreach (['en', 'en', 'en', 'fr', 'fr', 'fr'] as $i => $language) {
            $this->travel(1)->minutes();
            $this->addResult($alice, 60, 95, $language);
        }

        $this->assertSame('Français', (new AverageWpmProvider)->getLeaderboard()[0]['language']);
    }

    public function test_restarts_are_counted_per_player(): void
    {
        $alice = $this->playerWith([[60, 95]]);
        $bob = $this->playerWith([[50, 95]]);
        foreach ([now(), now(), null] as $restartedAt) {
            TypingTest::create([
                'player_id' => $alice->id, 'language' => 'en', 'source' => 'words', 'text' => 'x',
                'issued_at' => now(), 'restarted_at' => $restartedAt,
            ]);
        }

        $board = (new AverageWpmProvider)->getLeaderboard();

        $this->assertSame(2, $board[0]['restarts']);
        $this->assertSame(0, $board[1]['restarts']);
        $this->assertSame(2, (new AverageWpmProvider)->getPlayerStats($alice->id)['Restarts']);
    }

    public function test_player_stats_show_before_being_ranked(): void
    {
        $alice = $this->playerWith([[50, 90], [70, 100]]);
        $bob = Player::create(['name' => 'Bob']);

        $stats = (new AverageWpmProvider)->getPlayerStats($alice->id);

        $this->assertSame(['Avg WPM' => 60.0, 'Accuracy' => 95.0, 'Best WPM' => 70.0, 'Tests' => 2, 'Language' => 'English', 'Restarts' => 0], $stats);
        $this->assertNull((new AverageWpmProvider)->getPlayerStats($bob->id));
    }

    public function test_leaderboard_page_renders(): void
    {
        $this->seed(\Database\Seeders\GameTypeSeeder::class);
        $this->playerWith(array_fill(0, 5, [72, 90]));

        $this->get('/leaderboards/typing')->assertOk();
    }

    /**
     * @param  list<array{0: float|int, 1: float|int}>  $results  [wpm, accuracy] pairs
     */
    private function playerWith(array $results): Player
    {
        $player = Player::create(['name' => fake()->unique()->firstName()]);
        foreach ($results as [$wpm, $accuracy]) {
            $this->addResult($player, $wpm, $accuracy, 'en');
        }

        return $player;
    }

    private function addResult(Player $player, float $wpm, float $accuracy, string $language): void
    {
        TypingTest::create([
            'player_id' => $player->id,
            'language' => $language,
            'source' => 'words',
            'text' => 'x',
            'wpm' => $wpm,
            'accuracy' => $accuracy,
            'duration_ms' => 30000,
            'issued_at' => now(),
            'submitted_at' => now(),
        ]);
    }
}
