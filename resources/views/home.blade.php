@extends('layouts.app')

@section('title', 'Games Hub')

@section('content')
    {{-- Hero --}}
    <div class="mb-8 sm:mb-12">
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1.5">Games Hub</h1>
        <p class="text-white/50 text-sm sm:text-base">Your office gaming dashboard. Track scores, compete, and have fun.</p>
    </div>

    {{-- Game sections --}}
    <div class="space-y-6 sm:space-y-8 mb-10 sm:mb-12">
        @foreach($gameTypes as $game)
            <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                {{-- Game header --}}
                <div class="p-4 sm:p-6 pb-0 sm:pb-0">
                    <div class="flex items-start justify-between mb-1">
                        <div class="flex items-center gap-2.5 sm:gap-3">
                            <span class="text-3xl sm:text-4xl">{{ $game->icon }}</span>
                            <div>
                                <h2 class="text-lg sm:text-xl font-bold" style="color: {{ $game->color }}">{{ $game->name }}</h2>
                                <p class="text-xs sm:text-sm text-white/40">{{ $game->description }}</p>
                            </div>
                        </div>
                        @if($game->is_active)
                            <span class="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400 flex-shrink-0">Active</span>
                        @else
                            <span class="text-xs font-semibold px-2 py-1 rounded-full bg-white/10 text-white/50 flex-shrink-0">Coming Soon</span>
                        @endif
                    </div>
                </div>

                @if($game->is_active && isset($gameLeaderboards[$game->slug]))
                    @php
                        $lb = $gameLeaderboards[$game->slug];
                        $entries = $lb['entries'];
                        $primaryCol = $lb['primary_column'];
                    @endphp

                    @if($entries->isNotEmpty())
                        {{-- Mini podium --}}
                        <div class="px-4 sm:px-6 py-4 sm:py-5">
                            <div class="flex items-end justify-center gap-3 sm:gap-5 mb-1">
                                {{-- 2nd place --}}
                                @if($entries->count() >= 2)
                                    <div class="flex flex-col items-center w-24 sm:w-28">
                                        <span class="text-xs text-white/40 mb-1">2nd</span>
                                        <div class="w-full rounded-t-lg pt-4 pb-3 flex flex-col items-center" style="background: {{ $game->color }}15; border: 1px solid {{ $game->color }}25; border-bottom: none; min-height: 80px;">
                                            <span class="text-xl sm:text-2xl mb-1">🥈</span>
                                            <span class="font-bold text-xs sm:text-sm text-white truncate max-w-full px-2">{{ $entries[1]['player_name'] }}</span>
                                            @if($primaryCol)
                                                <span class="text-xs font-mono mt-0.5" style="color: {{ $game->color }}">{{ $entries[1][$primaryCol['key']] ?? '—' }}</span>
                                            @endif
                                        </div>
                                    </div>
                                @else
                                    <div class="w-24 sm:w-28"></div>
                                @endif

                                {{-- 1st place --}}
                                <div class="flex flex-col items-center w-28 sm:w-32">
                                    <span class="text-xs text-white/40 mb-1">1st</span>
                                    <div class="w-full rounded-t-lg pt-5 pb-4 flex flex-col items-center" style="background: {{ $game->color }}20; border: 1px solid {{ $game->color }}40; border-bottom: none; min-height: 100px;">
                                        <span class="text-2xl sm:text-3xl mb-1">🥇</span>
                                        <span class="font-bold text-sm sm:text-base text-white truncate max-w-full px-2">{{ $entries[0]['player_name'] }}</span>
                                        @if($primaryCol)
                                            <span class="text-sm font-mono font-bold mt-0.5" style="color: {{ $game->color }}">{{ $entries[0][$primaryCol['key']] ?? '—' }}</span>
                                        @endif
                                    </div>
                                </div>

                                {{-- 3rd place --}}
                                @if($entries->count() >= 3)
                                    <div class="flex flex-col items-center w-24 sm:w-28">
                                        <span class="text-xs text-white/40 mb-1">3rd</span>
                                        <div class="w-full rounded-t-lg pt-3 pb-2 flex flex-col items-center" style="background: {{ $game->color }}10; border: 1px solid {{ $game->color }}15; border-bottom: none; min-height: 64px;">
                                            <span class="text-lg sm:text-xl mb-1">🥉</span>
                                            <span class="font-bold text-xs sm:text-sm text-white truncate max-w-full px-2">{{ $entries[2]['player_name'] }}</span>
                                            @if($primaryCol)
                                                <span class="text-xs font-mono mt-0.5" style="color: {{ $game->color }}">{{ $entries[2][$primaryCol['key']] ?? '—' }}</span>
                                            @endif
                                        </div>
                                    </div>
                                @else
                                    <div class="w-24 sm:w-28"></div>
                                @endif
                            </div>
                            @if($primaryCol)
                                <p class="text-center text-xs text-white/30 mt-1">Ranked by {{ $lb['mode_name'] }} — {{ $primaryCol['label'] }}</p>
                            @endif
                        </div>
                    @else
                        <div class="px-4 sm:px-6 py-6 text-center">
                            <p class="text-sm text-white/30">No games played yet. Be the first!</p>
                        </div>
                    @endif

                    {{-- Actions --}}
                    <div class="border-t border-white/10 px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
                        <a href="{{ url('/leaderboards/' . $game->slug) }}"
                           class="inline-flex items-center gap-1.5 text-sm font-semibold transition hover:opacity-80"
                           style="color: {{ $game->color }}">
                            View Full Leaderboard &rarr;
                        </a>
                        <a href="{{ url('/games/' . $game->slug) }}"
                           class="hidden sm:inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-sm font-semibold transition hover:opacity-90"
                           style="background-color: {{ $game->color }}; color: #fff;">
                            Play &rarr;
                        </a>
                    </div>
                @elseif(!$game->is_active)
                    <div class="px-4 sm:px-6 py-6 text-center">
                        <p class="text-sm text-white/40">This game is coming soon.</p>
                    </div>
                @endif
            </div>
        @endforeach
    </div>

    {{-- Quick links --}}
    <div class="grid grid-cols-2 gap-3 sm:gap-6">
        <a href="{{ url('/players') }}" class="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition group">
            <h2 class="text-base sm:text-lg font-bold mb-1 sm:mb-4">👥 Players</h2>
            <p class="text-xs sm:text-sm text-white/50 mb-2 sm:mb-4">{{ $playerCount }} registered</p>
            <span class="text-xs sm:text-sm text-indigo-400 group-hover:text-indigo-300 font-medium hidden sm:inline">Manage Players →</span>
        </a>
        <a href="{{ url('/leaderboards') }}" class="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition group">
            <h2 class="text-base sm:text-lg font-bold mb-1 sm:mb-4">🏆 Leaderboards</h2>
            <p class="text-xs sm:text-sm text-white/50 mb-2 sm:mb-4">{{ $activeGameCount }} active {{ Str::plural('game', $activeGameCount) }}</p>
            <span class="text-xs sm:text-sm text-indigo-400 group-hover:text-indigo-300 font-medium hidden sm:inline">View Leaderboards →</span>
        </a>
    </div>
@endsection
