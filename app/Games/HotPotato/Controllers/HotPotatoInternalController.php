<?php

namespace App\Games\HotPotato\Controllers;

use App\Games\HotPotato\Jobs\SendHotPotatoInviteJob;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Endpoints for the hot potato sidecar only, behind RequireInternalSecret.
 * The sidecar never touches the database; everything it knows or keeps goes
 * through here.
 */
class HotPotatoInternalController extends Controller
{
    /** Lets the sidecar check a player is real before seating them. */
    public function player(Player $player): JsonResponse
    {
        return response()->json([
            'id' => $player->id,
            'name' => $player->name,
            'office_id' => $player->office_id,
        ]);
    }

    public function sessionOpened(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'office_id' => 'required|integer|exists:offices,id',
            'host_player_id' => 'required|integer|exists:players,id',
        ]);

        SendHotPotatoInviteJob::dispatch((int) $validated['office_id'], (int) $validated['host_player_id']);

        return response()->json(['queued' => true], 202);
    }

    public function results(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'mode' => ['sometimes', 'string', Rule::in(HotPotatoGame::MODES)],
            'office_id' => 'nullable|integer|exists:offices,id',
            'seed' => 'required|integer|min:0',
            'theme' => 'required|string|max:50',
            'duration_seconds' => 'required|integer|min:1|max:3600',
            'started_at' => 'required|date',
            'ended_at' => 'required|date',
            'players' => 'required|array|min:1|max:12',
            'players.*.player_id' => 'required|integer|distinct|exists:players,id',
            'players.*.position' => 'required|integer|min:1|max:12',
            'players.*.survived' => 'required|boolean',
            'players.*.eliminated_at_ms' => 'nullable|integer|min:0',
            'players.*.hold_ms' => 'required|integer|min:0',
            'players.*.passes' => 'required|integer|min:0',
        ]);

        $game = DB::transaction(function () use ($validated) {
            $game = HotPotatoGame::create([
                'mode' => $validated['mode'] ?? HotPotatoGame::MODE_SURVIVAL,
                'office_id' => $validated['office_id'] ?? null,
                'seed' => $validated['seed'],
                'theme' => $validated['theme'],
                'duration_seconds' => $validated['duration_seconds'],
                'started_at' => Carbon::parse($validated['started_at']),
                'ended_at' => Carbon::parse($validated['ended_at']),
            ]);

            foreach ($validated['players'] as $row) {
                $game->players()->create([
                    'player_id' => $row['player_id'],
                    'position' => $row['position'],
                    'survived' => $row['survived'],
                    'eliminated_at_ms' => $row['eliminated_at_ms'] ?? null,
                    'hold_ms' => $row['hold_ms'],
                    'passes' => $row['passes'],
                ]);
            }

            return $game;
        });

        return response()->json(['id' => $game->id], 201);
    }
}
