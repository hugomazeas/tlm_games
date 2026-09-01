<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongChallenge;

/**
 * Why an hourly draw did or didn't produce a challenge.
 *
 * Skipping is the common case — most hours are outside a given office's
 * window, or nobody eligible is in — so the reason is a first-class value the
 * command can print rather than something buried in a log line.
 */
class MatchmakingResult
{
    public const OFFICE_DISABLED = 'office_disabled';

    public const BURO_UNAVAILABLE = 'buro_unavailable';

    public const WEEKEND = 'weekend';

    public const OUTSIDE_HOURS = 'outside_hours';

    public const NO_OPT_INS = 'no_opt_ins';

    public const NOT_ENOUGH_PLAYERS = 'not_enough_players';

    public const DRY_RUN = 'dry_run';

    private function __construct(
        public readonly bool $created,
        public readonly string $reason,
        public readonly ?PingPongChallenge $challenge = null,
        public readonly int $eligibleCount = 0,
    ) {}

    public static function created(PingPongChallenge $challenge, int $eligibleCount): self
    {
        return new self(true, 'created', $challenge, $eligibleCount);
    }

    public static function skipped(string $reason, int $eligibleCount = 0): self
    {
        return new self(false, $reason, null, $eligibleCount);
    }
}
