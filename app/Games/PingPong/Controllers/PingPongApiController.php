<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\MatchScoreUpdated;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongRatingChange;
use App\Games\PingPong\Services\EloService;
use App\Http\Controllers\Controller;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PingPongApiController extends Controller
{
    public function __construct(
        private EloService $eloService
    ) {}

    public function offices(): JsonResponse
    {
        return response()->json(
            Office::orderBy('name')->get(['id', 'name'])
        );
    }

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

        if ($request->filled('office_id')) {
            $office = Office::find($request->query('office_id'));
            if (! $office) {
                return response()->json([]);
            }
            $allowedIds = Player::where('office_id', $office->id)->pluck('id');
            $playerIds = $playerIds->intersect($allowedIds)->values();
        }

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

            $winStreak = $this->getCurrentWinStreak($playerId, $mode);
            $losingStreak = $this->getCurrentLosingStreak($playerId, $mode);

            return [
                'player_id' => $playerId,
                'player_name' => $player->name,
                'elo_rating' => $elo,
                'wins' => $wins,
                'losses' => $losses,
                'win_rate' => $winRate,
                'win_streak' => $winStreak,
                'losing_streak' => $losingStreak,
                'games_played' => $totalGames,
            ];
        })
        ->filter()
        ->sortByDesc('elo_rating')
        ->values();

        return response()->json($entries);
    }

    /**
     * Get current win streak (consecutive wins from most recent match).
     */
    private function getCurrentWinStreak(int $playerId, string $mode): int
    {
        $matches = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId)
                  ->orWhere('team_left_player2_id', $playerId)
                  ->orWhere('team_right_player2_id', $playerId);
            })
            ->orderBy('ended_at', 'desc')
            ->get();

        $streak = 0;
        foreach ($matches as $match) {
            $won = $mode === '1v1'
                ? $match->winner_id === $playerId
                : (($match->winner_id === $match->player_left_id && in_array($playerId, [$match->player_left_id, $match->team_left_player2_id], true))
                    || ($match->winner_id === $match->player_right_id && in_array($playerId, [$match->player_right_id, $match->team_right_player2_id], true)));
            if ($won) {
                $streak++;
            } else {
                break;
            }
        }

        return $streak;
    }

    /**
     * Get current losing streak (consecutive losses from most recent match).
     */
    private function getCurrentLosingStreak(int $playerId, string $mode): int
    {
        $matches = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId)
                  ->orWhere('team_left_player2_id', $playerId)
                  ->orWhere('team_right_player2_id', $playerId);
            })
            ->orderBy('ended_at', 'desc')
            ->get();

        $streak = 0;
        foreach ($matches as $match) {
            $won = $mode === '1v1'
                ? $match->winner_id === $playerId
                : (($match->winner_id === $match->player_left_id && in_array($playerId, [$match->player_left_id, $match->team_left_player2_id], true))
                    || ($match->winner_id === $match->player_right_id && in_array($playerId, [$match->player_right_id, $match->team_right_player2_id], true)));
            if (!$won) {
                $streak++;
            } else {
                break;
            }
        }

        return $streak;
    }

    public function liveMatches(): JsonResponse
    {
        $matches = PingPongMatch::whereNotNull('started_at')
            ->whereNull('ended_at')
            ->where('started_at', '>=', now()->subHour())
            ->with(['playerLeft', 'playerRight', 'currentServer', 'teamLeftPlayer2', 'teamRightPlayer2'])
            ->orderBy('started_at', 'desc')
            ->get()
            ->map(function ($match) {
                $data = $match->toArray();
                $data['is_complete'] = false;
                return $data;
            });

        return response()->json($matches);
    }

    public function getMatch(int $id): JsonResponse
    {
        $match = PingPongMatch::with(['playerLeft', 'playerRight', 'currentServer', 'winner', 'teamLeftPlayer2', 'teamRightPlayer2', 'points'])
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

            $pointNumber = $match->points()->count() + 1;
            PingPongPoint::create([
                'match_id' => $match->id,
                'scoring_side' => $validated['side'],
                'point_number' => $pointNumber,
                'left_score_after' => $match->player_left_score,
                'right_score_after' => $match->player_right_score,
            ]);
        } else {
            $match->$scoreField = max(0, $match->$scoreField - 1);

            // Remove the last recorded point if it exists
            $lastPoint = $match->points()->orderByDesc('point_number')->first();
            if ($lastPoint) {
                $lastPoint->delete();
            }
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

        if ($match->is_complete) {
            $response['points'] = $match->points()->get()->toArray();
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

        // Current streak (using existing helper methods)
        $winStreak = $this->getCurrentWinStreak($id, $mode);
        $loseStreak = $this->getCurrentLosingStreak($id, $mode);
        $streak = max($winStreak, $loseStreak);
        $streakType = $winStreak >= $loseStreak ? ($winStreak > 0 ? 'W' : null) : 'L';

        // Fetch recent matches for highest streak calculation
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

        // Avg duration when winning vs losing
        $playerMatchesQuery = fn () => PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
            });

        $winMatchIds = $playerMatchesQuery()
            ->whereNotNull('winner_id')
            ->get()
            ->filter(function ($m) use ($id) {
                $onLeft = $m->player_left_id === $id || $m->team_left_player2_id === $id;
                $leftWon = $m->winner_id === $m->player_left_id;
                return ($onLeft && $leftWon) || (!$onLeft && !$leftWon);
            })
            ->pluck('id');

        $lossMatchIds = $playerMatchesQuery()
            ->whereNotNull('winner_id')
            ->get()
            ->filter(function ($m) use ($id) {
                $onLeft = $m->player_left_id === $id || $m->team_left_player2_id === $id;
                $leftWon = $m->winner_id === $m->player_left_id;
                return !(($onLeft && $leftWon) || (!$onLeft && !$leftWon));
            })
            ->pluck('id');

        $formatDuration = function ($avg) {
            if (!$avg) return null;
            $s = (int) round($avg);
            return sprintf('%d:%02d', floor($s / 60), $s % 60);
        };

        $avgDurationWin = $winMatchIds->isNotEmpty()
            ? PingPongMatch::whereIn('id', $winMatchIds)
                ->selectRaw('AVG(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) as avg_duration')
                ->value('avg_duration')
            : null;

        $avgDurationLoss = $lossMatchIds->isNotEmpty()
            ? PingPongMatch::whereIn('id', $lossMatchIds)
                ->selectRaw('AVG(CAST((julianday(ended_at) - julianday(started_at)) * 86400 AS INTEGER)) as avg_duration')
                ->value('avg_duration')
            : null;

        // Avg points scored when winning vs losing
        $avgPlayerScore = function ($matchIds) use ($id) {
            if ($matchIds->isEmpty()) return null;
            $matches = PingPongMatch::whereIn('id', $matchIds)->get();
            $total = 0;
            foreach ($matches as $m) {
                $onLeft = $m->player_left_id === $id || $m->team_left_player2_id === $id;
                $total += $onLeft ? $m->player_left_score : $m->player_right_score;
            }
            return round($total / $matches->count(), 1);
        };

        $avgPointsWin = $avgPlayerScore($winMatchIds);
        $avgPointsLoss = $avgPlayerScore($lossMatchIds);

        // Biggest score difference when winning and losing
        $scoreDiff = function ($matchIds) use ($id) {
            if ($matchIds->isEmpty()) return null;
            $matches = PingPongMatch::whereIn('id', $matchIds)->get();
            $maxDiff = 0;
            foreach ($matches as $m) {
                $onLeft = $m->player_left_id === $id || $m->team_left_player2_id === $id;
                $playerScore = $onLeft ? $m->player_left_score : $m->player_right_score;
                $oppScore = $onLeft ? $m->player_right_score : $m->player_left_score;
                $maxDiff = max($maxDiff, abs($playerScore - $oppScore));
            }
            return $maxDiff;
        };

        $biggestDiffWin = $scoreDiff($winMatchIds);
        $biggestDiffLoss = $scoreDiff($lossMatchIds);

        // Highest win streak and lose streak ever
        $highestWinStreak = 0;
        $highestLoseStreak = 0;
        $currentWinRun = 0;
        $currentLoseRun = 0;
        foreach ($recentMatches->reverse() as $match) {
            $onLeftTeam = $match->player_left_id === $id || $match->team_left_player2_id === $id;
            $leftWon = $match->winner_id === $match->player_left_id;
            $won = ($onLeftTeam && $leftWon) || (!$onLeftTeam && !$leftWon);

            if ($won) {
                $currentWinRun++;
                $currentLoseRun = 0;
                $highestWinStreak = max($highestWinStreak, $currentWinRun);
            } else {
                $currentLoseRun++;
                $currentWinRun = 0;
                $highestLoseStreak = max($highestLoseStreak, $currentLoseRun);
            }
        }

        // Highest ELO ever (peak rating from completed matches)
        $eloMatches = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)
                  ->orWhere('player_right_id', $id)
                  ->orWhere('team_left_player2_id', $id)
                  ->orWhere('team_right_player2_id', $id);
            })
            ->get(['player_left_id', 'player_right_id', 'team_left_player2_id', 'team_right_player2_id',
                   'player_left_elo_after', 'player_right_elo_after', 'team_left_player2_elo_after', 'team_right_player2_elo_after']);

        $highestElo = $eloMatches->map(function ($m) use ($id) {
            if ($m->player_left_id === $id) return $m->player_left_elo_after;
            if ($m->player_right_id === $id) return $m->player_right_elo_after;
            if ($m->team_left_player2_id === $id) return $m->team_left_player2_elo_after;
            if ($m->team_right_player2_id === $id) return $m->team_right_player2_elo_after;
            return null;
        })->filter()->max();

        // Best side: left or right with most wins
        $leftWins = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->whereNotNull('winner_id')
            ->whereColumn('winner_id', 'player_left_id')
            ->where(function ($q) use ($id) {
                $q->where('player_left_id', $id)->orWhere('team_left_player2_id', $id);
            })
            ->count();

        $rightWins = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->whereNotNull('winner_id')
            ->whereColumn('winner_id', 'player_right_id')
            ->where(function ($q) use ($id) {
                $q->where('player_right_id', $id)->orWhere('team_right_player2_id', $id);
            })
            ->count();

        $bestSide = match (true) {
            $leftWins > $rightWins => 'left',
            $rightWins > $leftWins => 'right',
            default => 'tie',
        };

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'elo_rating' => $elo,
            'highest_elo' => $highestElo,
            'wins' => $wins,
            'losses' => $losses,
            'win_rate' => $winRate,
            'games_played' => $totalGames,
            'avg_duration' => $avgDurationFormatted,
            'avg_duration_win' => $formatDuration($avgDurationWin),
            'avg_duration_loss' => $formatDuration($avgDurationLoss),
            'streak' => $streak,
            'streak_type' => $streakType,
            'best_side' => $bestSide,
            'left_wins' => $leftWins,
            'right_wins' => $rightWins,
            'highest_win_streak' => $highestWinStreak,
            'highest_lose_streak' => $highestLoseStreak,
            'avg_points_win' => $avgPointsWin,
            'avg_points_loss' => $avgPointsLoss,
            'biggest_diff_win' => $biggestDiffWin,
            'biggest_diff_loss' => $biggestDiffLoss,
        ]);
    }

    public function eloHistory(Request $request, int $id): JsonResponse
    {
        $player = Player::findOrFail($id);
        $mode = $request->query('mode', '1v1');

        $changes = PingPongRatingChange::where('player_id', $id)
            ->where('mode', $mode)
            ->orderBy('created_at')
            ->get();

        // Build map of date -> rating_after (last rating at end of each day with games)
        $cumulative = 1200;
        $ratingByDate = [];
        foreach ($changes as $change) {
            $cumulative += $change->rating_change;
            $day = $change->created_at->startOfDay()->toDateString();
            $ratingByDate[$day] = $cumulative;
        }

        // One point per day from first ELO change to today
        $firstChange = $changes->first();
        if (!$firstChange) {
            return response()->json([
                'player' => ['id' => $player->id, 'name' => $player->name],
                'mode' => $mode,
                'history' => [],
            ]);
        }
        $startDate = $firstChange->created_at->startOfDay();
        $endDate = now()->startOfDay();
        $history = [];
        $current = $startDate->copy();
        $lastRating = 1200;

        while ($current->lte($endDate)) {
            $dayStr = $current->toDateString();
            if (isset($ratingByDate[$dayStr])) {
                $lastRating = $ratingByDate[$dayStr];
            }
            $history[] = [
                'rating_after' => $lastRating,
                'created_at' => $current->toIso8601String(),
            ];
            $current->addDay();
        }

        return response()->json([
            'player' => ['id' => $player->id, 'name' => $player->name],
            'mode' => $mode,
            'history' => $history,
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
