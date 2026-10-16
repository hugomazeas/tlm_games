{{--
    Recent hot potato games, newest first. $games comes from RecentGames;
    rows with a `position` (a player's profile) show where they finished.
--}}
<ul class="divide-y divide-white/5 bg-white/5 border border-white/10 rounded-xl" data-recent-games>
    @foreach($games as $game)
        <li class="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
            @isset($game['position'])
                <span class="w-8 font-semibold {{ $game['survived'] ? 'text-yellow-300' : 'text-white/60' }}">
                    {{ $game['survived'] ? '🏆' : '#'.$game['position'] }}
                </span>
            @endisset
            <span class="font-semibold">{{ $game['mode'] }}</span>
            <span class="text-white/50">{{ $game['arena'] }}</span>
            <span class="text-white/70 truncate">🏆 {{ $game['winners'] }}</span>
            <span class="ml-auto flex items-center gap-3">
                <time class="text-xs text-white/40" datetime="{{ $game['ended_at']->toIso8601String() }}"
                      title="{{ $game['ended_at']->toDayDateTimeString() }}">{{ $game['ended_at']->diffForHumans() }}</time>
                @if($game['replay_url'])
                    <a href="{{ $game['replay_url'] }}" data-watch-replay
                       class="rounded-lg bg-white/10 hover:bg-white/20 px-3 py-1 text-xs font-semibold transition">▶ Watch</a>
                @endif
            </span>
        </li>
    @endforeach
</ul>
