<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use Illuminate\Support\Facades\Log;

class VideoRecordingService
{
    private string $hlsBasePath;
    private string $videoBasePath;
    private string $videoDevice;

    public function __construct()
    {
        $this->hlsBasePath = storage_path('app/recordings/live');
        $this->videoBasePath = storage_path('app/public/recordings/matches');
        $this->videoDevice = '/dev/video0';
    }

    public function startRecording(PingPongMatch $match): PingPongRecording
    {
        $active = $this->getActiveRecording();
        if ($active) {
            throw new \RuntimeException('Another recording is already active (match #' . $active->match_id . ')');
        }

        $hlsDir = $this->hlsBasePath . '/' . $match->id;
        if (!is_dir($hlsDir)) {
            mkdir($hlsDir, 0775, true);
        }

        // Remove any previous recording for this match (e.g. completed/failed)
        PingPongRecording::where('match_id', $match->id)->delete();

        $recording = PingPongRecording::create([
            'match_id' => $match->id,
            'status' => 'pending',
            'hls_path' => 'recordings/live/' . $match->id,
        ]);

        $segmentPattern = $hlsDir . '/segment%03d.ts';
        $m3u8Path = $hlsDir . '/stream.m3u8';

        $cmd = sprintf(
            'nohup ffmpeg -f v4l2 -video_size 1280x720 -framerate 30 -input_format mjpeg '
            . '-i %s -c:v libx264 -preset ultrafast -tune zerolatency -g 60 '
            . '-f hls -hls_time 2 -hls_list_size 10 -hls_flags delete_segments+append_list '
            . '-hls_segment_filename %s %s '
            . '> /dev/null 2>&1 & echo $!',
            escapeshellarg($this->videoDevice),
            escapeshellarg($segmentPattern),
            escapeshellarg($m3u8Path)
        );

        $pid = (int) trim(shell_exec($cmd));

        if ($pid <= 0) {
            $recording->update(['status' => 'failed', 'error_message' => 'Failed to start FFmpeg process']);
            throw new \RuntimeException('Failed to start FFmpeg process');
        }

        // Brief pause to verify process started
        usleep(500000);

        if (!$this->isProcessRunning($pid)) {
            $recording->update(['status' => 'failed', 'error_message' => 'FFmpeg process exited immediately']);
            throw new \RuntimeException('FFmpeg process exited immediately (PID: ' . $pid . ')');
        }

        $recording->update([
            'status' => 'recording',
            'ffmpeg_pid' => $pid,
        ]);

        Log::info('Recording started', ['match_id' => $match->id, 'pid' => $pid]);

        return $recording;
    }

    public function stopRecording(PingPongMatch $match): ?PingPongRecording
    {
        $recording = $match->recording;

        if (!$recording || $recording->status !== 'recording') {
            return $recording;
        }

        // Stop FFmpeg with SIGINT for clean shutdown
        if ($recording->ffmpeg_pid && $this->isProcessRunning($recording->ffmpeg_pid)) {
            posix_kill($recording->ffmpeg_pid, SIGINT);

            // Wait for FFmpeg to exit (max 10 seconds)
            $waited = 0;
            while ($this->isProcessRunning($recording->ffmpeg_pid) && $waited < 20) {
                usleep(500000);
                $waited++;
            }

            // Force kill if still running
            if ($this->isProcessRunning($recording->ffmpeg_pid)) {
                posix_kill($recording->ffmpeg_pid, SIGKILL);
                usleep(500000);
            }
        }

        $recording->update(['status' => 'finalizing', 'ffmpeg_pid' => null]);

        // Concatenate HLS segments into MP4
        try {
            $this->finalizeRecording($recording, $match);
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
        $this->cleanupHlsDir($match->id);

        return $recording->fresh();
    }

    public function getActiveRecording(): ?PingPongRecording
    {
        return PingPongRecording::where('status', 'recording')->first();
    }

    public function cleanupOrphans(): array
    {
        $cleaned = ['salvaged' => 0, 'failed' => 0, 'dirs_removed' => 0];

        // Find recordings marked as "recording" with dead processes
        $stale = PingPongRecording::where('status', 'recording')->get();

        foreach ($stale as $recording) {
            if ($recording->ffmpeg_pid && $this->isProcessRunning($recording->ffmpeg_pid)) {
                continue; // Still running, not orphaned
            }

            // Try to salvage by finalizing
            try {
                $this->finalizeRecording($recording, $recording->match);
                $cleaned['salvaged']++;
            } catch (\Throwable $e) {
                $recording->update([
                    'status' => 'failed',
                    'ffmpeg_pid' => null,
                    'error_message' => 'Orphaned recording: ' . $e->getMessage(),
                ]);
                $cleaned['failed']++;
            }

            $this->cleanupHlsDir($recording->match_id);
        }

        // Clean up stale HLS directories with no matching active recording
        if (is_dir($this->hlsBasePath)) {
            $dirs = glob($this->hlsBasePath . '/*', GLOB_ONLYDIR);
            foreach ($dirs as $dir) {
                $matchId = basename($dir);
                $hasActive = PingPongRecording::where('match_id', $matchId)
                    ->where('status', 'recording')
                    ->exists();

                if (!$hasActive) {
                    $this->removeDirectory($dir);
                    $cleaned['dirs_removed']++;
                }
            }
        }

        return $cleaned;
    }

    private function finalizeRecording(PingPongRecording $recording, PingPongMatch $match): void
    {
        $hlsDir = $this->hlsBasePath . '/' . $match->id;
        $m3u8Path = $hlsDir . '/stream.m3u8';
        $mp4Path = $this->videoBasePath . '/' . $match->id . '.mp4';

        if (!file_exists($m3u8Path)) {
            throw new \RuntimeException('HLS manifest not found: ' . $m3u8Path);
        }

        if (!is_dir($this->videoBasePath)) {
            mkdir($this->videoBasePath, 0775, true);
        }

        $cmd = sprintf(
            'ffmpeg -i %s -c copy %s 2>&1',
            escapeshellarg($m3u8Path),
            escapeshellarg($mp4Path)
        );

        $output = [];
        $returnCode = 0;
        exec($cmd, $output, $returnCode);

        if ($returnCode !== 0) {
            throw new \RuntimeException('FFmpeg finalization failed: ' . implode("\n", $output));
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
    }

    private function cleanupHlsDir(int $matchId): void
    {
        $hlsDir = $this->hlsBasePath . '/' . $matchId;
        if (is_dir($hlsDir)) {
            $this->removeDirectory($hlsDir);
        }
    }

    private function removeDirectory(string $dir): void
    {
        $files = glob($dir . '/*');
        foreach ($files as $file) {
            is_dir($file) ? $this->removeDirectory($file) : unlink($file);
        }
        rmdir($dir);
    }

    private function isProcessRunning(int $pid): bool
    {
        return file_exists('/proc/' . $pid);
    }
}
