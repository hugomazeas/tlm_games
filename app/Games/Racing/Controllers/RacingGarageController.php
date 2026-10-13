<?php

namespace App\Games\Racing\Controllers;

use App\Games\Racing\Models\RacingKart;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * The garage: a player paints their kart, body and accent, and it looks
 * like that on every track. The kart preview comes from the game server
 * (game-server/src/race/client/garage.ts).
 */
class RacingGarageController extends Controller
{
    public function show(Player $player): View
    {
        return view('games.racing.garage', [
            'player' => $player,
            'look' => RacingKart::lookOf($player),
        ]);
    }

    public function update(Request $request, Player $player): JsonResponse
    {
        $validated = $request->validate([
            'body' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
            'accent' => ['required', 'string', 'regex:/^#[0-9a-fA-F]{6}$/'],
        ], [
            'body.regex' => 'The body colour must look like #a1b2c3.',
            'accent.regex' => 'The accent colour must look like #a1b2c3.',
        ]);

        RacingKart::updateOrCreate(
            ['player_id' => $player->id],
            ['body' => strtolower($validated['body']), 'accent' => strtolower($validated['accent'])],
        );

        return response()->json(RacingKart::lookOf($player));
    }
}
