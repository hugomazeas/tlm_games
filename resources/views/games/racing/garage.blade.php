@extends('layouts.app')

@section('title', 'Garage - Racing - Games Hub')

@section('content')
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">{{ $player->name }}’s kart</h1>
            <p class="text-white/50 text-sm">Pick your colours: they follow you onto every track, under your name tag.</p>
        </div>
        <a href="{{ url('/games/racing') }}" class="text-sm text-orange-300 hover:text-orange-200">← Tracks</a>
    </div>

    @php
        $config = [
            ...$look,
            'saveUrl' => url('/games/racing/garage/' . $player->id),
            'csrf' => csrf_token(),
        ];
    @endphp

    {{-- The garage comes from the game server (game-server/src/race/client/garage.ts) and fills this box. --}}
    <div id="garage"></div>
    <script>window.garageConfig = @json($config);</script>
    <script type="module" src="{{ url('/games/racing/live/garage.js') }}"></script>
@endsection
