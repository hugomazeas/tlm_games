<?php

namespace App\Games\OfficeFps\Services;

use App\Contracts\LeaderboardProviderInterface;
use Illuminate\Support\Collection;

/** The office FPS leaderboard: kills, then K/D (also the home page card's podium). */
class OfficeFpsLeaderboardProvider implements LeaderboardProviderInterface
{
    public function __construct(private OfficeFpsStats $stats) {}

    public function getGameTypeSlug(): string
    {
        return 'office-fps';
    }

    public function getGameModeSlug(): string
    {
        return 'kills';
    }

    public function getLeaderboard(): Collection
    {
        return $this->stats->leaderboard();
    }

    public function getPlayerStats(int $playerId): ?array
    {
        $row = $this->stats->leaderboard()->firstWhere('player_id', $playerId);
        if ($row === null) {
            return null;
        }

        return [
            'Kills' => $row['kills'],
            'K/D' => $row['kd'],
            'Wins' => $row['wins'],
            'Matches' => $row['matches'],
            'Accuracy %' => $row['accuracy'],
        ];
    }
}
