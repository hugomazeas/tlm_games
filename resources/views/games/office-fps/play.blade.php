@extends('layouts.app')

@section('title', 'Office FPS - Games Hub')

@section('content')
    @php
        $config = [
            'playerId' => $player?->id,
            'name' => $player?->name ?? 'Guest',
            'backUrl' => url('/games/office-fps'),
        ];
    @endphp

    {{-- The game comes from the game server (game-server/src/fps/client/main.ts) and covers the whole window. --}}
    <p class="text-white/60">Loading the office…</p>
    <script>window.officeFpsConfig = @json($config);</script>
    <script type="module" src="{{ url('/games/office-fps/live/play.js') }}?v={{ $bundleVersion }}"></script>
@endsection
