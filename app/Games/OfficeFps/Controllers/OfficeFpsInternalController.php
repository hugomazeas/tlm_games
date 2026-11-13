<?php

namespace App\Games\OfficeFps\Controllers;

use App\Games\OfficeFps\Models\OfficeFpsKill;
use App\Games\OfficeFps\Models\OfficeFpsMatch;
use App\Games\OfficeFps\Models\OfficeFpsResult;
use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * What the game server posts when an office FPS match ends (behind the shared secret, like hot
 * potato's): the match, each Hub player's line, and every kill.
 */
class OfficeFpsInternalController extends Controller
{
    public function results(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'started_at' => 'required|date',
            'ended_at' => 'required|date|after_or_equal:started_at',
            'frag_limit' => 'required|integer|min:1|max:200',
            'minutes' => 'required|integer|min:1|max:120',
            'player_count' => 'required|integer|min:1|max:12',
            'mode' => ['sometimes', 'string', Rule::in(OfficeFpsMatch::MODES)],
            'map' => ['sometimes', 'string', Rule::in(OfficeFpsMatch::MAPS)],
            'players' => 'required|array|min:1|max:12',
            'players.*.player_id' => 'required|integer|distinct|exists:players,id',
            'players.*.place' => 'required|integer|min:1|max:12',
            'players.*.kills' => 'required|integer|min:0|max:10000',
            'players.*.deaths' => 'required|integer|min:0|max:10000',
            'players.*.headshots' => 'required|integer|min:0|max:10000',
            'players.*.damage' => 'required|integer|min:0|max:10000000',
            'players.*.shots' => 'required|integer|min:0|max:10000000',
            'players.*.hits' => 'required|integer|min:0|max:10000000|lte:players.*.shots',
            'players.*.melee_kills' => 'required|integer|min:0|max:10000',
            'players.*.backstabs' => 'required|integer|min:0|max:10000',
            'players.*.best_streak' => 'required|integer|min:0|max:10000',
            'players.*.played_ms' => 'required|integer|min:0|max:7200000',
            'players.*.left' => 'required|boolean',
            'players.*.team' => ['sometimes', 'nullable', 'string', Rule::in(OfficeFpsResult::TEAMS)],
            'players.*.won' => 'sometimes|boolean',
            'players.*.zone_ms' => 'sometimes|integer|min:0|max:7200000',
            'players.*.pickups' => 'sometimes|integer|min:0|max:10000',
            'kills' => 'present|array|max:5000',
            'kills.*.killer_id' => 'nullable|integer|exists:players,id',
            'kills.*.victim_id' => 'nullable|integer|exists:players,id',
            'kills.*.weapon' => ['required', 'string', Rule::in(OfficeFpsKill::WEAPONS)],
            'kills.*.headshot' => 'required|boolean',
            'kills.*.backstab' => 'required|boolean',
            'kills.*.at_ms' => 'required|integer|min:0|max:7200000',
        ]);

        $match = DB::transaction(function () use ($validated) {
            $match = OfficeFpsMatch::create([
                'started_at' => Carbon::parse($validated['started_at']),
                'ended_at' => Carbon::parse($validated['ended_at']),
                'frag_limit' => $validated['frag_limit'],
                'minutes' => $validated['minutes'],
                'player_count' => $validated['player_count'],
                'mode' => $validated['mode'] ?? 'ffa',
                // Posts from before maps: the office.
                'map' => $validated['map'] ?? 'office',
            ]);
            foreach ($validated['players'] as $row) {
                // Posts from before modes: no team, the winner is whoever placed first.
                $match->results()->create($row + [
                    'team' => null,
                    'won' => (int) $row['place'] === 1,
                    'zone_ms' => 0,
                    'pickups' => 0,
                ]);
            }
            foreach ($validated['kills'] as $kill) {
                $match->kills()->create($kill);
            }

            return $match;
        });

        return response()->json(['id' => $match->id], 201);
    }
}
