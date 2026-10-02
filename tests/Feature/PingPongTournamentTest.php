<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongRatingChange;
use App\Games\PingPong\Models\PingPongTournament;
use App\Games\PingPong\Services\TournamentService;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class PingPongTournamentTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->mock(VideoRecordingService::class)->shouldIgnoreMissing();
        Queue::fake();
    }

    /**
     * @return array<int, Player>
     */
    private function players(int $count): array
    {
        return collect(range(1, $count))->map(function (int $i) {
            $player = Player::create(['name' => "P{$i}"]);
            // P1 is the top seed, P2 second, ...
            PingPongRating::create(['player_id' => $player->id, 'mode' => '1v1', 'elo_rating' => 1500 - $i * 10]);

            return $player;
        })->all();
    }

    private function createTournament(array $players): PingPongTournament
    {
        $this->post('/games/ping-pong/tournaments', [
            'name' => 'Cup',
            'player_ids' => collect($players)->pluck('id')->shuffle()->all(),
        ])->assertRedirect();

        return PingPongTournament::latest('id')->firstOrFail();
    }

    /**
     * Plays the next bracket match to 11–0 for the left side.
     */
    private function playNextMatch(PingPongTournament $tournament): PingPongMatch
    {
        $this->post("/games/ping-pong/tournaments/{$tournament->id}/next")->assertRedirect();
        $match = PingPongMatch::includingTournaments()->latest('id')->firstOrFail();

        for ($i = 0; $i < 11; $i++) {
            $this->patchJson("/games/ping-pong/api/matches/{$match->id}", ['side' => 'left', 'action' => 'increment'])->assertOk();
        }

        return $match->fresh();
    }

    public function test_five_players_get_seeded_bracket_with_byes_for_top_seeds(): void
    {
        [$p1, $p2, $p3, $p4, $p5] = $this->players(5);
        $tournament = $this->createTournament([$p1, $p2, $p3, $p4, $p5]);

        // Standard order for 8 slots: 1v8, 4v5, 2v7, 3v6 — seeds 6–8 are byes.
        $firstRound = $tournament->bracket()->where('round', 1)->get()
            ->map(fn ($slot) => [$slot->player_left_id, $slot->player_right_id])->all();
        $this->assertSame([[$p1->id, null], [$p4->id, $p5->id], [$p2->id, null], [$p3->id, null]], $firstRound);

        // Byes walk through: round 2 is P1 vs TBD, P2 vs P3.
        $secondRound = $tournament->bracket()->where('round', 2)->get()
            ->map(fn ($slot) => [$slot->player_left_id, $slot->player_right_id])->all();
        $this->assertSame([[$p1->id, null], [$p2->id, $p3->id]], $secondRound);

        // 4 vs 5 is played first even though P2 vs P3 is ready too.
        $next = app(TournamentService::class)->nextSlot($tournament);
        $this->assertSame([1, $p4->id, $p5->id], [$next->round, $next->player_left_id, $next->player_right_id]);
    }

    public function test_full_tournament_runs_to_a_champion_without_touching_elo_or_official_stats(): void
    {
        $players = $this->players(4);
        $tournament = $this->createTournament($players);

        $played = collect([$this->playNextMatch($tournament), $this->playNextMatch($tournament), $this->playNextMatch($tournament)]);

        $tournament->refresh();
        $this->assertTrue($tournament->isComplete());
        $this->assertNotNull($tournament->winner_id);
        $this->assertSame(3, $tournament->matches()->count());

        // Points still recorded, tagged as tournament via the match.
        $this->assertSame(33, $played->sum(fn (PingPongMatch $m) => $m->points()->count()));
        $played->each(fn (PingPongMatch $m) => $this->assertSame($tournament->id, $m->tournament_id));

        // ELO untouched.
        $this->assertSame(0, PingPongRatingChange::count());
        $this->assertSame([1490, 1480, 1470, 1460], PingPongRating::orderBy('player_id')->pluck('elo_rating')->all());
        $this->assertNull($played->first()->player_left_elo_after);

        // Hidden from official queries, still reachable by id.
        $this->assertSame(0, PingPongMatch::whereNotNull('ended_at')->count());
        $this->getJson('/games/ping-pong/api/matches/recent')->assertExactJson([]);
        $this->getJson("/games/ping-pong/api/matches/{$played->first()->id}")
            ->assertOk()
            ->assertJsonPath('tournament_id', $tournament->id)
            ->assertJsonMissingPath('elo_changes');
    }

    public function test_official_match_still_applies_elo(): void
    {
        [$a, $b] = $this->players(2);
        $match = PingPongMatch::create([
            'mode' => '1v1', 'player_left_id' => $a->id, 'player_right_id' => $b->id,
            'first_server_id' => $a->id, 'player_left_score' => 10, 'started_at' => now(),
        ]);

        $this->patchJson("/games/ping-pong/api/matches/{$match->id}", ['side' => 'left', 'action' => 'increment'])
            ->assertOk()
            ->assertJsonStructure(['elo_changes']);

        $this->assertGreaterThan(0, PingPongRatingChange::count());
    }

    public function test_elo_preview_is_refused_for_tournament_matches(): void
    {
        $tournament = $this->createTournament($this->players(2));
        $this->post("/games/ping-pong/tournaments/{$tournament->id}/next");
        $match = PingPongMatch::includingTournaments()->firstOrFail();

        $this->getJson("/games/ping-pong/api/matches/{$match->id}/elo-preview")->assertStatus(422);
    }

    public function test_play_next_resumes_the_match_in_progress(): void
    {
        $tournament = $this->createTournament($this->players(2));

        $this->post("/games/ping-pong/tournaments/{$tournament->id}/next");
        $this->post("/games/ping-pong/tournaments/{$tournament->id}/next");

        $this->assertSame(1, $tournament->matches()->count());
    }

    public function test_abandoned_match_frees_the_slot(): void
    {
        $tournament = $this->createTournament($this->players(2));
        $this->post("/games/ping-pong/tournaments/{$tournament->id}/next");
        $match = $tournament->matches()->firstOrFail();

        $this->deleteJson("/games/ping-pong/api/matches/{$match->id}")->assertOk();

        $this->assertNull($tournament->bracket()->first()->match_id);
    }

    public function test_needs_at_least_two_players(): void
    {
        [$a] = $this->players(1);

        $this->post('/games/ping-pong/tournaments', ['name' => 'Solo', 'player_ids' => [$a->id]])
            ->assertSessionHasErrors('player_ids');
    }

    public function test_pages_render(): void
    {
        $tournament = $this->createTournament($this->players(3));

        $this->get('/games/ping-pong/tournaments')->assertOk()->assertSee('Cup');
        $this->get("/games/ping-pong/tournaments/{$tournament->id}")->assertOk()->assertSee('Semi-finals')->assertSee('bye');
    }
}
