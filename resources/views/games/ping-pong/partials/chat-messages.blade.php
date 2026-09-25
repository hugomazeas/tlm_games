{{--
    Scrolling chat history list. Needs `...pingPongChat()` on the component.
--}}
<div data-chat-scroll class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pr-1">
    <template x-if="chatMessages.length === 0">
        <p class="m-auto pph-mono text-[11px] tracking-[0.16em] uppercase text-[#f5ecd6]/35 text-center">No messages yet</p>
    </template>
    <template x-for="message in chatMessages" :key="'chat-' + message.id">
        <div class="rounded-lg bg-[#f5ecd6]/[0.04] border border-[#f5ecd6]/[0.08] px-3 py-2">
            <div class="flex items-baseline justify-between gap-2">
                <span class="pph-mono text-[11px] font-bold tracking-[0.12em] uppercase text-[#ffd166] truncate" x-text="message.player.name"></span>
                <span class="pph-mono text-[10px] text-[#f5ecd6]/35 flex-shrink-0" x-text="chatTime(message.created_at)"></span>
            </div>
            <p class="m-0 mt-0.5 text-[15px] leading-snug text-[#f5ecd6] break-words" x-text="message.body"></p>
        </div>
    </template>
</div>
