<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\VideoRecordingService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Stops a finished match's recording once its tail has run out.
 *
 * Runs on the "camera" queue, which is worked inside the app container: only
 * there can the job see (and signal) the ffmpeg process holding the webcam.
 */
class StopRecordingJob implements ShouldQueue
{
    use Queueable;

    public const QUEUE = 'camera';

    public int $tries = 1;

    public function __construct(
        public int $recordingId,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(VideoRecordingService $videoRecordingService): void
    {
        $recording = PingPongRecording::with('match')->find($this->recordingId);

        // Already stopped: a new match took the camera over during the tail.
        if (! $recording || $recording->status !== 'recording' || ! $recording->match) {
            return;
        }

        $videoRecordingService->stopRecording($recording->match);
    }
}
