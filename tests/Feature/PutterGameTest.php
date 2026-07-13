<?php

namespace Tests\Feature;

use App\Games\Putter\Models\PutterGame;
use App\Games\Putter\Services\Leaderboards\CareerMakePercentageProvider;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PutterGameTest extends TestCase
{
    use RefreshDatabase;

    public function test_submitting_a_round_records_makes_and_balls(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $response = $this->withoutMiddleware(ValidateCsrfToken::class)->post('/games/putter', [
            'player_id' => $player->id,
            'results' => [1, 0, 1, 1, 0],
        ]);

        $response->assertRedirect('/games/putter');

        $game = PutterGame::first();
        $this->assertSame(3, $game->makes);
        $this->assertSame(5, $game->balls);
        $this->assertSame([true, false, true, true, false], $game->results);
    }

    public function test_round_must_have_exactly_five_balls(): void
    {
        $player = Player::create(['name' => 'Bob']);

        $this->withoutMiddleware(ValidateCsrfToken::class)->post('/games/putter', [
            'player_id' => $player->id,
            'results' => [1, 0, 1],
        ])->assertSessionHasErrors('results');

        $this->assertSame(0, PutterGame::count());
    }

    public function test_leaderboard_ranks_by_career_make_percentage(): void
    {
        $alice = Player::create(['name' => 'Alice']); // 8/10 = 80%
        $bob = Player::create(['name' => 'Bob']);     // 3/5 = 60%

        PutterGame::create(['player_id' => $alice->id, 'results' => [true, true, true, true, false], 'makes' => 4, 'balls' => 5]);
        PutterGame::create(['player_id' => $alice->id, 'results' => [true, true, true, true, false], 'makes' => 4, 'balls' => 5]);
        PutterGame::create(['player_id' => $bob->id, 'results' => [true, true, true, false, false], 'makes' => 3, 'balls' => 5]);

        $board = (new CareerMakePercentageProvider())->getLeaderboard();

        $this->assertSame($alice->id, $board[0]['player_id']);
        $this->assertSame(80.0, $board[0]['make_pct']);
        $this->assertSame(60.0, $board[1]['make_pct']);
    }
}
