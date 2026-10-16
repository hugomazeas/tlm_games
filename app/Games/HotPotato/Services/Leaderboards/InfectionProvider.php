<?php

namespace App\Games\HotPotato\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Models\Player;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Infection: ranks players by games they stayed clean in, then by how often. */
class InfectionProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'hot-potato';
    }

    public function getGameModeSlug(): string
    {
        return 'infection';
    }

    public function getLeaderboard(): Collection
    {
        $rows = $this->totals()->groupBy('player_id')->get();
        $names = Player::whereIn('id', $rows->pluck('player_id'))->pluck('name', 'id');

        return $rows
            ->map(fn ($row) => [
                'player_id' => (int) $row->player_id,
                'player_name' => $names[$row->player_id] ?? '?',
                'survivals' => (int) $row->survivals,
                'survival_pct' => $row->games_played > 0 ? (int) round($row->survivals / $row->games_played * 100) : 0,
                'games_played' => (int) $row->games_played,
                'infections' => (int) $row->infections,
            ])
            ->sort(fn ($a, $b) => [$b['survivals'], $b['survival_pct']] <=> [$a['survivals'], $a['survival_pct']])
            ->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $stats = $this->totals()->where('player_id', $playerId)->first();

        if (! $stats || (int) $stats->games_played === 0) {
            return null;
        }

        return [
            'Stayed clean' => (int) $stats->survivals,
            'Clean %' => (int) round($stats->survivals / $stats->games_played * 100),
            'Games' => (int) $stats->games_played,
            'Infected others' => (int) $stats->infections,
        ];
    }

    /** "Survived" is staying clean (or being the last caught); passes are the people you infected. */
    private function totals()
    {
        return HotPotatoGamePlayer::query()->inMode(HotPotatoGame::MODE_INFECTION)->select(
            'player_id',
            DB::raw('COUNT(*) as games_played'),
            DB::raw('SUM(CASE WHEN survived THEN 1 ELSE 0 END) as survivals'),
            DB::raw('SUM(passes) as infections'),
        );
    }
}
