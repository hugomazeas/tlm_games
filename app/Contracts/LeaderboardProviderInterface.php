<?php

namespace App\Contracts;

use Illuminate\Support\Collection;

interface LeaderboardProviderInterface
{
    /**
     * Get the game type slug this provider handles.
     */
    public function getGameTypeSlug(): string;

    /**
     * Get the game mode slug this provider handles.
     */
    public function getGameModeSlug(): string;

    /**
     * Get leaderboard entries for the game mode.
     *
     * Each entry should be an array with keys matching the
     * leaderboard_columns defined on the GameMode, plus:
     * - 'player_id' => int
     * - 'player_name' => string
     *
     * @return Collection<int, array>
     */
    public function getLeaderboard(): Collection;

    /**
     * Get leaderboard stats for a specific player.
     *
     * @return array|null Keyed by column label, or null if player has no data
     */
    public function getPlayerStats(int $playerId): ?array;
}
