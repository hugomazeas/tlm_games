<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\LiveMatchStarted;
use App\Games\PingPong\Events\MatchScoreUpdated;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongRatingChange;
use App\Games\PingPong\Services\EloService;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Jobs\SendMatchStartedNotificationJob;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * Logged results: final scores typed in after the games, for offices without a
 * scoring screen. They move ELO like live games, in the order typed, and can be
 * undone for a few minutes while nobody in them has played since.
 */
class PingPongLoggedResultsTest extends TestCase
{
    use RefreshDatabase;

    private Player $ada;

    private Player $bo;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(VideoRecordingService::class)->shouldIgnoreMissing();
        Queue::fake();

        // 15:00 in Québec and Chicoutimi.
        $this->travelTo(Carbon::parse('2026-10-28 19:00:00', 'UTC'));

        $this->ada = Player::create(['name' => 'Ada']);
        $this->bo = Player::create(['name' => 'Bo']);
    }

    /**
     * @param  list<array{int, int}>  $games
     * @param  array<string, mixed>  $extra
     */
    private function logSingles(array $games, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/games/ping-pong/api/logged-results', [
            'left' => $this->ada->id,
            'right' => $this->bo->id,
            'games' => array_map(fn (array $game): array => ['left' => $game[0], 'right' => $game[1]], $games),
            ...$extra,
        ]);
    }

    private function elo(Player $player, string $mode = '1v1'): int
    {
        return PingPongRating::where('player_id', $player->id)->where('mode', $mode)->value('elo_rating');
    }

    public function test_the_log_page_lists_players_with_their_office(): void
    {
        $this->get('/games/ping-pong/log')
            ->assertOk()
            ->assertSee('Log a result')
            ->assertSee('Ada');
    }

    public function test_the_ping_pong_home_links_to_the_log_page(): void
    {
        $this->get('/games/ping-pong')
            ->assertOk()
            ->assertSee('href="/games/ping-pong/log"', false)
            ->assertSee('No screen? Log final scores');
    }

    public function test_a_logged_game_is_a_finished_ranked_match_that_moves_elo(): void
    {
        $this->logSingles([[11, 7]])
            ->assertCreated()
            ->assertJsonPath('matches.0.left_won', true)
            ->assertJsonPath('matches.0.elo.left.before', 1200)
            ->assertJsonPath('matches.0.elo.left.after', 1216)
            ->assertJsonPath('matches.0.elo.right.after', 1184);

        $match = PingPongMatch::sole();
        $this->assertTrue($match->isLogged());
        $this->assertTrue($match->is_complete);
        $this->assertSame($this->ada->id, $match->winner_id);
        $this->assertSame(0, $match->points()->count());
        $this->assertNull($match->duration_formatted);
        $this->assertSame(1216, $this->elo($this->ada));
        $this->assertSame(1184, $this->elo($this->bo));
    }

    public function test_logging_broadcasts_nothing_films_nothing_and_pushes_nothing(): void
    {
        Event::fake([LiveMatchStarted::class, MatchScoreUpdated::class]);
        $this->mock(VideoRecordingService::class)->shouldNotReceive('startRecording');

        $this->logSingles([[11, 7]])->assertCreated();

        Event::assertNotDispatched(LiveMatchStarted::class);
        Event::assertNotDispatched(MatchScoreUpdated::class);
        Queue::assertNotPushed(SendMatchStartedNotificationJob::class);
    }

    /**
     * @return array<string, array{int, int}>
     */
    public static function finalScores(): array
    {
        return ['11–0' => [11, 0], '11–9' => [11, 9], '12–10 after deuce' => [12, 10], '17–19 after a long deuce' => [17, 19]];
    }

    #[DataProvider('finalScores')]
    public function test_a_final_score_is_accepted(int $left, int $right): void
    {
        $this->logSingles([[$left, $right]])->assertCreated();
    }

    /**
     * @return array<string, array{int, int}>
     */
    public static function unfinishedScores(): array
    {
        return ['short of 11' => [10, 8], 'not won by two' => [11, 10], 'past 11 by more than two' => [15, 9], 'a tie' => [11, 11], 'deuce won by three' => [13, 10]];
    }

    #[DataProvider('unfinishedScores')]
    public function test_a_score_no_game_ends_on_is_refused(int $left, int $right): void
    {
        $this->logSingles([[11, 4], [$left, $right]])->assertUnprocessable()->assertJsonValidationErrors('games.1');

        $this->assertSame(0, PingPongMatch::count(), 'nothing from the batch is kept');
    }

    public function test_a_batch_is_applied_in_the_order_typed_so_the_third_win_earns_the_streak_bonus(): void
    {
        $this->logSingles([[11, 5], [11, 8], [11, 9]])->assertCreated();

        $matches = PingPongMatch::orderBy('id')->get();
        $this->assertCount(3, $matches);
        $this->assertTrue($matches[0]->ended_at->lt($matches[1]->ended_at));
        $this->assertTrue($matches[1]->ended_at->lt($matches[2]->ended_at));
        $this->assertTrue($matches[2]->ended_at->equalTo(now()));

        $bonuses = PingPongRatingChange::where('type', 'streak_bonus')->get();
        $this->assertCount(1, $bonuses);
        $this->assertSame($matches[2]->id, $bonuses->first()->match_id);
        $this->assertSame($this->ada->id, $bonuses->first()->player_id);
    }

    public function test_a_game_won_by_the_right_hand_player_is_theirs(): void
    {
        $this->logSingles([[9, 11]])->assertCreated()->assertJsonPath('matches.0.left_won', false);

        $this->assertSame($this->bo->id, PingPongMatch::sole()->winner_id);
        $this->assertSame(1216, $this->elo($this->bo));
    }

    public function test_logged_results_are_singles_only(): void
    {
        $this->logSingles([[11, 3]])->assertCreated();

        $this->assertSame('1v1', PingPongMatch::sole()->mode);
        $this->assertNull(PingPongRating::where('mode', '2v2')->first());
    }

    public function test_a_player_cannot_play_themselves(): void
    {
        $this->postJson('/games/ping-pong/api/logged-results', [
            'left' => $this->ada->id, 'right' => $this->ada->id, 'games' => [['left' => 11, 'right' => 3]],
        ])->assertUnprocessable()->assertJsonValidationErrors(['right' => 'Pick two different players.']);

        $this->assertSame(0, PingPongMatch::count());
    }

    public function test_a_game_can_be_logged_for_earlier_today_in_the_offices_timezone(): void
    {
        // 22:00 on the 28th in Québec is already the 29th in UTC.
        $this->travelTo(Carbon::parse('2026-10-29 02:00:00', 'UTC'));

        $this->logSingles([[11, 6]], ['played_at' => '2026-10-28T12:30:00-04:00'])->assertCreated();

        $this->assertTrue(PingPongMatch::sole()->ended_at->equalTo(Carbon::parse('2026-10-28 16:30:00', 'UTC')));
    }

    public function test_a_game_from_yesterday_or_the_future_is_refused(): void
    {
        $this->logSingles([[11, 6]], ['played_at' => '2026-10-27T23:30:00-04:00'])
            ->assertUnprocessable()->assertJsonValidationErrors('played_at');

        $this->logSingles([[11, 6]], ['played_at' => '2026-10-28T16:30:00-04:00'])
            ->assertUnprocessable()->assertJsonValidationErrors('played_at');

        $this->assertSame(0, PingPongMatch::count());
    }

    public function test_a_game_cannot_be_slipped_in_before_a_players_last_ranked_match(): void
    {
        // Bo played a live game at 14:00 Québec time.
        PingPongMatch::create([
            'mode' => '1v1', 'player_left_id' => $this->bo->id, 'player_right_id' => Player::create(['name' => 'Cy'])->id,
            'player_left_score' => 11, 'player_right_score' => 4, 'winner_id' => $this->bo->id,
            'started_at' => now()->subHour()->subMinutes(10), 'ended_at' => now()->subHour(),
        ]);

        $this->logSingles([[11, 6]], ['played_at' => '2026-10-28T13:00:00-04:00'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['played_at' => 'Bo already played a game that ended at 14:00']);

        $this->logSingles([[11, 6]], ['played_at' => '2026-10-28T14:30:00-04:00'])->assertCreated();
    }

    public function test_a_free_play_match_does_not_block_logging_before_it(): void
    {
        PingPongMatch::create([
            'mode' => '1v1', 'free_play' => true, 'player_left_id' => $this->ada->id, 'player_right_id' => $this->bo->id,
            'player_left_score' => 11, 'player_right_score' => 4, 'winner_id' => $this->ada->id,
            'started_at' => now()->subMinutes(20), 'ended_at' => now()->subMinutes(10),
        ]);

        $this->logSingles([[11, 6]], ['played_at' => '2026-10-28T14:30:00-04:00'])->assertCreated();
    }

    public function test_undo_takes_the_elo_back_and_removes_the_match(): void
    {
        $this->logSingles([[11, 5], [11, 8], [11, 9]])->assertCreated();
        $ids = PingPongMatch::orderBy('id')->pluck('id');

        foreach ($ids->reverse() as $id) {
            $this->deleteJson("/games/ping-pong/api/logged-results/{$id}")->assertOk();
        }

        $this->assertSame(0, PingPongMatch::count());
        $this->assertSame(0, PingPongRatingChange::count());
        $this->assertSame(1200, $this->elo($this->ada));
        $this->assertSame(1200, $this->elo($this->bo));
        $this->assertSame(1200, app(EloService::class)->getEloFromHistory($this->ada->id));
    }

    public function test_undo_must_start_from_the_latest_game(): void
    {
        $this->logSingles([[11, 5], [11, 8]])->assertCreated();
        $first = PingPongMatch::orderBy('id')->first();

        $this->deleteJson("/games/ping-pong/api/logged-results/{$first->id}")
            ->assertUnprocessable()->assertJsonValidationErrors('match');

        $this->assertSame(2, PingPongMatch::count());
    }

    public function test_undo_is_refused_once_a_player_has_played_a_live_game_since(): void
    {
        $this->logSingles([[11, 5]])->assertCreated();
        $logged = PingPongMatch::sole();

        $this->travel(2)->minutes();
        PingPongMatch::create([
            'mode' => '1v1', 'player_left_id' => $this->ada->id, 'player_right_id' => Player::create(['name' => 'Cy'])->id,
            'player_left_score' => 11, 'player_right_score' => 4, 'winner_id' => $this->ada->id,
            'started_at' => now()->subMinute(), 'ended_at' => now(),
        ]);

        $this->deleteJson("/games/ping-pong/api/logged-results/{$logged->id}")->assertUnprocessable();
        $this->assertNotNull($logged->fresh());
    }

    public function test_undo_closes_after_the_window(): void
    {
        $this->logSingles([[11, 5]])->assertCreated();

        $this->travel(16)->minutes();

        $this->deleteJson('/games/ping-pong/api/logged-results/'.PingPongMatch::sole()->id)
            ->assertUnprocessable()->assertJsonValidationErrors('match');
        $this->assertSame(1216, $this->elo($this->ada));
    }

    public function test_a_live_match_cannot_be_undone_through_the_log(): void
    {
        $live = PingPongMatch::create([
            'mode' => '1v1', 'player_left_id' => $this->ada->id, 'player_right_id' => $this->bo->id,
            'player_left_score' => 11, 'player_right_score' => 4, 'winner_id' => $this->ada->id,
            'started_at' => now()->subMinutes(10), 'ended_at' => now(),
        ]);

        $this->deleteJson("/games/ping-pong/api/logged-results/{$live->id}")->assertUnprocessable();
        $this->assertNotNull($live->fresh());
    }

    public function test_a_logged_match_shows_on_every_page_that_lists_matches(): void
    {
        $this->logSingles([[11, 7]])->assertCreated();
        $match = PingPongMatch::sole();

        $this->getJson('/games/ping-pong/api/matches/recent')->assertOk()->assertJsonPath('0.logged', true);
        $this->getJson("/games/ping-pong/api/players/{$this->ada->id}/matches")->assertOk()->assertJsonPath('matches.0.logged', true);
        $this->getJson("/games/ping-pong/api/matches/{$match->id}")->assertOk()->assertJsonPath('logged_at', fn ($at) => $at !== null);
        $this->get("/games/ping-pong/matches/{$match->id}")->assertOk();
        $this->get("/games/ping-pong/players/{$this->ada->id}")->assertOk();
        $this->getJson("/games/ping-pong/api/players/{$this->ada->id}/stats")->assertOk();
        $this->getJson("/games/ping-pong/api/matchup/{$this->ada->id}/{$this->bo->id}")->assertOk();
        $this->get("/games/ping-pong/matchup/{$this->ada->id}/{$this->bo->id}")->assertOk();
        $this->getJson('/games/ping-pong/api/leaderboard')->assertOk();
        $this->get('/games/ping-pong/stats')->assertOk();
    }
}
