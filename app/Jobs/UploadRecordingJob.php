<?php

namespace App\Jobs;

use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;

/**
 * Sends a finished match video to the external video archive as `{matchId}.mp4`.
 */
class UploadRecordingJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 300;

    public int $tries = 3;

    public int $backoff = 60;

    public function __construct(private int $matchId) {}

    public function handle(): void
    {
        $url = config('pingpong.video_upload_url');
        $path = storage_path('app/public/recordings/matches/'.$this->matchId.'.mp4');

        if (! $url || ! file_exists($path)) {
            return;
        }

        $file = fopen($path, 'r');

        try {
            Http::timeout(240)
                ->attach('file', $file, $this->matchId.'.mp4', ['Content-Type' => 'video/mp4'])
                ->post($url)
                ->throw();
        } finally {
            if (is_resource($file)) {
                fclose($file);
            }
        }
    }
}
