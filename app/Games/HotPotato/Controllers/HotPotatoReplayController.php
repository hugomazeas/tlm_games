<?php

namespace App\Games\HotPotato\Controllers;

use App\Games\HotPotato\Models\HotPotatoGame;
use App\Http\Controllers\Controller;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Storage;
use Illuminate\View\View;

/**
 * Watching a finished game again. The page loads the sidecar's replay player,
 * which fetches the recording from `data`.
 */
class HotPotatoReplayController extends Controller
{
    public function show(HotPotatoGame $game): View
    {
        abort_unless($game->hasReplay(), 404);

        $game->load('players.player:id,name', 'office:id,name');

        return view('games.hot-potato.replay', ['game' => $game]);
    }

    /** The recording, still gzipped: the browser unzips it on the way in. */
    public function data(HotPotatoGame $game): Response
    {
        $disk = Storage::disk('local');
        abort_unless($game->hasReplay() && $disk->exists($game->replay_path), 404);

        return response($disk->get($game->replay_path), 200, [
            'Content-Type' => 'application/json',
            'Content-Encoding' => 'gzip',
            'Cache-Control' => 'private, max-age=86400',
        ]);
    }
}
