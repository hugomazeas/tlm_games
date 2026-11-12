<?php

namespace App\Games\OfficeFps\Services;

use App\Games\OfficeFps\Models\OfficeFpsKill;
use App\Games\OfficeFps\Models\OfficeFpsMatch;
use App\Games\OfficeFps\Models\OfficeFpsResult;
use App\Models\Player;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Everything the office FPS knows about its players, from the matches the game server saved:
 * the leaderboard, and each player's profile (totals, rates, records, weapons, rivals, recent
 * matches).
 */
class OfficeFpsStats
{
    /**
     * Everyone who has played, best first: kills, then K/D.
     *
     * @return Collection<int, array{player_id: int, player_name: string, kills: int, deaths: int, kd: float, wins: int, matches: int, accuracy: float}>
     */
    public function leaderboard(): Collection
    {
        $rows = $this->totals()->groupBy('player_id')->get();
        $names = Player::whereIn('id', $rows->pluck('player_id'))->pluck('name', 'id');

        return $rows
            ->map(fn ($row) => [
                'player_id' => (int) $row->player_id,
                'player_name' => $names[$row->player_id] ?? '?',
                'kills' => (int) $row->kills,
                'deaths' => (int) $row->deaths,
                'kd' => $this->ratio((int) $row->kills, (int) $row->deaths),
                'wins' => (int) $row->wins,
                'matches' => (int) $row->matches,
                'accuracy' => $this->percent((int) $row->hits, (int) $row->shots),
            ])
            ->sort(fn ($a, $b) => [$b['kills'], $b['kd']] <=> [$a['kills'], $a['kd']])
            ->values();
    }

    /**
     * A player's whole office FPS record, or null if they've never finished a match.
     *
     * @return array{totals: array<string, int|float>, modes: array<string, array{matches: int, wins: int}>, records: array<string, int>, weapons: array<string, array{kills: int, deaths: int}>, nemeses: Collection, victims: Collection, recent: Collection, rank: int|null}|null
     */
    public function forPlayer(Player $player): ?array
    {
        $row = $this->totals()->where('player_id', $player->id)->first();
        if (! $row || (int) $row->matches === 0) {
            return null;
        }

        $matches = (int) $row->matches;
        $kills = (int) $row->kills;
        $playedMinutes = (int) $row->played_ms / 60_000;
        $results = OfficeFpsResult::query()->where('player_id', $player->id);

        return [
            'totals' => [
                'matches' => $matches,
                'wins' => (int) $row->wins,
                'win_rate' => $this->percent((int) $row->wins, $matches),
                'podiums' => (int) $row->podiums,
                'average_place' => round((float) $row->average_place, 1),
                'kills' => $kills,
                'deaths' => (int) $row->deaths,
                'kd' => $this->ratio($kills, (int) $row->deaths),
                'kills_per_match' => round($kills / $matches, 1),
                'kills_per_minute' => $playedMinutes > 0 ? round($kills / $playedMinutes, 2) : 0.0,
                'headshots' => (int) $row->headshots,
                'headshot_rate' => $this->percent((int) $row->headshots, $kills),
                'damage' => (int) $row->damage,
                'damage_per_match' => (int) round((int) $row->damage / $matches),
                'shots' => (int) $row->shots,
                'hits' => (int) $row->hits,
                'accuracy' => $this->percent((int) $row->hits, (int) $row->shots),
                'melee_kills' => (int) $row->melee_kills,
                'backstabs' => (int) $row->backstabs,
                'played_ms' => (int) $row->played_ms,
                'zone_ms' => (int) $row->zone_ms,
                'pickups' => (int) $row->pickups,
            ],
            'modes' => $this->modes($player),
            'records' => [
                'most_kills' => (int) (clone $results)->max('kills'),
                'most_damage' => (int) (clone $results)->max('damage'),
                'best_streak' => (int) (clone $results)->max('best_streak'),
            ],
            'weapons' => $this->weapons($player),
            'nemeses' => $this->rivals('victim_id', 'killer_id', $player),
            'victims' => $this->rivals('killer_id', 'victim_id', $player),
            'recent' => (clone $results)->with('match')->latest('id')->limit(10)->get(),
            'rank' => $this->rankOf($player),
        ];
    }

