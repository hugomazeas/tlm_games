<?php

namespace App\Http\Controllers;

use App\Models\GameMode;
use App\Models\GameType;
use App\Models\Player;
use App\Services\LeaderboardService;

class HomeController extends Controller
{
    public function index(LeaderboardService $leaderboardService)
    {
        $gameTypes = GameType::all();

        // Build top-3 leaderboard preview per game (using the first mode of each game)
        $gameLeaderboards = [];
        foreach ($gameTypes->where('is_active', true) as $game) {
            $providers = $leaderboardService->getProvidersForGameType($game->slug);
            if (!empty($providers)) {
                $firstProvider = reset($providers);
                $entries = $firstProvider->getLeaderboard()->take(3);
                $mode = GameMode::where('game_type_id', $game->id)
                    ->where('slug', $firstProvider->getGameModeSlug())
                    ->first();
                $primaryColumn = $mode && !empty($mode->leaderboard_columns)
                    ? $mode->leaderboard_columns[0]
                    : null;

                $gameLeaderboards[$game->slug] = [
                    'entries' => $entries,
                    'mode_slug' => $firstProvider->getGameModeSlug(),
                    'mode_name' => $mode?->name,
                    'primary_column' => $primaryColumn,
                ];
            }
        }

        return view('home', [
            'gameTypes' => $gameTypes,
            'gameLeaderboards' => $gameLeaderboards,
            'playerCount' => Player::count(),
            'activeGameCount' => GameType::active()->count(),
        ]);
    }
}
