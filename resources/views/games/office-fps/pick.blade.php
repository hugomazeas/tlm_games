@extends('layouts.app')

@section('title', 'Office FPS - Games Hub')

@section('content')
    {{-- One game, always open: pick yourself (remembered in this browser) and you're in it. --}}
    <div x-data="{
            state: null,
            remembered: localStorage.getItem('officeFps.player'),
            async refresh() {
                try {
                    const response = await fetch('{{ url('/games/office-fps/live/state') }}', { cache: 'no-store' })
                    if (response.ok) this.state = await response.json()
                } catch {}
            },
         }"
         x-init="refresh(); setInterval(() => refresh(), 3000)">
        <div class="mb-6">
            <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">🔫 Office FPS</h1>
            <p class="text-white/50 text-sm">
                Minis with blasters and jetpacks, all over the office. One game, always on: jump in any time.
            </p>
            <p class="text-sm mt-2" x-show="state" x-cloak>
                <span class="inline-block w-2 h-2 rounded-full mr-1"
                      :class="state && state.players ? 'bg-emerald-400' : 'bg-white/30'"></span>
                <span x-text="state && state.players
                    ? state.players + ' playing' + (state.watching ? ', ' + state.watching + ' waiting for a seat' : '')
                    : 'Nobody in yet'"></span>
            </p>
        </div>

        @if ($unknown)
            <p class="mb-4 text-amber-300 text-sm">That player doesn't exist (any more). Pick yourself again.</p>
        @endif

        <h2 class="text-sm uppercase tracking-wider text-white/50 mb-3">Who's playing?</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-6">
            @foreach ($players as $player)
                <a href="{{ url('/games/office-fps?player='.$player->id) }}"
                   @click="localStorage.setItem('officeFps.player', '{{ $player->id }}')"
                   class="bg-white/5 hover:bg-white/15 rounded-lg px-4 py-3 transition"
                   :class="remembered === '{{ $player->id }}' ? 'ring-2 ring-amber-300/70' : ''">
                    {{ $player->name }}
                </a>
            @endforeach
        </div>
        <a href="{{ url('/games/office-fps?guest=1') }}" class="text-sm text-white/60 hover:text-white underline">
            Play as a guest (not recorded)
        </a>
    </div>
@endsection
