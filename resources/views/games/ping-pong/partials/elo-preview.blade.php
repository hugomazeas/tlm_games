{{--
    ELO preview shown inside each playing-screen score panel.
    Editorial style — neutral ink card with mono numerals and red/green deltas.
--}}
<template x-if="eloPreview">
    <div class="mt-4 w-full max-w-[440px] rounded-xl bg-[#06081b]/55 border border-[#f5ecd6]/10 px-4 py-3">
        <template x-for="pid in previewPlayerIdsForSide('{{ $side }}')" :key="'preview-{{ $side }}-' + pid">
            <div class="flex flex-col gap-1.5 mb-2 last:mb-0">
                <template x-if="mode === '2v2'">
                    <div class="pph-mono text-[10px] tracking-[0.22em] uppercase text-[#f5ecd6]/55 font-bold" x-text="playerNameById(pid)"></div>
                </template>
                <div class="flex justify-between items-baseline gap-2.5">
                    <span class="pph-mono text-[10px] tracking-[0.22em] uppercase text-[#f5ecd6]/60 font-semibold">If wins</span>
                    <span class="text-right">
                        <span class="pph-mono font-bold text-[20px] tracking-tight"
                              :class="(eloPreviewFor(pid, true)?.total ?? 0) >= 0 ? 'text-[#9be7c4]' : 'text-[#ff5a4a]'"
                              x-text="formatDelta(eloPreviewFor(pid, true)?.total ?? 0)"></span>
                        <template x-if="(eloPreviewFor(pid, true)?.streak ?? 0) > 0 || (eloPreviewFor(pid, true)?.breaker ?? 0) > 0">
                            <span class="pph-mono text-[10px] text-[#f5ecd6]/45 ml-1.5">
                                (<span x-text="formatDelta(eloPreviewFor(pid, true).base)"></span><template x-if="eloPreviewFor(pid, true).streak > 0"><span> · <span class="text-[#ffd166]">+<span x-text="eloPreviewFor(pid, true).streak"></span> streak</span></span></template><template x-if="eloPreviewFor(pid, true).breaker > 0"><span> · <span class="text-[#fb923c]">+<span x-text="eloPreviewFor(pid, true).breaker"></span> break</span></span></template>)
                            </span>
                        </template>
                    </span>
                </div>
                <div class="flex justify-between items-baseline gap-2.5">
                    <span class="pph-mono text-[10px] tracking-[0.22em] uppercase text-[#f5ecd6]/60 font-semibold">If loses</span>
                    <span class="pph-mono font-bold text-[20px] tracking-tight"
                          :class="(eloPreviewFor(pid, false)?.total ?? 0) >= 0 ? 'text-[#9be7c4]' : 'text-[#ff5a4a]'"
                          x-text="formatDelta(eloPreviewFor(pid, false)?.total ?? 0)"></span>
                </div>
            </div>
        </template>
    </div>
</template>
