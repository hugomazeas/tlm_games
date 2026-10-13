<?php

namespace App\Games\Racing\Controllers;

use App\Games\Racing\Models\RacingKart;
use App\Games\Racing\Models\RacingResult;
use App\Games\Racing\Models\RacingTrack;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Endpoints for the game server's racing lobbies, behind the same shared
 * secret as hot potato's (RequireInternalSecret). The game server never opens
 * the database: it looks drivers and tracks up here, and posts results.
 */
class RacingInternalController extends Controller
{
    /** A driver as other karts see them: name and garage colours. */
    public function driver(Player $player): JsonResponse
    {
        return response()->json(['id' => $player->id, ...RacingKart::lookOf($player)]);
    }

    /** What a lobby needs to run a race on the track. */
    public function track(RacingTrack $track): JsonResponse
    {
        return response()->json([
            'id' => $track->id,
            'name' => $track->name,
            'laps' => $track->laps,
            'gates' => $track->gates,
        ]);
    }

    /** One race's results, one row per Hub player in it (guests aren't sent). */
    public function results(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'race_id' => 'required|string|max:40',
            'track_id' => 'required|integer|exists:racing_tracks,id',
            'racers' => 'required|integer|min:1|max:8',
            'results' => 'required|array|min:1|max:8',
            'results.*.player_id' => 'required|integer|distinct|exists:players,id',
            'results.*.position' => 'required|integer|min:1|max:8',
            'results.*.time_ms' => 'nullable|integer|min:1',
            'results.*.best_lap_ms' => 'nullable|integer|min:1',
        ]);

        DB::transaction(function () use ($validated) {
            foreach ($validated['results'] as $row) {
                RacingResult::updateOrCreate(
                    ['race_id' => $validated['race_id'], 'player_id' => $row['player_id']],
                    [
                        'racing_track_id' => $validated['track_id'],
                        'position' => $row['position'],
                        'racers' => $validated['racers'],
                        'time_ms' => $row['time_ms'] ?? null,
                        'best_lap_ms' => $row['best_lap_ms'] ?? null,
                    ],
                );
            }
        });

        return response()->json(['saved' => count($validated['results'])], 201);
    }
}
