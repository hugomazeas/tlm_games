@props(['game'])

<div class="bg-white/5 border border-white/10 rounded-xl p-4 sm:p-6 hover:bg-white/10 transition group">
    <div class="flex items-start justify-between mb-3 sm:mb-4">
        <span class="text-3xl sm:text-4xl">{{ $game->icon }}</span>
        @if($game->is_active)
            <span class="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-500/20 text-emerald-400">Active</span>
        @else
            <span class="text-xs font-semibold px-2 py-1 rounded-full bg-white/10 text-white/50">Coming Soon</span>
        @endif
    </div>
    <h3 class="text-base sm:text-lg font-bold mb-1" style="color: {{ $game->color }}">{{ $game->name }}</h3>
    <p class="text-xs sm:text-sm text-white/50 mb-3 sm:mb-4">{{ $game->description }}</p>
    <div class="flex items-center gap-3">
        @if($game->is_active)
            <a href="{{ url('/games/' . $game->slug) }}" class="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition" style="background-color: {{ $game->color }}; color: #fff;">
                Play &rarr;
            </a>
        @endif
        <a href="{{ url('/leaderboards/' . $game->slug) }}"
           class="inline-flex items-center gap-1.5 text-white/60 hover:text-white transition text-xs sm:text-sm font-medium ml-auto">
            Leaderboard &rarr;
        </a>
    </div>
</div>
