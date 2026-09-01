<?php

namespace App\Games\PingPong\Observers;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\ChallengeReconciler;
use Illuminate\Support\Facades\Log;

/**
 * Watches for matches that fulfil an outstanding challenge.
 *
 * An observer rather than a call inside each controller: matches are created
 * from the lobby, the scoring API and the rematch endpoint, and a fourth path
 * would silently miss the hook. Closing a challenge is bookkeeping, so a
 * failure here must never break the match that was just started.
 */
class PingPongMatchObserver
{
    public function __construct(private readonly ChallengeReconciler $reconciler) {}

    public function created(PingPongMatch $match): void
    {
        try {
            $closed = $this->reconciler->reconcileMatch($match);

            if ($closed > 0) {
                Log::info('Ping pong challenge fulfilled by a match.', [
                    'match_id' => $match->id,
                    'challenges_closed' => $closed,
                ]);
            }
        } catch (\Throwable $exception) {
            Log::error('Could not reconcile challenges for a new match.', [
                'match_id' => $match->id,
                'error' => $exception->getMessage(),
            ]);
        }
    }
}
