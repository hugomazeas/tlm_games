<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Services\MatchmakingService;
use App\Http\Controllers\Controller;
use App\Jobs\SendChallengeNotificationJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Accept / decline for an hourly challenge.
 *
 * Called by the service worker when someone taps a notification action, so it
 * has to tolerate being hit late: an expired or already-answered challenge
 * returns its current state instead of an error, since there is nothing
 * useful a background notification handler could do with a 422.
 */
class PingPongChallengeApiController extends Controller
{
    public function show(int $id): JsonResponse
    {
        $challenge = PingPongChallenge::with(['playerOne', 'playerTwo', 'lobby', 'office'])
            ->findOrFail($id);

        return response()->json($this->present($challenge));
    }

    public function respond(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|integer|exists:players,id',
            'response' => 'required|in:accepted,declined',
            'token' => 'required|string',
        ]);

        $challenge = PingPongChallenge::with(['playerOne', 'playerTwo', 'lobby'])->findOrFail($id);

        if ($challenge->isExpired() && $challenge->status === PingPongChallenge::STATUS_PENDING) {
            $challenge->forceFill(['status' => PingPongChallenge::STATUS_EXPIRED])->save();
        }

        $playerId = (int) $validated['player_id'];

        if ($challenge->responseColumnFor($playerId) === null
            || ! $challenge->matchesResponseToken($playerId, $validated['token'])) {
            return response()->json(['error' => 'That player is not part of this challenge.'], 403);
        }

        $recorded = $challenge->recordResponse($playerId, $validated['response']);

        return response()->json($this->present($challenge->fresh(['playerOne', 'playerTwo', 'lobby'])) + [
            'recorded' => $recorded,
        ]);
    }

    /**
     * Re-rolls a challenge nobody can honour.
     *
     * Open to anyone, like every other write in this app: whoever is standing
     * at the table is exactly the person who knows the drawn player went home,
     * and making them find an admin would guarantee nobody ever does it.
     */
    public function redraw(Request $request, int $id, MatchmakingService $matchmaking): JsonResponse
    {
        $validated = $request->validate([
            'absent_player_id' => 'nullable|integer|exists:players,id',
        ]);

        $challenge = PingPongChallenge::with(['office', 'playerOne', 'playerTwo'])->findOrFail($id);

        if ($challenge->status !== PingPongChallenge::STATUS_PENDING) {
            return response()->json([
                'error' => 'That challenge has already been resolved.',
                'status' => $challenge->status,
            ], 422);
        }

        $result = $matchmaking->redraw($challenge, $validated['absent_player_id'] ?? null);

        if (! $result->created || $result->challenge === null) {
            return response()->json([
                'redrawn' => false,
                'reason' => $result->reason,
                'eligible' => $result->eligibleCount,
            ]);
        }

        SendChallengeNotificationJob::dispatch($result->challenge->id);

        return response()->json([
            'redrawn' => true,
            'challenge' => $this->present($result->challenge->fresh(['playerOne', 'playerTwo', 'lobby'])),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function present(PingPongChallenge $challenge): array
    {
        return [
            'id' => $challenge->id,
            'status' => $challenge->status,
            'lobby_code' => $challenge->lobby?->code,
            'expires_at' => $challenge->expires_at?->toIso8601String(),
            'players' => [
                [
                    'id' => $challenge->player_one_id,
                    'name' => $challenge->playerOne?->name,
                    'response' => $challenge->player_one_response,
                ],
                [
                    'id' => $challenge->player_two_id,
                    'name' => $challenge->playerTwo?->name,
                    'response' => $challenge->player_two_response,
                ],
            ],
        ];
    }
}
