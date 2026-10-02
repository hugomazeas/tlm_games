@extends('layouts.app')

@section('title', 'Ping Pong Tournaments - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')

@include('games.ping-pong.partials.chrome')

@php
    $playerNames = $players->pluck('name', 'id');
@endphp

<div class="flex flex-col lg:h-[calc(100vh-80px)]"
     x-data="{ picked: @js(array_map('intval', old('player_ids', []))), search: '', names: @js($playerNames) }">
    <div class="pph-stage relative flex flex-col gap-5 flex-1 lg:min-h-0 lg:overflow-hidden rounded-3xl p-6 md:p-7 text-[#f5ecd6]/80">

        @include('games.ping-pong.partials.tournament-masthead', ['back' => '/games/ping-pong', 'label' => 'Tournaments'])

        <form method="POST" action="/games/ping-pong/tournaments"
              class="grid grid-cols-1 lg:grid-cols-[minmax(330px,380px)_minmax(0,1fr)] gap-5 flex-1 lg:min-h-0">
            @csrf

            {{-- ----- LEFT: ticket — name the cup, review the field, build ----- --}}
            <aside class="pph-ticket-notch relative flex flex-col gap-4 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.045] to-[#f5ecd6]/[0.015] p-5 md:p-6 lg:overflow-y-auto overflow-x-hidden">
                <div class="flex items-center justify-between gap-3">
                    <div class="pph-mono text-xs tracking-[0.18em] uppercase text-[#f5ecd6]/45">New tournament</div>
                    <span class="px-3.5 py-1.5 rounded-full font-semibold text-xs uppercase tracking-[0.04em] bg-[#f5ecd6] text-[#06081b] shadow-[0_4px_14px_rgba(245,236,214,0.22)]">Singles</span>
                </div>

                <input type="text" name="name" required maxlength="100" placeholder="Tournament name"
                       value="{{ old('name', 'Tournament '.now()->format('M j')) }}"
                       class="w-full rounded-lg px-3 py-2.5 font-semibold text-[15px] text-[#f5ecd6] bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 placeholder-[#f5ecd6]/25 focus:outline-none focus:border-[#f5ecd6]/40">

                @if ($errors->any())
                    <div class="rounded-lg px-3 py-2.5 text-xs text-[#ff5a4a] bg-[#ff5a4a]/10 border border-[#ff5a4a]/30">
                        @foreach ($errors->all() as $error)
                            <div>{{ $error }}</div>
                        @endforeach
                    </div>
                @endif

                {{-- Perforation --}}
                <div class="h-[2px] [background-image:repeating-linear-gradient(90deg,rgba(245,236,214,0.14)_0_5px,transparent_5px_10px)]"></div>

                <div class="flex items-baseline justify-between">
                    <span class="pph-mono text-[10px] tracking-[0.3em] uppercase text-[#ffd166]">Field</span>
                    <span class="pph-mono text-[10px] tracking-[0.2em] uppercase text-[#f5ecd6]/45" x-text="picked.length + ' players'"></span>
                </div>

                <div class="flex flex-col gap-1.5">
                    <template x-for="id in picked" :key="id">
                        <div class="pph-slot-in flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 font-semibold text-[13px] text-[#f5ecd6] bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 border-l-[3px] border-l-[#ffd166]">
                            <span class="truncate" x-text="names[id]"></span>
                            <button type="button" @click="picked = picked.filter(p => p !== id)"
                                    class="bg-transparent border-0 text-[#f5ecd6]/35 hover:text-[#ff5a4a] cursor-pointer text-base leading-none">×</button>
                        </div>
                    </template>
                    <template x-for="i in Math.max(0, 2 - picked.length)" :key="'empty-' + i">
                        <div class="rounded-lg px-3 py-2.5 italic font-medium text-xs text-[#f5ecd6]/25 border border-dashed border-[#f5ecd6]/15">Pick a player →</div>
                    </template>
                </div>

                <div class="mt-auto flex flex-col gap-3">
                    <button type="submit"
                            class="appearance-none border-0 bg-[#f5ecd6] text-[#06081b] px-5 py-3.5 rounded-xl pph-display text-[22px] tracking-[0.06em] uppercase cursor-pointer transition shadow-[0_8px_22px_rgba(245,236,214,0.18)] hover:enabled:-translate-y-px hover:enabled:bg-[#fffaf0] hover:enabled:shadow-[0_12px_30px_rgba(245,236,214,0.28)] disabled:opacity-[0.35] disabled:cursor-not-allowed disabled:shadow-none disabled:bg-[#f5ecd6]/40"
                            :disabled="picked.length < 2">
                        Build bracket →
                    </button>
                    <div class="pph-mono text-[10px] tracking-[0.12em] uppercase text-[#f5ecd6]/30 text-center leading-relaxed">
                        Seeded by ELO · single elimination<br>No ELO change · not in official stats
                    </div>
                </div>
            </aside>

            {{-- ----- RIGHT: player picker + past tournaments ----- --}}
            <section class="flex flex-col gap-4 lg:min-h-0 min-w-0">

                <div class="flex flex-col lg:min-h-0 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] px-4 md:px-5 pt-4 pb-4">
                    <div class="flex flex-wrap items-center gap-3 mb-3 flex-shrink-0">
                        <h2 class="flex items-baseline gap-2.5 m-0">
                            <span class="pph-display text-[26px] tracking-[0.04em] uppercase text-[#f5ecd6]">Players</span>
                            <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Tap to enter</span>
                        </h2>
                        <div class="ml-auto flex gap-2">
                            <input type="search" x-model="search" placeholder="Filter…"
                                   class="w-[160px] px-3 py-1.5 rounded-full border border-[#f5ecd6]/15 bg-transparent text-xs font-semibold text-[#f5ecd6] placeholder-[#f5ecd6]/30 focus:outline-none focus:border-[#f5ecd6]/40">
                            <button type="button" @click="picked = []" x-show="picked.length"
                                    class="px-3 py-1.5 rounded-full border border-[#f5ecd6]/15 bg-transparent text-[#f5ecd6]/80 text-xs font-semibold cursor-pointer transition hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.04]">Clear</button>
                        </div>
                    </div>

                    <div class="flex flex-wrap gap-1.5 overflow-y-auto lg:min-h-0 max-h-[40vh] lg:max-h-none">
                        @foreach ($players as $player)
                            <label x-show="@js(mb_strtolower($player->name)).includes(search.toLowerCase())"
                                   class="px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap transition cursor-pointer select-none"
                                   :class="picked.includes({{ $player->id }})
                                       ? 'bg-[#f5ecd6] text-[#06081b] border-[#f5ecd6]'
                                       : 'bg-transparent text-[#f5ecd6]/60 border-[#f5ecd6]/15 hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30'">
                                <input type="checkbox" name="player_ids[]" value="{{ $player->id }}" x-model.number="picked" class="sr-only">
                                {{ $player->name }}
                            </label>
                        @endforeach
                    </div>
                </div>

                <div class="flex flex-col flex-1 lg:min-h-0 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] px-4 md:px-5 pt-4 pb-1">
                    <h2 class="flex items-baseline gap-2.5 m-0 mb-3">
                        <span class="pph-display text-[26px] tracking-[0.04em] uppercase text-[#f5ecd6]">Tournaments</span>
                        <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Past &amp; ongoing</span>
                    </h2>

                    <div class="overflow-y-auto flex-1 lg:min-h-0 pb-3 -mx-1 px-1">
                        <div class="hidden md:grid grid-cols-[46px_1fr_200px_80px] items-center gap-2.5 px-3 pt-1 pb-2 mb-1 pph-mono text-[10px] tracking-[0.24em] uppercase text-[#f5ecd6]/45 border-b border-[#f5ecd6]/15">
                            <span>#</span><span>Name</span><span>Champion</span><span class="text-right">Date</span>
                        </div>
                        @forelse ($tournaments as $tournament)
                            <a href="/games/ping-pong/tournaments/{{ $tournament->id }}"
                               class="relative grid grid-cols-[40px_1fr_auto] md:grid-cols-[46px_1fr_200px_80px] items-center gap-2.5 px-3 py-2.5 md:py-2 rounded-[10px] no-underline text-[#f5ecd6]/80 hover:bg-[#f5ecd6]/[0.05] transition
                                      before:content-[''] before:absolute before:left-0.5 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-sm before:bg-transparent hover:before:bg-[#f5ecd6]">
                                <span class="pph-display text-[24px] md:text-[28px] leading-none tracking-wide text-[#f5ecd6]/45">{{ str_pad($loop->remaining + 1, 2, '0', STR_PAD_LEFT) }}</span>
                                <span class="font-bold text-[15px] md:text-base text-[#f5ecd6] truncate">{{ $tournament->name }}</span>
                                @if ($tournament->isComplete())
                                    <span class="pph-mono text-[12px] font-bold text-[#ffd166] truncate">🏆 {{ $tournament->winner->name ?? '—' }}</span>
                                @else
                                    <span class="inline-flex items-center gap-1.5 pph-mono text-[10px] font-bold tracking-[0.14em] uppercase text-[#ff5a4a]">
                                        <span class="pph-flicker w-1.5 h-1.5 rounded-full bg-[#ff5a4a]"></span>In progress
                                    </span>
                                @endif
                                <span class="hidden md:block pph-mono text-[11px] text-[#f5ecd6]/45 text-right">{{ $tournament->created_at->format('M j') }}</span>
                            </a>
                        @empty
                            <div class="py-10 text-center pph-mono text-xs tracking-[0.2em] uppercase text-[#f5ecd6]/35">No tournaments yet</div>
                        @endforelse
                    </div>
                </div>
            </section>
        </form>
    </div>
</div>
@endsection
