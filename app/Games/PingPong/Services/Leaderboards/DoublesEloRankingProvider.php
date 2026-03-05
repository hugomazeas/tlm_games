<?php

namespace App\Games\PingPong\Services\Leaderboards;

use App\Contracts\LeaderboardProviderInterface;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Models\Player;
use Illuminate\Support\Collection;

class DoublesEloRankingProvider implements LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string
    {
        return 'ping-pong';
    }

    public function getGameModeSlug(): string
    {
        return 'doubles-elo-ranking';
    }

    public function getLeaderboard(): Collection
    {
        $query = PingPongMatch::whereNotNull('ended_at')->where('mode', '2v2');

        $playerIds = (clone $query)->select('player_left_id')->distinct()->pluck('player_left_id')
            ->merge((clone $query)->select('player_right_id')->distinct()->pluck('player_right_id'))
            ->merge((clone $query)->whereNotNull('team_left_player2_id')->select('team_left_player2_id')->distinct()->pluck('team_left_player2_id'))
            ->merge((clone $query)->whereNotNull('team_right_player2_id')->select('team_right_player2_id')->distinct()->pluck('team_right_player2_id'))
            ->unique();

        return $playerIds->map(function ($playerId) {
            $player = Player::find($playerId);
            if (!$player) {
                return null;
            }

            $rating = PingPongRating::where('player_id', $playerId)->where('mode', '2v2')->first();
            $elo = $rating ? $rating->elo_rating : 1200;

            $totalGames = PingPongMatch::whereNotNull('ended_at')
                ->where('mode', '2v2')
                ->where(function ($q) use ($playerId) {
                    $q->where('player_left_id', $playerId)
                      ->orWhere('player_right_id', $playerId)
                      ->orWhere('team_left_player2_id', $playerId)
                      ->orWhere('team_right_player2_id', $playerId);
                })
                ->count();

            $wins = PingPongMatch::whereNotNull('ended_at')
                ->where('mode', '2v2')
                ->whereNotNull('winner_id')
                ->where(function ($q) use ($playerId) {
                    $q->where(function ($q2) use ($playerId) {
                        $q2->whereColumn('winner_id', 'player_left_id')
                            ->where(function ($q3) use ($playerId) {
                                $q3->where('player_left_id', $playerId)
                                   ->orWhere('team_left_player2_id', $playerId);
                            });
                    })
                    ->orWhere(function ($q2) use ($playerId) {
                        $q2->whereColumn('winner_id', 'player_right_id')
                            ->where(function ($q3) use ($playerId) {
                                $q3->where('player_right_id', $playerId)
                                   ->orWhere('team_right_player2_id', $playerId);
                            });
                    });
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
            ->where('mode', '2v2')
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId)
                  ->orWhere('team_left_player2_id', $playerId)
                  ->orWhere('team_right_player2_id', $playerId);
            })
            ->count();

        if ($totalGames === 0) {
            return null;
        }

        $rating = PingPongRating::where('player_id', $playerId)->where('mode', '2v2')->first();
        $elo = $rating ? $rating->elo_rating : 1200;

        $wins = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', '2v2')
            ->whereNotNull('winner_id')
            ->where(function ($q) use ($playerId) {
                $q->where(function ($q2) use ($playerId) {
                    $q2->whereColumn('winner_id', 'player_left_id')
                        ->where(function ($q3) use ($playerId) {
                            $q3->where('player_left_id', $playerId)
                               ->orWhere('team_left_player2_id', $playerId);
                        });
                })
                ->orWhere(function ($q2) use ($playerId) {
                    $q2->whereColumn('winner_id', 'player_right_id')
                        ->where(function ($q3) use ($playerId) {
                            $q3->where('player_right_id', $playerId)
                               ->orWhere('team_right_player2_id', $playerId);
                        });
                });
            })
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
