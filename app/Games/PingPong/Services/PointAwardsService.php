<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use Illuminate\Support\Carbon;

/**
 * Computes "bragging rights" awards from per-point tags across 1v1 matches.
 *
 * Each award names a single title-holder (the leading player) plus a runner-up,
 * and can expand to a top-N detail view that shows the exact calculation behind
 * every ranked player (compute transparency).
 *
 * Awards are 1v1-only: attributing a wing / winner / error to one player is only
 * sound in singles, where each side is one person.
 */
class PointAwardsService
{
    /** Matches before this date predate point tagging (migration added May 22, 2026). */
    private const TAGGING_STATS_SINCE = '2026-05-22';

    /**
     * Award definitions in display order.
     *
     * kind:    'rate' (percentage of points won) or 'count' (raw tally).
     * metric:  tally field used as the numerator (rate) or the value (count).
     * over:    tally field used as the denominator (rate only).
     * min:     eligibility floor — applies to `over` for rate awards, to `metric` for counts.
     * unit:    short suffix for the headline value label ('%', 'edges', ...).
     * noun:    plural noun used in the concrete calculation string ('forehand winners', ...).
     * formula: plain-language description of how the value is computed.
     */
    private const DEFS = [
        ['key' => 'sniper',          'title' => 'Sniper',          'emoji' => '🎯', 'blurb' => 'Highest clean-winner rate',     'kind' => 'rate',  'metric' => 'winners',    'over' => 'points_won', 'min' => 15, 'unit' => '%',     'noun' => 'winners',          'formula' => 'clean winners ÷ points won × 100'],
        ['key' => 'lucky_charm',     'title' => 'Lucky Charm',     'emoji' => '🍀', 'blurb' => 'Wins off the net & table edge', 'kind' => 'count', 'metric' => 'lucky',                            'min' => 2,  'unit' => 'edges', 'noun' => 'edge wins',        'formula' => 'points won on a net or table edge'],
        ['key' => 'forehand_cannon', 'title' => 'Forehand Cannon', 'emoji' => '💥', 'blurb' => 'Most forehand winners',         'kind' => 'count', 'metric' => 'fh_win',                           'min' => 3,  'unit' => 'FH',    'noun' => 'forehand winners', 'formula' => 'winning shots hit with the forehand'],
        ['key' => 'backhand_wizard', 'title' => 'Backhand Wizard', 'emoji' => '🪄', 'blurb' => 'Most backhand winners',         'kind' => 'count', 'metric' => 'bh_win',                           'min' => 3,  'unit' => 'BH',    'noun' => 'backhand winners', 'formula' => 'winning shots hit with the backhand'],
        ['key' => 'gift_giver',      'title' => 'Gift Giver',      'emoji' => '🎁', 'blurb' => 'Most points donated on errors', 'kind' => 'count', 'metric' => 'errors',                           'min' => 5,  'unit' => 'gifts', 'noun' => 'donated points',   'formula' => 'points lost to your own unforced errors'],
        ['key' => 'net_dumper',      'title' => 'Net Dumper',      'emoji' => '🥅', 'blurb' => 'Most balls dumped in the net',  'kind' => 'count', 'metric' => 'net_errors',                       'min' => 3,  'unit' => 'nets',  'noun' => 'net errors',       'formula' => 'your own errors that went into the net'],
    ];

    private const BLANK_TALLY = ['points_won' => 0, 'winners' => 0, 'lucky' => 0, 'fh_win' => 0, 'bh_win' => 0, 'errors' => 0, 'net_errors' => 0];

    /**
     * One headline card per award (holder + runner-up + formula).
     *
     * @param  string  $window  'all' | 'month'
     * @return list<array<string,mixed>>
     */
    public function getAwards(string $window = 'all'): array
    {
        $tallies = $this->tallies($window);
        $names = $this->playerNames(array_keys($tallies));

        return array_map(fn (array $def) => $this->buildCard($def, $tallies, $names), self::DEFS);
    }

