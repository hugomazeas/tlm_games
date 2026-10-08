{{--
    Who is watching the match: named viewers as chips, guests as a count.
    Needs `...pingPongViewers()` on the component.
--}}
<div data-viewers-list class="flex-shrink-0 flex flex-wrap items-center gap-1.5 pph-mono text-[10px] tracking-[0.12em] uppercase">
    <span class="text-[#f5ecd6]/45" x-text="viewerCount() === 0 ? 'Nobody watching yet' : (viewerCount() + ' watching')"></span>
    <template x-for="viewer in namedViewers()" :key="viewer.id">
        <span class="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-[#ffd166]/10 text-[#ffd166] font-bold transition-colors"
              :class="viewerJoins.some(j => j.name === viewer.name) && '!bg-[#ffd166]/30'">
            <x-player-avatar-js name="viewer.name" url="viewer.avatar_url" size="xs" class="!w-3.5 !h-3.5 !text-[6px]" />
            <span x-text="viewer.name"></span>
        </span>
    </template>
    <span x-show="guestViewerCount() > 0" class="px-2 py-0.5 rounded-full bg-[#f5ecd6]/[0.06] text-[#f5ecd6]/55"
          x-text="'+' + guestViewerCount() + (guestViewerCount() === 1 ? ' guest' : ' guests')"></span>
</div>
