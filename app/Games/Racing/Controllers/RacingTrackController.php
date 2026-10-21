<?php

namespace App\Games\Racing\Controllers;

use App\Games\Racing\Models\RacingKart;
use App\Games\Racing\Models\RacingResult;
use App\Games\Racing\Models\RacingTrack;
use App\Http\Controllers\Controller;
use App\Models\Player;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/**
 * The racing game's pages: pick a track, lay one out in the editor, race it.
 * The editor and the game themselves come from the game server
 * (game-server/src/race, served under /games/racing/live/).
 */
class RacingTrackController extends Controller
{
    public function index(): View
    {
        return view('games.racing.index', [
            'tracks' => RacingTrack::orderBy('name')->get(),
            'players' => Player::orderBy('name')->get(['id', 'name']),
        ]);
    }

    public function create(): View
    {
        return view('games.racing.editor', ['track' => null]);
    }

    public function edit(RacingTrack $track): View
    {
        return view('games.racing.editor', ['track' => $track]);
    }

    /**
     * Races the track as the player picked on the track list (?player=), or as
     * a guest: in the lobby given (?lobby=, from the lobby list), or in a new
     * one the driver hosts. Lobbies live in the game server.
     */
    public function play(Request $request, RacingTrack $track): View
    {
        $player = $request->integer('player') ? Player::find($request->integer('player')) : null;
        $lobby = $request->string('lobby')->toString();

        return view('games.racing.play', [
            'track' => $track,
            'player' => $player,
            'driver' => RacingKart::lookOf($player),
            'drivers' => RacingKart::drivers(),
            'lobby' => preg_match('/^[a-z0-9]{1,16}$/', $lobby) ? $lobby : null,
        ]);
    }

    /** The map with no race: fly around and identify buildings. */
    public function roam(): View
    {
        return view('games.racing.play', ['track' => null, 'player' => null, 'driver' => null, 'lobby' => null]);
    }

    /** The track's record table, for the game's Records panel. */
    public function records(RacingTrack $track): JsonResponse
    {
        return response()->json(RacingResult::recordsFor($track));
    }

    public function store(Request $request): JsonResponse
    {
        $track = RacingTrack::create($this->validated($request));

        return response()->json($this->links($track), 201);
    }

    public function update(Request $request, RacingTrack $track): JsonResponse
    {
        $track->update($this->validated($request, $track));

        return response()->json($this->links($track));
    }

    public function destroy(RacingTrack $track): RedirectResponse
    {
        $track->delete();

        return redirect('/games/racing')->with('success', "“{$track->name}” deleted.");
    }

    /**
     * The track as the editor sends it. The editor checks it can be raced
     * (on streets, nothing across a checkpoint, room for the grid); this
     * checks its shape, and that every checkpoint is on the map.
     *
     * @return array{name: string, map: string, laps: int, length: int|null, gates: array<int, array{lat: float, lon: float, heading: float, width: float}>}
     */
    private function validated(Request $request, ?RacingTrack $track = null): array
    {
        $map = $track->map ?? 'quebec-plains';
        $bounds = RacingTrack::MAPS[$map];

        $validated = $request->validate([
            'name' => ['required', 'string', 'max:60', Rule::unique('racing_tracks', 'name')->ignore($track?->id)],
            'laps' => ['required', 'integer', 'between:1,'.RacingTrack::MAX_LAPS],
            'length' => ['nullable', 'integer', 'between:0,100000'],
            'gates' => ['required', 'array', 'between:'.RacingTrack::MIN_GATES.','.RacingTrack::MAX_GATES],
            'gates.*' => ['array:lat,lon,heading,width'],
            'gates.*.lat' => ['required', 'numeric', "between:{$bounds['south']},{$bounds['north']}"],
            'gates.*.lon' => ['required', 'numeric', "between:{$bounds['west']},{$bounds['east']}"],
            'gates.*.heading' => ['required', 'numeric', 'between:-360,360'],
            'gates.*.width' => ['required', 'numeric', 'between:3,60'],
        ], [
            'name.unique' => 'There is already a track with that name.',
            'gates.between' => 'A track needs between :min and :max checkpoints.',
            'gates.*.lat.between' => 'Every checkpoint must be on the map.',
            'gates.*.lon.between' => 'Every checkpoint must be on the map.',
        ]);

        return [
            'name' => $validated['name'],
            'map' => $map,
            'laps' => (int) $validated['laps'],
            'length' => isset($validated['length']) ? (int) $validated['length'] : null,
            'gates' => array_map(fn (array $gate) => [
                'lat' => (float) $gate['lat'],
                'lon' => (float) $gate['lon'],
                'heading' => (float) $gate['heading'],
                'width' => (float) $gate['width'],
            ], $validated['gates']),
        ];
    }

    /**
     * Where the editor goes once a track is saved.
     *
     * @return array{id: int, index_url: string, play_url: string, edit_url: string}
     */
    private function links(RacingTrack $track): array
    {
        return [
            'id' => $track->id,
            'index_url' => url('/games/racing'),
            'play_url' => url("/games/racing/tracks/{$track->id}/play"),
            'edit_url' => url("/games/racing/tracks/{$track->id}/edit"),
        ];
    }
}
