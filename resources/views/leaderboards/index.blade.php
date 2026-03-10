@extends('layouts.app')

@section('title', 'Leaderboards - Games Hub')

@section('content')
    <div class="mb-6 sm:mb-8">
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1.5">Leaderboards</h1>
        <p class="text-white/50 text-sm">Select a game to view rankings.</p>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        @foreach($gameTypes as $game)
            <a href="{{ url('/leaderboards/' . $game->slug) }}"
               class="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition group block">
                <div class="flex items-center gap-3 mb-2 sm:mb-3">
                    <span class="text-2xl sm:text-3xl">{{ $game->icon }}</span>
                    <div>
                        <h3 class="font-bold text-sm sm:text-base" style="color: {{ $game->color }}">{{ $game->name }}</h3>
                        @if($game->is_active)
                            <span class="text-xs text-emerald-400">Active</span>
                        @else
                            <span class="text-xs text-white/40">Coming Soon</span>
                        @endif
                    </div>
                </div>
                <p class="text-xs sm:text-sm text-white/50">{{ $game->description }}</p>
            </a>
        @endforeach
    </div>
@endsection
