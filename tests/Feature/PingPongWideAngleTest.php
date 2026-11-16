<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Jobs\FinalizeRecordingJob;
use App\Jobs\FinalizeWideRecordingJob;
use App\Jobs\UploadRecordingJob;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

/**
 * The second camera (Anker C200, the wide angle): filmed by the same ffmpeg as the main one,
 * finalized on its own, uploaded with it, and shown next to it.
 */
class PingPongWideAngleTest extends TestCase
{
    use RefreshDatabase;

    /** A pid that is never running (above Linux's pid_max). */
    private const DEAD_PID = 99999999;

    private string $storagePath;

    protected function setUp(): void
    {
        parent::setUp();

        Queue::fake();
        $this->storagePath = sys_get_temp_dir().'/games-hub-wide-test-'.uniqid();
        File::ensureDirectoryExists($this->storagePath);
        $this->app->useStoragePath($this->storagePath);
        config(['pingpong.recording_audio_device' => 'plughw:CARD=C200,DEV=0']);
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->storagePath);

        parent::tearDown();
    }

    public function test_recording_films_both_angles_when_the_wide_camera_is_plugged_in(): void
    {
        $service = $this->fakeCameras(hasWide: true, pids: [getmypid()]);

        $recording = $service->startRecording($this->match());

        $this->assertSame([[true, true]], $service->attempts);
        $this->assertSame('recordings/live/'.$recording->match_id.'/wide', $recording->wide_hls_path);
        $this->assertSame('/recordings/live/'.$recording->match_id.'/wide/stream.m3u8', $recording->wide_hls_url);
        $this->assertDirectoryExists(storage_path('app/recordings/live/'.$recording->match_id.'/wide'));
    }

    public function test_a_failing_wide_camera_falls_back_to_the_main_one_alone(): void
    {
        // Both, both without the mic: dead. The main camera with the mic: films.
        $service = $this->fakeCameras(hasWide: true, pids: [self::DEAD_PID, self::DEAD_PID, getmypid()]);

        $recording = $service->startRecording($this->match());

        $this->assertSame([[true, true], [true, false], [false, true]], $service->attempts);
        $this->assertSame('recording', $recording->status);
        $this->assertNull($recording->wide_hls_path);
        $this->assertNull($recording->wide_hls_url);
    }

    public function test_without_the_wide_camera_it_records_as_before(): void
    {
        $service = $this->fakeCameras(hasWide: false, pids: [self::DEAD_PID, getmypid()]);

        $recording = $service->startRecording($this->match());

        $this->assertSame([[false, true], [false, false]], $service->attempts);
        $this->assertNull($recording->wide_hls_path);
        $this->assertDirectoryDoesNotExist(storage_path('app/recordings/live/'.$recording->match_id.'/wide'));
    }

    public function test_the_stream_is_on_air_once_both_angles_have_a_segment(): void
    {
        $recording = $this->recording(['status' => 'recording', 'wide_hls_path' => 'wide']);
        $recording->match->update(['ended_at' => null]);
        $dir = storage_path('app/recordings/live/'.$recording->match_id);
        File::ensureDirectoryExists($dir.'/wide');
        File::put($dir.'/stream.m3u8', $this->playlistWithASegment());

        $this->getJson('/games/ping-pong/api/recordings/live')->assertJsonPath('active', false);

        File::put($dir.'/wide/stream.m3u8', $this->playlistWithASegment());

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertJsonPath('active', true)
            ->assertJsonPath('hls_url', '/recordings/live/'.$recording->match_id.'/stream.m3u8')
            ->assertJsonPath('wide_hls_url', '/recordings/live/'.$recording->match_id.'/wide/stream.m3u8');
    }

    public function test_the_match_carries_both_videos_and_their_offset(): void
    {
        $recording = $this->recording([
            'status' => 'completed',
            'video_path' => 'recordings/matches/1.mp4',
            'wide_video_path' => 'recordings/matches/1_wide.mp4',
            'wide_offset_ms' => 120,
        ]);

        $this->getJson('/games/ping-pong/api/matches/'.$recording->match_id)
            ->assertOk()
            ->assertJsonPath('recording.video_url', '/storage/recordings/matches/1.mp4')
            ->assertJsonPath('recording.wide_video_url', '/storage/recordings/matches/1_wide.mp4')
            ->assertJsonPath('recording.wide_offset_ms', 120);
    }

    public function test_finalizing_hands_the_wide_angle_to_its_own_job_with_the_offset(): void
    {
        $this->requireFfmpeg();
        $recording = $this->recording(['status' => 'finalizing', 'wide_hls_path' => 'wide']);
        $dir = storage_path('app/recordings/live/'.$recording->match_id);
        $this->makeHls($dir, 0);
        $this->makeHls($dir.'/wide', 0.5);

        (new FinalizeRecordingJob($recording->id, $recording->match_id))->handle();

        $recording->refresh();
        $this->assertSame('completed', $recording->status);
        $this->assertEqualsWithDelta(500, $recording->wide_offset_ms, 40);
        // On its own queue: a 2K encode mustn't hold up the default one
        Queue::assertPushedOn(FinalizeWideRecordingJob::QUEUE, FinalizeWideRecordingJob::class);
        // The upload waits for the wide angle, whose HLS stays for its job
        Queue::assertNotPushed(UploadRecordingJob::class);
        $this->assertFileExists($dir.'/wide/stream.m3u8');
        $this->assertFileDoesNotExist($dir.'/stream.m3u8');
    }

    public function test_the_wide_cameras_measured_latency_comes_off_the_offset(): void
    {
        $this->requireFfmpeg();
        config(['pingpong.wide_camera.latency_ms' => 120]);
        $recording = $this->recording(['status' => 'finalizing', 'wide_hls_path' => 'wide']);
        $dir = storage_path('app/recordings/live/'.$recording->match_id);
        $this->makeHls($dir, 0);
        $this->makeHls($dir.'/wide', 0.5);

        (new FinalizeRecordingJob($recording->id, $recording->match_id))->handle();

        $this->assertEqualsWithDelta(380, $recording->fresh()->wide_offset_ms, 40);
    }

    public function test_the_wide_angle_is_kept_at_its_size_then_both_are_uploaded(): void
    {
        $this->requireFfmpeg();
        $recording = $this->recording(['status' => 'completed', 'wide_hls_path' => 'wide']);
        $dir = storage_path('app/recordings/live/'.$recording->match_id);
        $this->makeHls($dir.'/wide', 0);
        File::ensureDirectoryExists(storage_path('app/public/recordings/matches'));

        (new FinalizeWideRecordingJob($recording->id, $recording->match_id))->handle();

        $recording->refresh();
        $this->assertSame('recordings/matches/'.$recording->match_id.'_wide.mp4', $recording->wide_video_path);
        $this->assertNull($recording->wide_hls_path);
        $this->assertGreaterThan(0, $recording->wide_file_size);
        $this->assertSame('640,360', trim((string) shell_exec(
            'ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 '
            .escapeshellarg(storage_path('app/public/'.$recording->wide_video_path))
        )));
        $this->assertDirectoryDoesNotExist($dir);
        Queue::assertPushed(UploadRecordingJob::class);
    }

    public function test_a_failed_wide_angle_still_uploads_the_main_video(): void
    {
        $recording = $this->recording(['status' => 'completed', 'video_path' => 'recordings/matches/1.mp4', 'wide_hls_path' => 'wide']);
        File::ensureDirectoryExists(storage_path('app/recordings/live/'.$recording->match_id.'/wide'));
        // Left half-written by an earlier attempt
        $partial = storage_path('app/public/recordings/matches/'.$recording->match_id.'_wide.mp4');
        File::ensureDirectoryExists(dirname($partial));
        File::put($partial, 'half');

        (new FinalizeWideRecordingJob($recording->id, $recording->match_id))->handle();

        $recording->refresh();
        $this->assertSame('completed', $recording->status);
        $this->assertNull($recording->wide_hls_path);
        $this->assertNull($recording->wide_video_path);
        $this->assertFileDoesNotExist($partial);
        $this->assertDirectoryDoesNotExist(storage_path('app/recordings/live/'.$recording->match_id));
        Queue::assertPushed(UploadRecordingJob::class);
    }

    public function test_the_upload_carries_the_wide_angle_in_the_same_request(): void
    {
        $recording = $this->recording(['status' => 'completed', 'video_path' => 'x']);
        $id = $recording->match_id;
        $recording->update(['wide_video_path' => 'recordings/matches/'.$id.'_wide.mp4']);
        $this->videoFiles($id);

        (new UploadRecordingJob($id))->handle();

        Http::assertSentCount(1);
        Http::assertSent(fn (Request $request) => $request->hasFile('file', null, $id.'.mp4')
            && $request->hasFile('file_wide', null, $id.'_wide.mp4'));
    }

    public function test_a_wide_file_that_never_finished_finalizing_is_not_uploaded(): void
    {
        $id = $this->recording(['status' => 'completed', 'video_path' => 'x'])->match_id;
        $this->videoFiles($id);

        (new UploadRecordingJob($id))->handle();

        Http::assertSent(fn (Request $request) => $request->hasFile('file', null, $id.'.mp4')
            && ! $request->hasFile('file_wide'));
    }

    /**
     * Both angles' files on disk, and a fake archive to upload them to.
     */
    private function videoFiles(int $matchId): void
    {
        config(['pingpong.video_upload_url' => 'http://videos.test/api/videos']);
        $dir = storage_path('app/public/recordings/matches');
        File::ensureDirectoryExists($dir);
        File::put($dir.'/'.$matchId.'.mp4', 'main');
        File::put($dir.'/'.$matchId.'_wide.mp4', 'wide');
        Http::fake(['videos.test/*' => Http::response(['name' => $matchId.'.mp4'])]);
    }

    public function test_cleanup_deletes_both_angles_of_an_old_recording(): void
    {
        $recording = $this->recording([
            'status' => 'completed',
            'video_path' => 'recordings/matches/1.mp4',
            'wide_video_path' => 'recordings/matches/1_wide.mp4',
        ]);
        $recording->forceFill(['created_at' => now()->subDays(40)])->save();
        $dir = storage_path('app/public/recordings/matches');
        File::ensureDirectoryExists($dir);
        File::put($dir.'/1.mp4', 'main');
        File::put($dir.'/1_wide.mp4', 'wide');

        $this->artisan('recordings:cleanup')->assertSuccessful();

        $this->assertFileDoesNotExist($dir.'/1.mp4');
        $this->assertFileDoesNotExist($dir.'/1_wide.mp4');
    }

    public function test_the_live_pages_and_the_match_page_offer_the_camera_picker(): void
    {
        $recording = $this->recording(['status' => 'completed', 'video_path' => 'recordings/matches/1.mp4']);

        foreach (['/games/ping-pong/watch', '/games/ping-pong/embed-live', '/games/ping-pong/matches/'.$recording->match_id] as $page) {
            $html = $this->get($page)->assertOk()->getContent();

            $this->assertStringContainsString('data-angle-picker', $html, $page);
            $this->assertStringContainsString('data-wide-player', $html, $page);
            $this->assertStringContainsString('function pingPongStoredAngle()', $html, $page);
        }
    }

    /**
     * A recording service whose cameras are fakes: each ffmpeg start returns the next pid
     * (a running or a dead one) and is logged as [wide camera, mic].
     *
     * @param  list<int>  $pids
     */
    private function fakeCameras(bool $hasWide, array $pids): VideoRecordingService
    {
        return new class($hasWide, $pids) extends VideoRecordingService
        {
            /** @var list<array{0: bool, 1: bool}> */
            public array $attempts = [];

            /**
             * @param  list<int>  $pids
             */
            public function __construct(private bool $hasWide, private array $pids)
            {
                parent::__construct();
            }

            protected function hasWideCamera(): bool
            {
                return $this->hasWide;
            }

            protected function spawnFfmpeg(string $segmentPattern, string $m3u8Path, bool $withAudio, bool $withWide = false): int
            {
                $this->attempts[] = [$withWide, $withAudio];

                return array_shift($this->pids) ?? 0;
            }
        };
    }

    private function match(): PingPongMatch
    {
        $ada = Player::create(['name' => fake()->unique()->firstName()]);
        $bo = Player::create(['name' => fake()->unique()->firstName()]);

        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $ada->id,
            'player_right_id' => $bo->id,
            'player_left_score' => 11,
            'player_right_score' => 4,
            'first_server_id' => $ada->id,
            'current_server_id' => $ada->id,
            'serve_count' => 0,
            'started_at' => now()->subMinutes(10),
        ]);
    }

    /**
     * @param  array<string, mixed>  $attributes
     */
    private function recording(array $attributes): PingPongRecording
    {
        $match = $this->match();
        $match->update(['ended_at' => now()]);

        $attributes['wide_hls_path'] = isset($attributes['wide_hls_path']) ? 'recordings/live/'.$match->id.'/wide' : null;

        return PingPongRecording::create([
            'match_id' => $match->id,
            'hls_path' => 'recordings/live/'.$match->id,
            ...$attributes,
        ]);
    }

    private function playlistWithASegment(): string
    {
        return "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXTINF:2.000000,\nsegment000.ts\n";
    }

    private function requireFfmpeg(): void
    {
        if (trim((string) shell_exec('command -v ffmpeg')) === '') {
            $this->markTestSkipped('ffmpeg is not installed');
        }
    }

    /**
     * Two seconds of HLS as the recorder writes it, starting `$startSeconds` late on the shared clock.
     */
    private function makeHls(string $dir, float $startSeconds): void
    {
        File::ensureDirectoryExists($dir);
        exec(sprintf(
            'ffmpeg -y -v error -f lavfi -i testsrc=size=640x360:rate=30 -t 2 -c:v libx264 -preset ultrafast -g 30 '
            .'-output_ts_offset %s -f hls -hls_time 1 -hls_list_size 0 -hls_segment_filename %s %s 2>&1',
            $startSeconds,
            escapeshellarg($dir.'/segment%03d.ts'),
            escapeshellarg($dir.'/stream.m3u8')
        ), $output, $code);

        $this->assertSame(0, $code, implode("\n", $output));
    }
}
