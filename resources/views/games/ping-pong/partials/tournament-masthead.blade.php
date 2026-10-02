{{--
    The home screen's masthead, with a back button. Variables:
      $back  — URL the arrow goes to
      $label — right-hand mono label
--}}
<header class="pph-net relative flex items-center justify-between gap-6 pb-3 flex-shrink-0">
    <div class="flex items-center gap-2.5 leading-none select-none min-w-0">
        <a href="{{ $back }}"
           class="inline-flex items-center justify-center w-9 h-9 mr-1 rounded-full border border-[#f5ecd6]/15 text-[#f5ecd6]/60 no-underline transition hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.04] shrink-0"
           title="Back">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </a>
        <span class="pph-display uppercase tracking-[0.015em] text-[clamp(24px,2.6vw,38px)] text-[#ff5a4a] pph-glow-red">PING</span>
        <span aria-hidden="true" class="pph-ball block rounded-full w-[clamp(12px,1.1vw,16px)] h-[clamp(12px,1.1vw,16px)]"></span>
        <span class="pph-display uppercase tracking-[0.015em] text-[clamp(24px,2.6vw,38px)] text-[#3ec8ff] pph-glow-blue">PONG</span>
        <span class="hidden md:inline-block ml-3 pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/40">TLM Office League</span>
    </div>

    <div class="inline-flex items-center gap-2 pph-mono text-[11px] uppercase tracking-[0.12em] text-[#f5ecd6]/80 min-w-0">
        <span class="w-2 h-2 rounded-full bg-[#ffd166] shadow-[0_0_10px_#ffd166] shrink-0"></span>
        <span class="truncate">{{ $label }}</span>
    </div>
</header>
