@extends('layouts.app')

@section('title', $track->name . ' - Racing - Games Hub')

@section('content')
    @php
        $config = [
            'mapUrl' => url('/games/racing/live/map.json'),
            'track' => ['id' => $track->id, 'name' => $track->name, 'laps' => $track->laps, 'gates' => $track->gates],
            'backUrl' => url('/games/racing'),
            'driver' => $driver,
        ];
    @endphp

    {{-- The game comes from the game server (game-server/src/race/client/main.ts) and covers the whole window. --}}
    <p class="text-white/60">Loading {{ $track->name }}…</p>
    <script>window.racingConfig = @json($config);</script>
    <script type="module" src="{{ url('/games/racing/live/play.js') }}"></script>
@endsection
