<?php

namespace App\Games\Racing\Controllers;

use App\Games\Racing\Models\RacingKart;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
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
            // The livery is optional: a save that leaves it out keeps what was there.
            'number' => ['sometimes', 'nullable', 'integer', 'between:0,99'],
            'pattern' => ['sometimes', 'string', Rule::in(RacingKart::PATTERNS)],
            'stickers' => ['sometimes', 'boolean'],
            'sponsor' => ['sometimes', 'nullable', 'string', 'max:'.RacingKart::SPONSOR_LENGTH],
        ], [
            'body.regex' => 'The body colour must look like #a1b2c3.',
            'accent.regex' => 'The accent colour must look like #a1b2c3.',
            'number.between' => 'The race number goes from 0 to 99.',
            'sponsor.max' => 'The sponsor fits '.RacingKart::SPONSOR_LENGTH.' characters at most.',
        ]);

        RacingKart::updateOrCreate(
            ['player_id' => $player->id],
            [
                'body' => strtolower($validated['body']),
                'accent' => strtolower($validated['accent']),
                ...array_intersect_key($validated, array_flip(['number', 'pattern', 'stickers', 'sponsor'])),
            ],
        );

        return response()->json(RacingKart::lookOf($player));
    }

    /**
     * A newcomer who isn't a Hub player yet adds themselves from the game's
     * welcome screen, so their times count in the records.
     */
    public function createDriver(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:40', 'unique:players,name'],
        ], [
            'name.unique' => 'Someone already goes by that name: pick it from the list.',
        ]);

        $player = Player::create(['name' => trim($validated['name'])]);

        return response()->json(['id' => $player->id, ...RacingKart::lookOf($player)], 201);
    }
}
