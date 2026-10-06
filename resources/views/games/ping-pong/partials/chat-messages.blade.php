{{--
    Scrolling chat history list. Needs `...pingPongChat()` on the component.
    Join lines (`type: 'join'`) render as a single yellow line, Minecraft style.
    /giphy messages (`gif` set) show the GIF with their search words as a caption.
--}}
<div data-chat-scroll class="flex-1 min-h-0 overflow-y-auto flex flex-col gap-2.5 pr-1">
    <template x-if="chatMessages.length === 0">
        <p class="m-auto pph-mono text-[11px] tracking-[0.16em] uppercase text-[#f5ecd6]/35 text-center">No messages yet</p>
    </template>
    <template x-for="message in chatMessages" :key="'chat-' + message.id">
        <div>
            <template x-if="message.type === 'join'">
                <p data-chat-join class="m-0 px-1 pph-mono text-[12px] leading-snug text-[#ffff55] [text-shadow:2px_2px_0_#3f3f15] break-words">
                    <span x-text="message.player.name"></span> joined the chat
                </p>
            </template>
            <template x-if="message.type !== 'join'">
                <div class="rounded-lg bg-[#f5ecd6]/[0.04] border border-[#f5ecd6]/[0.08] px-3 py-2">
                    <div class="flex items-baseline justify-between gap-2">
                        <span class="pph-mono text-[11px] font-bold tracking-[0.12em] uppercase text-[#ffd166] truncate" x-text="message.player.name"></span>
                        <span class="pph-mono text-[10px] text-[#f5ecd6]/35 flex-shrink-0" x-text="chatTime(message.created_at)"></span>
                    </div>
                    <template x-if="message.gif">
                        <div data-chat-gif class="mt-1.5">
                            <img :src="message.gif.preview_url" :alt="message.gif.title" loading="lazy" @load="scrollChatToBottom()"
                                 :style="`aspect-ratio: ${message.gif.width || 4} / ${message.gif.height || 3}`"
                                 class="block w-full max-w-[240px] max-h-[140px] md:max-h-[200px] object-contain object-left rounded-md bg-[#f5ecd6]/[0.04]">
                            <p class="m-0 mt-1 pph-mono text-[10px] tracking-[0.08em] text-[#f5ecd6]/40 break-words">/giphy <span x-text="message.body"></span></p>
                        </div>
                    </template>
                    <template x-if="!message.gif">
                        <p class="m-0 mt-0.5 text-[15px] leading-snug text-[#f5ecd6] break-words" x-text="message.body"></p>
                    </template>
                </div>
            </template>
        </div>
    </template>
</div>
