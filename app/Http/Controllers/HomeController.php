<?php

namespace App\Http\Controllers;

use App\Games\Archery\Models\ArcheryGame;
use App\Games\PingPong\Models\PingPongMatch;
use App\Models\GameMode;
use App\Models\GameType;
use App\Models\Player;
use App\Services\LeaderboardService;
use Carbon\Carbon;

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

        // Recent activity
        $archeryGames = ArcheryGame::with('player')
            ->latest()
            ->take(10)
            ->get()
            ->map(fn ($game) => [
                'type' => 'archery',
                'icon' => '🎯',
                'description' => ($game->player?->name ?? 'Unknown') . ' scored ' . $game->total_score . ' points',
                'time' => $game->created_at,
                'color' => '#f59e0b',
            ]);

        $pingPongMatches = PingPongMatch::with(['playerLeft', 'playerRight', 'winner'])
            ->whereNotNull('ended_at')
            ->latest()
            ->take(10)
            ->get()
            ->map(function ($match) {
                $winner = $match->winner?->name ?? 'Unknown';
                $loser = $match->loser?->name ?? 'Unknown';
                return [
                    'type' => 'ping-pong',
                    'icon' => '🏓',
                    'description' => "{$winner} beat {$loser} ({$match->player_left_score}–{$match->player_right_score})",
                    'time' => $match->created_at,
                    'color' => '#3b82f6',
                ];
            });

        $recentActivity = $archeryGames->concat($pingPongMatches)
            ->sortByDesc('time')
            ->take(10)
            ->values();

        $totalGamesPlayed = ArcheryGame::count() + PingPongMatch::whereNotNull('ended_at')->count();
        $todayGamesCount = ArcheryGame::whereDate('created_at', Carbon::today())->count()
            + PingPongMatch::whereNotNull('ended_at')->whereDate('created_at', Carbon::today())->count();

        return view('home', [
            'gameTypes' => $gameTypes,
            'gameLeaderboards' => $gameLeaderboards,
            'playerCount' => Player::count(),
            'activeGameCount' => GameType::active()->count(),
            'recentActivity' => $recentActivity,
            'totalGamesPlayed' => $totalGamesPlayed,
            'todayGamesCount' => $todayGamesCount,
        ]);
    }
}
