<?php

namespace App\Games\PingPong\Controllers;

use App\Games\PingPong\Events\ChatMessagePosted;
use App\Games\PingPong\Models\PingPongChatMessage;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * The livestream chat: one ongoing room viewers post into from /watch, shown
 * as history and flash overlays on the playing screen.
 */
class PingPongChatController extends Controller
{
    private const HISTORY_LIMIT = 50;

    private const COOLDOWN_SECONDS = 5;

    public function messages(): JsonResponse
    {
        $messages = PingPongChatMessage::with('player')
            ->latest('created_at')
            ->latest('id')
            ->limit(self::HISTORY_LIMIT)
            ->get()
            ->reverse()
            ->values()
            ->map(fn (PingPongChatMessage $message) => $message->toChatPayload());

        return response()->json($messages);
    }

    public function post(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|integer|exists:players,id',
            'body' => 'required|string|max:200',
        ]);

        $allowed = RateLimiter::attempt(
            'ping-pong-chat:'.$validated['player_id'],
            1,
            fn () => true,
            self::COOLDOWN_SECONDS,
        );

        if (! $allowed) {
            return response()->json(['message' => 'Slow down — wait a few seconds.'], 429);
        }

        $message = PingPongChatMessage::create($validated);

        event(new ChatMessagePosted($message));

        return response()->json($message->toChatPayload(), 201);
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
