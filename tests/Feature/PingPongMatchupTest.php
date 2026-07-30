<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongClip;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\MatchupAnalysisService;
use App\Models\Player;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class PingPongMatchupTest extends TestCase
{
    use RefreshDatabase;

    private Player $ann;

    private Player $bob;

    protected function setUp(): void
    {
        parent::setUp();
        $this->ann = Player::create(['name' => 'Ann']);
        $this->bob = Player::create(['name' => 'Bob']);
    }

    /**
     * Create a completed match and its point rows.
     *
     * @param  list<string>  $sides  Scoring side per rally
     * @param  array<string, mixed>  $attrs
     */
    private function match(array $sides, array $attrs = []): PingPongMatch
    {
        $leftId = $attrs['player_left_id'] ?? $this->ann->id;
        $rightId = $attrs['player_right_id'] ?? $this->bob->id;

        $left = 0;
        $right = 0;
        foreach ($sides as $side) {
            $side === 'left' ? $left++ : $right++;
        }

        $match = PingPongMatch::create(array_merge([
            'mode' => '1v1',
            'player_left_id' => $leftId,
            'player_right_id' => $rightId,
            'first_server_id' => $leftId,
            'player_left_score' => $left,
            'player_right_score' => $right,
            'started_at' => Carbon::parse('2026-07-01 10:00:00'),
            'ended_at' => Carbon::parse('2026-07-01 10:15:00'),
            'winner_id' => $left > $right ? $leftId : $rightId,
        ], $attrs));

        $l = 0;
        $r = 0;
        foreach ($sides as $index => $side) {
            $side === 'left' ? $l++ : $r++;
            PingPongPoint::create([
                'match_id' => $match->id,
                'scoring_side' => $side,
                'point_number' => $index + 1,
                'left_score_after' => $l,
                'right_score_after' => $r,
            ]);
        }

        return $match->fresh();
    }

    private function service(): MatchupAnalysisService
    {
        return app(MatchupAnalysisService::class);
    }

    public function test_it_charts_only_completed_singles_between_the_two_players(): void
    {
        $cy = Player::create(['name' => 'Cy']);

        $this->match(['left', 'left']);
        $this->match(['left'], ['ended_at' => null]);
        $this->match(['left'], ['mode' => '2v2']);
        $this->match(['left'], ['player_right_id' => $cy->id]);

        $payload = $this->service()->forPlayers($this->ann, $this->bob);

        $this->assertCount(1, $payload['lanes']);
        $this->assertSame(1, $payload['record']['games_total']);
    }

    public function test_record_includes_legacy_matches_that_have_no_point_rows(): void
    {
        $this->match(['left', 'left']);
        $this->match([], ['player_left_score' => 11, 'player_right_score' => 6, 'winner_id' => $this->ann->id]);

        $payload = $this->service()->forPlayers($this->ann, $this->bob);

        $this->assertSame(2, $payload['record']['games_total']);
        $this->assertSame(2, $payload['record']['a_wins']);
        $this->assertSame(1, $payload['games_with_points']);
        $this->assertCount(1, $payload['lanes']);
    }

    public function test_window_keeps_the_most_recent_games_but_returns_them_oldest_first(): void
    {
        $oldest = $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-01 10:00:00')]);
        $middle = $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-02 10:00:00')]);
        $newest = $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-03 10:00:00')]);

        $payload = $this->service()->forPlayers($this->ann, $this->bob, 2);

        $this->assertSame(
            [$middle->id, $newest->id],
            array_column($payload['lanes'], 'match_id'),
            'Expected the two most recent games, ordered oldest first for display.'
        );
        $this->assertNotContains($oldest->id, array_column($payload['lanes'], 'match_id'));
        $this->assertSame(3, $payload['window']['total']);
    }

    public function test_offset_pages_back_through_older_games(): void
    {
        $oldest = $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-01 10:00:00')]);
        $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-02 10:00:00')]);
        $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-03 10:00:00')]);

        $payload = $this->service()->forPlayers($this->ann, $this->bob, 2, 2);

        $this->assertSame([$oldest->id], array_column($payload['lanes'], 'match_id'));
    }

    public function test_it_normalises_when_player_a_played_on_the_right(): void
    {
        $this->match(
            ['left', 'left', 'right'],
            ['player_left_id' => $this->bob->id, 'player_right_id' => $this->ann->id]
        );

        $payload = $this->service()->forPlayers($this->ann, $this->bob);

        $this->assertSame([-1, -2, -1], array_column($payload['lanes'][0]['dots'], 'margin'));
        $this->assertSame('Ann', $payload['player_a']['name']);
    }

    public function test_dots_link_to_clips_recorded_against_that_point(): void
    {
        $match = $this->match(['left', 'right']);
        $secondPoint = PingPongPoint::where('match_id', $match->id)->orderBy('point_number')->get()[1];

        $recording = PingPongRecording::create(['match_id' => $match->id, 'status' => 'ready']);
        $clip = PingPongClip::create([
            'recording_id' => $recording->id,
            'match_id' => $match->id,
            'ping_pong_point_id' => $secondPoint->id,
            'player_id' => $this->ann->id,
            'start_seconds' => 1.0,
            'end_seconds' => 5.2,
            'duration_seconds' => 4.2,
            'clip_path' => 'clips/test.mp4',
        ]);

        $dots = $this->service()->forPlayers($this->ann, $this->bob)['lanes'][0]['dots'];

        $this->assertNull($dots[0]['clip_id']);
        $this->assertSame($clip->id, $dots[1]['clip_id']);
    }

    public function test_it_loads_without_lazy_loading_a_relation_per_point(): void
    {
        foreach (range(1, 3) as $day) {
            $this->match(['left', 'right', 'left'], ['ended_at' => Carbon::parse("2026-07-0{$day} 10:00:00")]);
        }

        Model::preventLazyLoading();

        try {
            $payload = $this->service()->forPlayers($this->ann, $this->bob);
        } finally {
            Model::preventLazyLoading(false);
        }

        $this->assertCount(3, $payload['lanes']);
    }

    public function test_api_returns_the_matchup_payload(): void
    {
        $this->match(['left', 'left']);

        $response = $this->getJson("/games/ping-pong/api/matchup/{$this->ann->id}/{$this->bob->id}");

        $response->assertOk()
            ->assertJsonPath('player_a.name', 'Ann')
            ->assertJsonPath('player_b.name', 'Bob')
            ->assertJsonPath('record.games_total', 1)
            ->assertJsonStructure(['lanes', 'summary', 'window', 'games_with_points']);
    }

    public function test_api_rejects_a_matchup_of_a_player_against_themselves(): void
    {
        $this->getJson("/games/ping-pong/api/matchup/{$this->ann->id}/{$this->ann->id}")
            ->assertNotFound();
    }

    public function test_api_404s_for_an_unknown_player(): void
    {
        $this->getJson("/games/ping-pong/api/matchup/{$this->ann->id}/999999")
            ->assertNotFound();
    }

    public function test_api_respects_limit_and_offset_query_parameters(): void
    {
        $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-01 10:00:00')]);
        $newest = $this->match(['left'], ['ended_at' => Carbon::parse('2026-07-02 10:00:00')]);

        $this->getJson("/games/ping-pong/api/matchup/{$this->ann->id}/{$this->bob->id}?limit=1")
            ->assertOk()
            ->assertJsonPath('lanes.0.match_id', $newest->id)
            ->assertJsonCount(1, 'lanes');
    }

    public function test_matchup_page_renders(): void
    {
        $this->seed();
        $this->match(['left', 'left']);

        $this->get("/games/ping-pong/matchup/{$this->ann->id}/{$this->bob->id}")
            ->assertOk()
            ->assertSee('Ann', false);
    }

    public function test_matchup_page_404s_for_a_self_matchup(): void
    {
        $this->seed();

        $this->get("/games/ping-pong/matchup/{$this->ann->id}/{$this->ann->id}")
            ->assertNotFound();
    }
}
