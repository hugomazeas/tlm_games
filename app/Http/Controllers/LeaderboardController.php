<?php

namespace App\Http\Controllers;

use App\Models\GameMode;
use App\Models\GameType;
use App\Services\LeaderboardService;

class LeaderboardController extends Controller
{
    public function index()
    {
        return view('leaderboards.index', [
            'gameTypes' => GameType::all(),
        ]);
    }

    public function show(GameType $gameType)
    {
        $modes = $gameType->gameModes()->active()->orderBy('sort_order')->get();

        return view('leaderboards.show', [
            'gameType' => $gameType,
            'modes' => $modes,
        ]);
    }

    public function mode(GameType $gameType, string $modeSlug, LeaderboardService $leaderboard)
    {
        $gameMode = $gameType->gameModes()
            ->where('slug', $modeSlug)
            ->firstOrFail();

        $entries = $leaderboard->getLeaderboard($gameType->slug, $modeSlug);
        $columns = $gameMode->leaderboard_columns ?? [];

        return view('leaderboards.mode', [
            'gameType' => $gameType,
            'gameMode' => $gameMode,
            'entries' => $entries,
            'columns' => $columns,
        ]);
    }
}
