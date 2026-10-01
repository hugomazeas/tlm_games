<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Jobs\FinalizeRecordingJob;
use App\Jobs\StopRecordingJob;
use Illuminate\Support\Facades\Log;

class VideoRecordingService
{
    private string $hlsBasePath;

    private string $videoBasePath;

    private string $videoDevice;

    private string $audioDevice;

    public function __construct()
    {
        $this->hlsBasePath = storage_path('app/recordings/live');
        $this->videoBasePath = storage_path('app/public/recordings/matches');
        $this->videoDevice = '/dev/video0';
        $this->audioDevice = (string) config('pingpong.recording_audio_device');
    }

    public function startRecording(PingPongMatch $match): PingPongRecording
    {
        $active = $this->getActiveRecording();
        if ($active && $this->isTailing($active)) {
            // The previous match is only rolling its tail; the new match needs the camera now.
            $this->stopRecording($active->match);
        } elseif ($active) {
            throw new \RuntimeException('Another recording is already active (match #'.$active->match_id.')');
        }

        $hlsDir = $this->hlsBasePath.'/'.$match->id;
        if (! is_dir($hlsDir)) {
            mkdir($hlsDir, 0775, true);
        }

        // Remove any previous recording for this match (e.g. completed/failed)
        PingPongRecording::where('match_id', $match->id)->delete();

        $recording = PingPongRecording::create([
            'match_id' => $match->id,
            'status' => 'pending',
            'hls_path' => 'recordings/live/'.$match->id,
        ]);

        $segmentPattern = $hlsDir.'/segment%03d.ts';
        $m3u8Path = $hlsDir.'/stream.m3u8';

        $pid = $this->spawnFfmpeg($segmentPattern, $m3u8Path, withAudio: $this->audioDevice !== '');

        // ponytail: a missing/busy mic shouldn't cost the whole recording, so retry video-only
        if ($pid > 0 && ! $this->isProcessRunning($pid) && $this->audioDevice !== '') {
            Log::warning('FFmpeg failed with audio, retrying video-only', ['match_id' => $match->id, 'audio_device' => $this->audioDevice]);
            $pid = $this->spawnFfmpeg($segmentPattern, $m3u8Path, withAudio: false);
        }

        if ($pid <= 0) {
            $recording->update(['status' => 'failed', 'error_message' => 'Failed to start FFmpeg process']);
            throw new \RuntimeException('Failed to start FFmpeg process');
        }

        if (! $this->isProcessRunning($pid)) {
            $recording->update(['status' => 'failed', 'error_message' => 'FFmpeg process exited immediately']);
            throw new \RuntimeException('FFmpeg process exited immediately (PID: '.$pid.')');
        }

        $recording->update([
            'status' => 'recording',
            'ffmpeg_pid' => $pid,
        ]);

        Log::info('Recording started', ['match_id' => $match->id, 'pid' => $pid]);

        return $recording;
    }

    /**
     * Keep the camera rolling for a few seconds after the match ends, then stop.
     * The stream runs behind the table, so stopping on the winning point would
     * cut the final rally off for viewers and from the saved video.
     */
    public function stopRecordingAfterTail(PingPongMatch $match): void
    {
        $recording = $match->recording;

        if (! $recording || $recording->status !== 'recording') {
            return;
        }

        $tailSeconds = $this->tailSeconds();

        if ($tailSeconds === 0) {
            $this->stopRecording($match);

            return;
        }

        StopRecordingJob::dispatch($recording->id)->delay(now()->addSeconds($tailSeconds));
    }

    /**
     * Whether the camera is only filming the tail of a match that already ended.
     */
    public function isTailing(PingPongRecording $recording): bool
    {
        return $recording->status === 'recording' && $recording->match?->ended_at !== null;
    }

