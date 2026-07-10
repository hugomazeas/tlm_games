<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * Live win-probability for 1v1 ping pong.
 *
 * Builds a pre-match prior p0 (probability the LEFT player wins the match) from
 * three signals, then projects it forward through the current score, correcting
 * the projection with historical "game shape" data:
 *
 *   1. Elo skill        — each player's current rating (EloService).
 *   2. Recent form      — last-N win rate, shrunk toward .500, applied as an Elo delta.
 *   3. Head-to-head     — this pairing's record, Beta-shrunk toward the form-adjusted Elo.
 *
 * Score projection: p0 -> per-point win prob q -> P(reach 11 win-by-2). The raw
 * race-DP is then blended, by sample size, with the EMPIRICAL win-rate observed
 * historically at the same (points-scored, margin) — so the live number tracks
 * what actually happens from a given lead, not just the theory. In the deuce
 * region each player's historical clutch delta nudges the result.
 *
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

    /** Empirical (state) trust: pseudo-games pulling a state's win-rate toward theory. */
    private const EMPIRICAL_PRIOR_WEIGHT = 30.0;

    /** Below this many games observed at a state, ignore the empirical table entirely. */
    private const EMPIRICAL_MIN_GAMES = 20;

    /** Clutch trust: deuce-games pulling a player's clutch delta toward zero. */
    private const CLUTCH_PRIOR_WEIGHT = 40.0;

    /** How long the historical shape tables stay cached (seconds). */
    private const SHAPE_CACHE_TTL = 3600;

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
            $match->player_left_id,
            $match->player_right_id,
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
     * Starts from the calibrated race-DP (q chosen so the 0-0 value equals p0),
     * then corrects it with the two data-backed "shape" signals:
     *   - empirical margin recalibration: blend the theoretical value with the
     *     historical win-rate seen at this (points-scored, margin), by sample size;
     *   - clutch: in the deuce region, nudge by each player's historical deuce delta.
     */
    private function matchWinProbability(float $p0, int $left, int $right, int $leftId, int $rightId): float
    {
        $q = $this->calibratePointProbability($p0);
        $theoretical = $this->raceProbability($q, $left, $right);

        $p = $this->blendWithEmpirical($theoretical, $p0, $left, $right);
        $p = $this->applyClutch($p, $left, $right, $leftId, $rightId);

        return min(max($p, 0.0), 1.0);
    }

    /**
     * Blend the theoretical race prob with the historical win-rate observed at the
     * same (total points, margin). The empirical table is measured over the average
     * matchup, so we re-center it by how skewed this matchup is (p0 vs .500) before
     * blending. Below EMPIRICAL_MIN_GAMES observed, we trust theory alone.
     */
    private function blendWithEmpirical(float $theoretical, float $p0, int $left, int $right): float
    {
        // Only meaningful pre-deuce; deuce is handled by the DP + clutch.
        if ($left >= 10 && $right >= 10) {
            return $theoretical;
        }

        $table = $this->empiricalStateTable();
        $key = ($left + $right) . ':' . ($left - $right);

        if (! isset($table[$key])) {
            return $theoretical;
        }

        [$games, $leftWins] = $table[$key];
        if ($games < self::EMPIRICAL_MIN_GAMES) {
            return $theoretical;
        }

        // Historical rate for an even matchup at this state...
        $rawRate = $leftWins / $games;
        // ...re-centered in logit space toward this matchup's skew, so a strong
        // favorite leading 2-0 reads higher than an even player leading 2-0.
        $empirical = $this->logisticShift($rawRate, $this->logit($p0));

        // Sample-size weighted blend toward the empirical observation.
        $w = $games / ($games + self::EMPIRICAL_PRIOR_WEIGHT);

        return $w * $empirical + (1 - $w) * $theoretical;
    }

    /**
     * In the deuce region (both >= 10, undecided), nudge the probability by each
     * player's historical clutch delta (deuce win-rate vs. their baseline), shrunk
     * toward zero for players with few deuce games. Applied in logit space.
     */
    private function applyClutch(float $p, int $left, int $right, int $leftId, int $rightId): float
    {
        if ($left < 10 || $right < 10 || $p <= 0.0 || $p >= 1.0) {
            return $p;
        }

        $clutch = $this->clutchTable();
        $delta = ($clutch[$leftId] ?? 0.0) - ($clutch[$rightId] ?? 0.0);

        if ($delta === 0.0) {
            return $p;
        }

        return 1 / (1 + exp(-($this->logit($p) + $delta)));
    }

    private function logit(float $p): float
    {
        $p = min(max($p, 0.0001), 0.9999);

        return log($p / (1 - $p));
    }

    /** Apply a logit-space shift to a probability. */
    private function logisticShift(float $p, float $shift): float
    {
        return 1 / (1 + exp(-($this->logit($p) + $shift)));
    }

    /**
     * Historical outcome by mid-game state, keyed "total:margin" => [games, leftWins].
     * Cached — one game only adds a handful of point-rows, so hourly is plenty fresh.
     *
     * @return array<string, array{0: int, 1: int}>
     */
    private function empiricalStateTable(): array
    {
        return Cache::remember('pp.winprob.states', self::SHAPE_CACHE_TTL, function (): array {
            $rows = DB::table('ping_pong_points as p')
                ->join('ping_pong_matches as m', 'm.id', '=', 'p.match_id')
                ->whereNotNull('m.ended_at')
                ->where('m.mode', '1v1')
                ->whereColumn('p.left_score_after', '<', DB::raw('11'))
                ->whereColumn('p.right_score_after', '<', DB::raw('11'))
                ->selectRaw('(p.left_score_after + p.right_score_after) as total')
                ->selectRaw('(p.left_score_after - p.right_score_after) as margin')
                ->selectRaw('COUNT(*) as games')
                ->selectRaw('SUM(CASE WHEN m.winner_id = m.player_left_id THEN 1 ELSE 0 END) as left_wins')
                ->groupBy('total', 'margin')
                ->get();

            $table = [];
            foreach ($rows as $r) {
                $table[$r->total . ':' . $r->margin] = [(int) $r->games, (int) $r->left_wins];
            }

            return $table;
        });
    }

    /**
     * Per-player clutch delta in logit units: how much better/worse a player does
     * in deuce games than their overall baseline, shrunk toward zero by deuce count.
     * Cached hourly.
     *
     * @return array<int, float>
     */
    private function clutchTable(): array
    {
        return Cache::remember('pp.winprob.clutch', self::SHAPE_CACHE_TTL, function (): array {
            $deuce = DB::table('ping_pong_matches')
                ->whereNotNull('ended_at')
                ->where('mode', '1v1')
                ->where('player_left_score', '>=', 10)
                ->where('player_right_score', '>=', 10)
                ->get(['player_left_id', 'player_right_id', 'winner_id']);

            $overall = DB::table('ping_pong_matches')
                ->whereNotNull('ended_at')
                ->where('mode', '1v1')
                ->get(['player_left_id', 'player_right_id', 'winner_id']);

            $overallGames = [];
            $overallWins = [];
            foreach ($overall as $m) {
                foreach ([$m->player_left_id, $m->player_right_id] as $pid) {
                    $overallGames[$pid] = ($overallGames[$pid] ?? 0) + 1;
                }
                $overallWins[$m->winner_id] = ($overallWins[$m->winner_id] ?? 0) + 1;
            }

            $deuceGames = [];
            $deuceWins = [];
            foreach ($deuce as $m) {
                foreach ([$m->player_left_id, $m->player_right_id] as $pid) {
                    $deuceGames[$pid] = ($deuceGames[$pid] ?? 0) + 1;
                }
                $deuceWins[$m->winner_id] = ($deuceWins[$m->winner_id] ?? 0) + 1;
            }

            $table = [];
            foreach ($deuceGames as $pid => $dg) {
                $baseRate = ($overallWins[$pid] ?? 0) / max(1, $overallGames[$pid] ?? 1);
                $deuceRate = ($deuceWins[$pid] ?? 0) / $dg;

                // Shrink the observed deuce rate toward the player's baseline by count.
                $w = $dg / ($dg + self::CLUTCH_PRIOR_WEIGHT);
                $shrunkRate = $w * $deuceRate + (1 - $w) * $baseRate;

                $table[$pid] = $this->logit($shrunkRate) - $this->logit($baseRate);
            }

            return $table;
        });
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
