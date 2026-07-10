<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;

/**
 * Live win-probability for 1v1 ping pong.
 *
 * Builds a pre-match prior p0 (probability the LEFT player wins the match) from
 * three signals, then projects it forward through the current score:
 *
 *   1. Elo skill        — each player's current rating (EloService).
 *   2. Recent form      — last-N win rate, shrunk toward .500, applied as an Elo delta.
 *   3. Head-to-head     — this pairing's record, Beta-shrunk toward the form-adjusted Elo.
 *
 * p0 -> per-point win prob q -> P(reach 11, win by 2, from the current score).
 * At 0-0 the result is p0; as the score moves the margin dominates the prior.
 */
class WinProbabilityService
{
    /** Head-to-head trust: pseudo-games pulling H2H toward the Elo prior. */
    private const H2H_PRIOR_WEIGHT = 4.0;

    /** Recent-form trust: pseudo-games pulling form toward .500. */
    private const FORM_PRIOR_WEIGHT = 2.0;

    /** How many recent matches count as "recent form". */
    private const FORM_WINDOW = 10;

    /** Cap on the Elo swing a hot/cold streak may contribute (points). */
    private const FORM_ELO_CAP = 100.0;

    public function __construct(private EloService $eloService) {}

    /**
     * @return array{left: int, right: int, favored: 'left'|'right', p0: float}|null
     *   Percentages (0-100) for each side, plus the raw pre-match prior. Null for
     *   non-1v1 matches or when a player is missing.
     */
    public function forMatch(PingPongMatch $match): ?array
    {
        if ($match->mode !== '1v1' || ! $match->player_left_id || ! $match->player_right_id) {
            return null;
        }

        $p0 = $this->priorLeftWins($match->player_left_id, $match->player_right_id, $match->id);

        $pLeft = $this->matchWinProbability(
            $p0,
            $match->player_left_score ?? 0,
            $match->player_right_score ?? 0,
        );

        $leftPct = (int) round($pLeft * 100);

        return [
            'left' => $leftPct,
            'right' => 100 - $leftPct,
            'favored' => $pLeft >= 0.5 ? 'left' : 'right',
            'p0' => round($p0, 4),
        ];
    }

    /**
     * Pre-match probability that `left` beats `right`, combining Elo (nudged by
     * recent form) with the shrunk head-to-head record.
     */
    private function priorLeftWins(int $leftId, int $rightId, int $excludeMatchId): float
    {
        $eloLeft = $this->eloService->getEloFromHistory($leftId) + $this->formEloDelta($leftId, $excludeMatchId);
        $eloRight = $this->eloService->getEloFromHistory($rightId) + $this->formEloDelta($rightId, $excludeMatchId);

        $pElo = 1 / (1 + pow(10, ($eloRight - $eloLeft) / 400));

        [$leftWins, $games] = $this->headToHead($leftId, $rightId, $excludeMatchId);

        // Beta shrinkage: with few H2H games this stays near pElo; with many it
        // converges on the real record.
        return ($leftWins + self::H2H_PRIOR_WEIGHT * $pElo)
            / ($games + self::H2H_PRIOR_WEIGHT);
    }

    /**
     * Recent form expressed as an Elo adjustment: last-N win rate shrunk toward
     * .500, mapped through the logistic-inverse to Elo points, capped.
     */
    private function formEloDelta(int $playerId, int $excludeMatchId): float
    {
        [$wins, $played] = $this->recentRecord($playerId, $excludeMatchId, self::FORM_WINDOW);

        if ($played === 0) {
            return 0.0;
        }

        $rate = ($wins + self::FORM_PRIOR_WEIGHT * 0.5) / ($played + self::FORM_PRIOR_WEIGHT);
        $rate = min(max($rate, 0.001), 0.999);

        $delta = 400 * log10($rate / (1 - $rate));

        return max(-self::FORM_ELO_CAP, min(self::FORM_ELO_CAP, $delta));
    }

