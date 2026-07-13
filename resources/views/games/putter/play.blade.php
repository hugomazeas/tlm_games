@extends('layouts.app')

@section('title', 'Putter - Games Hub')

@section('content')
    <div class="mb-6 sm:mb-8">
        <h1 class="text-2xl sm:text-3xl font-extrabold tracking-tight mb-1">⛳ Putter</h1>
        <p class="text-white/50 text-sm">{{ $balls }} balls, one stroke each — tap each ball made or missed.</p>
    </div>

    @if(session('status'))
        <div class="bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm rounded-lg px-4 py-3 mb-6">
            {{ session('status') }}
        </div>
    @endif

    @if($players->isEmpty())
        <x-empty-state icon="👥" title="No players yet" message="Add a player before recording a round." />
    @else
        <form method="POST" action="{{ url('/games/putter') }}"
              x-data="{
                  results: Array({{ $balls }}).fill(null),
                  playerId: '{{ old('player_id') }}',
                  init() {
                      if (!this.playerId) { this.playerId = localStorage.getItem('putter_last_player') || ''; }
                      this.$watch('playerId', v => localStorage.setItem('putter_last_player', v));
                  }
              }"
              class="bg-white/5 border border-white/10 rounded-xl p-6 mb-8">
            @csrf

            <label class="block text-sm font-medium text-white/70 mb-2">Player</label>
            <select name="player_id" x-model="playerId" required
                    class="w-full bg-white/10 border border-white/20 rounded-lg px-4 py-2 text-sm text-white mb-6 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500">
                <option value="" class="bg-slate-800">Select a player…</option>
                @foreach($players as $player)
                    <option value="{{ $player->id }}" class="bg-slate-800">{{ $player->name }}</option>
                @endforeach
            </select>

            <label class="block text-sm font-medium text-white/70 mb-2">Balls</label>
            <div class="grid grid-cols-{{ $balls }} gap-2 mb-2">
                @for($i = 0; $i < $balls; $i++)
                    <div class="flex flex-col gap-1">
                        <div class="text-center text-xs text-white/40 mb-1">#{{ $i + 1 }}</div>
                        <button type="button" @click="results[{{ $i }}] = true"
                                :class="results[{{ $i }}] === true ? 'bg-emerald-600 border-emerald-400 text-white' : 'bg-white/5 border-white/15 text-white/50'"
                                class="border rounded-lg py-3 text-lg font-bold transition">✓</button>
                        <button type="button" @click="results[{{ $i }}] = false"
                                :class="results[{{ $i }}] === false ? 'bg-red-600 border-red-400 text-white' : 'bg-white/5 border-white/15 text-white/50'"
                                class="border rounded-lg py-3 text-lg font-bold transition">✗</button>
                        <input type="hidden" name="results[{{ $i }}]" :value="results[{{ $i }}] === null ? '' : (results[{{ $i }}] ? 1 : 0)">
                    </div>
                @endfor
            </div>

            <p class="text-center text-sm text-white/60 mb-6">
                Score: <span class="font-bold text-white" x-text="results.filter(r => r === true).length"></span> / {{ $balls }}
            </p>

            <button type="submit"
                    :disabled="results.some(r => r === null)"
                    :class="results.some(r => r === null) ? 'opacity-40 cursor-not-allowed' : 'hover:bg-indigo-500'"
                    class="w-full bg-indigo-600 text-white text-sm font-semibold py-3 rounded-lg transition">
                Save Round
            </button>

            @error('results')
                <p class="text-red-400 text-xs mt-2 text-center">{{ $message }}</p>
            @enderror
        </form>

        @if($recent->isNotEmpty())
            <h2 class="text-sm font-semibold text-white/70 mb-3">Recent rounds</h2>
            <div class="space-y-2">
                @foreach($recent as $game)
                    <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg px-4 py-3">
                        <span class="font-semibold text-sm">{{ $game->player->name }}</span>
                        <div class="flex items-center gap-3">
                            <span class="text-sm font-bold">{{ $game->makes }}/{{ $game->balls }}</span>
                            <span class="text-xs text-white/40">{{ $game->created_at->diffForHumans() }}</span>
                        </div>
                    </div>
                @endforeach
            </div>
        @endif
    @endif
@endsection
