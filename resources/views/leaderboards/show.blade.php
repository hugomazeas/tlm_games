@extends('layouts.app')

@section('title', $gameType->name . ' Leaderboard - Games Hub')

@section('content')
    <div class="mb-8">
        <a href="{{ url('/leaderboards') }}" class="text-sm text-white/50 hover:text-white/70 transition">&larr; All Leaderboards</a>
    </div>

    <div class="flex items-center gap-3 mb-8">
        <span class="text-4xl">{{ $gameType->icon }}</span>
        <div>
            <h1 class="text-3xl font-extrabold tracking-tight" style="color: {{ $gameType->color }}">{{ $gameType->name }}</h1>
            <p class="text-white/50 text-sm">Select a game mode to view rankings.</p>
        </div>
    </div>

    @if(!$gameType->is_active)
        <x-empty-state
            icon="{{ $gameType->icon }}"
            title="{{ $gameType->name }} coming soon"
            message="This game module hasn't been installed yet. Check back later!" />
    @elseif($modes->isEmpty())
        <x-empty-state
            icon="🏆"
            title="No game modes available"
            message="No leaderboard modes have been configured for this game yet." />
    @else
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            @foreach($modes as $mode)
                <a href="{{ url('/leaderboards/' . $gameType->slug . '/' . $mode->slug) }}"
                   class="bg-white/5 border border-white/10 rounded-xl p-6 hover:bg-white/10 transition group block">
                    <h3 class="font-bold text-lg mb-2" style="color: {{ $gameType->color }}">{{ $mode->name }}</h3>
                    @if($mode->description)
                        <p class="text-sm text-white/50">{{ $mode->description }}</p>
                    @endif
                </a>
            @endforeach
        </div>
    @endif
@endsection
