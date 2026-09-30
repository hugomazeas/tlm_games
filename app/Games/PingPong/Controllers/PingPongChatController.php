<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\ChatMessagePosted;
use App\Games\PingPong\Models\PingPongChatMessage;
use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\GiphyService;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\ValidationException;

/**
 * The livestream chat: each match is its own room. Viewers post into it from
 * /watch while the match is on; the playing screen shows its history and
 * flashes each new message. A new match starts with an empty room.
 */
class PingPongChatController extends Controller
{
    private const HISTORY_LIMIT = 50;

    private const COOLDOWN_SECONDS = 5;

    private const GIPHY_SEARCHES_PER_PLAYER = 10;

    private const GIPHY_SEARCH_WINDOW_SECONDS = 600;

    public function messages(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'match_id' => 'required|integer|exists:ping_pong_matches,id',
        ]);

        $messages = PingPongChatMessage::with('player')
            ->where('match_id', $validated['match_id'])
            ->latest('created_at')
            ->latest('id')
            ->limit(self::HISTORY_LIMIT)
            ->get()
            ->reverse()
            ->values()
            ->map(fn (PingPongChatMessage $message) => $message->toChatPayload());

        return response()->json($messages);
    }

    public function post(Request $request, GiphyService $giphy): JsonResponse
    {
        $validated = $request->validate([
            'match_id' => 'required|integer|exists:ping_pong_matches,id',
            'player_id' => 'required|integer|exists:players,id',
            'body' => 'required|string|max:200',
            'gif_id' => 'nullable|string|max:64',
        ]);

        if (PingPongMatch::whereKey($validated['match_id'])->whereNotNull('ended_at')->exists()) {
            throw ValidationException::withMessages(['match_id' => 'This match has ended.']);
        }

        $gif = null;
        if (isset($validated['gif_id'])) {
            $gif = $giphy->find($validated['gif_id']);

            if (! $gif) {
                throw ValidationException::withMessages(['gif_id' => 'That GIF expired — search again.']);
            }
        }

        $allowed = RateLimiter::attempt(
            'ping-pong-chat:'.$validated['player_id'],
            1,
            fn () => true,
            self::COOLDOWN_SECONDS,
        );

        if (! $allowed) {
            return response()->json(['message' => 'Slow down — wait a few seconds.'], 429);
        }

        $message = PingPongChatMessage::create([
            'match_id' => $validated['match_id'],
            'player_id' => $validated['player_id'],
            'body' => $validated['body'],
            'gif' => $gif,
        ]);

        event(new ChatMessagePosted($message));

        return response()->json($message->toChatPayload(), 201);
    }

    /**
     * Backs the /giphy command: up to 25 GIFs for the words typed, which the
     * composer shuffles through locally. Each player gets a few searches per
     * window so one person can't spend the app's hourly Giphy budget.
     */
    public function giphy(Request $request, GiphyService $giphy): JsonResponse
    {
        $validated = $request->validate([
            'q' => 'required|string|max:100',
            'player_id' => 'required|integer|exists:players,id',
        ]);

        $allowed = RateLimiter::attempt(
            'ping-pong-giphy:'.$validated['player_id'],
            self::GIPHY_SEARCHES_PER_PLAYER,
            fn () => true,
            self::GIPHY_SEARCH_WINDOW_SECONDS,
        );

        if (! $allowed) {
            return response()->json(['message' => 'Too many GIF searches — wait a few minutes.'], 429);
        }

        return response()->json($giphy->search($validated['q']));
    }

    /**
     * Resolves a typed name to a player, creating one when nobody has it yet.
     * Matching ignores case so "ann" doesn't become a second Ann.
     */
    public function identify(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $player = Player::whereRaw('LOWER(name) = ?', [mb_strtolower($validated['name'])])->first();

        if ($player) {
            return response()->json(['id' => $player->id, 'name' => $player->name]);
        }

        $player = Player::create(['name' => $validated['name']]);

        return response()->json(['id' => $player->id, 'name' => $player->name], 201);
    }
}
