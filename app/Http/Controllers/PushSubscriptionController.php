<?php

namespace App\Http\Controllers;

use App\Models\Player;
use App\Models\PushSubscription;
use App\Services\Push\WebPushSender;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Self-service push registration.
 *
 * The Games Hub has no login — a person identifies themselves by picking their
 * own name, exactly as they already do when starting a match. The stored
 * subscription is therefore only as trustworthy as the office network, which
 * matches the trust model of every other write endpoint in this app.
 */
class PushSubscriptionController extends Controller
{
    public function index(WebPushSender $sender): JsonResponse
    {
        return response()->json([
            'configured' => $sender->isConfigured(),
            'public_key' => $sender->publicKey(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
            'endpoint' => 'required|string|max:2048',
            'keys.p256dh' => 'required|string|max:255',
            'keys.auth' => 'required|string|max:255',
            'content_encoding' => 'nullable|string|in:aesgcm,aes128gcm',
        ]);

        $endpoint = $validated['endpoint'];

        // One endpoint belongs to exactly one person. Re-registering the same
        // browser under a different name moves it rather than duplicating it,
        // which is what happens when two people share a shop-floor tablet.
        $subscription = PushSubscription::updateOrCreate(
            ['endpoint_hash' => PushSubscription::hashEndpoint($endpoint)],
            [
                'player_id' => $validated['player_id'],
                'endpoint' => $endpoint,
                'public_key' => $validated['keys']['p256dh'],
                'auth_token' => $validated['keys']['auth'],
                'content_encoding' => $validated['content_encoding'] ?? 'aesgcm',
            ]
        );

        return response()->json([
            'id' => $subscription->id,
            'player_id' => $subscription->player_id,
        ], 201);
    }

    public function destroy(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'endpoint' => 'required|string|max:2048',
        ]);

        $deleted = PushSubscription::where(
            'endpoint_hash',
            PushSubscription::hashEndpoint($validated['endpoint'])
        )->delete();

        return response()->json(['deleted' => $deleted]);
    }

    /** Sends a one-off notification so someone can prove the setup works. */
    public function test(Request $request, WebPushSender $sender): JsonResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
        ]);

        $player = Player::with('pushSubscriptions')->findOrFail($validated['player_id']);

        $delivered = $sender->send($player->pushSubscriptions, [
            'title' => '🏓 Notifications are on',
            'body' => 'You’ll get a ping when you’re drawn for a match.',
            'tag' => 'pingpong-test',
            'url' => url('/games/ping-pong'),
        ]);

        return response()->json(['delivered' => $delivered]);
    }
}
