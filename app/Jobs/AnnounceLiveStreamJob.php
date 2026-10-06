<?php

namespace App\Jobs;

use App\Games\PingPong\Events\LiveStreamReady;
use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\VideoRecordingService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

/**
 * Tells watchers a match's stream is on air once ffmpeg has written its first
 * playlist. The recording is marked live before that file exists, and a player
 * pointed at it too early just gets a 404.
 *
 * Runs on the "camera" queue: only the app container sees the HLS files.
 */
class AnnounceLiveStreamJob implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    private const CHECK_INTERVAL_MICROSECONDS = 250_000;

    public function __construct(
        public int $recordingId,
        public int $waitSeconds = 20,
    ) {
        $this->onQueue(StopRecordingJob::QUEUE);
    }

    public function handle(VideoRecordingService $videoRecordingService): void
    {
        $deadline = microtime(true) + $this->waitSeconds;

        do {
            $recording = PingPongRecording::find($this->recordingId);

            // Stopped or replaced before it ever went on air.
            if (! $recording || $recording->status !== 'recording') {
                return;
            }

            if ($videoRecordingService->isStreamReady($recording)) {
                broadcast(new LiveStreamReady($recording->match_id, $recording->hls_url));

                return;
            }

            usleep(self::CHECK_INTERVAL_MICROSECONDS);
        } while (microtime(true) < $deadline);

        Log::warning('Live stream never produced a playlist', ['recording_id' => $this->recordingId]);
    }
}
