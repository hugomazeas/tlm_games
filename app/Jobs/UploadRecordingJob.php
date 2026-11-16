<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongRecording;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Http;

/**
 * Sends a finished match video to the external video archive as `{matchId}.mp4`,
 * and keeps the name of the stats run the archive starts for it. When the match
 * was also filmed from the wide camera, that angle rides along in the same request
 * as `file_wide` (`{matchId}_wide.mp4`): two angles of one match.
 */
class UploadRecordingJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 900;

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

        // Only a wide angle that finished finalizing: a file without the row could be half-written
        $wideVideoPath = PingPongRecording::where('match_id', $this->matchId)->value('wide_video_path');
        $widePath = $wideVideoPath ? storage_path('app/public/'.$wideVideoPath) : null;
        $file = fopen($path, 'r');
        $wideFile = $widePath && file_exists($widePath) ? fopen($widePath, 'r') : null;

        try {
            $request = Http::timeout(600)
                ->attach('file', $file, $this->matchId.'.mp4', ['Content-Type' => 'video/mp4']);

            if ($wideFile) {
                $request->attach('file_wide', $wideFile, $this->matchId.'_wide.mp4', ['Content-Type' => 'video/mp4']);
            }

            $response = $request->post($url)->throw();
        } finally {
            foreach ([$file, $wideFile] as $handle) {
                if (is_resource($handle)) {
                    fclose($handle);
                }
            }
        }

        // The archive starts a stats run on upload and names it; null when it has no model to run.
        PingPongRecording::where('match_id', $this->matchId)->update(['stats_run' => $response->json('run')]);
    }
}
