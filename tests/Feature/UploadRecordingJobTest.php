<?php

namespace Tests\Feature;

use App\Jobs\UploadRecordingJob;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class UploadRecordingJobTest extends TestCase
{
    private const MATCH_ID = 987654;

    private string $videoPath;

    protected function setUp(): void
    {
        parent::setUp();

        config(['pingpong.video_upload_url' => 'http://videos.test/api/videos']);
        $this->videoPath = storage_path('app/public/recordings/matches/'.self::MATCH_ID.'.mp4');
        File::ensureDirectoryExists(dirname($this->videoPath));
        File::put($this->videoPath, 'fake-mp4-bytes');
    }

    protected function tearDown(): void
    {
        File::delete($this->videoPath);

        parent::tearDown();
    }

    public function test_it_posts_the_video_as_multipart_named_after_the_match(): void
    {
        Http::fake(['videos.test/*' => Http::response(['ok' => true], 201)]);

        (new UploadRecordingJob(self::MATCH_ID))->handle();

        Http::assertSent(fn (Request $request) => $request->url() === 'http://videos.test/api/videos'
            && $request->isMultipart()
            && $request->hasFile('file', null, self::MATCH_ID.'.mp4'));
    }

    public function test_a_failed_upload_throws_so_the_queue_retries(): void
    {
        Http::fake(['videos.test/*' => Http::response('nope', 500)]);

        $this->expectException(\Illuminate\Http\Client\RequestException::class);

        (new UploadRecordingJob(self::MATCH_ID))->handle();
    }

    public function test_it_skips_when_the_video_is_missing_or_the_url_is_empty(): void
    {
        Http::fake();

        (new UploadRecordingJob(self::MATCH_ID + 1))->handle();
        config(['pingpong.video_upload_url' => '']);
        (new UploadRecordingJob(self::MATCH_ID))->handle();

        Http::assertNothingSent();
    }
}
