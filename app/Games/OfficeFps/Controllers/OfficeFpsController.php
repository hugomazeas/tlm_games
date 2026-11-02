<?php

namespace App\Games\OfficeFps\Controllers;

use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\Request;
use Illuminate\View\View;

/**
 * There is one game, always open: this page either asks who you are, or puts you in it
 * (`?player=ID`, or `?guest=1`).
 */
class OfficeFpsController extends Controller
{
    public function show(Request $request): View
    {
        $player = $request->integer('player') ? Player::find($request->integer('player')) : null;

        if ($player === null && ! $request->boolean('guest')) {
            return view('games.office-fps.pick', [
                'players' => Player::query()->orderBy('name')->get(['id', 'name']),
                'unknown' => $request->filled('player'),
            ]);
        }

        return view('games.office-fps.play', ['player' => $player]);
    }
}
