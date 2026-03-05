<?php

namespace App\Games\PingPong\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Models\Player;
use Illuminate\Support\Collection;

class EloRankingProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'ping-pong';
    }

    public function getGameModeSlug(): string
    {
        return 'elo-ranking';
    }

    public function getLeaderboard(): Collection
    {
        $playerIds = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', '1v1')
            ->select('player_left_id')
            ->distinct()
            ->pluck('player_left_id')
            ->merge(
                PingPongMatch::whereNotNull('ended_at')
                    ->where('mode', '1v1')
                    ->select('player_right_id')
                    ->distinct()
                    ->pluck('player_right_id')
            )
            ->unique();

        return $playerIds->map(function ($playerId) {
            $player = Player::find($playerId);
            if (!$player) {
                return null;
            }

            $rating = PingPongRating::where('player_id', $playerId)->where('mode', '1v1')->first();
            $elo = $rating ? $rating->elo_rating : 1200;

            $wins = PingPongMatch::where('winner_id', $playerId)
                ->where('mode', '1v1')
                ->whereNotNull('ended_at')
                ->count();

            $totalGames = PingPongMatch::whereNotNull('ended_at')
                ->where('mode', '1v1')
                ->where(function ($q) use ($playerId) {
                    $q->where('player_left_id', $playerId)
                      ->orWhere('player_right_id', $playerId);
                })
                ->count();

            $losses = $totalGames - $wins;
            $winRate = $totalGames > 0 ? round(($wins / $totalGames) * 100) : 0;

            return [
                'player_id' => $playerId,
                'player_name' => $player->name,
                'elo_rating' => $elo,
                'wins' => $wins,
                'losses' => $losses,
                'win_rate' => $winRate . '%',
                'games_played' => $totalGames,
            ];
        })
        ->filter()
        ->sortByDesc('elo_rating')
        ->values();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $totalGames = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', '1v1')
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId);
            })
            ->count();

        if ($totalGames === 0) {
            return null;
        }

        $rating = PingPongRating::where('player_id', $playerId)->where('mode', '1v1')->first();
        $elo = $rating ? $rating->elo_rating : 1200;

        $wins = PingPongMatch::where('winner_id', $playerId)
            ->where('mode', '1v1')
            ->whereNotNull('ended_at')
            ->count();

        $losses = $totalGames - $wins;
        $winRate = $totalGames > 0 ? round(($wins / $totalGames) * 100) : 0;

        return [
            'ELO' => $elo,
            'Wins' => $wins,
            'Losses' => $losses,
            'Win %' => $winRate . '%',
            'Games' => $totalGames,
        ];
    }
}
