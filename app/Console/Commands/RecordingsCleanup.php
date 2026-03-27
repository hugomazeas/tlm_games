<?php

namespace App\Console\Commands;

use App\Games\PingPong\Models\PingPongRecording;
use App\Games\PingPong\Services\VideoRecordingService;
use Illuminate\Console\Command;

class RecordingsCleanup extends Command
{
    protected $signature = 'recordings:cleanup {--days=30 : Delete completed recordings older than this many days}';

    protected $description = 'Clean up orphaned recording processes and delete old recording files';

    public function handle(VideoRecordingService $service): int
    {
        // Clean up orphaned recordings (dead FFmpeg processes)
        $this->info('Cleaning up orphaned recordings...');
        $result = $service->cleanupOrphans();
        $this->info("  Salvaged: {$result['salvaged']}, Failed: {$result['failed']}, Dirs removed: {$result['dirs_removed']}");

        // Delete old completed recordings
        $days = (int) $this->option('days');
        $cutoff = now()->subDays($days);

        $old = PingPongRecording::where('status', 'completed')
            ->where('created_at', '<', $cutoff)
            ->get();

        $deleted = 0;
        foreach ($old as $recording) {
            if ($recording->video_path) {
                $fullPath = storage_path('app/public/' . $recording->video_path);
                if (file_exists($fullPath)) {
                    unlink($fullPath);
                }
            }
            $recording->delete();
            $deleted++;
        }

        $this->info("Deleted {$deleted} recordings older than {$days} days.");

        return self::SUCCESS;
    }
}
