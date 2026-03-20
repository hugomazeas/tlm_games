<?php

namespace App\Http\Controllers;

use App\Models\GameType;
use App\Models\Office;
use App\Models\Player;
use App\Services\LeaderboardService;
use Illuminate\Http\Request;

class PlayerController extends Controller
{
    public function index()
    {
        return view('players.index', [
            'players' => Player::orderBy('name')->get(),
        ]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:players,name',
        ]);

        Player::create($validated);

        return redirect('/players')->with('success', 'Player created.');
    }

    public function show(Player $player, LeaderboardService $leaderboard)
    {
        $gameStats = [];

        foreach (GameType::active()->get() as $gameType) {
            $providers = $leaderboard->getProvidersForGameType($gameType->slug);

            foreach ($providers as $modeSlug => $provider) {
                $stats = $provider->getPlayerStats($player->id);
                if ($stats) {
                    $mode = $gameType->gameModes()->where('slug', $modeSlug)->first();
                    $gameStats[] = [
                        'name' => $gameType->name . ($mode ? ' - ' . $mode->name : ''),
                        'icon' => $gameType->icon,
                        'color' => $gameType->color,
                        'stats' => $stats,
                    ];
                }
            }
        }

        return view('players.show', [
            'player' => $player,
            'gameStats' => $gameStats,
        ]);
    }

    public function edit(Player $player)
    {
        return view('players.edit', [
            'player' => $player,
            'offices' => Office::orderBy('name')->get(),
        ]);
    }

    public function update(Request $request, Player $player)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255|unique:players,name,' . $player->id,
            'office_id' => 'nullable|exists:offices,id',
        ]);

        $player->update($validated);

        return redirect('/players/' . $player->id)->with('success', 'Player updated.');
    }

    public function destroy(Player $player)
    {
        $player->delete();

        return redirect('/players')->with('success', 'Player deleted.');
    }
}
