{{--
    Editorial-style leaderboard rows.
    Variables:
      $entriesExpr — Alpine expression yielding an array of entries
                     (e.g. 'leaderboard' or 'block.entries').
--}}
@php
    $entriesExpr = $entriesExpr ?? 'leaderboard';
@endphp

<div class="flex flex-col gap-px md:min-w-[760px]">
    {{-- Header (md+) --}}
    <div class="hidden md:grid items-center gap-2.5 px-3 pt-1 pb-2 mb-1 pph-mono text-[10px] tracking-[0.24em] uppercase text-[#f5ecd6]/45 border-b border-[#f5ecd6]/15 sticky top-0 bg-[#0a0f24] z-10"
         :class="mode === '2v2'
            ? 'grid-cols-[46px_1fr_76px_72px_80px_120px_60px]'
            : 'grid-cols-[46px_1fr_72px_66px_76px_88px_104px_56px_auto]'">
        <span>Rank</span>
        <span>Player</span>
        <span>ELO</span>
        <span class="text-center">W·L</span>
        <span class="text-center" title="Lifetime win rate / last 30 days">Win %</span>
        <template x-if="mode !== '2v2'">
            <span class="text-center" title="Times beaten the reigning #1 · title defenses as #1">Champion</span>
        </template>
        <span class="text-center">Last 10</span>
        <span class="text-center">Streak</span>
        <template x-if="mode !== '2v2'">
            <span class="text-center" title="Workdays with a match — last 7 days / 30 days">Presence</span>
        </template>
    </div>

    <template x-for="(entry, i) in {{ $entriesExpr }}" :key="entry.player_id">
        <a :href="'/games/ping-pong/players/' + entry.player_id"
           class="relative grid grid-cols-[40px_1fr_auto_auto] items-center gap-x-2.5 gap-y-1 px-3 py-2.5 md:py-2 rounded-[10px] no-underline text-[#f5ecd6]/80 hover:bg-[#f5ecd6]/[0.05] transition
                  before:content-[''] before:absolute before:left-0.5 before:top-2.5 before:bottom-2.5 before:w-[3px] before:rounded-sm before:bg-transparent hover:before:bg-[#f5ecd6]"
           :class="{
               'md:grid-cols-[46px_1fr_72px_66px_76px_88px_104px_56px_auto]': mode !== '2v2',
               'md:grid-cols-[46px_1fr_76px_72px_80px_120px_60px]': mode === '2v2',
               'pph-rank-1 before:!bg-[#ffd166]': i === 0,
               'pph-rank-2 before:!bg-[#f5ecd6]/70': i === 1,
               'pph-rank-3 before:!bg-[#c98a5a]': i === 2,
           }">

            {{-- Rank --}}
            <span class="pph-display text-[24px] md:text-[28px] leading-none tracking-wide"
                  :class="i === 0 ? 'text-[#ffd166] pph-glow-amber'
                                 : i === 1 ? 'text-[#f5ecd6]'
                                 : i === 2 ? 'text-[#d99a6c]'
                                 : 'text-[#f5ecd6]/45'"
                  x-text="String(i + 1).padStart(2, '0')"></span>

            {{-- Name --}}
            <span class="font-bold text-[15px] md:text-base text-[#f5ecd6] truncate" x-text="entry.player_name"></span>

            {{-- ELO --}}
            <span class="pph-mono font-bold text-[13px] md:text-[15px] tracking-tight px-2.5 py-1 rounded-md justify-self-end md:justify-self-start"
                  :class="i === 0 ? 'bg-[#ffd166]/20 text-[#ffd166]' : 'bg-[#f5ecd6]/[0.08] text-[#f5ecd6]'"
                  x-text="entry.elo_rating"></span>

            {{-- W·L --}}
            <span class="hidden md:flex flex-col items-center leading-tight gap-px">
                <span class="pph-mono text-[13px] font-bold whitespace-nowrap">
                    <span class="text-[#9be7c4]" x-text="entry.wins"></span><span class="text-[#f5ecd6]/25 mx-1">·</span><span class="text-[#ff5a4a]" x-text="entry.losses"></span>
                </span>
            </span>

            {{-- Win % (lifetime + rolling 30 days) --}}
            <span class="hidden md:flex flex-col items-center leading-tight gap-px">
                <span class="pph-mono text-[13px] font-bold text-[#f5ecd6]" x-text="entry.win_rate + '%'"></span>
                <span class="pph-mono text-[10px] text-[#f5ecd6]/45 tracking-wide"
                      x-text="(entry.win_rate_30d === null ? '—' : entry.win_rate_30d + '%') + ' · 30d'"></span>
            </span>

            {{-- Champion: beats (wins over the #1) and title defenses, 1v1 only --}}
            <template x-if="mode !== '2v2'">
                <span class="hidden md:flex items-center justify-center gap-3 leading-none">
                    <span class="flex flex-col items-center gap-0.5" title="Wins over the reigning #1">
                        <span class="pph-mono text-[13px] font-bold"
                              :class="entry.champion_beats > 0 ? 'text-[#ffd166]' : 'text-[#f5ecd6]/25'"
                              x-text="entry.champion_beats"></span>
                        <span class="pph-mono text-[9px] tracking-[0.14em] text-[#f5ecd6]/40">BEAT</span>
                    </span>
                    <span class="flex flex-col items-center gap-0.5" title="Title defenses while ranked #1">
                        <span class="pph-mono text-[13px] font-bold"
                              :class="entry.title_defenses > 0 ? 'text-[#9be7c4]' : 'text-[#f5ecd6]/25'"
                              x-text="entry.title_defenses"></span>
                        <span class="pph-mono text-[9px] tracking-[0.14em] text-[#f5ecd6]/40">DEF</span>
                    </span>
                </span>
            </template>

            {{-- Last 10 --}}
            <span class="hidden md:block text-center">
                <template x-if="entry.last_10 && entry.last_10.length > 0">
                    <span>
                        <span class="block pph-mono text-[12px] text-[#f5ecd6]/80 mb-1 font-medium" x-text="entry.last_10.filter(r => r === 'W').length + '-' + entry.last_10.filter(r => r === 'L').length"></span>
                        <span class="inline-flex gap-[3px]">
                            <template x-for="(r, j) in entry.last_10" :key="j">
                                <span class="w-[7px] h-[7px] rounded-full" :class="r === 'W' ? 'bg-[#9be7c4]' : 'bg-[#ff5a4a]'"></span>
                            </template>
                        </span>
                    </span>
                </template>
                <template x-if="!entry.last_10 || entry.last_10.length === 0">
                    <span class="text-[#f5ecd6]/25">—</span>
                </template>
            </span>

            {{-- Streak --}}
            <span class="text-center">
                <template x-if="entry.win_streak > 0">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full pph-mono font-bold text-[11px] tracking-wide bg-[#9be7c4]/[0.16] text-[#9be7c4]"><span>W</span><span x-text="entry.win_streak"></span></span>
                </template>
                <template x-if="entry.win_streak === 0 && entry.losing_streak > 0">
                    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full pph-mono font-bold text-[11px] tracking-wide bg-[#ff5a4a]/[0.16] text-[#ff5a4a]"><span>L</span><span x-text="entry.losing_streak"></span></span>
                </template>
                <template x-if="entry.win_streak === 0 && !entry.losing_streak">
                    <span class="text-[#f5ecd6]/25">—</span>
                </template>
            </span>

            {{-- Presence (1v1 only) --}}
            <template x-if="mode !== '2v2'">
                <span class="hidden md:flex flex-col items-center leading-tight gap-px">
                    <span class="pph-mono text-[13px] font-bold text-[#f5ecd6]" x-text="entry.office_7d + '%'"></span>
                    <span class="pph-mono text-[10px] text-[#f5ecd6]/45 tracking-wide" x-text="entry.office_30d + '% · 30d'"></span>
                </span>
            </template>
        </a>
    </template>
</div>
