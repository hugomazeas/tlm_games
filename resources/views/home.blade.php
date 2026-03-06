@extends('layouts.app')

@section('title', 'Games Hub')

@section('content')
    <div class="mb-8">
        <h1 class="text-5xl font-extrabold tracking-tight mb-2">Games Hub</h1>
        <p class="text-white/50">Your office gaming dashboard. Track scores, compete, and have fun.</p>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        @foreach($gameTypes as $game)
            <x-game-card :game="$game" />
        @endforeach
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div class="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 class="text-lg font-bold mb-4">👥 Players</h2>
            <p class="text-sm text-white/50 mb-4">{{ $playerCount }} registered {{ Str::plural('player', $playerCount) }}</p>
            <a href="{{ url('/players') }}" class="text-sm text-indigo-400 hover:text-indigo-300 font-medium">Manage Players →</a>
        </div>
        <div class="bg-white/5 border border-white/10 rounded-xl p-6">
            <h2 class="text-lg font-bold mb-4">🏆 Leaderboards</h2>
            <p class="text-sm text-white/50 mb-4">{{ $activeGameCount }} active {{ Str::plural('game', $activeGameCount) }}</p>
            <a href="{{ url('/leaderboards') }}" class="text-sm text-indigo-400 hover:text-indigo-300 font-medium">View Leaderboards →</a>
        </div>
    </div>
@endsection
