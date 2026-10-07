<?php

namespace App\Games\HotPotato\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Models\HotPotatoGamePlayer;
use App\Models\Player;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/** King of the Potato: ranks players by crowns won, then by total time holding the potato. */
class KingProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'hot-potato';
    }

    public function getGameModeSlug(): string
    {
        return 'king';
    }

    public function getLeaderboard(): Collection
    {
        $rows = $this->totals()->groupBy('player_id')->get();
        $names = Player::whereIn('id', $rows->pluck('player_id'))->pluck('name', 'id');

        return $rows
            ->map(fn ($row) => [
                'player_id' => (int) $row->player_id,
                'player_name' => $names[$row->player_id] ?? '?',
                'crowns' => (int) $row->crowns,
                'held_seconds' => (int) round($row->held_ms / 1000),
                'games_played' => (int) $row->games_played,
                'steals' => (int) $row->steals,
            ])
            ->sort(fn ($a, $b) => [$b['crowns'], $b['held_seconds']] <=> [$a['crowns'], $a['held_seconds']])
            ->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $stats = $this->totals()->where('player_id', $playerId)->first();

        if (! $stats || (int) $stats->games_played === 0) {
            return null;
        }

        return [
            'Crowns' => (int) $stats->crowns,
            'Time held' => (int) round($stats->held_ms / 1000).' s',
            'Games' => (int) $stats->games_played,
            'Steals' => (int) $stats->steals,
        ];
    }

    /** A crown is a first place: the sidecar ranks King games by time held, ties sharing first. */
    private function totals()
    {
        return HotPotatoGamePlayer::query()->inMode(HotPotatoGame::MODE_KING)->select(
            'player_id',
            DB::raw('COUNT(*) as games_played'),
            DB::raw('SUM(CASE WHEN position = 1 THEN 1 ELSE 0 END) as crowns'),
            DB::raw('SUM(hold_ms) as held_ms'),
            DB::raw('SUM(passes) as steals'),
        );
    }
}
