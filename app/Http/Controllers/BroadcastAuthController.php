<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;

class BroadcastAuthController extends Controller
{
    /**
     * Authenticate guest users for presence channels.
     * Returns a Pusher-compatible auth response using session ID as identity.
     */
    public function authenticate(Request $request)
    {
        $socketId = $request->input('socket_id');
        $channelName = $request->input('channel_name');

        if (!$socketId || !$channelName || !str_starts_with($channelName, 'presence-')) {
            return response()->json(['error' => 'Invalid request'], 403);
        }

        $viewerId = session()->getId();

        $channelData = json_encode([
            'user_id' => $viewerId,
            'user_info' => ['name' => 'Viewer'],
        ]);

        $secret = config('broadcasting.connections.reverb.secret');
        $key = config('broadcasting.connections.reverb.key');
        $signature = hash_hmac('sha256', "{$socketId}:{$channelName}:{$channelData}", $secret);

        return response()->json([
            'auth' => "{$key}:{$signature}",
            'channel_data' => $channelData,
        ]);
    }
}
