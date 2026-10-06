<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\LiveStreamReady;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Jobs\AnnounceLiveStreamJob;
use App\Jobs\StopRecordingJob;
use App\Models\Player;
use Illuminate\Broadcasting\Channel;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\File;
use Tests\TestCase;

/**
 * Watchers already on the page learn over the websocket when a new match's
 * stream is actually playable, instead of reloading or polling for it.
 */
class PingPongLiveStreamReadyTest extends TestCase
{
    use RefreshDatabase;

    private string $storagePath;

    protected function setUp(): void
    {
        parent::setUp();

        // Keep the fake HLS files away from any real recordings on this machine.
        $this->storagePath = sys_get_temp_dir().'/games-hub-stream-test-'.uniqid();
        File::ensureDirectoryExists($this->storagePath);
        $this->app->useStoragePath($this->storagePath);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->storagePath);

        parent::tearDown();
    }

    private function liveRecording(): PingPongRecording
    {
        $ada = Player::create(['name' => fake()->unique()->firstName()]);
        $bo = Player::create(['name' => fake()->unique()->firstName()]);

        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'first_server_id' => $ada->id,
            'current_server_id' => $ada->id,
            'serve_count' => 0,
            'started_at' => now(),
        ]);

        return PingPongRecording::create([
            'match_id' => $match->id,
            'status' => 'recording',
            'hls_path' => 'recordings/live/'.$match->id,
        ]);
    }

    private function writePlaylist(PingPongRecording $recording, string $contents): void
    {
        $dir = storage_path('app/recordings/live/'.$recording->match_id);
        File::ensureDirectoryExists($dir);
        File::put($dir.'/stream.m3u8', $contents);
    }

    private function playlistWithASegment(): string
    {
        return "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.000000,\nsegment000.ts\n";
    }

    public function test_announces_the_stream_once_the_playlist_has_a_segment(): void
    {
        Event::fake([LiveStreamReady::class]);
        $recording = $this->liveRecording();
        $this->writePlaylist($recording, $this->playlistWithASegment());

        (new AnnounceLiveStreamJob($recording->id))->handle(app(VideoRecordingService::class));

        Event::assertDispatched(LiveStreamReady::class, function (LiveStreamReady $event) use ($recording) {
            return $event->matchId === $recording->match_id
                && $event->hlsUrl === '/recordings/live/'.$recording->match_id.'/stream.m3u8';
        });
    }

    public function test_gives_up_quietly_when_ffmpeg_never_writes_a_playlist(): void
    {
        Event::fake([LiveStreamReady::class]);
        $recording = $this->liveRecording();

        (new AnnounceLiveStreamJob($recording->id, waitSeconds: 0))->handle(app(VideoRecordingService::class));

        Event::assertNotDispatched(LiveStreamReady::class);
    }

    public function test_an_empty_playlist_is_not_on_air_yet(): void
    {
        Event::fake([LiveStreamReady::class]);
        $recording = $this->liveRecording();
        $this->writePlaylist($recording, "#EXTM3U\n#EXT-X-TARGETDURATION:2\n");

        (new AnnounceLiveStreamJob($recording->id, waitSeconds: 0))->handle(app(VideoRecordingService::class));

        Event::assertNotDispatched(LiveStreamReady::class);
    }

    public function test_does_not_announce_a_recording_that_already_stopped(): void
    {
        Event::fake([LiveStreamReady::class]);
        $recording = $this->liveRecording();
        $this->writePlaylist($recording, $this->playlistWithASegment());
        $recording->update(['status' => 'completed']);

        (new AnnounceLiveStreamJob($recording->id))->handle(app(VideoRecordingService::class));

        Event::assertNotDispatched(LiveStreamReady::class);
    }

    public function test_runs_on_the_camera_queue_where_the_hls_files_live(): void
    {
        $this->assertSame(StopRecordingJob::QUEUE, (new AnnounceLiveStreamJob(1))->queue);
    }

    public function test_broadcasts_stream_ready_on_the_live_channel(): void
    {
        $event = new LiveStreamReady(7, '/recordings/live/7/stream.m3u8');

        $this->assertEquals([new Channel('ping-pong.live')], $event->broadcastOn());
        $this->assertSame('stream.ready', $event->broadcastAs());
        $this->assertSame(['match_id' => 7, 'hls_url' => '/recordings/live/7/stream.m3u8'], $event->broadcastWith());
    }

    public function test_live_recording_endpoint_waits_for_the_playlist(): void
    {
        $recording = $this->liveRecording();

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertOk()
            ->assertJsonPath('active', false);

        $this->writePlaylist($recording, $this->playlistWithASegment());

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertOk()
            ->assertJsonPath('active', true)
            ->assertJsonPath('match_id', $recording->match_id)
            ->assertJsonPath('hls_url', '/recordings/live/'.$recording->match_id.'/stream.m3u8');
    }
}
