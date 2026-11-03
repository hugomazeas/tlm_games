@extends('layouts.app')

@section('title', $player->name . ' - Office FPS - Games Hub')

@section('content')
    @php
        $minutes = fn (int $ms) => $ms >= 3_600_000
            ? floor($ms / 3_600_000) . ' h ' . floor(($ms % 3_600_000) / 60_000) . ' min'
            : floor($ms / 60_000) . ' min';
    @endphp

    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
            <a href="{{ url('/games/office-fps') }}" class="text-sm text-white/50 hover:text-white">← Office FPS</a>
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mt-1">🔫 {{ $player->name }}</h1>
            @if ($stats && $stats['rank'])
                <p class="text-white/50 text-sm">#{{ $stats['rank'] }} on the <a href="{{ url('/leaderboards/office-fps/kills') }}" class="underline hover:text-white">leaderboard</a></p>
            @endif
        </div>
        <a href="{{ url('/games/office-fps?player=' . $player->id) }}"
           class="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-lg text-sm font-semibold transition">Play as {{ $player->name }}</a>
    </div>

    @if (! $stats)
        <p class="text-white/60">No matches yet. Stats start with the first match {{ $player->name }} plays to the end.</p>
    @else
        @php $t = $stats['totals']; @endphp

        {{-- The headline numbers. --}}
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            @foreach ([
                ['Kills', $t['kills']],
                ['Deaths', $t['deaths']],
                ['K/D', number_format($t['kd'], 2)],
                ['Wins', $t['wins'] . ' / ' . $t['matches']],
            ] as [$label, $value])
                <div class="bg-white/5 border border-white/10 rounded-xl p-4">
                    <div class="text-xs uppercase tracking-wider text-white/50">{{ $label }}</div>
                    <div class="text-2xl font-extrabold mt-1">{{ $value }}</div>
                </div>
            @endforeach
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
            {{-- Everything else, two columns of label / value. --}}
            <section class="bg-white/5 border border-white/10 rounded-xl p-4">
                <h2 class="text-sm uppercase tracking-wider text-white/50 mb-3">Totals</h2>
                <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    @foreach ([
                        ['Matches', $t['matches']],
                        ['Win rate', $t['win_rate'] . '%'],
                        ['Podiums', $t['podiums']],
                        ['Average place', $t['average_place']],
                        ['Kills per match', $t['kills_per_match']],
                        ['Kills per minute', $t['kills_per_minute']],
                        ['Headshots', $t['headshots'] . ' (' . $t['headshot_rate'] . '% of kills)'],
                        ['Accuracy', $t['accuracy'] . '% (' . number_format($t['hits']) . ' / ' . number_format($t['shots']) . ')'],
                        ['Damage', number_format($t['damage'])],
                        ['Damage per match', number_format($t['damage_per_match'])],
                        ['Stapler kills', $t['melee_kills']],
                        ['Backstabs', $t['backstabs']],
                        ['Time played', $minutes($t['played_ms'])],
                        ['Pickups', $t['pickups']],
                        ['Zone time', $minutes($t['zone_ms'])],
                    ] as [$label, $value])
                        <dt class="text-white/50">{{ $label }}</dt>
                        <dd class="text-right font-semibold tabular-nums">{{ $value }}</dd>
                    @endforeach
                </dl>
            </section>

            <div class="space-y-4">
                <section class="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h2 class="text-sm uppercase tracking-wider text-white/50 mb-3">Records</h2>
                    <dl class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                        <dt class="text-white/50">Most kills in a match</dt><dd class="text-right font-semibold">{{ $stats['records']['most_kills'] }}</dd>
                        <dt class="text-white/50">Most damage in a match</dt><dd class="text-right font-semibold">{{ number_format($stats['records']['most_damage']) }}</dd>
                        <dt class="text-white/50">Longest streak</dt><dd class="text-right font-semibold">{{ $stats['records']['best_streak'] }}</dd>
                    </dl>
                </section>

                <section class="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h2 class="text-sm uppercase tracking-wider text-white/50 mb-3">By mode</h2>
                    <table class="w-full text-sm">
                        <tr class="text-white/50"><th class="text-left font-normal">Mode</th><th class="text-right font-normal">Matches</th><th class="text-right font-normal">Wins</th></tr>
                        @foreach ($stats['modes'] as $mode => $counts)
                            <tr>
                                <td class="py-1">{{ \App\Games\OfficeFps\Models\OfficeFpsMatch::MODE_LABELS[$mode] }}</td>
                                <td class="text-right font-semibold tabular-nums">{{ $counts['matches'] }}</td>
                                <td class="text-right font-semibold tabular-nums">{{ $counts['wins'] }}</td>
                            </tr>
                        @endforeach
                    </table>
                </section>

                <section class="bg-white/5 border border-white/10 rounded-xl p-4">
                    <h2 class="text-sm uppercase tracking-wider text-white/50 mb-3">Weapons</h2>
                    <table class="w-full text-sm">
                        <tr class="text-white/50"><th class="text-left font-normal">Weapon</th><th class="text-right font-normal">Kills</th><th class="text-right font-normal">Deaths to it</th></tr>
                        @foreach ($stats['weapons'] as $weapon => $counts)
                            <tr>
                                <td class="py-1">{{ \App\Games\OfficeFps\Models\OfficeFpsKill::WEAPON_LABELS[$weapon] ?? $weapon }}</td>
                                <td class="text-right font-semibold tabular-nums">{{ $counts['kills'] }}</td>
                                <td class="text-right font-semibold tabular-nums">{{ $counts['deaths'] }}</td>
                            </tr>
                        @endforeach
                    </table>
                </section>

                <section class="bg-white/5 border border-white/10 rounded-xl p-4 grid grid-cols-2 gap-4 text-sm">
                    @foreach ([['Nemesis', 'Downed you most', $stats['nemeses']], ['Favourite target', 'You downed most', $stats['victims']]] as [$title, $hint, $rows])
                        <div>
                            <h2 class="text-sm uppercase tracking-wider text-white/50">{{ $title }}</h2>
                            <p class="text-xs text-white/40 mb-2">{{ $hint }}</p>
                            @forelse ($rows as $row)
                                <div class="flex justify-between py-0.5">
                                    <a href="{{ url('/games/office-fps/players/' . $row['player']->id) }}" class="hover:underline">{{ $row['player']->name }}</a>
                                    <span class="font-semibold tabular-nums">{{ $row['count'] }}</span>
                                </div>
                            @empty
                                <p class="text-white/40">Nobody yet</p>
                            @endforelse
                        </div>
                    @endforeach
                </section>
            </div>
        </div>

        <section class="bg-white/5 border border-white/10 rounded-xl p-4">
            <h2 class="text-sm uppercase tracking-wider text-white/50 mb-3">Recent matches</h2>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <tr class="text-white/50 text-left">
                        <th class="font-normal py-1">When</th><th class="font-normal">Mode</th><th class="font-normal">Place</th><th class="font-normal text-right">Kills</th>
                        <th class="font-normal text-right">Deaths</th><th class="font-normal text-right">Damage</th><th class="font-normal text-right">Accuracy</th><th class="font-normal text-right">Rules</th>
                    </tr>
                    @foreach ($stats['recent'] as $result)
                        <tr class="border-t border-white/5">
                            <td class="py-1.5 text-white/70">{{ $result->match->ended_at->diffForHumans() }}</td>
                            <td class="text-white/70">
                                {{ \App\Games\OfficeFps\Models\OfficeFpsMatch::MODE_LABELS[$result->match->mode] ?? $result->match->mode }}
                                @if ($result->match->mode === 'tdm' && $result->team)
                                    <span class="{{ $result->team === 'red' ? 'text-red-400' : 'text-blue-400' }}">· Team {{ $result->team }}</span>
                                @endif
                            </td>
                            <td>{{ $result->won ? '🏆' : '' }} {{ $result->place }} / {{ $result->match->player_count }}{{ $result->left ? ' (left)' : '' }}</td>
                            <td class="text-right tabular-nums">{{ $result->kills }}</td>
                            <td class="text-right tabular-nums">{{ $result->deaths }}</td>
                            <td class="text-right tabular-nums">{{ number_format($result->damage) }}</td>
                            <td class="text-right tabular-nums">{{ $result->shots ? round($result->hits / $result->shots * 100) . '%' : '—' }}</td>
                            <td class="text-right text-white/50">{{ $result->match->frag_limit }} kills · {{ $result->match->minutes }} min</td>
                        </tr>
                    @endforeach
                </table>
            </div>
        </section>
    @endif
@endsection
