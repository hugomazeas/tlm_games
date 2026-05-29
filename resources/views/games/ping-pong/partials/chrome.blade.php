{{--
    Shared editorial chrome for all ping pong pages.
    Loads display/body/mono fonts and defines all .pph-* design tokens, animations,
    and irreducible CSS (grain texture, glows, scrollbar hiding, etc).

    Use by wrapping each page's main content in a `.pph-stage` element and including
    this partial once at the top of the @section('content').
--}}

<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">

<style>
    .pph-stage { font-family: 'Bricolage Grotesque', 'Outfit', system-ui, sans-serif; color: rgba(245, 236, 214, 0.82); }
    .pph-stage .pph-display { font-family: 'Anton', sans-serif; font-weight: 400; }
    .pph-stage .pph-mono { font-family: 'JetBrains Mono', ui-monospace, SFMono-Regular, monospace; }

    .pph-stage {
        background:
            radial-gradient(40% 50% at 6% 4%,   rgba(255, 90, 74, 0.13), transparent 70%),
            radial-gradient(55% 65% at 96% 96%, rgba(62, 200, 255, 0.13), transparent 72%),
            linear-gradient(180deg, #0a0f24 0%, #06081b 100%);
        isolation: isolate;
    }
    .pph-stage::before {
        content: '';
        position: absolute; inset: 0;
        background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.85  0 0 0 0.6 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        opacity: 0.06;
        mix-blend-mode: overlay;
        pointer-events: none;
        z-index: 0;
        border-radius: inherit;
    }
    .pph-stage > * { position: relative; z-index: 1; }

    .pph-net::after {
        content: '';
        position: absolute; left: 0; right: 0; bottom: 0;
        height: 2px;
        background-image: repeating-linear-gradient(90deg, #f5ecd6 0 10px, transparent 10px 20px);
        opacity: 0.22;
    }

    .pph-ticket-notch::before,
    .pph-ticket-notch::after {
        content: '';
        position: absolute;
        width: 20px; height: 20px;
        border-radius: 9999px;
        background: #06081b;
        border: 1px solid rgba(245, 236, 214, 0.14);
        left: 50%;
        transform: translateX(-50%);
    }
    .pph-ticket-notch::before { top: -10px; }
    .pph-ticket-notch::after  { bottom: -10px; }

    .pph-ball {
        background: radial-gradient(circle at 35% 28%, #fff 0%, #f5ecd6 55%, #d9ca9c 100%);
        box-shadow:
            inset -3px -4px 6px rgba(120, 100, 60, 0.3),
            0 0 0 1px rgba(245, 236, 214, 0.4),
            0 8px 22px rgba(245, 236, 214, 0.22);
        /* animation: pph-ball-bounce 1.3s cubic-bezier(.4, 0, .6, 1) infinite alternate; */
    }
    @keyframes pph-ball-bounce {
        0%   { transform: translateY(-10px) rotate(0deg); }
        100% { transform: translateY(10px)  rotate(180deg); }
    }

    .pph-qr-corners > span {
        position: absolute; width: 12px; height: 12px;
        border: 2px solid #ff5a4a;
    }
    .pph-qr-corners > span:nth-child(1) { top: 0;    left: 0;  border-right: 0; border-bottom: 0; }
    .pph-qr-corners > span:nth-child(2) { top: 0;    right: 0; border-left: 0;  border-bottom: 0; border-color: #3ec8ff; }
    .pph-qr-corners > span:nth-child(3) { bottom: 0; left: 0;  border-right: 0; border-top: 0;    border-color: #3ec8ff; }
    .pph-qr-corners > span:nth-child(4) { bottom: 0; right: 0; border-left: 0;  border-top: 0; }

    #lobbyQrContainer img,
    #lobbyQrContainer canvas { display: block; width: 100% !important; height: 100% !important; }

    @keyframes pph-pulse-dot {
        0%, 100% { box-shadow: 0 0 0 0  rgba(255, 90, 74, 0.55); }
        50%      { box-shadow: 0 0 0 8px rgba(255, 90, 74, 0); }
    }
    .pph-pulse-dot { animation: pph-pulse-dot 1.5s ease-in-out infinite; }

    @keyframes pph-flicker { 0%,100% { opacity: 1; } 50% { opacity: .35; } }
    .pph-flicker { animation: pph-flicker 1.2s ease-in-out infinite; }

    @keyframes pph-slot-in {
        from { opacity: 0; transform: translateY(4px); }
        to   { opacity: 1; transform: none; }
    }
    .pph-slot-in { animation: pph-slot-in .35s ease-out; }

    @keyframes pph-spin { to { transform: rotate(360deg); } }
    .pph-spin { animation: pph-spin .8s linear infinite; }

    .pph-glow-amber { text-shadow: 0 0 18px rgba(255, 209, 102, 0.55); }
    .pph-glow-red   { text-shadow: 0 0 30px rgba(255, 90, 74, 0.38); }
    .pph-glow-blue  { text-shadow: 0 0 30px rgba(62, 200, 255, 0.38); }

    .pph-shadow-left  { box-shadow: -10px 0 26px -12px rgba(255, 90, 74, 0.38); }
    .pph-shadow-right { box-shadow:  10px 0 26px -12px rgba(62, 200, 255, 0.38); }

    /* Hide scrollbars inside the stage (still scrollable) */
    .pph-stage,
    .pph-stage * { scrollbar-width: none; -ms-overflow-style: none; }
    .pph-stage::-webkit-scrollbar,
    .pph-stage *::-webkit-scrollbar { width: 0; height: 0; display: none; }

    /* Serving dot on live cards */
    .pph-serving-right::after,
    .pph-serving-left::before {
        content: '•';
        color: #ffd166;
        text-shadow: 0 0 8px #ffd166;
    }
    .pph-serving-right::after { margin-left: 6px; }
    .pph-serving-left::before { margin-right: 6px; }

    /* Reusable surfaces */
    .pph-panel {
        background: linear-gradient(180deg, rgba(245, 236, 214, 0.03), rgba(245, 236, 214, 0.01));
        border: 1px solid rgba(245, 236, 214, 0.15);
        border-radius: 16px;
    }
    .pph-table th {
        font-family: 'JetBrains Mono', monospace;
        font-size: 10px;
        letter-spacing: 0.24em;
        text-transform: uppercase;
        color: rgba(245, 236, 214, 0.45);
        border-bottom: 1px solid rgba(245, 236, 214, 0.15);
        padding: 10px 12px;
        text-align: left;
        background: #0a0f24;
        position: sticky;
        top: 0;
    }
    .pph-table td {
        padding: 8px 12px;
        border-bottom: 1px solid rgba(245, 236, 214, 0.06);
        color: rgba(245, 236, 214, 0.82);
    }
    .pph-table tbody tr:hover td { background: rgba(245, 236, 214, 0.04); }
    .pph-table a { color: #3ec8ff; text-decoration: none; }
    .pph-table a:hover { color: #f5ecd6; }
</style>

@php
    $pageTitle = $pageTitle ?? null;
    $pageEyebrow = $pageEyebrow ?? 'TLM Office League';
    $pageBack = $pageBack ?? '/games/ping-pong';
@endphp

@if ($pageTitle)
    {{-- Slim editorial masthead for sub-pages --}}
    <header class="pph-net relative flex items-center justify-between gap-4 pb-3 mb-5 flex-shrink-0">
        <div class="flex items-center gap-3 min-w-0">
            <a href="{{ $pageBack }}"
               class="inline-flex items-center justify-center w-9 h-9 rounded-full border border-[#f5ecd6]/15 text-[#f5ecd6]/60 no-underline transition hover:text-[#f5ecd6] hover:border-[#f5ecd6]/30 hover:bg-[#f5ecd6]/[0.04] shrink-0"
               title="Back">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </a>
            <div class="flex items-center gap-2 leading-none select-none min-w-0">
                <span class="pph-display uppercase tracking-[0.015em] text-[clamp(20px,2.2vw,30px)] text-[#ff5a4a] pph-glow-red">PING</span>
                <span aria-hidden="true" class="pph-ball block rounded-full w-3 h-3 md:w-3.5 md:h-3.5 shrink-0"></span>
                <span class="pph-display uppercase tracking-[0.015em] text-[clamp(20px,2.2vw,30px)] text-[#3ec8ff] pph-glow-blue">PONG</span>
            </div>
            <span class="hidden md:inline-block ml-2 pph-mono text-[10px] tracking-[0.28em] uppercase text-[#f5ecd6]/40 truncate">{{ $pageEyebrow }}</span>
        </div>
        <h1 class="pph-display uppercase tracking-[0.04em] text-[clamp(22px,2.4vw,32px)] text-[#f5ecd6] m-0 truncate">{{ $pageTitle }}</h1>
    </header>
@endif
