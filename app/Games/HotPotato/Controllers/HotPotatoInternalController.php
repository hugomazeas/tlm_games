<?php

namespace App\Games\HotPotato\Controllers;

use App\Games\HotPotato\Jobs\SendHotPotatoInviteJob;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Games\HotPotato\Services\ReplayPruner;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Validation\Rule;

/**
 * Endpoints for the hot potato sidecar only, behind RequireInternalSecret.
 * The sidecar never touches the database; everything it knows or keeps goes
 * through here.
 */
class HotPotatoInternalController extends Controller
{
    /** Below PHP's default post_max_size (8 MB); a long 12-player game gzips to ~2 MB. */
    private const MAX_REPLAY_BYTES = 7 * 1024 * 1024;

    private const GZIP_MAGIC = "\x1f\x8b";

    /** Lets the sidecar check a player is real before seating them. */
    public function player(Player $player): JsonResponse
    {
        return response()->json([
            'id' => $player->id,
            'name' => $player->name,
            'avatar_url' => $player->avatarUrl(),
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

    /**
     * A saved game's replay: the gzipped recording as the raw body, stored as is.
     * Saving one prunes the office's oldest replays past the configured count.
     */
    public function replay(Request $request, HotPotatoGame $game, ReplayPruner $pruner): JsonResponse
    {
        $body = $request->getContent();

        if (strlen($body) > self::MAX_REPLAY_BYTES) {
            return response()->json(['message' => 'Replay too large.'], 413);
        }
        if (! str_starts_with($body, self::GZIP_MAGIC)) {
            return response()->json(['message' => 'Expected a gzipped replay.'], 422);
        }

        $path = HotPotatoGame::replayPathFor($game->id);
        Storage::disk('local')->put($path, $body);
        $game->update(['replay_path' => $path]);

        $pruner->prune($game->office_id);

        return response()->json(['id' => $game->id], 201);
    }
}
