{{--
    ELO preview shown inside each playing-screen score panel.
    Editorial style — neutral ink card with mono numerals and red/green deltas.
    Per player: current rating, projected rating if win / if loss, and the
    swing (how much this single game moves them).
--}}
<template x-if="eloPreview">
    <div class="mt-4 w-full max-w-[500px] rounded-xl bg-[#06081b]/55 border border-[#f5ecd6]/10 px-5 py-4">
        <template x-for="pid in previewPlayerIdsForSide('{{ $side }}')" :key="'preview-{{ $side }}-' + pid">
            <div class="flex flex-col gap-2.5 mb-4 last:mb-0">
                {{-- Header: name (2v2) + current rating --}}
                <div class="flex justify-between items-baseline gap-2.5 border-b border-[#f5ecd6]/10 pb-2">
                    <template x-if="mode === '2v2'">
                        <span class="pph-mono text-[13px] tracking-[0.18em] uppercase text-[#f5ecd6]/70 font-bold" x-text="playerNameById(pid)"></span>
                    </template>
                    <template x-if="mode !== '2v2'">
                        <span class="pph-mono text-[13px] tracking-[0.18em] uppercase text-[#f5ecd6]/55 font-bold">Now</span>
                    </template>
                    <span class="pph-mono font-bold text-[24px] tracking-tight text-[#f5ecd6]" x-text="currentRatingFor(pid) ?? '—'"></span>
                </div>

                {{-- If wins --}}
                <div class="flex justify-between items-baseline gap-3">
                    <span class="pph-mono text-[13px] tracking-[0.2em] uppercase text-[#f5ecd6]/65 font-semibold">If wins</span>
                    <span class="flex items-baseline gap-2.5 text-right">
                        <span class="pph-mono font-semibold text-[16px]"
                              :class="(eloPreviewFor(pid, true)?.total ?? 0) >= 0 ? 'text-[#9be7c4]' : 'text-[#ff5a4a]'"
                              x-text="formatDelta(eloPreviewFor(pid, true)?.total ?? 0)"></span>
                        <span class="text-[#f5ecd6]/35 text-[16px]">→</span>
                        <span class="pph-mono font-bold text-[28px] tracking-tight text-[#9be7c4] pph-glow-green"
                              x-text="projectedEloFor(pid, true) ?? '—'"></span>
                    </span>
                </div>
                {{-- Bonus breakdown for the win (streak / streak-breaker) --}}
                <template x-if="(eloPreviewFor(pid, true)?.streak ?? 0) > 0 || (eloPreviewFor(pid, true)?.breaker ?? 0) > 0">
                    <div class="pph-mono text-[12px] text-[#f5ecd6]/50 text-right -mt-1.5">
                        <span x-text="formatDelta(eloPreviewFor(pid, true).base)"></span><template x-if="eloPreviewFor(pid, true).streak > 0"><span> · <span class="text-[#ffd166]">+<span x-text="eloPreviewFor(pid, true).streak"></span> streak</span></span></template><template x-if="eloPreviewFor(pid, true).breaker > 0"><span> · <span class="text-[#fb923c]">+<span x-text="eloPreviewFor(pid, true).breaker"></span> break</span></span></template>
                    </div>
                </template>

                {{-- If loses --}}
                <div class="flex justify-between items-baseline gap-3">
                    <span class="pph-mono text-[13px] tracking-[0.2em] uppercase text-[#f5ecd6]/65 font-semibold">If loses</span>
                    <span class="flex items-baseline gap-2.5 text-right">
                        <span class="pph-mono font-semibold text-[16px]"
                              :class="(eloPreviewFor(pid, false)?.total ?? 0) >= 0 ? 'text-[#9be7c4]' : 'text-[#ff5a4a]'"
                              x-text="formatDelta(eloPreviewFor(pid, false)?.total ?? 0)"></span>
                        <span class="text-[#f5ecd6]/35 text-[16px]">→</span>
                        <span class="pph-mono font-bold text-[28px] tracking-tight text-[#ff5a4a]"
                              x-text="projectedEloFor(pid, false) ?? '—'"></span>
                    </span>
                </div>

                {{-- Swing: how much this game moves the player --}}
                <div class="flex justify-between items-baseline gap-2.5 pt-1.5">
                    <span class="pph-mono text-[13px] tracking-[0.2em] uppercase text-[#f5ecd6]/45 font-semibold">Swing</span>
                    <span class="pph-mono font-bold text-[18px] text-[#ffd166]">
                        <span x-text="eloSwingFor(pid) ?? '—'"></span><span class="text-[12px] text-[#f5ecd6]/45 ml-1">pts</span>
                    </span>
                </div>
            </div>
        </template>
    </div>
</template>
