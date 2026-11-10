<?php

namespace App\Games\OfficeFps\Controllers;

use App\Games\OfficeFps\Services\OfficeFpsStats;
use App\Games\Racing\Models\RacingKart;
use App\Games\Racing\Models\RacingResult;
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

        return view('games.office-fps.play', [
            'player' => $player,
            'easterEggs' => $this->easterEggs(),
        ]);
    }

    /**
     * What Cloud Nine's easter eggs show: this week's top fragger (on the paper plane's wing) and
     * the kart colours of the Hub's busiest racing driver (the helmet in the gondola's bucket).
     *
     * @return array{topFragger: string|null, helmet: array{name: string, body: string, accent: string}}
     */
    private function easterEggs(): array
    {
        $driver = RacingResult::query()
            ->whereNotNull('player_id')
            ->groupBy('player_id')
            ->orderByRaw('COUNT(*) DESC')
            ->value('player_id');
        $look = RacingKart::lookOf($driver ? Player::find($driver) : null);

        return [
            'topFragger' => app(OfficeFpsStats::class)->topFraggerOfTheWeek(),
            'helmet' => ['name' => $look['name'], 'body' => $look['body'], 'accent' => $look['accent']],
        ];
    }

    /** A player's office FPS record: totals, rates, records, weapons, rivals, recent matches. */
    public function stats(Player $player, OfficeFpsStats $stats): View
    {
        return view('games.office-fps.stats', ['player' => $player, 'stats' => $stats->forPlayer($player)]);
    }
}
