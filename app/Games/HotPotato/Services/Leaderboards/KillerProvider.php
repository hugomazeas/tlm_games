<?php

namespace App\Games\HotPotato\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Models\Player;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** Killer Potato: ranks players by games they survived as prey, then by people they caught as the hunter. */
class KillerProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'hot-potato';
    }

    public function getGameModeSlug(): string
    {
        return 'killer';
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
                'catches' => (int) $row->catches,
                'games_played' => (int) $row->games_played,
            ])
            ->sort(fn ($a, $b) => [$b['survivals'], $b['catches']] <=> [$a['survivals'], $a['catches']])
            ->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $stats = $this->totals()->where('player_id', $playerId)->first();

        if (! $stats || (int) $stats->games_played === 0) {
            return null;
        }

        return [
            'Survived' => (int) $stats->survivals,
            'Catches' => (int) $stats->catches,
            'Games' => (int) $stats->games_played,
        ];
    }

    /** "Survived" is prey still standing at the end (the hunter never survives); passes are the people the hunter caught. */
    private function totals()
    {
        return HotPotatoGamePlayer::query()->inMode(HotPotatoGame::MODE_KILLER)->select(
            'player_id',
            DB::raw('COUNT(*) as games_played'),
            DB::raw('SUM(CASE WHEN survived THEN 1 ELSE 0 END) as survivals'),
            DB::raw('SUM(passes) as catches'),
        );
    }
}
