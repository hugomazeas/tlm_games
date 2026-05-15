<template x-if="eloPreview">
    <div style="margin-top: 16px; padding: 14px 18px; background: rgba(0,0,0,0.28); border-radius: 12px; font-size: 1.25rem; line-height: 1.4; width: 100%; max-width: 420px;">
        <template x-for="pid in previewPlayerIdsForSide('{{ $side }}')" :key="'preview-{{ $side }}-' + pid">
            <div style="display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;">
                <template x-if="mode === '2v2'">
                    <div style="font-size: 1rem; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 0.8px; font-weight: 700;"
                         x-text="playerNameById(pid)"></div>
                </template>
                <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px;">
                    <span style="color: rgba(255,255,255,0.7); font-weight: 600;">If wins</span>
                    <span>
                        <span style="font-weight: 800; font-size: 1.45rem;"
                              :style="'color:' + ((eloPreviewFor(pid, true)?.total ?? 0) >= 0 ? '#22c55e' : '#ef4444')"
                              x-text="formatDelta(eloPreviewFor(pid, true)?.total ?? 0)"></span>
                        <template x-if="(eloPreviewFor(pid, true)?.streak ?? 0) > 0 || (eloPreviewFor(pid, true)?.breaker ?? 0) > 0">
                            <span style="color: rgba(255,255,255,0.55); font-size: 1rem; margin-left: 6px;">
                                (<span x-text="formatDelta(eloPreviewFor(pid, true).base)"></span><template x-if="eloPreviewFor(pid, true).streak > 0"><span> · +<span x-text="eloPreviewFor(pid, true).streak"></span> streak</span></template><template x-if="eloPreviewFor(pid, true).breaker > 0"><span> · +<span x-text="eloPreviewFor(pid, true).breaker"></span> break</span></template>)
                            </span>
                        </template>
                    </span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px;">
                    <span style="color: rgba(255,255,255,0.7); font-weight: 600;">If loses</span>
                    <span style="font-weight: 800; font-size: 1.45rem;"
                          :style="'color:' + ((eloPreviewFor(pid, false)?.total ?? 0) >= 0 ? '#22c55e' : '#ef4444')"
                          x-text="formatDelta(eloPreviewFor(pid, false)?.total ?? 0)"></span>
                </div>
            </div>
        </template>
    </div>
</template>
