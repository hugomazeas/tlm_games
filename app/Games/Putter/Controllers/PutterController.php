<?php

namespace App\Games\Putter\Controllers;

use App\Games\Putter\Models\PutterGame;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\View\View;

class PutterController extends Controller
{
    private const BALLS = 5;

    public function play(): View
    {
        $players = Player::orderBy('name')->get();
        $recent = PutterGame::with('player')->latest()->limit(10)->get();

        return view('games.putter.play', [
            'players' => $players,
            'recent' => $recent,
            'balls' => self::BALLS,
        ]);
    }

    public function submit(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'player_id' => 'required|exists:players,id',
            'results' => 'required|array|size:'.self::BALLS,
            'results.*' => 'required|boolean',
        ]);

        $results = array_map('boolval', $validated['results']);

        PutterGame::create([
            'player_id' => $validated['player_id'],
            'results' => $results,
            'makes' => count(array_filter($results)),
            'balls' => self::BALLS,
        ]);

        return redirect('/games/putter')->with('status', 'Round saved!');
    }
}
