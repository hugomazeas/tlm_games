@extends('layouts.app')

@section('title', $tournament->name.' - Ping Pong Tournament')
@section('main-class', 'px-4 py-4')

@section('content')

@include('games.ping-pong.partials.chrome')

@php
    $roundCount = $rounds->count();
    $roundName = fn (int $round) => match ($roundCount - $round) {
        0 => 'Final',
        1 => 'Semi-finals',
        2 => 'Quarter-finals',
        default => 'Round '.$round,
    };
    $live = $nextSlot?->match && ! $nextSlot->match->is_complete ? $nextSlot->match : null;
    $listed = $tournament->bracket->filter(fn ($slot) => $slot->match || ($slot->player_left_id && $slot->player_right_id) || $slot->round > 1);
    $played = $listed->filter(fn ($slot) => $slot->winner_id)->count();
@endphp

<div class="flex flex-col lg:h-[calc(100vh-80px)]">
    <div class="pph-stage relative flex flex-col gap-5 flex-1 lg:min-h-0 lg:overflow-hidden rounded-3xl p-6 md:p-7 text-[#f5ecd6]/80">

        @include('games.ping-pong.partials.tournament-masthead', ['back' => '/games/ping-pong/tournaments', 'label' => $tournament->name])

        <div class="grid grid-cols-1 lg:grid-cols-[minmax(330px,380px)_minmax(0,1fr)] gap-5 flex-1 lg:min-h-0">

            {{-- ----- LEFT: ticket — next match / champion ----- --}}
            <aside class="pph-ticket-notch relative flex flex-col gap-4 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.045] to-[#f5ecd6]/[0.015] p-5 md:p-6 lg:overflow-y-auto overflow-x-hidden">
                <div class="flex items-center justify-between gap-3">
                    <div class="pph-mono text-xs tracking-[0.18em] uppercase text-[#f5ecd6]/45">
                        @if ($tournament->isComplete())
                            Champion
                        @else
                            {{ $live ? 'Now playing' : 'Next up' }}
                            @if ($nextSlot)
                                <strong class="text-[#f5ecd6] font-bold tracking-[0.06em] ml-1">{{ $roundName($nextSlot->round) }}</strong>
                            @endif
                        @endif
                    </div>
                    <span class="pph-mono text-[10px] tracking-[0.2em] uppercase text-[#f5ecd6]/45">{{ $played }} / {{ $listed->count() }} played</span>
                </div>

                @if ($tournament->isComplete())
                    <div class="flex flex-col items-center gap-3 py-8 text-center">
                        <span class="text-[64px] leading-none">🏆</span>
                        <span class="pph-display uppercase tracking-[0.04em] text-[40px] leading-none text-[#ffd166] pph-glow-amber">{{ $tournament->winner->name ?? '—' }}</span>
                        <span class="pph-mono text-[10px] tracking-[0.3em] uppercase text-[#f5ecd6]/45">{{ $tournament->name }}</span>
                    </div>
                @elseif ($nextSlot)
                    {{-- Perforation --}}
                    <div class="h-[2px] [background-image:repeating-linear-gradient(90deg,rgba(245,236,214,0.14)_0_5px,transparent_5px_10px)]"></div>

                    <div class="grid grid-cols-[1fr_auto_1fr] gap-2 items-start">
                        <div class="flex flex-col gap-1.5 min-w-0">
                            <span class="pph-mono text-[10px] tracking-[0.3em] uppercase text-[#ff5a4a]">Left</span>
                            <div class="pph-slot-in pph-shadow-left rounded-lg px-3 py-2.5 font-semibold text-[13px] text-[#f5ecd6] bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 border-l-[3px] border-l-[#ff5a4a] truncate">{{ $nextSlot->playerLeft->name }}</div>
                        </div>
                        <div class="relative self-center pt-4 pph-display text-[22px] tracking-[0.06em] text-[#f5ecd6]">VS</div>
                        <div class="flex flex-col gap-1.5 min-w-0 text-right items-end">
                            <span class="pph-mono text-[10px] tracking-[0.3em] uppercase text-[#3ec8ff]">Right</span>
                            <div class="pph-slot-in pph-shadow-right rounded-lg px-3 py-2.5 font-semibold text-[13px] text-[#f5ecd6] bg-[#f5ecd6]/[0.06] border border-[#f5ecd6]/15 border-r-[3px] border-r-[#3ec8ff] truncate text-right w-full">{{ $nextSlot->playerRight->name }}</div>
                        </div>
                    </div>

                    @if ($live)
                        <div class="flex items-center justify-center gap-1.5 pph-mono leading-none">
                            <span class="text-[40px] font-bold text-[#ff5a4a] min-w-[48px] text-center">{{ $live->player_left_score }}</span>
                            <span class="text-[#f5ecd6]/25">·</span>
                            <span class="text-[40px] font-bold text-[#3ec8ff] min-w-[48px] text-center">{{ $live->player_right_score }}</span>
                        </div>
                    @endif

                    <form method="POST" action="/games/ping-pong/tournaments/{{ $tournament->id }}/next" class="flex flex-col">
                        @csrf
                        <button type="submit"
                                class="appearance-none border-0 mt-0.5 bg-[#f5ecd6] text-[#06081b] px-5 py-3.5 rounded-xl pph-display text-[22px] tracking-[0.06em] uppercase cursor-pointer transition shadow-[0_8px_22px_rgba(245,236,214,0.18)] hover:-translate-y-px hover:bg-[#fffaf0] hover:shadow-[0_12px_30px_rgba(245,236,214,0.28)]">
                            {{ $live ? 'Resume match →' : 'Start match →' }}
                        </button>
                    </form>

                    @if ($live)
                        <div class="grid grid-cols-2 gap-2">
                            <a href="/games/ping-pong/remote/{{ $live->id }}/left"
                               class="px-3 py-1.5 rounded-full border border-[#ff5a4a]/40 text-[#ff5a4a] no-underline text-xs font-semibold text-center truncate transition hover:bg-[#ff5a4a]/10">Remote · {{ $nextSlot->playerLeft->name }}</a>
                            <a href="/games/ping-pong/remote/{{ $live->id }}/right"
                               class="px-3 py-1.5 rounded-full border border-[#3ec8ff]/40 text-[#3ec8ff] no-underline text-xs font-semibold text-center truncate transition hover:bg-[#3ec8ff]/10">Remote · {{ $nextSlot->playerRight->name }}</a>
                        </div>
                    @endif
                @endif

                <div class="mt-auto pph-mono text-[10px] tracking-[0.12em] uppercase text-[#f5ecd6]/30 text-center leading-relaxed">
                    Tournament play<br>No ELO change · not in official stats
                </div>
            </aside>

            {{-- ----- RIGHT: bracket + match list ----- --}}
            <section class="flex flex-col gap-4 lg:min-h-0 min-w-0">

                <div class="flex-shrink-0 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] px-4 md:px-5 pt-4 pb-4">
                    <h2 class="flex items-baseline gap-2.5 m-0 mb-3">
                        <span class="pph-display text-[26px] tracking-[0.04em] uppercase text-[#f5ecd6]">Bracket</span>
                        <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Singles · single elimination</span>
                    </h2>

                    <div class="overflow-x-auto pb-1">
                        <div class="flex gap-4 min-w-max">
                            @foreach ($rounds as $round => $slots)
                                <div class="flex flex-col w-[210px]">
                                    <div class="pph-mono text-[10px] tracking-[0.24em] uppercase text-[#f5ecd6]/45 pb-2 mb-2 border-b border-[#f5ecd6]/15">{{ $roundName($round) }}</div>
                                    <div class="flex flex-col justify-around gap-2 flex-1">
                                        @foreach ($slots as $slot)
                                            @php $isNext = $nextSlot?->is($slot); @endphp
                                            <div class="rounded-[10px] border bg-[#f5ecd6]/[0.03] overflow-hidden {{ $isNext ? 'border-[#ffd166]/60 bg-[#ffd166]/[0.06]' : 'border-[#f5ecd6]/15' }}">
                                                @foreach (['left', 'right'] as $side)
                                                    @php
                                                        $player = $side === 'left' ? $slot->playerLeft : $slot->playerRight;
                                                        $score = $slot->match?->{'player_'.$side.'_score'};
                                                        $won = $player && $slot->winner_id === $player->id;
                                                        $accent = $side === 'left' ? 'border-l-[#ff5a4a]' : 'border-l-[#3ec8ff]';
                                                        $scoreColor = $side === 'left' ? 'text-[#ff5a4a]' : 'text-[#3ec8ff]';
                                                    @endphp
                                                    <div class="flex items-center justify-between gap-2 px-3 py-1.5 border-l-[3px] {{ $player ? $accent : 'border-l-transparent' }} {{ $side === 'left' ? 'border-b border-b-[#f5ecd6]/10' : '' }}">
                                                        <span class="truncate text-[13px] {{ $won ? 'font-bold text-[#f5ecd6]' : ($slot->winner_id || ! $player ? 'text-[#f5ecd6]/35' : 'font-semibold text-[#f5ecd6]/80') }} {{ $player ? '' : 'italic' }}">
                                                            {{ $player->name ?? ($round === 1 ? 'Bye' : 'TBD') }}
                                                        </span>
                                                        <span class="pph-mono text-[13px] font-bold tabular-nums {{ $won ? $scoreColor : 'text-[#f5ecd6]/35' }}">{{ $score }}</span>
                                                    </div>
                                                @endforeach
                                            </div>
                                        @endforeach
                                    </div>
                                </div>
                            @endforeach
                        </div>
                    </div>
                </div>

                <div class="flex flex-col flex-1 lg:min-h-0 rounded-2xl border border-[#f5ecd6]/15 bg-gradient-to-b from-[#f5ecd6]/[0.03] to-[#f5ecd6]/[0.01] px-4 md:px-5 pt-4 pb-1">
                    <h2 class="flex items-baseline gap-2.5 m-0 mb-3">
                        <span class="pph-display text-[26px] tracking-[0.04em] uppercase text-[#f5ecd6]">Matches</span>
                        <span class="pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/45">Play order</span>
                    </h2>

                    <div class="overflow-y-auto flex-1 lg:min-h-0 pb-3 -mx-1 px-1 flex flex-col gap-1.5">
                        @foreach ($listed as $slot)
                            @php
                                $match = $slot->match;
                                $isLive = $match && ! $match->is_complete;
                            @endphp
                            <a @if ($match?->is_complete) href="/games/ping-pong/matches/{{ $match->id }}" @endif
                               class="relative grid grid-cols-[120px_1fr_auto_1fr_80px] items-center gap-3 px-3.5 py-2.5 rounded-[10px] border no-underline transition
                                      {{ $isLive ? 'border-[#ff5a4a]/40 bg-[#ff5a4a]/[0.07]' : 'border-[#f5ecd6]/15 bg-[#f5ecd6]/[0.03]' }}
                                      {{ $match?->is_complete ? 'cursor-pointer hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.05] hover:-translate-y-px' : '' }}">
                                <span class="pph-mono text-[10px] tracking-[0.18em] uppercase text-[#f5ecd6]/45 truncate">{{ $roundName($slot->round) }}</span>
                                <span class="text-right font-bold text-sm truncate {{ $slot->winner_id && $slot->winner_id === $slot->player_left_id ? 'text-[#f5ecd6]' : 'text-[#f5ecd6]/60' }}">{{ $slot->playerLeft->name ?? 'TBD' }}</span>
                                <span class="flex items-baseline gap-1.5 pph-mono leading-none">
                                    @if ($match)
                                        <span class="text-[20px] font-bold text-[#ff5a4a] min-w-[24px] text-center">{{ $match->player_left_score }}</span>
                                        <span class="text-[#f5ecd6]/25">·</span>
                                        <span class="text-[20px] font-bold text-[#3ec8ff] min-w-[24px] text-center">{{ $match->player_right_score }}</span>
                                    @else
                                        <span class="text-[11px] tracking-[0.16em] uppercase text-[#f5ecd6]/25 px-3">vs</span>
                                    @endif
                                </span>
                                <span class="text-left font-bold text-sm truncate {{ $slot->winner_id && $slot->winner_id === $slot->player_right_id ? 'text-[#f5ecd6]' : 'text-[#f5ecd6]/60' }}">{{ $slot->playerRight->name ?? 'TBD' }}</span>
                                <span class="text-right pph-mono text-[10px] font-bold tracking-[0.14em] uppercase">
                                    @if ($isLive)
                                        <span class="inline-flex items-center gap-1 text-[#ff5a4a]"><span class="pph-flicker w-1.5 h-1.5 rounded-full bg-[#ff5a4a]"></span>Live</span>
                                    @elseif ($match?->is_complete)
                                        <span class="text-[#3ec8ff]">Details ›</span>
                                    @else
                                        <span class="text-[#f5ecd6]/30">Pending</span>
                                    @endif
                                </span>
                            </a>
                        @endforeach
                    </div>
                </div>
            </section>
        </div>
    </div>
</div>
@endsection
