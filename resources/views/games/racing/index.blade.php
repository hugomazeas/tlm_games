@extends('layouts.app')

@section('title', 'Racing - Games Hub')

@section('content')
    {{-- Who's driving is remembered in this browser; Play takes them along (?player=), the garage paints their kart. --}}
    <div x-data="{
            playerId: localStorage.getItem('racing_player') ?? '',
            pick() { localStorage.setItem('racing_player', this.playerId) },
            play(url) { return this.playerId ? url + '?player=' + this.playerId : url },
         }">
    <div class="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">🏎️ Racing</h1>
            <p class="text-white/50 text-sm">Kart races through Québec, from the Plains of Abraham to Old Québec. Pick a track, or make your own.</p>
        </div>
        <a href="{{ url('/games/racing/tracks/create') }}"
           class="bg-orange-600 hover:bg-orange-500 px-4 py-2 rounded-lg font-semibold text-sm transition">
            + New track
        </a>
    </div>

    <div class="mb-6 flex flex-wrap items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
        <label for="racing-player" class="text-sm text-white/70">Driving as</label>
        <select id="racing-player" x-model="playerId" @change="pick()"
                class="bg-white/10 border border-white/20 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-orange-500">
            <option value="" class="bg-slate-800">Guest</option>
            @foreach($players as $player)
                <option value="{{ $player->id }}" class="bg-slate-800">{{ $player->name }}</option>
            @endforeach
        </select>
        <a x-show="playerId" x-cloak :href="'{{ url('/games/racing/garage') }}/' + playerId"
           class="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm transition">
            🎨 Garage: paint your kart
        </a>
        <span x-show="!playerId" class="text-sm text-white/50">Pick yourself to race under your name, in your colours.</span>
    </div>

    @if($tracks->isEmpty())
        <div class="bg-white/5 border border-white/10 rounded-xl p-8 text-center text-white/60">
            No tracks yet. <a href="{{ url('/games/racing/tracks/create') }}" class="text-orange-300 hover:text-orange-200">Make the first one →</a>
        </div>
    @else
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            @foreach($tracks as $track)
                <div class="bg-white/5 border border-white/10 rounded-xl overflow-hidden flex flex-col">
                    <a href="{{ url('/games/racing/tracks/' . $track->id . '/play') }}"
                       :href="play('{{ url('/games/racing/tracks/' . $track->id . '/play') }}')" class="block bg-black/20 hover:bg-black/30 transition">
                        <svg viewBox="0 0 100 100" class="w-full h-40" aria-hidden="true">
                            <path d="{{ $track->outlinePath() }}" fill="none" stroke="#fb923c" stroke-width="2.5" stroke-linejoin="round"/>
                        </svg>
                    </a>
                    <div class="p-4 flex-1 flex flex-col gap-3">
                        <div>
                            <h2 class="font-bold text-lg leading-tight">{{ $track->name }}</h2>
                            <p class="text-white/50 text-sm">
                                {{ $track->laps }} {{ Str::plural('lap', $track->laps) }}
                                · {{ count($track->gates) }} checkpoints
                                @if($track->length)
                                    · {{ number_format($track->length / 1000, 2) }} km a lap
                                @endif
                            </p>
                        </div>
                        <div class="flex gap-2 mt-auto">
                            <a href="{{ url('/games/racing/tracks/' . $track->id . '/play') }}"
                               :href="play('{{ url('/games/racing/tracks/' . $track->id . '/play') }}')"
                               class="flex-1 text-center bg-orange-600 hover:bg-orange-500 px-3 py-2 rounded-lg font-semibold text-sm transition">
                                Play
                            </a>
                            <a href="{{ url('/games/racing/tracks/' . $track->id . '/edit') }}"
                               class="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-lg text-sm transition">
                                Edit
                            </a>
                            <form method="POST" action="{{ url('/games/racing/tracks/' . $track->id) }}"
                                  onsubmit="return confirm('Delete this track?')">
                                @csrf
                                @method('DELETE')
                                <button type="submit" class="bg-red-500/20 hover:bg-red-500/30 text-red-400 px-3 py-2 rounded-lg text-sm transition">
                                    Delete
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            @endforeach
        </div>
    @endif
    </div>
@endsection
