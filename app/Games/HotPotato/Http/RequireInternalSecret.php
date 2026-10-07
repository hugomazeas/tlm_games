<?php

namespace App\Games\HotPotato\Http;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Lets only the hot potato sidecar through to the internal endpoints.
 *
 * The routes are reachable through nginx like any other, so the shared secret
 * is the whole fence. Unset means closed, never open.
 */
class RequireInternalSecret
{
    public function handle(Request $request, Closure $next): Response
    {
        $secret = (string) config('games.hot_potato.internal_secret');

        if ($secret === '') {
            return response()->json(['message' => 'Hot potato is not configured.'], 503);
        }

        if (! hash_equals($secret, (string) $request->header('X-Internal-Secret'))) {
            return response()->json(['message' => 'Forbidden.'], 403);
        }

        return $next($request);
    }
}
