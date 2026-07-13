<?php

namespace App\Games\Putter\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\Putter\Models\PutterGame;
use App\Models\Player;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CareerMakePercentageProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'putter';
    }

    public function getGameModeSlug(): string
    {
        return 'career-make-percentage';
    }

    public function getLeaderboard(): Collection
    {
        return PutterGame::query()
            ->select(
                'player_id',
                DB::raw('COUNT(*) as games_played'),
                DB::raw('SUM(makes) as total_makes'),
                DB::raw('SUM(balls) as total_balls')
            )
            ->groupBy('player_id')
            ->get()
            ->map(function ($item) {
                $player = Player::find($item->player_id);

                return [
                    'player_id' => $item->player_id,
                    'player_name' => $player->name,
                    'make_pct' => round($item->total_makes / $item->total_balls * 100, 1),
                    'total_makes' => (int) $item->total_makes,
                    'total_balls' => (int) $item->total_balls,
                    'games_played' => $item->games_played,
                ];
            })
            ->sortByDesc('make_pct')
            ->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $stats = PutterGame::query()
            ->select(
                DB::raw('COUNT(*) as games_played'),
                DB::raw('SUM(makes) as total_makes'),
                DB::raw('SUM(balls) as total_balls')
            )
            ->where('player_id', $playerId)
            ->first();

        if (! $stats || $stats->games_played == 0) {
            return null;
        }

        return [
            'Make %' => round($stats->total_makes / $stats->total_balls * 100, 1),
            'Makes' => (int) $stats->total_makes,
            'Balls' => (int) $stats->total_balls,
            'Rounds' => $stats->games_played,
        ];
    }
}
