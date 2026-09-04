<?php

namespace App\Games\PingPong\Console\Commands;

use App\Games\PingPong\Events\ChallengeUpdated;
use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Services\ChallengeReconciler;
use App\Games\PingPong\Services\MatchmakingResult;
use App\Games\PingPong\Services\MatchmakingService;
use App\Jobs\SendChallengeNotificationJob;
use App\Models\Office;
use Illuminate\Console\Command;

/**
 * The hourly draw, run once per office.
 *
 * Scheduled every hour at :30 (see `routes/console.php`) with no time window
 * of its own — each office carries its own hours, and the office-local clock
 * comes from Buro, so a Quebec office and a European one can share the tick.
 */
class MatchmakeCommand extends Command
{
    protected $signature = 'pingpong:matchmake
                            {--office= : Restrict the draw to one office id}
                            {--dry-run : Report who would be drawn without creating anything}';

    protected $description = 'Pair two colleagues who are in the office for a ping pong match';

    public function handle(MatchmakingService $matchmaking, ChallengeReconciler $reconciler): int
    {
        // Before anything is expired: a pair who walked to the table and
        // played without touching the lobby honoured their challenge, and it
        // must be recorded as played rather than swept up as expired.
        $played = $reconciler->reconcilePending();

        if ($played > 0) {
            $this->line("Closed {$played} ".str('challenge')->plural($played).' the players had already played.');
        }

        $expired = PingPongChallenge::expireStale();

        if ($expired > 0) {
            $this->line("Expired {$expired} stale ".str('challenge')->plural($expired).'.');
        }

        $offices = Office::query()
            ->matchmaking()
            ->when($this->option('office'), fn ($query, $id) => $query->whereKey($id))
            ->orderBy('name')
            ->get();

        if ($offices->isEmpty()) {
            $this->info('No offices have matchmaking enabled.');

            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        foreach ($offices as $office) {
            $result = $matchmaking->drawForOffice($office, $dryRun);

            $this->reportResult($office, $result);

            if ($result->created && $result->challenge !== null) {
                SendChallengeNotificationJob::dispatch($result->challenge->id);

                // Pushes reach the two players; this reaches the screen by the
                // table, which nobody is holding.
                broadcast(new ChallengeUpdated($result->challenge));
            }
        }

        return self::SUCCESS;
    }

    private function reportResult(Office $office, MatchmakingResult $result): void
    {
        if ($result->created && $result->challenge !== null) {
            $challenge = $result->challenge->loadMissing(['playerOne', 'playerTwo', 'lobby']);

            $this->info(sprintf(
                '%s: %s vs %s (lobby %s, %d eligible)',
                $office->name,
                $challenge->playerOne->name,
                $challenge->playerTwo->name,
                $challenge->lobby?->code ?? '—',
                $result->eligibleCount,
            ));

            return;
        }

        $this->line(sprintf(
            '%s: skipped (%s%s)',
            $office->name,
            $result->reason,
            $result->eligibleCount > 0 ? ", {$result->eligibleCount} eligible" : '',
        ));
    }
}
