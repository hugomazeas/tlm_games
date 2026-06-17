@extends('layouts.app')

@section('title', $detail['title'] . ' - Ping Pong Awards')
@section('main-class', 'px-4 py-4')

@section('content')
@include('games.ping-pong.partials.chrome', ['pageTitle' => $detail['title'], 'pageBack' => '/games/ping-pong/stats'])

@php
    $medals = ['🥇', '🥈', '🥉'];
@endphp

<div class="pph-stage relative rounded-3xl p-4 md:p-7 overflow-x-hidden">

    {{-- Award hero + how it's calculated --}}
    <section class="pph-panel p-5 md:p-6 mb-5">
        <div class="flex items-start justify-between flex-wrap gap-4">
            <div class="flex items-center gap-3">
                <span class="text-[34px] leading-none">{{ $detail['emoji'] }}</span>
                <div>
                    <div class="pph-display text-[26px] tracking-[0.04em] uppercase text-[#f5ecd6] leading-none">{{ $detail['title'] }}</div>
                    <div class="pph-mono text-[11px] tracking-[0.14em] uppercase text-[#f5ecd6]/45 mt-1.5">{{ $detail['blurb'] }}</div>
                </div>
            </div>

            {{-- Window toggle --}}
            <div class="inline-flex rounded-full border border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03] p-0.5">
                @foreach (['month' => 'This month', 'all' => 'All-time'] as $w => $label)
                    <a href="/games/ping-pong/awards/{{ $detail['key'] }}?window={{ $w }}"
                       class="pph-mono text-[10px] tracking-[0.16em] uppercase px-3 py-1.5 rounded-full no-underline transition
                              {{ $window === $w ? 'bg-[#f5ecd6]/[0.12] text-[#f5ecd6]' : 'text-[#f5ecd6]/45 hover:text-[#f5ecd6]/70' }}">
                        {{ $label }}
                    </a>
                @endforeach
            </div>
        </div>

        {{-- Compute transparency: the exact calculation --}}
        <div class="mt-5 rounded-[12px] border border-[#3ec8ff]/20 bg-[#3ec8ff]/[0.04] px-4 py-3.5">
            <div class="pph-mono text-[10px] font-bold tracking-[0.24em] uppercase text-[#3ec8ff]/80">How it's calculated</div>
            <div class="text-[15px] text-[#f5ecd6] mt-1.5">{{ $detail['formula'] }}</div>
            <div class="pph-mono text-[11px] tracking-[0.06em] text-[#f5ecd6]/45 mt-2">{{ $detail['eligibility'] }}</div>
        </div>
    </section>

    {{-- Top 3 --}}
    <section class="pph-panel p-5 md:p-6">
        <div class="flex items-baseline gap-2.5 mb-4">
            <span class="pph-display text-[22px] tracking-[0.04em] uppercase text-[#f5ecd6]">Top 3</span>
            <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">{{ $window === 'month' ? 'This month' : 'All-time' }} · singles</span>
        </div>

        @if (count($detail['entries']) === 0)
            <p class="pph-mono text-[12px] tracking-[0.14em] uppercase text-[#f5ecd6]/45">
                No one qualifies yet — {{ strtolower($detail['eligibility']) }}.
            </p>
        @else
            <div class="flex flex-col gap-3">
                @foreach ($detail['entries'] as $entry)
                    <a href="/games/ping-pong/players/{{ $entry['player_id'] }}"
                       class="flex items-center flex-wrap gap-x-4 gap-y-2.5 px-4 py-4 rounded-[12px] no-underline transition
                              border {{ $entry['rank'] === 1 ? 'border-[#ffd166]/30 bg-[#ffd166]/[0.05]' : 'border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03]' }}
                              hover:bg-[#f5ecd6]/[0.06] hover:border-[#f5ecd6]/30">
                        {{-- Rank --}}
                        <span class="text-[26px] leading-none shrink-0 w-8 text-center">{{ $medals[$entry['rank'] - 1] ?? ('#' . $entry['rank']) }}</span>

                        {{-- Player + calc --}}
                        <div class="flex-1 min-w-0">
                            <div class="font-semibold text-[16px] text-[#f5ecd6] truncate">{{ $entry['player_name'] }}</div>
                            {{-- The concrete, auditable calculation for this player --}}
                            <div class="pph-mono text-[12px] tracking-[0.04em] text-[#f5ecd6]/55 mt-1 tabular-nums">{{ $entry['calc'] }}</div>
                            {{-- Raw inputs --}}
                            <div class="flex flex-wrap gap-1.5 mt-2">
                                @foreach ($entry['breakdown'] as $part)
                                    <span class="pph-mono text-[10px] tracking-[0.08em] uppercase text-[#f5ecd6]/50 bg-[#f5ecd6]/[0.06] px-2 py-0.5 rounded-md tabular-nums">
                                        {{ $part['label'] }} <span class="text-[#f5ecd6]/80 font-bold">{{ $part['value'] }}</span>
                                    </span>
                                @endforeach
                            </div>
                        </div>

                        {{-- Headline value --}}
                        <span class="pph-display text-[24px] text-[#3ec8ff] tabular-nums shrink-0 ml-auto pph-glow-blue">{{ $entry['value_label'] }}</span>
                    </a>
                @endforeach
            </div>
        @endif
    </section>
</div>
@endsection
