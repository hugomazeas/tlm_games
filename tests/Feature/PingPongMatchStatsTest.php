<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * The match page polls this while the video archive works out the ball stats
 * from the match video, then shows them.
 */
class PingPongMatchStatsTest extends TestCase
{
    use RefreshDatabase;

    private const DEBUG_URL = 'http://videos.test/api/debug/v6_1999';

    private const RUNS_URL = 'http://videos.test/api/runs/*';

    protected function setUp(): void
    {
        parent::setUp();

        config(['pingpong.video_upload_url' => 'http://videos.test/api/videos']);
    }

    /**
     * @param  array<string, mixed>  $recording
     */
    private function finishedMatch(?array $recording = ['status' => 'completed', 'stats_run' => 'v6_1999'], ?string $endedAt = 'now'): PingPongMatch
    {
        $ada = Player::create(['name' => fake()->unique()->firstName()]);
        $bo = Player::create(['name' => fake()->unique()->firstName()]);

        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'player_left_score' => 11,
            'player_right_score' => 4,
            'first_server_id' => $ada->id,
            'current_server_id' => $ada->id,
            'serve_count' => 0,
            'started_at' => now()->subMinutes(10),
            'ended_at' => $endedAt ? now()->modify($endedAt) : null,
        ]);

        if ($recording) {
            PingPongRecording::create(['match_id' => $match->id, ...$recording]);
        }

        return $match;
    }

    public function test_a_running_job_reports_its_progress(): void
    {
        Http::fake([self::DEBUG_URL => Http::response(['state' => 'running', 'stage' => 'detect', 'done' => 420, 'total' => 1800])]);

        $this->getJson('/games/ping-pong/api/matches/'.$this->finishedMatch()->id.'/stats')
            ->assertOk()
            ->assertExactJson(['state' => 'running', 'stage' => 'detect', 'done' => 420, 'total' => 1800]);

        Http::assertSentCount(1);
    }

    public function test_a_done_job_comes_with_the_latest_runs_stats_but_not_its_log(): void
    {
        $match = $this->finishedMatch();
        $stats = [['Bounce pairs measured', 3], ['Average speed (km/h)', 30.0], ['Left player average speed (km/h)', '35.0 (2 shots)']];
        Http::fake([
            self::DEBUG_URL => Http::response(['state' => 'done', 'stage' => 'encode', 'done' => 0, 'total' => 0, 'log' => '/srv/secret/path']),
            self::RUNS_URL => Http::response(['name' => 'v7_1999', 'modes' => [], 'files' => [], 'stats' => $stats, 'bounces' => [], 'table_m' => [2.8, 1.3]]),
        ]);

        $this->getJson('/games/ping-pong/api/matches/'.$match->id.'/stats')
            ->assertOk()
            ->assertExactJson(['state' => 'done', 'stage' => 'encode', 'done' => 0, 'total' => 0, 'stats' => $stats]);

        // By match id, not by run name: the archive answers with its newest run for that video
        Http::assertSent(fn (Request $request) => $request->url() === 'http://videos.test/api/runs/'.$match->id);
    }

    public function test_a_failed_job_hides_its_error_output(): void
    {
        Http::fake([self::DEBUG_URL => Http::response(['state' => 'error', 'stage' => 'detect', 'done' => 3, 'total' => 1800, 'error' => 'Traceback ...'])]);

        $this->getJson('/games/ping-pong/api/matches/'.$this->finishedMatch()->id.'/stats')
            ->assertOk()
            ->assertExactJson(['state' => 'error', 'stage' => 'detect', 'done' => 3, 'total' => 1800]);
    }

    public function test_a_freshly_finished_match_without_a_run_yet_is_still_uploading(): void
    {
        Http::fake();

        $this->getJson('/games/ping-pong/api/matches/'.$this->finishedMatch(['status' => 'completed'])->id.'/stats')
            ->assertOk()
            ->assertExactJson(['state' => 'pending']);

        Http::assertNothingSent();
    }

    public function test_there_are_no_stats_for_an_old_failed_unrecorded_or_unfinished_match(): void
    {
        Http::fake();

        foreach ([
            $this->finishedMatch(['status' => 'completed'], '-1 hour'),
            $this->finishedMatch(['status' => 'failed']),
            $this->finishedMatch(null),
            $this->finishedMatch(['status' => 'recording'], null),
        ] as $match) {
            $this->getJson('/games/ping-pong/api/matches/'.$match->id.'/stats')
                ->assertOk()
                ->assertExactJson(['state' => 'none']);
        }

        Http::assertNothingSent();
    }

    public function test_an_unreachable_archive_is_reported_as_unavailable(): void
    {
        Http::fake([self::DEBUG_URL => fn () => throw new ConnectionException('down')]);

        $this->getJson('/games/ping-pong/api/matches/'.$this->finishedMatch()->id.'/stats')
            ->assertOk()
            ->assertExactJson(['state' => 'unavailable']);
    }

    public function test_a_job_the_archive_lost_is_reported_as_unavailable(): void
    {
        Http::fake([self::DEBUG_URL => Http::response(['detail' => 'no such job'], 404)]);

        $this->getJson('/games/ping-pong/api/matches/'.$this->finishedMatch()->id.'/stats')
            ->assertOk()
            ->assertExactJson(['state' => 'unavailable']);
    }
}
