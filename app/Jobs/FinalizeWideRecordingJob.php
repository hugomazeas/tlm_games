<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongRecording;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Turns the wide angle's HLS into `{matchId}_wide.mp4` once the main video is done, at its own
 * size (no 720p scale: the 2K is for the ML and the match page), then uploads both angles. A
 * failure only costs the wide angle: the main video stays and is uploaded alone.
 *
 * It has its own queue (and worker, in supervisord.conf): a 2K encode can take long enough to
 * hold up everything else on the default one, match notifications included.
 */
class FinalizeWideRecordingJob implements ShouldQueue
{
    use Queueable;

    public const QUEUE = 'video';

    public int $timeout = 1800;

    public int $tries = 1;

    public function __construct(
        private int $recordingId,
        private int $matchId,
    ) {
        $this->onQueue(self::QUEUE);
    }

    public function handle(): void
    {
        $recording = PingPongRecording::find($this->recordingId);

        if (! $recording) {
            $this->cleanupHlsDir();

            return;
        }

        $wideDir = $this->hlsDir().'/wide';
        [$rawPath, $mp4Path] = $this->videoPaths();

        try {
            $this->ffmpeg(sprintf('ffmpeg -y -i %s -c copy %s 2>&1', escapeshellarg($wideDir.'/stream.m3u8'), escapeshellarg($rawPath)), 'remux');

            try {
                $this->ffmpeg(sprintf(
                    'ffmpeg -y -i %s -c:v libx264 -preset veryfast -crf 28 -c:a aac -b:a 96k %s 2>&1',
                    escapeshellarg($rawPath),
                    escapeshellarg($mp4Path)
                ), 'compression');
            } finally {
                if (file_exists($rawPath)) {
                    unlink($rawPath);
                }
            }

            $recording->update([
                'wide_video_path' => 'recordings/matches/'.$this->matchId.'_wide.mp4',
                'wide_file_size' => filesize($mp4Path) ?: null,
                'wide_hls_path' => null,
            ]);

            Log::info('Wide angle finalized', ['match_id' => $this->matchId, 'file_size' => $recording->wide_file_size]);
        } catch (Throwable $e) {
            $this->giveUp($e);

            return;
        }

        $this->cleanupHlsDir();
        UploadRecordingJob::dispatch($this->matchId);
    }

    /**
     * Also called when the queue kills the job for running past its timeout.
     */
    public function failed(?Throwable $e): void
    {
        $this->giveUp($e);
    }

    private function giveUp(?Throwable $e): void
    {
        PingPongRecording::whereKey($this->recordingId)->update(['wide_hls_path' => null]);

        // A half-written file must not be uploaded or served
        foreach ($this->videoPaths() as $path) {
            if (file_exists($path)) {
                unlink($path);
            }
        }

        Log::error('Wide angle finalization failed', ['match_id' => $this->matchId, 'error' => $e?->getMessage()]);

        $this->cleanupHlsDir();
        UploadRecordingJob::dispatch($this->matchId);
    }

    private function ffmpeg(string $command, string $step): void
    {
        $output = [];
        $returnCode = 0;
        exec($command, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException('FFmpeg '.$step.' failed: '.implode("\n", array_slice($output, -20)));
        }
    }

    /**
     * @return array{0: string, 1: string} the remuxed file, then the finished one
     */
    private function videoPaths(): array
    {
        $base = storage_path('app/public/recordings/matches/'.$this->matchId);

        return [$base.'_wide_raw.mp4', $base.'_wide.mp4'];
    }

    private function hlsDir(): string
    {
        return storage_path('app/recordings/live/'.$this->matchId);
    }

    private function cleanupHlsDir(?string $dir = null): void
    {
        $dir ??= $this->hlsDir();

        if (! is_dir($dir)) {
            return;
        }

        foreach (glob($dir.'/*') as $file) {
            is_dir($file) ? $this->cleanupHlsDir($file) : unlink($file);
        }
        rmdir($dir);
    }
}
