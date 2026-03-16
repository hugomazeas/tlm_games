<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\MatchScoreUpdated;
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

    public function players(Request $request): JsonResponse
    {
        $mode = $request->query('mode', '1v1');

        $playerIds = PingPongMatch::where('mode', $mode)
            ->select('player_left_id')
            ->selectRaw('MAX(COALESCE(ended_at, started_at, created_at)) as last_activity')
            ->groupBy('player_left_id')
            ->pluck('last_activity', 'player_left_id')
            ->union(
                PingPongMatch::where('mode', $mode)
                    ->select('player_right_id')
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

        $players = Player::orderBy('name')->get()->map(function ($player) use ($activityMap, $mode) {
            $rating = PingPongRating::where('player_id', $player->id)->where('mode', $mode)->first();

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

    public function leaderboard(Request $request): JsonResponse
    {
        $mode = $request->query('mode', '1v1');

        $query = PingPongMatch::whereNotNull('ended_at')->where('mode', $mode);

        $playerIds = (clone $query)->select('player_left_id')->distinct()->pluck('player_left_id')
            ->merge((clone $query)->select('player_right_id')->distinct()->pluck('player_right_id'));

        if ($mode === '2v2') {
            $playerIds = $playerIds
                ->merge((clone $query)->whereNotNull('team_left_player2_id')->select('team_left_player2_id')->distinct()->pluck('team_left_player2_id'))
                ->merge((clone $query)->whereNotNull('team_right_player2_id')->select('team_right_player2_id')->distinct()->pluck('team_right_player2_id'));
        }

        $playerIds = $playerIds->unique();

        $entries = $playerIds->map(function ($playerId) use ($mode) {
            $player = Player::find($playerId);
            if (!$player) {
                return null;
            }

            $rating = PingPongRating::where('player_id', $playerId)->where('mode', $mode)->first();
            $elo = $rating ? $rating->elo_rating : 1200;

            $totalGames = PingPongMatch::whereNotNull('ended_at')
                ->where('mode', $mode)
                ->where(function ($q) use ($playerId) {
                    $q->where('player_left_id', $playerId)
                      ->orWhere('player_right_id', $playerId)
                      ->orWhere('team_left_player2_id', $playerId)
                      ->orWhere('team_right_player2_id', $playerId);
                })
                ->count();

            // Wins: player was on the winning side
            $wins = PingPongMatch::whereNotNull('ended_at')
                ->where('mode', $mode)
                ->whereNotNull('winner_id')
                ->where(function ($q) use ($playerId) {
                    // Left team won and player was on left team
                    $q->where(function ($q2) use ($playerId) {
                        $q2->whereColumn('winner_id', 'player_left_id')
                            ->where(function ($q3) use ($playerId) {
                                $q3->where('player_left_id', $playerId)
                                   ->orWhere('team_left_player2_id', $playerId);
                            });
                    })
                    // Right team won and player was on right team
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
                'win_rate' => $winRate,
                'games_played' => $totalGames,
            ];
        })
        ->filter()
        ->sortByDesc('elo_rating')
        ->values();

        return response()->json($entries);
    }

    public function getMatch(int $id): JsonResponse
    {
        $match = PingPongMatch::with(['playerLeft', 'playerRight', 'currentServer', 'winner', 'teamLeftPlayer2', 'teamRightPlayer2'])
            ->findOrFail($id);

        $response = $match->toArray();
        $response['duration'] = $match->duration;
        $response['duration_formatted'] = $match->duration_formatted;
        $response['is_complete'] = $match->is_complete;
        $response['left_remote_connected'] = $match->left_remote_connected_at !== null;
        $response['right_remote_connected'] = $match->right_remote_connected_at !== null;

        if ($match->is_complete && $match->player_left_elo_before !== null) {
            if ($match->isDoubles()) {
                $leftChange = $match->player_left_elo_after - $match->player_left_elo_before;
                $rightChange = $match->player_right_elo_after - $match->player_right_elo_before;

                $teamLeftAvg = (int) round(($match->player_left_elo_before + $match->team_left_player2_elo_before) / 2);
                $teamRightAvg = (int) round(($match->player_right_elo_before + $match->team_right_player2_elo_before) / 2);

                $response['elo_changes'] = [
                    'left' => [
                        'team_avg_before' => $teamLeftAvg,
                        'team_avg_after' => $teamLeftAvg + $leftChange,
                        'change' => $leftChange,
                        'player1' => ['before' => $match->player_left_elo_before, 'after' => $match->player_left_elo_after],
                        'player2' => ['before' => $match->team_left_player2_elo_before, 'after' => $match->team_left_player2_elo_after],
                    ],
                    'right' => [
                        'team_avg_before' => $teamRightAvg,
                        'team_avg_after' => $teamRightAvg + $rightChange,
                        'change' => $rightChange,
                        'player1' => ['before' => $match->player_right_elo_before, 'after' => $match->player_right_elo_after],
                        'player2' => ['before' => $match->team_right_player2_elo_before, 'after' => $match->team_right_player2_elo_after],
                    ],
                ];
            } else {
                $response['elo_changes'] = [
                    'left' => [
                        'before' => $match->player_left_elo_before,
                        'after' => $match->player_left_elo_after,
                        'change' => $match->player_left_elo_after - $match->player_left_elo_before,
                    ],
                    'right' => [
                        'before' => $match->player_right_elo_before,
                        'after' => $match->player_right_elo_after,
                        'change' => $match->player_right_elo_after - $match->player_right_elo_before,
                    ],
                ];
            }
        }

        return response()->json($response);
    }

    public function createMatch(Request $request): JsonResponse
    {
        $mode = $request->input('mode', '1v1');

        $rules = [
            'mode' => 'sometimes|in:1v1,2v2',
            'player_left_id' => 'required|exists:players,id',
            'player_right_id' => 'required|exists:players,id|different:player_left_id',
            'first_server_id' => 'required|exists:players,id',
        ];

        if ($mode === '2v2') {
            $rules['team_left_player2_id'] = 'required|exists:players,id|different:player_left_id|different:player_right_id';
            $rules['team_right_player2_id'] = 'required|exists:players,id|different:player_left_id|different:player_right_id|different:team_left_player2_id';
        }

        $validated = $request->validate($rules);

        $matchData = [
            'mode' => $mode,
            'player_left_id' => $validated['player_left_id'],
            'player_right_id' => $validated['player_right_id'],
            'player_left_score' => 0,
            'player_right_score' => 0,
            'current_server_id' => $validated['first_server_id'],
            'serve_count' => 0,
            'started_at' => now(),
        ];

        if ($mode === '2v2') {
            $matchData['team_left_player2_id'] = $validated['team_left_player2_id'];
            $matchData['team_right_player2_id'] = $validated['team_right_player2_id'];
        }

        $match = PingPongMatch::create($matchData);

        $match->load(['playerLeft', 'playerRight', 'currentServer', 'teamLeftPlayer2', 'teamRightPlayer2']);

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

        $match->load(['playerLeft', 'playerRight', 'currentServer', 'winner', 'teamLeftPlayer2', 'teamRightPlayer2']);

        broadcast(new MatchScoreUpdated($match));

        $response = $match->toArray();
        $response['duration'] = $match->duration;
        $response['duration_formatted'] = $match->duration_formatted;
        $response['is_complete'] = $match->is_complete;

        if ($eloChanges) {
            $response['elo_changes'] = $eloChanges;
        }

        return response()->json($response);
    }

    public function connectRemote(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'side' => 'required|in:left,right',
        ]);

        $match = PingPongMatch::findOrFail($id);

        $field = $validated['side'] === 'left' ? 'left_remote_connected_at' : 'right_remote_connected_at';

        if ($match->$field === null) {
            $match->$field = now();
            $match->save();
        }

        return response()->json([
            'connected' => true,
            'left_remote_connected' => $match->left_remote_connected_at !== null,
            'right_remote_connected' => $match->right_remote_connected_at !== null,
        ]);
    }

    public function rematch(int $id): JsonResponse
    {
        $previousMatch = PingPongMatch::findOrFail($id);

        if (!$previousMatch->is_complete) {
            return response()->json(['error' => 'Previous match is not complete'], 422);
        }

        $matchData = [
            'mode' => $previousMatch->mode,
            'player_left_id' => $previousMatch->player_left_id,
            'player_right_id' => $previousMatch->player_right_id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'current_server_id' => $previousMatch->player_left_id,
            'serve_count' => 0,
            'started_at' => now(),
        ];

        if ($previousMatch->isDoubles()) {
            $matchData['team_left_player2_id'] = $previousMatch->team_left_player2_id;
            $matchData['team_right_player2_id'] = $previousMatch->team_right_player2_id;
        }

        $match = PingPongMatch::create($matchData);

        $match->load(['playerLeft', 'playerRight', 'currentServer', 'teamLeftPlayer2', 'teamRightPlayer2']);

        return response()->json($match, 201);
    }

    public function playerStatsApi(Request $request, int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $mode = $request->query('mode', '1v1');

        $rating = PingPongRating::where('player_id', $id)->where('mode', $mode)->first();
        $elo = $rating ? $rating->elo_rating : 1200;

        $totalGames = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
            })
            ->count();

        $wins = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->whereNotNull('winner_id')
            ->where(function ($q) use ($id) {
                $q->where(function ($q2) use ($id) {
                    $q2->whereColumn('winner_id', 'player_left_id')
                        ->where(function ($q3) use ($id) {
                            $q3->where('player_left_id', $id)
                               ->orWhere('team_left_player2_id', $id);
                        });
                })
                ->orWhere(function ($q2) use ($id) {
                    $q2->whereColumn('winner_id', 'player_right_id')
                        ->where(function ($q3) use ($id) {
                            $q3->where('player_right_id', $id)
                               ->orWhere('team_right_player2_id', $id);
                        });
                });
            })
            ->count();

        $losses = $totalGames - $wins;
        $winRate = $totalGames > 0 ? round(($wins / $totalGames) * 100) : 0;

        $avgDuration = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
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
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
            })
            ->orderBy('ended_at', 'desc')
            ->get();

        $streak = 0;
        $streakType = null;
        foreach ($recentMatches as $match) {
            $onLeftTeam = $match->player_left_id === $id || $match->team_left_player2_id === $id;
            $leftWon = $match->winner_id === $match->player_left_id;
            $won = ($onLeftTeam && $leftWon) || (!$onLeftTeam && !$leftWon);

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

    public function playerMatches(Request $request, int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $mode = $request->query('mode', '1v1');

        $matches = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
            })
            ->with(['playerLeft', 'playerRight', 'winner', 'teamLeftPlayer2', 'teamRightPlayer2'])
            ->orderBy('ended_at', 'desc')
            ->get()
            ->map(function ($match) use ($id) {
                $onLeftTeam = $match->player_left_id === $id || $match->team_left_player2_id === $id;
                $leftWon = $match->winner_id === $match->player_left_id;
                $won = ($onLeftTeam && $leftWon) || (!$onLeftTeam && !$leftWon);

                $playerScore = $onLeftTeam ? $match->player_left_score : $match->player_right_score;
                $opponentScore = $onLeftTeam ? $match->player_right_score : $match->player_left_score;

                if ($match->isDoubles()) {
                    $opponent = $onLeftTeam
                        ? $match->playerRight->name . ' & ' . ($match->teamRightPlayer2->name ?? '')
                        : $match->playerLeft->name . ' & ' . ($match->teamLeftPlayer2->name ?? '');
                } else {
                    $opponent = $onLeftTeam ? $match->playerRight : $match->playerLeft;
                    $opponent = ['id' => $opponent->id, 'name' => $opponent->name];
                }

                return [
                    'id' => $match->id,
                    'mode' => $match->mode,
                    'opponent' => $opponent,
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

    public function headToHead(Request $request, int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $mode = $request->query('mode', '1v1');

        $completedMatches = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
            })
            ->with(['playerLeft', 'playerRight', 'teamLeftPlayer2', 'teamRightPlayer2'])
            ->get();

        $h2h = [];
        foreach ($completedMatches as $match) {
            $onLeftTeam = $match->player_left_id === $id || $match->team_left_player2_id === $id;
            $leftWon = $match->winner_id === $match->player_left_id;
            $won = ($onLeftTeam && $leftWon) || (!$onLeftTeam && !$leftWon);

            if ($match->isDoubles()) {
                // Key by opposing team (sorted IDs for consistency)
                $oppIds = $onLeftTeam
                    ? [$match->player_right_id, $match->team_right_player2_id]
                    : [$match->player_left_id, $match->team_left_player2_id];
                sort($oppIds);
                $key = implode('-', $oppIds);

                $oppNames = $onLeftTeam
                    ? $match->playerRight->name . ' & ' . ($match->teamRightPlayer2->name ?? '')
                    : $match->playerLeft->name . ' & ' . ($match->teamLeftPlayer2->name ?? '');

                if (!isset($h2h[$key])) {
                    $h2h[$key] = ['opponent' => $oppNames, 'wins' => 0, 'losses' => 0];
                }
            } else {
                $opponentId = $onLeftTeam ? $match->player_right_id : $match->player_left_id;
                $opponent = $onLeftTeam ? $match->playerRight : $match->playerLeft;
                $key = (string) $opponentId;

                if (!isset($h2h[$key])) {
                    $h2h[$key] = [
                        'opponent' => ['id' => $opponent->id, 'name' => $opponent->name],
                        'wins' => 0,
                        'losses' => 0,
                    ];
                }
            }

            if ($won) {
                $h2h[$key]['wins']++;
            } else {
                $h2h[$key]['losses']++;
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
