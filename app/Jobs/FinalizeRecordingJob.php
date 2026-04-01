<?php

namespace App\Jobs;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
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
        $match = PingPongMatch::find($this->matchId);

        if (!$recording || !$match) {
            Log::error('FinalizeRecordingJob: recording or match not found', [
                'recording_id' => $this->recordingId,
                'match_id' => $this->matchId,
            ]);
            return;
        }

        $hlsBasePath = storage_path('app/recordings/live');
        $videoBasePath = storage_path('app/public/recordings/matches');

        $hlsDir = $hlsBasePath . '/' . $match->id;
        $m3u8Path = $hlsDir . '/stream.m3u8';
        $rawPath = $videoBasePath . '/' . $match->id . '_raw.mp4';
        $mp4Path = $videoBasePath . '/' . $match->id . '.mp4';

        try {
            if (!file_exists($m3u8Path)) {
                throw new \RuntimeException('HLS manifest not found: ' . $m3u8Path);
            }

            if (!is_dir($videoBasePath)) {
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
                throw new \RuntimeException('FFmpeg remux failed: ' . implode("\n", $output));
            }

            // Step 2: Re-encode with compression (CRF 28, medium preset, 720p)
            $cmd = sprintf(
                'ffmpeg -y -i %s -c:v libx264 -preset medium -crf 28 -vf scale=-2:720 -an %s 2>&1',
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
                throw new \RuntimeException('FFmpeg compression failed: ' . implode("\n", $output));
            }

            $fileSize = file_exists($mp4Path) ? filesize($mp4Path) : null;
            $durationSeconds = $match->ended_at && $match->started_at
                ? $match->started_at->diffInSeconds($match->ended_at)
                : null;

            $recording->update([
                'status' => 'completed',
                'video_path' => 'recordings/matches/' . $match->id . '.mp4',
                'file_size' => $fileSize,
                'duration_seconds' => $durationSeconds,
            ]);

            Log::info('Recording finalized', [
                'match_id' => $match->id,
                'file_size' => $fileSize,
                'duration' => $durationSeconds,
            ]);
        } catch (\Throwable $e) {
            $recording->update([
                'status' => 'failed',
                'error_message' => 'Finalization failed: ' . $e->getMessage(),
            ]);
            Log::error('Recording finalization failed', [
                'match_id' => $match->id,
                'error' => $e->getMessage(),
            ]);
        }

        // Clean up HLS directory
        $this->cleanupHlsDir($hlsDir);
    }

    private function cleanupHlsDir(string $hlsDir): void
    {
        if (!is_dir($hlsDir)) {
            return;
        }

        $files = glob($hlsDir . '/*');
        foreach ($files as $file) {
            is_dir($file) ? $this->cleanupHlsDir($file) : unlink($file);
        }
        rmdir($hlsDir);
    }
}
