<?php

namespace App\Games\Archery\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\Archery\Models\ArcheryGame;
use App\Models\Player;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class WeeklyBestProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'archery';
    }

    public function getGameModeSlug(): string
    {
        return 'weekly-best';
    }

    public function getLeaderboard(): Collection
    {
        $startDate = now()->startOfWeek();
        $endDate = now()->endOfWeek();

        return ArcheryGame::query()
            ->select(
                'player_id',
                DB::raw('COUNT(*) as games_played'),
                DB::raw('SUM(total_score) as total_score'),
                DB::raw('ROUND(AVG(total_score), 2) as avg_score'),
                DB::raw('MAX(total_score) as best_game')
            )
            ->whereBetween('created_at', [$startDate, $endDate])
            ->groupBy('player_id')
            ->get()
            ->map(function ($item) {
                $player = Player::find($item->player_id);
                return [
                    'player_id' => $item->player_id,
                    'player_name' => $player->name,
                    'best_game' => $item->best_game,
                    'avg_score' => $item->avg_score,
                    'games_played' => $item->games_played,
                    'total_score' => $item->total_score,
                ];
            })
            ->sort(function ($a, $b) {
                if ($b['best_game'] !== $a['best_game']) {
                    return $b['best_game'] <=> $a['best_game'];
                }
                return $b['avg_score'] <=> $a['avg_score'];
            })
            ->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $startDate = now()->startOfWeek();
        $endDate = now()->endOfWeek();

        $stats = ArcheryGame::query()
            ->select(
                DB::raw('COUNT(*) as games_played'),
                DB::raw('SUM(total_score) as total_score'),
                DB::raw('ROUND(AVG(total_score), 2) as avg_score'),
                DB::raw('MAX(total_score) as best_game')
            )
            ->where('player_id', $playerId)
            ->whereBetween('created_at', [$startDate, $endDate])
            ->first();

        if (!$stats || $stats->games_played == 0) {
            return null;
        }

        return [
            'Best Game' => $stats->best_game,
            'Avg Score' => $stats->avg_score,
            'Games' => $stats->games_played,
            'Total' => $stats->total_score,
        ];
    }
}
