<?php

namespace App\Games\HotPotato\Services;

use App\Games\HotPotato\Models\HotPotatoGame;
use Illuminate\Support\Facades\Storage;

/**
 * Keeps only the newest replays of each office (games with no office count as
 * one more): older games lose their file, never their results.
 */
class ReplayPruner
{
    public function prune(?int $officeId): int
    {
        $keep = (int) config('games.hot_potato.replays_per_office', 100);

        // where(…, null) is whereNull: games with no office prune among themselves.
        $stale = HotPotatoGame::query()
            ->whereNotNull('replay_path')
            ->where('office_id', $officeId)
            ->orderByDesc('id')
            ->get(['id', 'replay_path'])
            ->slice($keep);

        foreach ($stale as $game) {
            Storage::disk('local')->delete($game->replay_path);
            $game->update(['replay_path' => null]);
        }

        return $stale->count();
    }
}
