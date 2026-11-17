<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\ClipExtractionService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class FinalizeRecordingJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 600;

    public int $tries = 1;

    public function __construct(
        private int $recordingId,
        private int $matchId,
    ) {}

    public function handle(): void
    {
        $recording = PingPongRecording::find($this->recordingId);
        $match = PingPongMatch::includingTournaments()->find($this->matchId);

        if (! $recording || ! $match) {
            Log::error('FinalizeRecordingJob: recording or match not found', [
                'recording_id' => $this->recordingId,
                'match_id' => $this->matchId,
            ]);

            return;
        }

        $hlsBasePath = storage_path('app/recordings/live');
        $videoBasePath = storage_path('app/public/recordings/matches');

        $hlsDir = $hlsBasePath.'/'.$match->id;
        $m3u8Path = $hlsDir.'/stream.m3u8';
        $rawPath = $videoBasePath.'/'.$match->id.'_raw.mp4';
        $mp4Path = $videoBasePath.'/'.$match->id.'.mp4';
        $wideM3u8Path = $hlsDir.'/wide/stream.m3u8';
        $widePending = false;

        try {
            if (! file_exists($m3u8Path)) {
                throw new \RuntimeException('HLS manifest not found: '.$m3u8Path);
            }

            if (! is_dir($videoBasePath)) {
                mkdir($videoBasePath, 0775, true);
            }

            // Step 1: Remux HLS segments into a single raw MP4
            $cmd = sprintf(
                'ffmpeg -y -i %s -c copy %s 2>&1',
                escapeshellarg($m3u8Path),
                escapeshellarg($rawPath)
            );

            $output = [];
            $returnCode = 0;
            exec($cmd, $output, $returnCode);

            if ($returnCode !== 0) {
                throw new \RuntimeException('FFmpeg remux failed: '.implode("\n", $output));
            }

            // Step 2: Re-encode with compression (CRF 28, medium preset, 720p)
            $cmd = sprintf(
                'ffmpeg -y -i %s -c:v libx264 -preset medium -crf 28 -vf scale=-2:720 -c:a aac -b:a 96k %s 2>&1',
                escapeshellarg($rawPath),
                escapeshellarg($mp4Path)
            );

            $output = [];
            $returnCode = 0;
            exec($cmd, $output, $returnCode);

            // Clean up raw file
            if (file_exists($rawPath)) {
                unlink($rawPath);
            }

            if ($returnCode !== 0) {
                throw new \RuntimeException('FFmpeg compression failed: '.implode("\n", $output));
            }

            $fileSize = file_exists($mp4Path) ? filesize($mp4Path) : null;
            $durationSeconds = $match->ended_at && $match->started_at
                ? $match->started_at->diffInSeconds($match->ended_at)
                : null;

            $recording->update([
                'status' => 'completed',
                'video_path' => 'recordings/matches/'.$match->id.'.mp4',
                'file_size' => $fileSize,
                'duration_seconds' => $durationSeconds,
            ]);

            Log::info('Recording finalized', [
                'match_id' => $match->id,
                'file_size' => $fileSize,
                'duration' => $durationSeconds,
            ]);

            // The wide angle is finalized on its own (a 2K encode takes longer); it uploads both when done.
            $widePending = $recording->wide_hls_path !== null && file_exists($wideM3u8Path);
            if ($widePending) {
                $recording->update(['wide_offset_ms' => $this->startOffsetMs($m3u8Path, $wideM3u8Path)]);
                FinalizeWideRecordingJob::dispatch($recording->id, $match->id);
            } else {
                $recording->update(['wide_hls_path' => null]);
                UploadRecordingJob::dispatch($match->id);
            }

            try {
                $clipService = app(ClipExtractionService::class);
                $clips = $clipService->extractFlaggedClips($recording->fresh());
                if (! empty($clips)) {
                    Log::info('Per-point clips extracted', [
                        'match_id' => $match->id,
                        'count' => count($clips),
                    ]);
                }
            } catch (\Throwable $e) {
                Log::warning('Per-point clip extraction batch failed', [
                    'match_id' => $match->id,
                    'error' => $e->getMessage(),
                ]);
            }
        } catch (\Throwable $e) {
            $recording->update([
                'status' => 'failed',
                'error_message' => 'Finalization failed: '.$e->getMessage(),
                'wide_hls_path' => null,
            ]);
            Log::error('Recording finalization failed', [
                'match_id' => $match->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Clean up HLS directory (the wide job removes it once it's done with `wide/`)
        if ($widePending) {
            $this->cleanupMainHlsFiles($hlsDir);
        } else {
            $this->cleanupHlsDir($hlsDir);
        }
    }

    /**
     * How much later the wide video's 0:00 is than the main one's, in ms (wide time = main time
     * - offset). Both come from one ffmpeg on one clock, so their timestamps compare. Each mp4
     * starts at its playlist's earliest packet, the shared mic's or its camera's, hence the
     * playlists' overall start. Less the wide camera's own extra latency, measured with a clap
     * (`pingpong.wide_camera.latency_ms`). Null if unreadable.
     */
    private function startOffsetMs(string $mainPlaylist, string $widePlaylist): ?int
    {
        $mainStart = $this->startSeconds($mainPlaylist);
        $wideStart = $this->startSeconds($widePlaylist);

        if ($mainStart === null || $wideStart === null) {
            return null;
        }

        return (int) round(($wideStart - $mainStart) * 1000) - (int) config('pingpong.wide_camera.latency_ms');
    }

    private function startSeconds(string $playlist): ?float
    {
        $output = trim((string) shell_exec(sprintf(
            'ffprobe -v error -show_entries format=start_time -of csv=p=0 %s 2>/dev/null',
            escapeshellarg($playlist)
        )));

        return is_numeric($output) ? (float) $output : null;
    }

    private function cleanupMainHlsFiles(string $hlsDir): void
    {
        foreach (glob($hlsDir.'/*') as $file) {
            if (is_file($file)) {
                unlink($file);
            }
        }
    }

    private function cleanupHlsDir(string $hlsDir): void
    {
        if (! is_dir($hlsDir)) {
            return;
        }

        $files = glob($hlsDir.'/*');
        foreach ($files as $file) {
            is_dir($file) ? $this->cleanupHlsDir($file) : unlink($file);
        }
        rmdir($hlsDir);
    }
}
