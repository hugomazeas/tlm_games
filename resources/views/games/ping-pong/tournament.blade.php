@extends('layouts.app')

@section('title', $tournament->name.' - Ping Pong Tournament')
@section('main-class', 'px-4 py-4')

@section('content')
@include('games.ping-pong.partials.chrome', ['pageTitle' => $tournament->name, 'pageBack' => '/games/ping-pong/tournaments'])

@php
    $roundCount = $rounds->count();
    $roundName = fn (int $round) => match ($roundCount - $round) {
        0 => 'Final',
        1 => 'Semi-finals',
        2 => 'Quarter-finals',
        default => 'Round '.$round,
    };
    $live = $nextSlot?->match && ! $nextSlot->match->is_complete ? $nextSlot->match : null;
@endphp

<div class="pph-stage relative rounded-3xl p-4 md:p-7 overflow-x-hidden">

    {{-- Next up --}}
    <section class="pph-panel p-5 md:p-6 mb-5 flex flex-wrap items-center justify-between gap-4">
        @if ($tournament->isComplete())
            <div>
                <div class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Champion</div>
                <div class="pph-display text-[34px] tracking-[0.04em] uppercase text-[#3ec8ff]">🏆 {{ $tournament->winner->name ?? '—' }}</div>
            </div>
        @elseif ($nextSlot)
            <div>
                <div class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">{{ $live ? 'Now playing' : 'Next up' }} · {{ $roundName($nextSlot->round) }}</div>
                <div class="pph-display text-[28px] tracking-[0.04em] uppercase text-[#f5ecd6]">
                    {{ $nextSlot->playerLeft->name }} <span class="text-[#f5ecd6]/40">vs</span> {{ $nextSlot->playerRight->name }}
                </div>
                @if ($live)
                    <div class="flex gap-3 mt-2 text-sm">
                        <a href="/games/ping-pong/remote/{{ $live->id }}/left" class="text-[#3ec8ff]">Remote · {{ $nextSlot->playerLeft->name }}</a>
                        <a href="/games/ping-pong/remote/{{ $live->id }}/right" class="text-[#3ec8ff]">Remote · {{ $nextSlot->playerRight->name }}</a>
                    </div>
                @endif
            </div>
            <form method="POST" action="/games/ping-pong/tournaments/{{ $tournament->id }}/next">
                @csrf
                <button type="submit" class="px-5 py-2.5 rounded-full bg-[#ff5a4a] text-[#06081b] font-semibold cursor-pointer transition hover:bg-[#ff7a6a]">
                    {{ $live ? 'Resume match →' : 'Play match →' }}
                </button>
            </form>
        @endif
        <span class="pph-mono text-[10px] tracking-[0.18em] uppercase text-[#f5ecd6]/35 w-full">Tournament play · no ELO · not in official stats</span>
    </section>

    {{-- Bracket --}}
    <section class="pph-panel p-5 md:p-6 mb-5 overflow-x-auto">
        <div class="flex gap-6 min-w-max">
            @foreach ($rounds as $round => $slots)
                <div class="flex flex-col justify-around gap-3 w-[220px]">
                    <div class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">{{ $roundName($round) }}</div>
                    @foreach ($slots as $slot)
                        <div class="rounded-xl border {{ $nextSlot?->is($slot) ? 'border-[#ff5a4a]/60' : 'border-[#f5ecd6]/12' }} bg-[#f5ecd6]/[0.03] text-sm">
                            @foreach (['left', 'right'] as $side)
                                @php
                                    $player = $side === 'left' ? $slot->playerLeft : $slot->playerRight;
                                    $score = $slot->match?->{'player_'.$side.'_score'};
                                    $isBye = $round === 1 && ! $player;
                                    $won = $player && $slot->winner_id === $player->id;
                                @endphp
                                <div class="flex justify-between px-3 py-1.5 {{ $side === 'left' ? 'border-b border-[#f5ecd6]/8' : '' }} {{ $won ? 'text-[#3ec8ff] font-semibold' : ($slot->winner_id ? 'text-[#f5ecd6]/35' : 'text-[#f5ecd6]/80') }}">
                                    <span class="truncate">{{ $player->name ?? ($isBye ? 'bye' : 'TBD') }}</span>
                                    <span class="pph-mono tabular-nums">{{ $score }}</span>
                                </div>
                            @endforeach
                        </div>
                    @endforeach
                </div>
            @endforeach
        </div>
    </section>

    {{-- Match list --}}
    <section class="pph-panel p-5 md:p-6">
        <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6] block mb-4">Matches</span>
        @foreach ($tournament->bracket->filter(fn ($slot) => $slot->match || ($slot->playerLeft && $slot->playerRight) || $slot->round > 1) as $slot)
            <div class="flex items-center justify-between gap-3 px-4 py-2.5 mb-2 rounded-xl border border-[#f5ecd6]/12 text-sm">
                <span class="pph-mono text-[10px] tracking-[0.18em] uppercase text-[#f5ecd6]/40 w-[110px] shrink-0">{{ $roundName($slot->round) }}</span>
                <span class="flex-1 text-[#f5ecd6]/85">{{ $slot->playerLeft->name ?? 'TBD' }} <span class="text-[#f5ecd6]/35">vs</span> {{ $slot->playerRight->name ?? 'TBD' }}</span>
                @if ($slot->match?->is_complete)
                    <a href="/games/ping-pong/matches/{{ $slot->match->id }}" class="pph-mono tabular-nums text-[#3ec8ff]">
                        {{ $slot->match->player_left_score }}–{{ $slot->match->player_right_score }} ›
                    </a>
                @elseif ($slot->match)
                    <span class="pph-mono text-[11px] uppercase text-[#ff5a4a]">Live {{ $slot->match->player_left_score }}–{{ $slot->match->player_right_score }}</span>
                @else
                    <span class="pph-mono text-[11px] uppercase text-[#f5ecd6]/35">Pending</span>
                @endif
            </div>
        @endforeach
    </section>
</div>
@endsection
