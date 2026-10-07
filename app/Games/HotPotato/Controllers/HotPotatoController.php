<?php

namespace App\Games\HotPotato\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Office;
use App\Models\Player;
use App\Models\PushSubscription;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * The hot potato page and its notification opt-in. The game itself runs in
 * the sidecar (`game-server/`), which also serves the page's script.
 */
class HotPotatoController extends Controller
{
    public function play(): View
    {
        return view('games.hot-potato.play', [
            'offices' => Office::orderBy('name')->get(['id', 'name']),
            'players' => Player::orderBy('name')->get(['id', 'name', 'office_id']),
        ]);
    }

    /**
     * Opts a browser into "someone opened a hot potato in my office" pushes.
     *
     * A player is required: their office decides which games they hear about.
     * Same trust model as every other write here — you are who you pick.
     */
    public function subscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
            'endpoint' => 'required|string|max:2048',
            'keys.p256dh' => 'required|string|max:255',
            'keys.auth' => 'required|string|max:255',
            'content_encoding' => 'nullable|string|in:aesgcm,aes128gcm',
        ]);

        $endpoint = $validated['endpoint'];

        $subscription = PushSubscription::updateOrCreate(
            ['endpoint_hash' => PushSubscription::hashEndpoint($endpoint)],
            [
                'player_id' => $validated['player_id'],
                'endpoint' => $endpoint,
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'content_encoding' => $validated['content_encoding'] ?? 'aesgcm',
                'notify_hot_potato' => true,
            ]
        );

        return response()->json([
            'id' => $subscription->id,
            'notify_hot_potato' => true,
        ], 201);
    }

    /** Opts out. The row stays: other notifications may ride on it. */
    public function unsubscribe(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => 'required|string|max:2048',
        ]);

        PushSubscription::where('endpoint_hash', PushSubscription::hashEndpoint($validated['endpoint']))
            ->update(['notify_hot_potato' => false]);

        return response()->json(['notify_hot_potato' => false]);
    }
}
