<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Services\LoggedResultService;
use App\Http\Controllers\Controller;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\View\View;

/**
 * Typing in results after the games, for offices without a scoring screen.
 */
class PingPongLogController extends Controller
{
    public function __construct(private LoggedResultService $loggedResults) {}

    public function create(): View
    {
        $ratings = PingPongRating::where('mode', '1v1')->pluck('elo_rating', 'player_id');

        return view('games.ping-pong.log', [
            'offices' => Office::orderBy('name')->get(['id', 'name']),
            'players' => Player::orderBy('name')->get()->map(fn (Player $player): array => [
                'id' => $player->id,
                'name' => $player->name,
                'office_id' => $player->office_id,
                'avatar_url' => $player->avatarUrl(),
                'elo' => $ratings->get($player->id, 1200),
            ])->values(),
            'undoMinutes' => config('pingpong.logged_undo_minutes'),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'left' => 'required|integer|exists:players,id',
            'right' => 'required|integer|exists:players,id|different:left',
            'games' => 'required|array|min:1|max:20',
            'games.*.left' => 'required|integer|min:0|max:99',
            'games.*.right' => 'required|integer|min:0|max:99',
            'played_at' => 'nullable|date',
        ], [
            'right.different' => 'Pick two different players.',
        ]);

        $matches = $this->loggedResults->log(
            (int) $validated['left'],
            (int) $validated['right'],
            array_map(fn (array $game): array => ['left' => (int) $game['left'], 'right' => (int) $game['right']], $validated['games']),
            isset($validated['played_at']) ? Carbon::parse($validated['played_at']) : now(),
        );

        return response()->json([
            'matches' => $matches->map(fn (PingPongMatch $match): array => $this->summary($match))->values(),
        ], 201);
    }

    public function destroy(int $id): JsonResponse
    {
        $this->loggedResults->undo(PingPongMatch::findOrFail($id));

        return response()->json(['undone' => true]);
    }

    /**
     * @return array{id: int, player_left_score: int, player_right_score: int, left_won: bool, logged_at: string, elo: array{left: array{before: int, after: int}, right: array{before: int, after: int}}}
     */
    private function summary(PingPongMatch $match): array
    {
        return [
            'id' => $match->id,
            'player_left_score' => $match->player_left_score,
            'player_right_score' => $match->player_right_score,
            'left_won' => $match->winner_id === $match->player_left_id,
            'logged_at' => $match->logged_at->toIso8601String(),
            'elo' => [
                'left' => ['before' => $match->player_left_elo_before, 'after' => $match->player_left_elo_after],
                'right' => ['before' => $match->player_right_elo_before, 'after' => $match->player_right_elo_after],
            ],
        ];
    }
}
