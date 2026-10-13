@extends('layouts.app')

@section('title', ($track->name ?? 'Free roam') . ' - Racing - Games Hub')

@section('content')
    @php
        $config = $track
            ? [
                'mode' => 'race',
                'mapUrl' => url('/games/racing/live/map.json'),
                'track' => ['id' => $track->id, 'name' => $track->name, 'laps' => $track->laps, 'gates' => $track->gates],
                'backUrl' => url('/games/racing'),
                'driver' => $driver,
                'playerId' => $player?->id,
                'lobby' => $lobby,
                'recordsUrl' => url("/games/racing/tracks/{$track->id}/records"),
            ]
            : [
                'mode' => 'roam',
                'mapUrl' => url('/games/racing/live/map.json'),
                'track' => null,
                'backUrl' => url('/games/racing'),
            ];
    @endphp

    {{-- The game comes from the game server (game-server/src/race/client/main.ts) and covers the whole window. --}}
    <p class="text-white/60">Loading {{ $track->name ?? 'the map' }}…</p>
    <script>window.racingConfig = @json($config);</script>
    <script type="module" src="{{ url('/games/racing/live/play.js') }}"></script>
@endsection
