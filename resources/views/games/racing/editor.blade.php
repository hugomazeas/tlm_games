@extends('layouts.app')

@section('title', ($track ? 'Edit ' . $track->name : 'New track') . ' - Racing - Games Hub')

@section('main-class', 'max-w-none mx-auto px-4 sm:px-6 py-4')

@section('content')
    <div class="mb-3 flex items-center justify-between gap-4">
        <h1 class="text-xl font-extrabold tracking-tight">{{ $track ? 'Edit “' . $track->name . '”' : 'New track' }}</h1>
        <a href="{{ url('/games/racing') }}" class="text-sm text-orange-300 hover:text-orange-200">← All tracks</a>
    </div>

    @php
        $config = [
            'mapUrl' => url('/games/racing/live/map.json'),
            'track' => $track ? ['name' => $track->name, 'laps' => $track->laps, 'gates' => $track->gates] : null,
            'saveUrl' => $track ? url('/games/racing/tracks/' . $track->id) : url('/games/racing/tracks'),
            'method' => $track ? 'PUT' : 'POST',
            'csrf' => csrf_token(),
            'backUrl' => url('/games/racing'),
        ];
    @endphp

    {{-- The editor comes from the game server (game-server/src/race/client/track-editor.ts) and fills this box. --}}
    <div id="track-editor" style="height: calc(100vh - 11rem)"></div>
    <script>window.trackEditorConfig = @json($config);</script>
    <script type="module" src="{{ url('/games/racing/live/editor.js') }}"></script>
@endsection
