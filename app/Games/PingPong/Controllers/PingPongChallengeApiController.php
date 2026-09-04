<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\ChallengeUpdated;
use App\Games\PingPong\Models\PingPongChallenge;
use App\Games\PingPong\Services\MatchmakingService;
use App\Http\Controllers\Controller;
use App\Jobs\SendChallengeNotificationJob;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Reading and answering the hourly challenge.
 *
 * `respond` is called by the service worker when someone taps a notification
 * action, so it has to tolerate being hit late: an expired or already-answered
 * challenge returns its current state instead of an error, since there is
 * nothing useful a background notification handler could do with a 422.
 */
class PingPongChallengeApiController extends Controller
{
    private const RELATIONS = ['playerOne', 'playerTwo', 'lobby', 'office'];

    public function show(int $id): JsonResponse
    {
        $challenge = PingPongChallenge::with(self::RELATIONS)->findOrFail($id);

        return response()->json($challenge->toApiArray());
    }

    /**
     * Every challenge still in play, across offices.
     *
     * The home screen has no office of its own — it shows the whole league —
     * so it gets everything live and labels each row with its office. That is
     * one row on any normal day and stays correct the day a second office
     * turns matchmaking on.
     */
    public function current(): JsonResponse
    {
        $challenges = PingPongChallenge::with(self::RELATIONS)
            ->live()
            ->orderBy('scheduled_for')
            ->get();

        return response()->json([
            'challenges' => $challenges->map(fn (PingPongChallenge $challenge) => $challenge->toApiArray())->all(),
        ]);
    }

    public function respond(Request $request, int $id): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|integer|exists:players,id',
            'response' => 'required|in:accepted,declined',
            'token' => 'required|string',
        ]);

        $challenge = PingPongChallenge::with(self::RELATIONS)->findOrFail($id);

        if ($challenge->isExpired() && $challenge->status === PingPongChallenge::STATUS_PENDING) {
            $challenge->forceFill(['status' => PingPongChallenge::STATUS_EXPIRED])->save();
        }

        $playerId = (int) $validated['player_id'];

        if ($challenge->responseColumnFor($playerId) === null
            || ! $challenge->matchesResponseToken($playerId, $validated['token'])) {
            return response()->json(['error' => 'That player is not part of this challenge.'], 403);
        }

        $recorded = $challenge->recordResponse($playerId, $validated['response']);

        $challenge = $challenge->fresh(self::RELATIONS);

        if ($recorded) {
            broadcast(new ChallengeUpdated($challenge));
        }

        return response()->json($challenge->toApiArray() + [
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

        $challenge = PingPongChallenge::with(self::RELATIONS)->findOrFail($id);

        if ($challenge->status !== PingPongChallenge::STATUS_PENDING) {
            return response()->json([
                'error' => 'That challenge has already been resolved.',
                'status' => $challenge->status,
            ], 422);
        }

        $result = $matchmaking->redraw($challenge, $validated['absent_player_id'] ?? null);

        // Announced whether or not a replacement was found: every screen
        // showing the old pair has to stop showing them either way.
        broadcast(new ChallengeUpdated($challenge));

        if (! $result->created || $result->challenge === null) {
            return response()->json([
                'redrawn' => false,
                'reason' => $result->reason,
                'eligible' => $result->eligibleCount,
            ]);
        }

        $fresh = $result->challenge->fresh(self::RELATIONS);

        SendChallengeNotificationJob::dispatch($fresh->id);
        broadcast(new ChallengeUpdated($fresh));

        return response()->json([
            'redrawn' => true,
            'challenge' => $fresh->toApiArray(),
        ]);
    }
}