    /**
     * Top-N ranking for a single award, with the exact calculation per player.
     *
     * @param  string  $window  'all' | 'month'
     * @return array<string,mixed>|null  null when $key is not a real award
     */
    public function getAwardDetail(string $key, string $window = 'all', int $limit = 3): ?array
    {
        $def = $this->def($key);
        if ($def === null) {
            return null;
        }

        $tallies = $this->tallies($window);
        $names = $this->playerNames(array_keys($tallies));
        $ranked = array_slice($this->rankedCandidates($def, $tallies), 0, $limit);

        $entries = [];
        foreach ($ranked as $i => $cand) {
            $t = $cand['tally'];
            $entries[] = [
                'rank' => $i + 1,
                'player_id' => $cand['id'],
                'player_name' => $names[$cand['id']] ?? 'Unknown',
                'value' => $cand['value'],
                'value_label' => $this->label($cand['value'], $def['unit']),
                'calc' => $this->concreteCalc($def, $t, $cand['value']),
                'breakdown' => $this->breakdown($def, $t),
            ];
        }

        return [
            'key' => $def['key'],
            'title' => $def['title'],
            'emoji' => $def['emoji'],
            'blurb' => $def['blurb'],
            'formula' => $def['formula'],
            'eligibility' => $this->eligibilityNote($def),
            'window' => $window === 'month' ? 'month' : 'all',
            'entries' => $entries,
        ];
    }

    /** @return list<array{key:string,title:string}> for menu/validation use */
    public function awardKeys(): array
    {
        return array_map(fn (array $d) => ['key' => $d['key'], 'title' => $d['title']], self::DEFS);
    }

    /**
     * Per-player tallies of every metric the awards need, in one pass over the points.
     *
     * @return array<int, array<string,int>>
     */
    private function tallies(string $window): array
    {
        $floor = Carbon::parse(self::TAGGING_STATS_SINCE)->startOfDay();
        if ($window === 'month') {
            $floor = max($floor, Carbon::now()->startOfMonth());
        }

        $matches = PingPongMatch::with('points')
            ->where('mode', '1v1')
            ->whereNotNull('ended_at')
            ->where('ended_at', '>=', $floor)
            ->get();

        $tallies = [];

        foreach ($matches as $match) {
            $sideId = [
                'left' => $match->player_left_id,
                'right' => $match->player_right_id,
            ];

            foreach ($match->points as $point) {
                $winnerId = $sideId[$point->scoring_side] ?? null;
                $loserSide = $point->scoring_side === 'left' ? 'right' : 'left';
                $loserId = $sideId[$loserSide] ?? null;

                if ($winnerId !== null) {
                    $tallies[$winnerId] ??= self::BLANK_TALLY;
                    $tallies[$winnerId]['points_won']++;

                    if ($point->point_cause === 'winner') {
                        $tallies[$winnerId]['winners']++;
                        if ($point->shot_type === 'forehand') {
                            $tallies[$winnerId]['fh_win']++;
                        } elseif ($point->shot_type === 'backhand') {
                            $tallies[$winnerId]['bh_win']++;
                        }
                    }

                    if ($point->net_edge || $point->table_edge) {
                        $tallies[$winnerId]['lucky']++;
                    }
                }

                // An opponent_error point is lost by the side that hit the errant shot.
                if ($point->point_cause === 'opponent_error' && $loserId !== null) {
                    $tallies[$loserId] ??= self::BLANK_TALLY;
                    $tallies[$loserId]['errors']++;
                    if ($point->error_type === 'net') {
                        $tallies[$loserId]['net_errors']++;
                    }
                }
            }
        }

        return $tallies;
    }

    /**
     * Eligible players for an award, sorted best-first.
     *
     * @param  array<int, array<string,int>>  $tallies
     * @return list<array{id:int,value:int,tally:array<string,int>}>
     */
    private function rankedCandidates(array $def, array $tallies): array
    {
        $candidates = [];
        foreach ($tallies as $playerId => $t) {
            if (!$this->isEligible($def, $t)) {
                continue;
            }

            $value = $this->value($def, $t);
            if ($value <= 0) {
                continue;
            }

            $candidates[] = ['id' => $playerId, 'value' => $value, 'tally' => $t];
        }

        // value desc -> activity (points won) desc -> lowest id (deterministic tie-break).
        usort($candidates, function ($a, $b) {
            return [$b['value'], $b['tally']['points_won'], $a['id']]
                <=> [$a['value'], $a['tally']['points_won'], $b['id']];
        });

        return $candidates;
    }

