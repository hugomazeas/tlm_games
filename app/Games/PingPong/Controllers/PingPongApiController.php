<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Services\EloService;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PingPongApiController extends Controller
{
    public function __construct(
        private EloService $eloService
    ) {}

    public function players(): JsonResponse
    {
        $playerIds = PingPongMatch::select('player_left_id')
            ->selectRaw('MAX(COALESCE(ended_at, started_at, created_at)) as last_activity')
            ->groupBy('player_left_id')
            ->pluck('last_activity', 'player_left_id')
            ->union(
                PingPongMatch::select('player_right_id')
                    ->selectRaw('MAX(COALESCE(ended_at, started_at, created_at)) as last_activity')
                    ->groupBy('player_right_id')
                    ->pluck('last_activity', 'player_right_id')
            );

        $activityMap = [];
        foreach ($playerIds as $id => $activity) {
            if (!isset($activityMap[$id]) || $activity > $activityMap[$id]) {
                $activityMap[$id] = $activity;
            }
        }

        $players = Player::orderBy('name')->get()->map(function ($player) use ($activityMap) {
            $rating = PingPongRating::where('player_id', $player->id)->first();

            return [
                'id' => $player->id,
                'name' => $player->name,
                'elo_rating' => $rating ? $rating->elo_rating : 1200,
                'last_activity' => $activityMap[$player->id] ?? null,
            ];
        });

        return response()->json(
            $players->sortByDesc('last_activity')->values()
        );
    }

    public function leaderboard(): JsonResponse
    {
        $playerIds = PingPongMatch::whereNotNull('ended_at')
            ->select('player_left_id')
            ->distinct()
            ->pluck('player_left_id')
            ->merge(
                PingPongMatch::whereNotNull('ended_at')
                    ->select('player_right_id')
                    ->distinct()
                    ->pluck('player_right_id')
            )
            ->unique();

        $entries = $playerIds->map(function ($playerId) {
            $player = Player::find($playerId);
            if (!$player) {
                return null;
            }

            $rating = PingPongRating::where('player_id', $playerId)->first();
            $elo = $rating ? $rating->elo_rating : 1200;

            $wins = PingPongMatch::where('winner_id', $playerId)
                ->whereNotNull('ended_at')
                ->count();

            $totalGames = PingPongMatch::whereNotNull('ended_at')
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
                'win_rate' => $winRate,
                'games_played' => $totalGames,
            ];
        })
        ->filter()
        ->sortByDesc('elo_rating')
        ->values();

        return response()->json($entries);
    }

    public function createMatch(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'player_left_id' => 'required|exists:players,id',
            'player_right_id' => 'required|exists:players,id|different:player_left_id',
            'first_server_id' => 'required|exists:players,id',
        ]);

        $match = PingPongMatch::create([
            'player_left_id' => $validated['player_left_id'],
            'player_right_id' => $validated['player_right_id'],
            'player_left_score' => 0,
            'player_right_score' => 0,
            'current_server_id' => $validated['first_server_id'],
            'serve_count' => 0,
            'started_at' => now(),
        ]);

        $match->load(['playerLeft', 'playerRight', 'currentServer']);

        return response()->json($match, 201);
    }

    public function updateScore(Request $request, int $id): JsonResponse
    {
        $match = PingPongMatch::findOrFail($id);

        if ($match->is_complete) {
            return response()->json(['error' => 'Match is already complete'], 422);
        }

        $validated = $request->validate([
            'side' => 'required|in:left,right',
            'action' => 'required|in:increment,decrement',
        ]);

        $scoreField = $validated['side'] === 'left' ? 'player_left_score' : 'player_right_score';

        if ($validated['action'] === 'increment') {
            $match->$scoreField += 1;
        } else {
            $match->$scoreField = max(0, $match->$scoreField - 1);
        }

        $match->updateServer();

        $winnerId = $match->checkWinCondition();
        $eloChanges = null;

        if ($winnerId) {
            $match->winner_id = $winnerId;
            $match->ended_at = now();
            $match->save();
            $eloChanges = $this->eloService->applyMatchResult($match);
        } else {
            $match->save();
        }

        $match->load(['playerLeft', 'playerRight', 'currentServer', 'winner']);

        $response = $match->toArray();
        $response['duration'] = $match->duration;
        $response['duration_formatted'] = $match->duration_formatted;
        $response['is_complete'] = $match->is_complete;

        if ($eloChanges) {
            $response['elo_changes'] = $eloChanges;
        }

        return response()->json($response);
    }

    public function rematch(int $id): JsonResponse
    {
        $previousMatch = PingPongMatch::findOrFail($id);

        if (!$previousMatch->is_complete) {
            return response()->json(['error' => 'Previous match is not complete'], 422);
        }

        $match = PingPongMatch::create([
            'player_left_id' => $previousMatch->player_left_id,
            'player_right_id' => $previousMatch->player_right_id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'current_server_id' => $previousMatch->player_left_id,
            'serve_count' => 0,
            'started_at' => now(),
        ]);

        $match->load(['playerLeft', 'playerRight', 'currentServer']);

        return response()->json($match, 201);
    }

    public function playerStatsApi(int $id): JsonResponse
    {
        $player = Player::findOrFail($id);

        $rating = PingPongRating::where('player_id', $id)->first();
        $elo = $rating ? $rating->elo_rating : 1200;

        $wins = PingPongMatch::where('winner_id', $id)
            ->whereNotNull('ended_at')
            ->count();

        $totalGames = PingPongMatch::whereNotNull('ended_at')
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id);
            })
            ->count();

        $losses = $totalGames - $wins;
        $winRate = $totalGames > 0 ? round(($wins / $totalGames) * 100) : 0;

        $avgDuration = PingPongMatch::whereNotNull('ended_at')
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id);
            })
            ->selectRaw('AVG(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) as avg_duration')
            ->value('avg_duration');

        $avgDurationFormatted = null;
        if ($avgDuration) {
            $avgSeconds = (int) round($avgDuration);
            $avgDurationFormatted = sprintf('%d:%02d', floor($avgSeconds / 60), $avgSeconds % 60);
        }

        // Current streak
        $recentMatches = PingPongMatch::whereNotNull('ended_at')
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id);
            })
            ->orderBy('ended_at', 'desc')
            ->get();

        $streak = 0;
        $streakType = null;
        foreach ($recentMatches as $match) {
            $won = $match->winner_id === $id;
            if ($streakType === null) {
                $streakType = $won ? 'W' : 'L';
            }
            if (($streakType === 'W' && $won) || ($streakType === 'L' && !$won)) {
                $streak++;
            } else {
                break;
            }
        }

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'elo_rating' => $elo,
            'wins' => $wins,
            'losses' => $losses,
            'win_rate' => $winRate,
            'games_played' => $totalGames,
            'avg_duration' => $avgDurationFormatted,
            'streak' => $streak,
            'streak_type' => $streakType,
        ]);
    }

    public function playerMatches(int $id): JsonResponse
    {
        $player = Player::findOrFail($id);

        $matches = PingPongMatch::whereNotNull('ended_at')
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id);
            })
            ->with(['playerLeft', 'playerRight', 'winner'])
            ->orderBy('ended_at', 'desc')
            ->get()
            ->map(function ($match) use ($id) {
                $isLeft = $match->player_left_id === $id;
                $opponent = $isLeft ? $match->playerRight : $match->playerLeft;
                $playerScore = $isLeft ? $match->player_left_score : $match->player_right_score;
                $opponentScore = $isLeft ? $match->player_right_score : $match->player_left_score;
                $won = $match->winner_id === $id;

                return [
                    'id' => $match->id,
                    'opponent' => ['id' => $opponent->id, 'name' => $opponent->name],
                    'player_score' => $playerScore,
                    'opponent_score' => $opponentScore,
                    'won' => $won,
                    'duration_formatted' => $match->duration_formatted,
                    'ended_at' => $match->ended_at->toIso8601String(),
                    'ended_at_human' => $match->ended_at->diffForHumans(),
                ];
            });

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'matches' => $matches,
        ]);
    }

    public function headToHead(int $id): JsonResponse
    {
        $player = Player::findOrFail($id);

        $completedMatches = PingPongMatch::whereNotNull('ended_at')
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id);
            })
            ->with(['playerLeft', 'playerRight'])
            ->get();

        $h2h = [];
        foreach ($completedMatches as $match) {
            $isLeft = $match->player_left_id === $id;
            $opponentId = $isLeft ? $match->player_right_id : $match->player_left_id;
            $opponent = $isLeft ? $match->playerRight : $match->playerLeft;
            $won = $match->winner_id === $id;

            if (!isset($h2h[$opponentId])) {
                $h2h[$opponentId] = [
                    'opponent' => ['id' => $opponent->id, 'name' => $opponent->name],
                    'wins' => 0,
                    'losses' => 0,
                ];
            }

            if ($won) {
                $h2h[$opponentId]['wins']++;
            } else {
                $h2h[$opponentId]['losses']++;
            }
        }

        $records = collect(array_values($h2h))->sortByDesc(function ($r) {
            return $r['wins'] + $r['losses'];
        })->values();

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'records' => $records,
        ]);
    }
}
