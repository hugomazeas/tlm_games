<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Models\PingPongMatch;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Broadcast;

/**
 * Who is watching a match. Each match has a Reverb presence channel,
 * presence-ping-pong.match.{id}.viewers; Reverb keeps the member list and
 * this endpoint only signs people into it. There is no login, so the member
 * identity is whatever the browser claims — the same trust the chat gives.
 *
 * Viewers on /watch join as "viewer" (named once they've picked a chat name,
 * a guest until then). The playing screen joins as "screen" so it can read
 * the list; clients leave screens out of the count.
 */
class PingPongViewerController extends Controller
{
    private const CHANNEL_PATTERN = '/^presence-ping-pong\.match\.(\d+)\.viewers$/';

    public function auth(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'socket_id' => ['required', 'string', 'regex:/^\d+\.\d+$/'],
            'channel_name' => ['required', 'string', 'regex:'.self::CHANNEL_PATTERN],
            'role' => 'required|in:viewer,screen',
            'viewer_id' => ['required', 'string', 'max:64', 'regex:/^[A-Za-z0-9_-]+$/'],
            'player_id' => 'nullable|integer|exists:players,id',
        ]);

        preg_match(self::CHANNEL_PATTERN, $validated['channel_name'], $channel);

        $match = PingPongMatch::find($channel[1]);

        if (! $match || $match->ended_at) {
            return response()->json(['message' => 'This match is not live.'], 403);
        }

        $player = $validated['role'] === 'viewer' && isset($validated['player_id'])
            ? Player::find($validated['player_id'])
            : null;

        // A named viewer is one member however many tabs they have open.
        $memberId = match (true) {
            $validated['role'] === 'screen' => 'screen-'.$validated['viewer_id'],
            $player !== null => 'player-'.$player->id,
            default => 'guest-'.$validated['viewer_id'],
        };

        $signed = Broadcast::connection('reverb')->getPusher()->authorizePresenceChannel(
            $validated['channel_name'],
            $validated['socket_id'],
            $memberId,
            [
                'id' => $memberId,
                'role' => $validated['role'],
                'player_id' => $player?->id,
                'name' => $player?->name,
            ],
        );

        return response()->json(json_decode($signed, true));
    }
}