    /**
     * @param  array<int, array<string,int>>  $tallies
     * @param  array<int, string>  $names
     */
    private function buildCard(array $def, array $tallies, array $names): array
    {
        $base = [
            'key' => $def['key'],
            'title' => $def['title'],
            'emoji' => $def['emoji'],
            'blurb' => $def['blurb'],
            'formula' => $def['formula'],
            'holder_player_id' => null,
            'holder_name' => null,
            'value' => null,
            'value_label' => null,
            'runner_up_name' => null,
            'runner_up_value_label' => null,
        ];

        $ranked = $this->rankedCandidates($def, $tallies);
        if (!isset($ranked[0])) {
            return $base;
        }

        $holder = $ranked[0];
        $base['holder_player_id'] = $holder['id'];
        $base['holder_name'] = $names[$holder['id']] ?? 'Unknown';
        $base['value'] = $holder['value'];
        $base['value_label'] = $this->label($holder['value'], $def['unit']);

        if (isset($ranked[1])) {
            $runner = $ranked[1];
            $base['runner_up_name'] = $names[$runner['id']] ?? 'Unknown';
            $base['runner_up_value_label'] = $this->label($runner['value'], $def['unit']);
        }

        return $base;
    }

    private function isEligible(array $def, array $t): bool
    {
        return $def['kind'] === 'rate'
            ? $t[$def['over']] >= $def['min']
            : $t[$def['metric']] >= $def['min'];
    }

    private function value(array $def, array $t): int
    {
        if ($def['kind'] === 'rate') {
            return $t[$def['over']] > 0
                ? (int) round(($t[$def['metric']] / $t[$def['over']]) * 100)
                : 0;
        }

        return $t[$def['metric']];
    }

    /** Concrete, auditable calculation for one player ("15 ÷ 20 × 100 = 75%"). */
    private function concreteCalc(array $def, array $t, int $value): string
    {
        if ($def['kind'] === 'rate') {
            return sprintf('%d ÷ %d × 100 = %d%%', $t[$def['metric']], $t[$def['over']], $value);
        }

        return $value . ' ' . $def['noun'];
    }

    /**
     * Raw inputs behind a player's value, for the transparency panel.
     *
     * @return list<array{label:string,value:int}>
     */
    private function breakdown(array $def, array $t): array
    {
        if ($def['kind'] === 'rate') {
            return [
                ['label' => 'Winners', 'value' => $t[$def['metric']]],
                ['label' => 'Points won', 'value' => $t[$def['over']]],
            ];
        }

        return [
            ['label' => ucfirst($def['noun']), 'value' => $t[$def['metric']]],
            ['label' => 'Points won', 'value' => $t['points_won']],
        ];
    }

    private function eligibilityNote(array $def): string
    {
        return $def['kind'] === 'rate'
            ? sprintf('Needs at least %d points won to qualify', $def['min'])
            : sprintf('Needs at least %d %s to qualify', $def['min'], $def['noun']);
    }

    private function label(int $value, string $unit): string
    {
        if ($unit === '%') {
            return $value . '%';
        }

        $word = $unit;
        if ($value === 1 && $unit === 'edges') {
            $word = 'edge';
        } elseif ($value === 1 && $unit === 'gifts') {
            $word = 'gift';
        } elseif ($value === 1 && $unit === 'nets') {
            $word = 'net';
        }

        return $value . ' ' . $word;
    }

    /** @return array<string,mixed>|null */
    private function def(string $key): ?array
    {
        foreach (self::DEFS as $def) {
            if ($def['key'] === $key) {
                return $def;
            }
        }

        return null;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, string>
     */
    private function playerNames(array $ids): array
    {
        if (empty($ids)) {
            return [];
        }

        return Player::whereIn('id', $ids)->pluck('name', 'id')->all();
    }
}
