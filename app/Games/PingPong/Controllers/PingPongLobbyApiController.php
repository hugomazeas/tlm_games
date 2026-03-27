<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\LiveMatchStarted;
use App\Games\PingPong\Events\LobbyMatchStarted;
use App\Games\PingPong\Events\LobbyUpdated;
use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongLobbyParticipant;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PingPongLobbyApiController extends Controller
{
    public function createLobby(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mode' => 'required|in:1v1,2v2',
        ]);

        $lobby = PingPongLobby::create([
            'code' => PingPongLobby::generateCode(),
            'mode' => $validated['mode'],
            'host_token' => Str::random(64),
            'status' => 'waiting',
            'expires_at' => now()->addYears(10),
        ]);

        return response()->json([
            'code' => $lobby->code,
            'host_token' => $lobby->host_token,
            'mode' => $lobby->mode,
        ], 201);
    }

    public function getLobby(string $code): JsonResponse
    {
        $lobby = PingPongLobby::where('code', $code)->firstOrFail();
        $lobby->load('participants.player');

        return response()->json([
            'code' => $lobby->code,
            'mode' => $lobby->mode,
            'status' => $lobby->status,
            'match_id' => $lobby->match_id,
            'participants' => $lobby->participants->map(fn ($p) => [
                'id' => $p->id,
                'player_id' => $p->player_id,
                'player_name' => $p->player->name,
                'elo_rating' => PingPongRating::where('player_id', $p->player_id)->where('mode', $lobby->mode)->value('elo_rating') ?? 1200,
                'side' => $p->side,
            ])->values(),
        ]);
    }

    public function joinLobby(Request $request, string $code): JsonResponse
    {
        $lobby = PingPongLobby::where('code', $code)->where('status', 'waiting')->firstOrFail();

        if ($lobby->isExpired()) {
            return response()->json(['error' => 'Lobby has expired'], 422);
        }

        $validated = $request->validate([
            'player_id' => 'required_without:player_name|nullable|exists:players,id',
            'player_name' => 'required_without:player_id|nullable|string|max:255',
        ]);

        if (!empty($validated['player_name']) && empty($validated['player_id'])) {
            $player = Player::create(['name' => $validated['player_name']]);
            $playerId = $player->id;
        } else {
            $playerId = $validated['player_id'];
        }

        // Check if already in lobby
        $existing = PingPongLobbyParticipant::where('lobby_id', $lobby->id)
            ->where('player_id', $playerId)
            ->first();

        if ($existing) {
            return response()->json([
                'session_token' => $existing->session_token,
                'side' => $existing->side,
                'player_id' => $playerId,
            ]);
        }

        // Check capacity
        $maxPerSide = $lobby->mode === '2v2' ? 2 : 1;
        $leftCount = $lobby->participants()->where('side', 'left')->count();
        $rightCount = $lobby->participants()->where('side', 'right')->count();

        // Auto-assign side with fewer players
        $side = $leftCount <= $rightCount ? 'left' : 'right';

        // Check if side is full
        $sideCount = $side === 'left' ? $leftCount : $rightCount;
        if ($sideCount >= $maxPerSide) {
            $otherSide = $side === 'left' ? 'right' : 'left';
            $otherCount = $side === 'left' ? $rightCount : $leftCount;
            if ($otherCount >= $maxPerSide) {
                return response()->json(['error' => 'Lobby is full'], 422);
            }
            $side = $otherSide;
        }

        $sessionToken = Str::random(64);

        PingPongLobbyParticipant::create([
            'lobby_id' => $lobby->id,
            'player_id' => $playerId,
            'side' => $side,
            'session_token' => $sessionToken,
            'last_seen_at' => now(),
        ]);

        broadcast(new LobbyUpdated($lobby->fresh()));

        return response()->json([
            'session_token' => $sessionToken,
            'side' => $side,
            'player_id' => $playerId,
        ], 201);
    }

    public function switchSide(Request $request, string $code): JsonResponse
    {
        $lobby = PingPongLobby::where('code', $code)->where('status', 'waiting')->firstOrFail();

        $validated = $request->validate([
            'session_token' => 'required|string',
            'side' => 'required|in:left,right',
        ]);

        $participant = PingPongLobbyParticipant::where('lobby_id', $lobby->id)
            ->where('session_token', $validated['session_token'])
            ->firstOrFail();

        // Check if target side has room
        $maxPerSide = $lobby->mode === '2v2' ? 2 : 1;
        $targetCount = $lobby->participants()
            ->where('side', $validated['side'])
            ->where('id', '!=', $participant->id)
            ->count();

        if ($targetCount >= $maxPerSide) {
            return response()->json(['error' => 'Side is full'], 422);
        }

        $participant->update(['side' => $validated['side']]);

        broadcast(new LobbyUpdated($lobby->fresh()));

        return response()->json(['side' => $validated['side']]);
    }

    public function leaveLobby(Request $request, string $code): JsonResponse
    {
        $lobby = PingPongLobby::where('code', $code)->firstOrFail();

        $validated = $request->validate([
            'session_token' => 'required|string',
        ]);

        $participant = PingPongLobbyParticipant::where('lobby_id', $lobby->id)
            ->where('session_token', $validated['session_token'])
            ->firstOrFail();

        $participant->delete();

        broadcast(new LobbyUpdated($lobby->fresh()));

        return response()->json(['left' => true]);
    }

    public function startMatch(Request $request, string $code): JsonResponse
    {
        $lobby = PingPongLobby::where('code', $code)->where('status', 'waiting')->firstOrFail();

        $validated = $request->validate([
            'host_token' => 'nullable|string',
            'session_token' => 'nullable|string',
            'record' => 'sometimes|boolean',
        ]);

        $authorized = false;

        if (!empty($validated['host_token']) && $lobby->host_token === $validated['host_token']) {
            $authorized = true;
        }

        if (!empty($validated['session_token'])) {
            $isParticipant = PingPongLobbyParticipant::where('lobby_id', $lobby->id)
                ->where('session_token', $validated['session_token'])
                ->exists();
            if ($isParticipant) {
                $authorized = true;
            }
        }

        if (!$authorized) {
            return response()->json(['error' => 'Unauthorized'], 403);
        }

        if (!$lobby->isReadyToStart()) {
            return response()->json(['error' => 'Not enough players'], 422);
        }

        $leftParticipants = $lobby->participants()->where('side', 'left')->with('player')->get();
        $rightParticipants = $lobby->participants()->where('side', 'right')->with('player')->get();

        $matchData = [
            'mode' => $lobby->mode,
            'player_left_id' => $leftParticipants[0]->player_id,
            'player_right_id' => $rightParticipants[0]->player_id,
            'player_left_score' => 0,
            'player_right_score' => 0,
            'current_server_id' => $leftParticipants[0]->player_id,
            'serve_count' => 0,
            'started_at' => now(),
            'last_score_activity_at' => now(),
        ];

        if ($lobby->mode === '2v2') {
            $matchData['team_left_player2_id'] = $leftParticipants[1]->player_id;
            $matchData['team_right_player2_id'] = $rightParticipants[1]->player_id;
        }

        $match = PingPongMatch::create($matchData);
        $match->load(['playerLeft', 'playerRight', 'currentServer', 'teamLeftPlayer2', 'teamRightPlayer2']);

        if ($request->boolean('record')) {
            try {
                app(VideoRecordingService::class)->startRecording($match);
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Failed to start recording', [
                    'match_id' => $match->id,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        $lobby->update([
            'status' => 'started',
            'match_id' => $match->id,
        ]);

        broadcast(new LobbyMatchStarted($lobby->fresh()));
        broadcast(new LiveMatchStarted($match));

        return response()->json([
            'match' => $match,
            'lobby_code' => $lobby->code,
        ]);
    }

    public function closeLobby(Request $request, string $code): JsonResponse
    {
        $lobby = PingPongLobby::where('code', $code)->firstOrFail();

        $validated = $request->validate([
            'host_token' => 'required|string',
        ]);

        if ($lobby->host_token !== $validated['host_token']) {
            return response()->json(['error' => 'Invalid host token'], 403);
        }

        $lobby->update(['status' => 'expired']);

        broadcast(new LobbyUpdated($lobby->fresh()));

        return response()->json(['closed' => true]);
    }
}