    public function stopRecording(PingPongMatch $match): ?PingPongRecording
    {
        $recording = $match->recording;

        if (! $recording || $recording->status !== 'recording') {
            return $recording;
        }

        // Stop FFmpeg with SIGTERM for graceful shutdown (properly releases camera)
        if ($recording->ffmpeg_pid && $this->isProcessRunning($recording->ffmpeg_pid)) {
            posix_kill($recording->ffmpeg_pid, SIGTERM);

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

        // Dispatch finalization to a queued job (remux + compress)
        FinalizeRecordingJob::dispatch($recording->id, $match->id);

        return $recording->fresh();
    }

    /**
     * Launch FFmpeg in the background and return its PID, after a short pause
     * so a process that dies on startup (bad device) is already gone.
     */
    protected function spawnFfmpeg(string $segmentPattern, string $m3u8Path, bool $withAudio): int
    {
        $pid = (int) trim((string) shell_exec($this->buildFfmpegCommand($segmentPattern, $m3u8Path, $withAudio)));

        if ($pid > 0) {
            usleep(500000);
        }

        return $pid;
    }

    public function buildFfmpegCommand(string $segmentPattern, string $m3u8Path, bool $withAudio): string
    {
        // ffmpeg rebases each input to start at zero on its own, so the camera and
        // mic would be offset by however long each took to deliver its first
        // packet. Both are stamped on the wall clock (-ts mono2abs on the camera,
        // ALSA already is) and -isync 0 keeps the mic's start relative to the camera's.
        $audioInput = $withAudio
            ? '-f alsa -thread_queue_size 1024 -isync 0 -i '.escapeshellarg($this->audioDevice).' '
            : '';
        // Downmixed to mono (-ac 1); clips and the final file inherit it. aresample
        // keeps the mic's sample clock locked to its timestamps so it can't drift
        // away from the picture over a long match.
        $audioCodec = $withAudio ? '-af aresample=async=1000 -c:a aac -ac 1 -b:a 96k ' : '';

        return sprintf(
            'nohup ffmpeg -f v4l2 -thread_queue_size 512 -ts mono2abs -video_size 1280x720 -framerate 30 -input_format mjpeg '
            .'-i %s %s-vf "hflip,vflip" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -tune zerolatency -g 60 '
            .'%s-f hls -hls_time 2 -hls_list_size 0 -hls_flags append_list '
            .'-hls_segment_filename %s %s '
            .'> /dev/null 2>&1 & echo $!',
            escapeshellarg($this->videoDevice),
            $audioInput,
            $audioCodec,
            escapeshellarg($segmentPattern),
            escapeshellarg($m3u8Path)
        );
    }

    public function getActiveRecording(): ?PingPongRecording
    {
        $recording = PingPongRecording::where('status', 'recording')->first();

        if (! $recording) {
            return null;
        }

        // An ended match still recording long past its tail was never stopped (e.g. the camera worker was down)
        $match = $recording->match;
        $staleAfterSeconds = $this->tailSeconds() + 60;
        if ($match && $match->ended_at !== null && $match->ended_at->lt(now()->subSeconds($staleAfterSeconds))) {
            Log::warning('Clearing stale recording for completed match', [
                'recording_id' => $recording->id,
                'match_id' => $recording->match_id,
            ]);
            $this->stopRecording($match);

            return null;
        }

        if ($recording->ffmpeg_pid && ! $this->isProcessRunning($recording->ffmpeg_pid)) {
            Log::warning('Clearing stale recording with dead FFmpeg process', [
                'recording_id' => $recording->id,
                'match_id' => $recording->match_id,
                'pid' => $recording->ffmpeg_pid,
            ]);
            $recording->update([
                'status' => 'failed',
                'ffmpeg_pid' => null,
                'error_message' => 'FFmpeg process died (likely container restart)',
            ]);
            $this->cleanupHlsDir($recording->match_id);

            return null;
        }

        return $recording;
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

            // Try to salvage by dispatching finalization job
            $recording->update(['status' => 'finalizing', 'ffmpeg_pid' => null]);
            FinalizeRecordingJob::dispatch($recording->id, $recording->match_id);
            $cleaned['salvaged']++;
        }

        // Clean up stale HLS directories with no matching active or finalizing recording
        if (is_dir($this->hlsBasePath)) {
            $dirs = glob($this->hlsBasePath.'/*', GLOB_ONLYDIR);
            foreach ($dirs as $dir) {
                $matchId = basename($dir);
                $hasActive = PingPongRecording::where('match_id', $matchId)
                    ->whereIn('status', ['recording', 'finalizing'])
                    ->exists();

                if (! $hasActive) {
                    $this->removeDirectory($dir);
                    $cleaned['dirs_removed']++;
                }
            }
        }

        return $cleaned;
    }

    private function tailSeconds(): int
    {
        return max(0, (int) config('pingpong.recording_tail_seconds'));
    }

    private function cleanupHlsDir(int $matchId): void
    {
        $hlsDir = $this->hlsBasePath.'/'.$matchId;
        if (is_dir($hlsDir)) {
            $this->removeDirectory($hlsDir);
        }
    }

    private function removeDirectory(string $dir): void
    {
        $files = glob($dir.'/*');
        foreach ($files as $file) {
            is_dir($file) ? $this->removeDirectory($file) : unlink($file);
        }
        rmdir($dir);
    }

    private function isProcessRunning(int $pid): bool
    {
        return file_exists('/proc/'.$pid);
    }
}
