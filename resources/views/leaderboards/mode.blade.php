@extends('layouts.app')

@section('title', $gameMode->name . ' - ' . $gameType->name . ' - Games Hub')

@section('content')
    <div class="mb-6 sm:mb-8">
        <a href="{{ url('/leaderboards/' . $gameType->slug) }}" class="text-sm text-white/50 hover:text-white/70 transition">&larr; {{ $gameType->name }} Modes</a>
    </div>

    <div class="flex items-center justify-between mb-6 sm:mb-8">
        <div class="flex items-center gap-3">
            <span class="text-3xl sm:text-4xl">{{ $gameType->icon }}</span>
            <div>
                <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight" style="color: {{ $gameType->color }}">{{ $gameType->name }}</h1>
                <p class="text-white/50 text-sm">{{ $gameMode->name }}</p>
            </div>
        </div>
        @if(!$entries->isEmpty())
            <button
                x-data="{ copied: false }"
                x-on:click="
                    const medal = ['🥇', '🥈', '🥉'];
                    let text = '{{ $gameType->icon }} *{{ $gameType->name }} — {{ $gameMode->name }}*\n\n';
                    document.querySelectorAll('#leaderboard-table tbody tr').forEach((row, i) => {
                        const cells = row.querySelectorAll('td');
                        const rank = medal[i] || `${i + 1}.`;
                        const name = cells[1].textContent.trim();
                        const stats = [];
                        @foreach($columns as $col)
                            stats.push('{{ $col['label'] }}: ' + cells[{{ $loop->index }} + 2].textContent.trim());
                        @endforeach
                        text += `${rank} *${name}* — ${stats.join(' | ')}\n`;
                    });
                    navigator.clipboard.writeText(text);
                    copied = true;
                    setTimeout(() => copied = false, 2000);
                "
                x-text="copied ? 'Copied! ✅' : '📋 Copy for Slack'"
                class="px-3 py-1.5 text-xs sm:text-sm font-medium bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg transition cursor-pointer whitespace-nowrap"
            ></button>
        @endif
    </div>

    @if($entries->isEmpty())
        <x-empty-state
            icon="🏆"
            title="No entries yet"
            message="Play some games to see rankings here." />
    @else
        <div class="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            {{-- Scrollable wrapper for mobile --}}
            <div class="overflow-x-auto">
                <table id="leaderboard-table" class="w-full text-sm min-w-[480px]">
                    <thead>
                        <tr class="border-b border-white/10">
                            <th class="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider w-10">#</th>
                            <th class="text-left px-3 sm:px-5 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">Player</th>
                            @foreach($columns as $col)
                                <th class="{{ ($col['type'] ?? null) === 'last_10' ? 'text-center' : 'text-left' }} px-3 sm:px-5 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">{{ $col['label'] }}</th>
                            @endforeach
                        </tr>
                    </thead>
                    <tbody>
                        @foreach($entries as $index => $entry)
                            <tr class="border-b border-white/5 hover:bg-white/5 transition">
                                <td class="px-3 sm:px-5 py-3 text-white/40 font-mono">{{ $index + 1 }}</td>
                                <td class="px-3 sm:px-5 py-3 font-semibold whitespace-nowrap">
                                    <a href="{{ url('/players/' . $entry['player_id']) }}" class="hover:text-indigo-400 transition">
                                        {{ $entry['player_name'] }}
                                    </a>
                                </td>
                                @foreach($columns as $col)
                                    @if(($col['type'] ?? null) === 'last_10' && is_array($entry[$col['key']] ?? null))
                                        @php
                                            $results = $entry[$col['key']];
                                            $w = count(array_filter($results, fn($r) => $r === 'W'));
                                            $l = count($results) - $w;
                                        @endphp
                                        <td class="px-3 sm:px-5 py-3 text-center whitespace-nowrap">
                                            @if(count($results) > 0)
                                                <div class="flex flex-col items-center gap-1">
                                                    <span class="text-sm font-semibold text-white/80">{{ $w }}-{{ $l }}</span>
                                                    <div class="flex items-center gap-[3px]">
                                                        @foreach($results as $r)
                                                            <span class="inline-block w-[7px] h-[7px] rounded-full {{ $r === 'W' ? 'bg-green-500' : 'bg-red-500' }}"></span>
                                                        @endforeach
                                                        <span class="text-[9px] text-white/25 ml-0.5">&#9656;</span>
                                                    </div>
                                                </div>
                                            @else
                                                <span class="text-white/30">—</span>
                                            @endif
                                        </td>
                                    @elseif(($col['type'] ?? null) === 'record')
                                        <td class="px-3 sm:px-5 py-3 whitespace-nowrap">
                                            <div class="flex flex-col items-center">
                                                <span class="text-[15px] font-semibold">
                                                    @php $parts = explode('-', $entry[$col['key']] ?? '0-0'); @endphp
                                                    <span class="text-green-500">{{ $parts[0] }}</span><span class="text-white/30">-</span><span class="text-red-500">{{ $parts[1] ?? 0 }}</span>
                                                </span>
                                                @if(isset($entry['win_rate']))
                                                    <span class="text-[11px] text-white/40">{{ $entry['win_rate'] }}</span>
                                                @endif
                                            </div>
                                        </td>
                                    @else
                                        <td class="px-3 sm:px-5 py-3 text-white/70 whitespace-nowrap">{{ $entry[$col['key']] ?? '—' }}</td>
                                    @endif
                                @endforeach
                            </tr>
                        @endforeach
                    </tbody>
                </table>
            </div>
        </div>
    @endif
@endsection