    /**
     * @return array{0: int, 1: int} [leftWins, totalGames] for the pairing.
     */
    private function headToHead(int $leftId, int $rightId, int $excludeMatchId): array
    {
        $matches = PingPongMatch::query()
            ->whereNotNull('ended_at')
            ->where('mode', '1v1')
            ->where('id', '!=', $excludeMatchId)
            ->where(function ($q) use ($leftId, $rightId) {
                $q->where(function ($q) use ($leftId, $rightId) {
                    $q->where('player_left_id', $leftId)->where('player_right_id', $rightId);
                })->orWhere(function ($q) use ($leftId, $rightId) {
                    $q->where('player_left_id', $rightId)->where('player_right_id', $leftId);
                });
            })
            ->get(['winner_id']);

        $leftWins = $matches->where('winner_id', $leftId)->count();

        return [$leftWins, $matches->count()];
    }

    /**
     * @return array{0: int, 1: int} [wins, played] over the player's last $window
     *   finished 1v1 matches (regardless of side).
     */
    private function recentRecord(int $playerId, int $excludeMatchId, int $window): array
    {
        $matches = PingPongMatch::query()
            ->whereNotNull('ended_at')
            ->where('mode', '1v1')
            ->where('id', '!=', $excludeMatchId)
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)->orWhere('player_right_id', $playerId);
            })
            ->orderByDesc('ended_at')
            ->limit($window)
            ->get(['winner_id']);

        $wins = $matches->where('winner_id', $playerId)->count();

        return [$wins, $matches->count()];
    }

    /**
     * P(left wins the match | current score), games to 11 win-by-2.
     *
     * A per-point win prob q gets *amplified* by a race to 11, so we can't use p0
     * as q directly. Instead we calibrate: find the q whose race-from-0-0 equals
     * p0 (bisection — the race prob is monotonic in q), so at 0-0 the displayed
     * number is exactly the pre-match prior. From there the live score drives it.
     */
    private function matchWinProbability(float $p0, int $left, int $right): float
    {
        $q = $this->calibratePointProbability($p0);

        return $this->raceProbability($q, $left, $right);
    }

    /**
     * Solve for the per-point win prob q such that raceProbability(q, 0, 0) == p0.
     */
    private function calibratePointProbability(float $target): float
    {
        $target = min(max($target, 0.001), 0.999);

        $lo = 0.001;
        $hi = 0.999;

        // ~30 iterations converges well past display precision.
        for ($i = 0; $i < 30; $i++) {
            $mid = ($lo + $hi) / 2;
            if ($this->raceProbability($mid, 0, 0) < $target) {
                $lo = $mid;
            } else {
                $hi = $mid;
            }
        }

        return ($lo + $hi) / 2;
    }

    /**
     * P(left wins a race to 11 win-by-2 from the current score), given per-point
     * win prob q. Memoized recursion over reachable (l, r) states — a few dozen,
     * sub-ms.
     */
    private function raceProbability(float $q, int $left, int $right): float
    {
        $memo = [];

        $solve = function (int $l, int $r) use (&$solve, &$memo, $q): float {
            // Terminal: someone has >=11 and a 2-point lead.
            if (($l >= 11 || $r >= 11) && abs($l - $r) >= 2) {
                return $l > $r ? 1.0 : 0.0;
            }

            $key = $l . ',' . $r;
            if (isset($memo[$key])) {
                return $memo[$key];
            }

            // At deuce (10-10 and beyond) the state space is unbounded; collapse
            // it to the closed-form probability of winning a win-by-2 tiebreak.
            if ($l >= 10 && $r >= 10) {
                return $memo[$key] = $this->deuceProbability($q, $l - $r);
            }

            $p = $q * $solve($l + 1, $r) + (1 - $q) * $solve($l, $r + 1);

            return $memo[$key] = $p;
        };

        return $solve($left, $right);
    }

    /**
     * Probability the left player wins a win-by-2 tiebreak given per-point prob q
     * and the current lead (leftScore - rightScore), which in deuce is -1, 0, or +1.
     *
     * From a tied deuce, P(win) = q^2 / (q^2 + (1-q)^2). A one-point lead/deficit
     * shifts by one "must-win-two / lose-two" step.
     */
    private function deuceProbability(float $q, int $lead): float
    {
        $tied = ($q * $q) / ($q * $q + (1 - $q) * (1 - $q));

        if ($lead === 0) {
            return $tied;
        }

        // Up one: win next point -> win (prob q), else back to tied.
        if ($lead > 0) {
            return $q + (1 - $q) * $tied;
        }

        // Down one: lose next point -> loss, else back to tied.
        return $q * $tied;
    }
}
