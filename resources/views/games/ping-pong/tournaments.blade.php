@extends('layouts.app')

@section('title', 'Ping Pong Tournaments - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')
@include('games.ping-pong.partials.chrome', ['pageTitle' => 'Tournaments', 'pageBack' => '/games/ping-pong'])

<div class="pph-stage relative rounded-3xl p-4 md:p-7 overflow-x-hidden">

    {{-- Step 1: pick the field --}}
    <section class="pph-panel p-5 md:p-6 mb-5" x-data="{ picked: @js(array_map('intval', old('player_ids', []))), search: '' }">
        <div class="flex items-baseline gap-2.5 mb-1">
            <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6]">New tournament</span>
            <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Singles · single elimination</span>
        </div>
        <p class="text-sm text-[#f5ecd6]/50 mb-4">Tournament matches record points and tags as usual, but never touch ELO or the official stats.</p>

        @if ($errors->any())
            <div class="mb-4 px-4 py-3 rounded-xl bg-[#ff5a4a]/10 border border-[#ff5a4a]/30 text-[#ff5a4a] text-sm">
                @foreach ($errors->all() as $error)
                    <div>{{ $error }}</div>
                @endforeach
            </div>
        @endif

        <form method="POST" action="/games/ping-pong/tournaments">
            @csrf
            <div class="flex flex-wrap gap-3 mb-4">
                <input type="text" name="name" required maxlength="100" placeholder="Tournament name"
                       value="{{ old('name', 'Tournament '.now()->format('M j')) }}"
                       class="flex-1 min-w-[200px] px-4 py-2 rounded-xl bg-[#f5ecd6]/[0.04] border border-[#f5ecd6]/15 text-[#f5ecd6] placeholder-[#f5ecd6]/30">
                <input type="search" x-model="search" placeholder="Filter players"
                       class="w-[200px] px-4 py-2 rounded-xl bg-[#f5ecd6]/[0.04] border border-[#f5ecd6]/15 text-[#f5ecd6] placeholder-[#f5ecd6]/30">
            </div>

            <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mb-4">
                @foreach ($players as $player)
                    <label x-show="@js(strtolower($player->name)).includes(search.toLowerCase())"
                           class="flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer transition"
                           :class="picked.includes({{ $player->id }}) ? 'border-[#3ec8ff]/50 bg-[#3ec8ff]/10 text-[#f5ecd6]' : 'border-[#f5ecd6]/12 text-[#f5ecd6]/60 hover:border-[#f5ecd6]/30'">
                        <input type="checkbox" name="player_ids[]" value="{{ $player->id }}" x-model.number="picked" class="accent-[#3ec8ff]">
                        <span class="truncate text-sm font-semibold">{{ $player->name }}</span>
                    </label>
                @endforeach
            </div>

            <div class="flex items-center gap-3">
                <button type="submit" :disabled="picked.length < 2"
                        class="px-4 py-2 rounded-full bg-[#ff5a4a] text-[#06081b] text-sm font-semibold cursor-pointer transition hover:bg-[#ff7a6a] disabled:opacity-40 disabled:cursor-not-allowed">
                    Build bracket →
                </button>
                <span class="pph-mono text-[11px] tracking-[0.12em] uppercase text-[#f5ecd6]/45"
                      x-text="picked.length + ' players' + (picked.length >= 2 ? ' · seeded by ELO' : '')"></span>
            </div>
        </form>
    </section>

    <section class="pph-panel p-5 md:p-6">
        <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6] block mb-4">Past &amp; ongoing</span>
        @forelse ($tournaments as $tournament)
            <a href="/games/ping-pong/tournaments/{{ $tournament->id }}"
               class="flex items-center justify-between gap-3 px-4 py-3 mb-2 rounded-xl border border-[#f5ecd6]/12 no-underline hover:bg-[#f5ecd6]/[0.04] transition">
                <span class="font-semibold text-[#f5ecd6]">{{ $tournament->name }}</span>
                <span class="pph-mono text-[11px] tracking-[0.12em] uppercase {{ $tournament->isComplete() ? 'text-[#3ec8ff]' : 'text-[#ff5a4a]' }}">
                    {{ $tournament->isComplete() ? '🏆 '.($tournament->winner->name ?? '—') : 'In progress' }}
                    · {{ $tournament->created_at->format('M j') }}
                </span>
            </a>
        @empty
            <p class="text-sm text-[#f5ecd6]/40">No tournaments yet.</p>
        @endforelse
    </section>
</div>
@endsection
