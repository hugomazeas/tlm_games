<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongClip;
use App\Games\PingPong\Models\PingPongRecording;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class ClipExtractionService
{
    private const MAX_CLIP_SECONDS = 600;

    private string $clipsBasePath;

    public function __construct()
    {
        $this->clipsBasePath = storage_path('app/public/recordings/clips');
    }

    public function extract(PingPongRecording $recording, float $start, float $end, int $playerId): PingPongClip
    {
        if ($recording->status !== 'completed' || !$recording->video_path) {
            throw new \RuntimeException('Recording is not ready for clip extraction (status: ' . $recording->status . ')');
        }

        if ($start < 0 || $end <= $start) {
            throw new \InvalidArgumentException('Invalid time range: start must be >= 0 and end must be > start');
        }

        $duration = $end - $start;

        if ($duration > self::MAX_CLIP_SECONDS) {
            throw new \InvalidArgumentException('Clip too long: max ' . self::MAX_CLIP_SECONDS . ' seconds');
        }

        if ($recording->duration_seconds !== null && $end > $recording->duration_seconds + 0.5) {
            throw new \InvalidArgumentException('End time exceeds recording duration (' . $recording->duration_seconds . 's)');
        }

        $sourcePath = storage_path('app/public/' . $recording->video_path);

        if (!file_exists($sourcePath)) {
            throw new \RuntimeException('Source video file not found on disk');
        }

        $matchDir = $this->clipsBasePath . '/' . $recording->match_id;
        if (!is_dir($matchDir)) {
            mkdir($matchDir, 0775, true);
        }

        $filename = sprintf(
            '%d_%d-%d_%s.mp4',
            $recording->id,
            (int) floor($start),
            (int) ceil($end),
            Str::random(6)
        );
        $destAbsolute = $matchDir . '/' . $filename;
        $relativePath = 'recordings/clips/' . $recording->match_id . '/' . $filename;

        $clip = PingPongClip::create([
            'recording_id' => $recording->id,
            'match_id' => $recording->match_id,
            'player_id' => $playerId,
            'start_seconds' => $start,
            'end_seconds' => $end,
            'duration_seconds' => $duration,
            'status' => 'ready',
        ]);

        $cmd = sprintf(
            'ffmpeg -y -ss %s -i %s -t %s -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -an -movflags +faststart %s 2>&1',
            escapeshellarg((string) $start),
            escapeshellarg($sourcePath),
            escapeshellarg((string) $duration),
            escapeshellarg($destAbsolute)
        );

        $output = [];
        $exitCode = 0;
        exec($cmd, $output, $exitCode);

        if ($exitCode !== 0 || !file_exists($destAbsolute)) {
            $stderr = implode("\n", array_slice($output, -20));
            Log::warning('ffmpeg clip extraction failed', [
                'clip_id' => $clip->id,
                'recording_id' => $recording->id,
                'exit_code' => $exitCode,
                'stderr' => $stderr,
            ]);
            $clip->update([
                'status' => 'failed',
                'error_message' => $stderr ?: 'ffmpeg exited with code ' . $exitCode,
            ]);

            if (file_exists($destAbsolute)) {
                @unlink($destAbsolute);
            }

            return $clip->fresh();
        }

        $clip->update([
            'clip_path' => $relativePath,
            'file_size' => filesize($destAbsolute) ?: null,
        ]);

        return $clip->fresh();
    }
}
