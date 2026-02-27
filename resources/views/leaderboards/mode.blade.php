@extends('layouts.app')

@section('title', $gameMode->name . ' - ' . $gameType->name . ' - Games Hub')

@section('content')
    <div class="mb-8">
        <a href="{{ url('/leaderboards/' . $gameType->slug) }}" class="text-sm text-white/50 hover:text-white/70 transition">&larr; {{ $gameType->name }} Modes</a>
    </div>

    <div class="flex items-center gap-3 mb-8">
        <span class="text-4xl">{{ $gameType->icon }}</span>
        <div>
            <h1 class="text-3xl font-extrabold tracking-tight" style="color: {{ $gameType->color }}">{{ $gameType->name }}</h1>
            <p class="text-white/50 text-sm">{{ $gameMode->name }}</p>
        </div>
    </div>

    @if($entries->isEmpty())
        <x-empty-state
            icon="🏆"
            title="No entries yet"
            message="Play some games to see rankings here." />
    @else
        <div class="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table class="w-full text-sm">
                <thead>
                    <tr class="border-b border-white/10">
                        <th class="text-left px-5 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">#</th>
                        <th class="text-left px-5 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">Player</th>
                        @foreach($columns as $col)
                            <th class="text-left px-5 py-3 text-xs font-semibold text-white/50 uppercase tracking-wider">{{ $col['label'] }}</th>
                        @endforeach
                    </tr>
                </thead>
                <tbody>
                    @foreach($entries as $index => $entry)
                        <tr class="border-b border-white/5 hover:bg-white/5 transition">
                            <td class="px-5 py-3 text-white/40 font-mono">{{ $index + 1 }}</td>
                            <td class="px-5 py-3 font-semibold">
                                <a href="{{ url('/players/' . $entry['player_id']) }}" class="hover:text-indigo-400 transition">
                                    {{ $entry['player_name'] }}
                                </a>
                            </td>
                            @foreach($columns as $col)
                                <td class="px-5 py-3 text-white/70">{{ $entry[$col['key']] ?? '—' }}</td>
                            @endforeach
                        </tr>
                    @endforeach
                </tbody>
            </table>
        </div>
    @endif
@endsection