    /** One SQL pass over the results: sums, wins and places per player. */
    private function totals(): Builder
    {
        return OfficeFpsResult::query()->select(
            'player_id',
            DB::raw('COUNT(*) as matches'),
            DB::raw('SUM(CASE WHEN won THEN 1 ELSE 0 END) as wins'),
            DB::raw('SUM(CASE WHEN place <= 3 THEN 1 ELSE 0 END) as podiums'),
            DB::raw('AVG(place) as average_place'),
            DB::raw('SUM(kills) as kills'),
            DB::raw('SUM(deaths) as deaths'),
            DB::raw('SUM(headshots) as headshots'),
            DB::raw('SUM(damage) as damage'),
            DB::raw('SUM(shots) as shots'),
            DB::raw('SUM(hits) as hits'),
            DB::raw('SUM(melee_kills) as melee_kills'),
            DB::raw('SUM(backstabs) as backstabs'),
            DB::raw('SUM(played_ms) as played_ms'),
            DB::raw('SUM(zone_ms) as zone_ms'),
            DB::raw('SUM(pickups) as pickups'),
        );
    }

    /**
     * Matches played and won in each mode, every mode listed (zeros for one never played).
     *
     * @return array<string, array{matches: int, wins: int}>
     */
    private function modes(Player $player): array
    {
        $rows = OfficeFpsResult::query()
            ->join('office_fps_matches', 'office_fps_matches.id', '=', 'office_fps_results.office_fps_match_id')
            ->where('office_fps_results.player_id', $player->id)
            ->groupBy('office_fps_matches.mode')
            ->get([
                'office_fps_matches.mode',
                DB::raw('COUNT(*) as matches'),
                DB::raw('SUM(CASE WHEN office_fps_results.won THEN 1 ELSE 0 END) as wins'),
            ])
            ->keyBy('mode');

        return collect(OfficeFpsMatch::MODES)
            ->mapWithKeys(fn (string $mode) => [$mode => [
                'matches' => (int) ($rows[$mode]->matches ?? 0),
                'wins' => (int) ($rows[$mode]->wins ?? 0),
            ]])
            ->all();
    }

    /**
     * Kills and deaths per weapon: every weapon in the game, and a retired one (the blaster) only
     * when they have a kill or a death with it.
     *
     * @return array<string, array{kills: int, deaths: int}>
     */
    private function weapons(Player $player): array
    {
        $kills = OfficeFpsKill::query()->where('killer_id', $player->id)->groupBy('weapon')->pluck(DB::raw('COUNT(*)'), 'weapon');
        $deaths = OfficeFpsKill::query()->where('victim_id', $player->id)->groupBy('weapon')->pluck(DB::raw('COUNT(*)'), 'weapon');

        return collect(OfficeFpsKill::WEAPONS)
            ->mapWithKeys(fn (string $weapon) => [$weapon => [
                'kills' => (int) ($kills[$weapon] ?? 0),
                'deaths' => (int) ($deaths[$weapon] ?? 0),
            ]])
            ->reject(fn (array $counts, string $weapon) => in_array($weapon, OfficeFpsKill::RETIRED_WEAPONS, true)
                && $counts['kills'] + $counts['deaths'] === 0)
            ->all();
    }

    /**
     * The other players they meet most on one side of a kill: as killers (`victim_id` is them,
     * their nemeses) or as victims (`killer_id` is them).
     *
     * @return Collection<int, array{player: Player, count: int}>
     */
    private function rivals(string $theirSide, string $otherSide, Player $player): Collection
    {
        $counts = OfficeFpsKill::query()
            ->where($theirSide, $player->id)
            ->whereNotNull($otherSide)
            ->where($otherSide, '!=', $player->id)
            ->groupBy($otherSide)
            ->orderByDesc('count')
            ->limit(3)
            ->get([$otherSide, DB::raw('COUNT(*) as count')]);
        $players = Player::whereIn('id', $counts->pluck($otherSide))->get()->keyBy('id');

        return $counts
            ->filter(fn ($row) => isset($players[$row->{$otherSide}]))
            ->map(fn ($row) => ['player' => $players[$row->{$otherSide}], 'count' => (int) $row->count])
            ->values();
    }

    private function rankOf(Player $player): ?int
    {
        $index = $this->leaderboard()->search(fn (array $row) => $row['player_id'] === $player->id);

        return $index === false ? null : $index + 1;
    }

    /** Kills per death (kills alone when never killed). */
    private function ratio(int $kills, int $deaths): float
    {
        return round($deaths === 0 ? $kills : $kills / $deaths, 2);
    }

    private function percent(int $part, int $whole): float
    {
        return $whole === 0 ? 0.0 : round($part / $whole * 100, 1);
    }
}
