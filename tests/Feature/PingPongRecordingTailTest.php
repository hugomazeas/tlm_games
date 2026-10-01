<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Jobs\FinalizeRecordingJob;
use App\Jobs\StopRecordingJob;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The camera keeps filming for a few seconds after the winning point so the
 * (delayed) livestream and the saved video show the end of the final rally.
 */
class PingPongRecordingTailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        Queue::fake();
        config(['pingpong.recording_tail_seconds' => 20]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function singlesMatch(array $attributes = []): PingPongMatch
    {
        $ada = Player::create(['name' => fake()->unique()->firstName()]);
        $bo = Player::create(['name' => fake()->unique()->firstName()]);

        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'first_server_id' => $ada->id,
            'current_server_id' => $ada->id,
            'serve_count' => 0,
            'started_at' => now()->subMinutes(10),
            ...$attributes,
        ]);
    }

    /**
     * A recording row with no ffmpeg process attached, so stopping it never signals anything.
     */
    private function recordingFor(PingPongMatch $match): PingPongRecording
    {
        return PingPongRecording::create([
            'match_id' => $match->id,
            'status' => 'recording',
            'hls_path' => 'recordings/live/'.$match->id,
        ]);
    }

    public function test_winning_point_keeps_recording_and_schedules_the_stop_after_the_tail(): void
    {
        $this->freezeTime();
        $match = $this->singlesMatch(['player_left_score' => 10]);
        $recording = $this->recordingFor($match);

        $this->patchJson('/games/ping-pong/api/matches/'.$match->id, ['side' => 'left', 'action' => 'increment'])
            ->assertOk()
            ->assertJsonPath('is_complete', true);

        $this->assertSame('recording', $recording->fresh()->status);
        Queue::assertPushedOn(StopRecordingJob::QUEUE, StopRecordingJob::class, function (StopRecordingJob $job) use ($recording) {
            return $job->recordingId === $recording->id;
        });
        $job = Queue::pushed(StopRecordingJob::class)->first();
        $this->assertTrue($job->delay->equalTo(now()->addSeconds(20)));
        Queue::assertNotPushed(FinalizeRecordingJob::class);
    }

    public function test_a_point_that_does_not_win_schedules_nothing(): void
    {
        $match = $this->singlesMatch(['player_left_score' => 5]);
        $this->recordingFor($match);

        $this->patchJson('/games/ping-pong/api/matches/'.$match->id, ['side' => 'left', 'action' => 'increment'])
            ->assertOk();

        Queue::assertNotPushed(StopRecordingJob::class);
    }

    public function test_zero_tail_stops_the_recording_on_the_winning_point(): void
    {
        config(['pingpong.recording_tail_seconds' => 0]);
        $match = $this->singlesMatch(['player_left_score' => 10]);
        $recording = $this->recordingFor($match);

        $this->patchJson('/games/ping-pong/api/matches/'.$match->id, ['side' => 'left', 'action' => 'increment'])
            ->assertOk();

        $this->assertSame('finalizing', $recording->fresh()->status);
        Queue::assertNotPushed(StopRecordingJob::class);
        Queue::assertPushed(FinalizeRecordingJob::class);
    }

    public function test_stop_job_stops_the_recording_once_the_tail_is_over(): void
    {
        $match = $this->singlesMatch(['ended_at' => now()->subSeconds(20)]);
        $recording = $this->recordingFor($match);

        (new StopRecordingJob($recording->id))->handle(app(VideoRecordingService::class));

        $this->assertSame('finalizing', $recording->fresh()->status);
        Queue::assertPushed(FinalizeRecordingJob::class, 1);
    }

    public function test_stop_job_does_nothing_when_a_new_match_already_cut_the_tail(): void
    {
        $match = $this->singlesMatch(['ended_at' => now()->subSeconds(20)]);
        $recording = $this->recordingFor($match);
        $recording->update(['status' => 'finalizing']);

        (new StopRecordingJob($recording->id))->handle(app(VideoRecordingService::class));

        $this->assertSame('finalizing', $recording->fresh()->status);
        Queue::assertNotPushed(FinalizeRecordingJob::class);
    }

    public function test_stop_job_does_nothing_when_the_recording_is_gone(): void
    {
        (new StopRecordingJob(999))->handle(app(VideoRecordingService::class));

        Queue::assertNotPushed(FinalizeRecordingJob::class);
    }

    public function test_tailing_recording_still_holds_the_camera(): void
    {
        $match = $this->singlesMatch(['ended_at' => now()->subSeconds(5)]);
        $recording = $this->recordingFor($match);
        $service = app(VideoRecordingService::class);

        $active = $service->getActiveRecording();

        $this->assertTrue($active->is($recording));
        $this->assertTrue($service->isTailing($active));
        $this->assertSame('recording', $recording->fresh()->status);
    }

    public function test_recording_of_a_match_still_in_play_is_not_tailing(): void
    {
        $recording = $this->recordingFor($this->singlesMatch());

        $this->assertFalse(app(VideoRecordingService::class)->isTailing($recording));
    }

    public function test_recording_left_running_long_after_its_tail_is_stopped_as_stale(): void
    {
        $match = $this->singlesMatch(['ended_at' => now()->subMinutes(5)]);
        $recording = $this->recordingFor($match);

        $this->assertNull(app(VideoRecordingService::class)->getActiveRecording());
        $this->assertSame('finalizing', $recording->fresh()->status);
    }

    public function test_live_endpoint_does_not_offer_a_tailing_recording_to_new_viewers(): void
    {
        $match = $this->singlesMatch(['ended_at' => now()->subSeconds(5)]);
        $this->recordingFor($match);

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertOk()
            ->assertJson(['active' => false]);
    }

    public function test_live_endpoint_offers_the_recording_of_a_match_in_play(): void
    {
        $match = $this->singlesMatch();
        $this->recordingFor($match);

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertOk()
            ->assertJson(['active' => true, 'match_id' => $match->id]);
    }

    public function test_starting_a_match_during_the_tail_cuts_it_and_takes_the_camera(): void
    {
        $previous = $this->singlesMatch(['ended_at' => now()->subSeconds(5)]);
        $tail = $this->recordingFor($previous);
        $next = $this->singlesMatch();

        try {
            // ffmpeg is never launched here; reaching the spawn means the tail no longer blocks it.
            $this->serviceWithoutCamera()->startRecording($next);
            $this->fail('Expected the stubbed ffmpeg spawn to fail');
        } catch (\RuntimeException $e) {
            $this->assertSame('Failed to start FFmpeg process', $e->getMessage());
        } finally {
            $this->removeHlsDir($next);
        }

        $this->assertSame('finalizing', $tail->fresh()->status);
        Queue::assertPushed(FinalizeRecordingJob::class, 1);
        $this->assertTrue(PingPongRecording::where('match_id', $next->id)->exists());
    }

    /**
     * The real service would grab the webcam when tests run on the camera box.
     */
    private function serviceWithoutCamera(): VideoRecordingService
    {
        return new class extends VideoRecordingService
        {
            protected function spawnFfmpeg(string $segmentPattern, string $m3u8Path, bool $withAudio): int
            {
                return 0;
            }
        };
    }

    private function removeHlsDir(PingPongMatch $match): void
    {
        $hlsDir = storage_path('app/recordings/live/'.$match->id);
        if (is_dir($hlsDir)) {
            rmdir($hlsDir);
        }
    }

    public function test_starting_a_match_while_another_is_in_play_is_still_refused(): void
    {
        $this->recordingFor($this->singlesMatch());

        $this->expectExceptionMessage('Another recording is already active');

        $this->serviceWithoutCamera()->startRecording($this->singlesMatch());
    }
}
