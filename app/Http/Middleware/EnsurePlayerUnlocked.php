<?php

namespace App\Http\Middleware;

use App\Models\Player;
use App\Services\PlayerPinService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Keeps a claimed player's profile shut until their PIN was entered in this
 * session. Unclaimed players pass straight through.
 */
class EnsurePlayerUnlocked
{
    public function __construct(private PlayerPinService $pins) {}

    public function handle(Request $request, Closure $next): Response
    {
        $player = $request->route('player');

        if ($player instanceof Player && ! $this->pins->isUnlocked($player)) {
            $message = 'Enter '.$player->name.'\'s PIN to change this profile.';

            if ($request->expectsJson()) {
                return response()->json(['message' => $message], 403);
            }

            return redirect('/players/'.$player->id)->with('error', $message);
        }

        return $next($request);
    }
}
