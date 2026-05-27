<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Join Ping Pong Lobby</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Anton&family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=JetBrains+Mono:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        /* ===== Editorial join — paddle-red × chalk-blue × cream on ink ===== */
        :root {
            --ink: #06081b;
            --ink-2: #0a0f24;
            --paper: #f5ecd6;
            --paper-soft: rgba(245, 236, 214, 0.82);
            --paper-faint: rgba(245, 236, 214, 0.45);
            --paper-fainter: rgba(245, 236, 214, 0.22);
            --paper-line: rgba(245, 236, 214, 0.14);
            --red:   #ff5a4a;
            --blue:  #3ec8ff;
            --amber: #ffd166;
            --mint:  #9be7c4;
        }

        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
            min-height: 100%;
            font-family: 'Bricolage Grotesque', system-ui, sans-serif;
            color: var(--paper-soft);
            -webkit-user-select: none;
            user-select: none;
            background:
                radial-gradient(40% 50% at 6% 4%,   rgba(255, 90, 74, 0.13), transparent 70%),
                radial-gradient(55% 65% at 96% 96%, rgba(62, 200, 255, 0.13), transparent 72%),
                linear-gradient(180deg, var(--ink-2) 0%, var(--ink) 100%);
        }

        .pph-display { font-family: 'Anton', sans-serif; font-weight: 400; }
        .pph-mono    { font-family: 'JetBrains Mono', ui-monospace, monospace; }

        .pph-glow-red  { text-shadow: 0 0 24px rgba(255, 90, 74, 0.4); }
        .pph-glow-blue { text-shadow: 0 0 24px rgba(62, 200, 255, 0.4); }

        @keyframes pph-flicker { 0%,100% { opacity: 1; } 50% { opacity: .4; } }
        @keyframes pph-ball-bounce {
            0%   { transform: translateY(-3px); }
            100% { transform: translateY(3px); }
        }
        @keyframes pph-dots {
            0%   { content: ''; }
            33%  { content: '.'; }
            66%  { content: '..'; }
            100% { content: '...'; }
        }

        .join-container {
            position: relative;
            min-height: 100vh;
            display: flex;
            flex-direction: column;
            isolation: isolate;
        }
        .join-container::before {
            content: '';
            position: absolute; inset: 0;
            background-image: url("data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 1 0 0 0 0 0.95 0 0 0 0 0.85 0 0 0 0.55 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
            opacity: 0.06;
            mix-blend-mode: overlay;
            pointer-events: none;
            z-index: 0;
        }
        .join-container > * { position: relative; z-index: 1; }

        /* ===== Masthead ===== */
        .join-header {
            text-align: center;
            padding: calc(22px + env(safe-area-inset-top)) 16px 14px;
            position: relative;
        }
        .join-header::after {
            content: '';
            position: absolute;
            left: 18%; right: 18%; bottom: 0;
            height: 2px;
            background-image: repeating-linear-gradient(90deg, var(--paper) 0 8px, transparent 8px 16px);
            opacity: 0.22;
        }
        .join-header .wordmark {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            line-height: 0.85;
        }
        .join-header .word {
            font-family: 'Anton', sans-serif;
            font-size: clamp(22px, 6vw, 32px);
            letter-spacing: 0.015em;
            text-transform: uppercase;
        }
        .join-header .word.red  { color: var(--red);  text-shadow: 0 0 24px rgba(255, 90, 74, 0.38); }
        .join-header .word.blue { color: var(--blue); text-shadow: 0 0 24px rgba(62, 200, 255, 0.38); }
        .join-header .ball {
            width: 11px; height: 11px;
            border-radius: 50%;
            background: radial-gradient(circle at 35% 28%, #fff 0%, var(--paper) 55%, #d9ca9c 100%);
            box-shadow: 0 0 0 1px rgba(245, 236, 214, 0.35), 0 6px 18px rgba(245, 236, 214, 0.2);
            animation: pph-ball-bounce 1.2s ease-in-out infinite alternate;
        }
        .join-header .lobby-code {
            margin-top: 10px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.22em;
            color: var(--paper-faint);
        }
        .join-header .lobby-code strong {
            color: var(--paper);
            margin: 0 4px;
        }

        /* Default (portrait) layout — single column, flex */
        .select-layout,
        .waiting-layout {
            display: flex;
            flex-direction: column;
            flex: 1;
            min-height: 0;
        }

        /* ===== Search input ===== */
        .create-player-section {
            padding: 16px;
            display: flex;
            gap: 10px;
        }
        .search-input {
            width: 100%;
            padding: 12px 14px;
            background: rgba(245, 236, 214, 0.05);
            border: 1px solid var(--paper-line);
            border-radius: 12px;
            color: var(--paper);
            font-family: 'Bricolage Grotesque', sans-serif;
            font-size: 0.95rem;
            font-weight: 500;
            outline: none;
            transition: border-color 0.18s, background 0.18s;
        }
        .search-input:focus {
            border-color: var(--paper);
            background: rgba(245, 236, 214, 0.08);
        }
        .search-input::placeholder {
            color: var(--paper-fainter);
            font-family: 'Bricolage Grotesque', sans-serif;
        }

        .create-btn {
            padding: 12px 18px;
            background: var(--paper);
            color: var(--ink);
            border: none;
            border-radius: 12px;
            font-family: 'Anton', sans-serif;
            font-weight: 400;
            font-size: 1rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
            white-space: nowrap;
            transition: transform 0.12s, box-shadow 0.18s, background 0.18s;
            box-shadow: 0 4px 14px rgba(245, 236, 214, 0.22);
        }
        .create-btn:active:not(:disabled) {
            transform: scale(0.97);
        }
        .create-btn:hover:not(:disabled) {
            background: #fffaf0;
        }
        .create-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
            box-shadow: none;
            background: rgba(245, 236, 214, 0.4);
        }

        /* ===== Player list ===== */
        .player-list {
            flex: 1;
            overflow-y: auto;
            padding: 0 16px calc(16px + env(safe-area-inset-bottom));
            scrollbar-width: none;
        }
        .player-list::-webkit-scrollbar { display: none; }

        .player-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 14px;
            border-radius: 12px;
            background: rgba(245, 236, 214, 0.03);
            border: 1px solid var(--paper-line);
            margin-bottom: 6px;
            cursor: pointer;
            transition: transform 0.12s, background 0.15s, border-color 0.15s;
        }
        .player-item:active {
            transform: scale(0.98);
            background: rgba(245, 236, 214, 0.07);
            border-color: var(--paper);
        }
        .player-item .name {
            font-family: 'Anton', sans-serif;
            font-weight: 400;
            font-size: 1.2rem;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            color: var(--paper);
        }
        .player-item .elo {
            font-family: 'JetBrains Mono', monospace;
            color: var(--paper-faint);
            font-size: 0.85rem;
            letter-spacing: 0.06em;
            font-weight: 700;
        }

        /* ===== Side selection ===== */
        .side-panels {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            padding: 10px 16px;
            flex-shrink: 0;
        }

        .side-panel {
            border-radius: 14px;
            padding: 12px 12px 14px;
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
            transition: transform 0.12s, background 0.2s, border-color 0.2s, box-shadow 0.2s;
            border: 2px solid;
            min-height: 96px;
        }
        .side-panel.left {
            background: rgba(255, 90, 74, 0.06);
            border-color: rgba(255, 90, 74, 0.3);
        }
        .side-panel.right {
            background: rgba(62, 200, 255, 0.06);
            border-color: rgba(62, 200, 255, 0.3);
        }
        .side-panel.left.selected {
            background: rgba(255, 90, 74, 0.18);
            border-color: var(--red);
            box-shadow: 0 0 24px rgba(255, 90, 74, 0.2);
        }
        .side-panel.right.selected {
            background: rgba(62, 200, 255, 0.18);
            border-color: var(--blue);
            box-shadow: 0 0 24px rgba(62, 200, 255, 0.2);
        }
        .side-panel:active { transform: scale(0.97); }

        .side-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.28em;
            margin-bottom: 8px;
        }
        .side-panel.left .side-label  { color: var(--red); }
        .side-panel.right .side-label { color: var(--blue); }

        .side-player {
            padding: 8px 10px;
            border-radius: 8px;
            background: rgba(245, 236, 214, 0.06);
            margin-bottom: 6px;
            font-family: 'Anton', sans-serif;
            font-weight: 400;
            font-size: 1rem;
            letter-spacing: 0.02em;
            text-transform: uppercase;
            color: var(--paper);
            text-align: center;
            width: 100%;
        }
        .side-player.is-me {
            background: rgba(255, 209, 102, 0.18);
            border: 1px solid rgba(255, 209, 102, 0.55);
            color: var(--amber);
            text-shadow: 0 0 14px rgba(255, 209, 102, 0.35);
        }

        /* ===== Waiting screen header ===== */
        .reselect-player {
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 8px 14px;
            border-radius: 999px;
            border: 1px solid var(--paper-line);
            background: rgba(245, 236, 214, 0.04);
            font-family: 'Anton', sans-serif;
            font-size: 1rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--paper);
            transition: background 0.15s, border-color 0.15s, transform 0.12s;
        }
        .reselect-player:active {
            transform: scale(0.97);
            background: rgba(245, 236, 214, 0.08);
            border-color: rgba(245, 236, 214, 0.3);
        }
        .reselect-player::before {
            content: '↺';
            color: var(--amber);
            font-size: 0.9rem;
        }

        .reselect-hint {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: var(--paper-faint);
            margin-top: 8px;
            line-height: 1.5;
        }

        /* ===== QR section ===== */
        .qr-section {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 10px;
            padding: 12px 16px 4px;
        }
        .qr-label {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            font-weight: 700;
            letter-spacing: 0.28em;
            text-transform: uppercase;
            color: var(--paper-faint);
        }
        .qr-container {
            background: #ffffff;
            border-radius: 12px;
            padding: 10px;
            position: relative;
        }
        .qr-container::before,
        .qr-container::after {
            content: '';
            position: absolute;
            width: 10px; height: 10px;
        }
        .qr-container::before {
            top: 2px; left: 2px;
            border-top: 2px solid var(--red);
            border-left: 2px solid var(--red);
        }
        .qr-container::after {
            bottom: 2px; right: 2px;
            border-bottom: 2px solid var(--blue);
            border-right: 2px solid var(--blue);
        }
        #joinQrContainer img,
        #joinQrContainer canvas { display: block; }

        .qr-lobby-code {
            font-family: 'Anton', sans-serif;
            font-size: 2rem;
            letter-spacing: 0.18em;
            color: var(--paper);
            text-shadow: 0 0 22px rgba(245, 236, 214, 0.25);
        }
        .qr-join-url {
            font-family: 'JetBrains Mono', monospace;
            font-size: 10px;
            color: var(--paper-fainter);
            word-break: break-all;
            text-align: center;
            max-width: 280px;
            letter-spacing: 0.04em;
        }

        /* ===== Start / waiting ===== */
        .start-row {
            padding: 14px 16px calc(20px + env(safe-area-inset-bottom));
        }
        .start-btn {
            width: 100%;
            padding: 16px;
            background: var(--paper);
            color: var(--ink);
            border: none;
            border-radius: 14px;
            font-family: 'Anton', sans-serif;
            font-size: 1.2rem;
            letter-spacing: 0.06em;
            text-transform: uppercase;
            cursor: pointer;
            box-shadow: 0 6px 18px rgba(245, 236, 214, 0.22);
            transition: transform 0.12s, background 0.18s, box-shadow 0.18s;
        }
        .start-btn:active:not(:disabled) { transform: scale(0.98); }
        .start-btn:hover:not(:disabled)  { background: #fffaf0; }
        .start-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
            box-shadow: none;
            background: rgba(245, 236, 214, 0.4);
        }

        .waiting-indicator {
            text-align: center;
            padding: 14px 16px;
            color: var(--paper-faint);
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            letter-spacing: 0.16em;
            text-transform: uppercase;
        }
        .waiting-indicator .dots::after {
            content: '';
            animation: pph-dots 1.5s steps(3) infinite;
        }

        /* Search-empty hint */
        .empty-hint {
            text-align: center;
            padding: 24px 12px;
            font-family: 'JetBrains Mono', monospace;
            font-size: 11px;
            color: var(--paper-faint);
            letter-spacing: 0.1em;
            line-height: 1.6;
        }
        .empty-hint .query {
            color: var(--amber);
            font-weight: 700;
        }

        /* Error screen */
        .error-screen {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            text-align: center;
            padding: 24px;
        }
        .error-title {
            font-family: 'Anton', sans-serif;
            font-size: 1.6rem;
            letter-spacing: 0.04em;
            text-transform: uppercase;
            color: var(--red);
            text-shadow: 0 0 22px rgba(255, 90, 74, 0.35);
            margin-bottom: 8px;
        }
        .error-message {
            font-family: 'JetBrains Mono', monospace;
            font-size: 12px;
            letter-spacing: 0.12em;
            text-transform: uppercase;
            color: var(--paper-faint);
        }

        /* ============================================================
           Landscape — phone held sideways
           Lock viewport: no scrolling, everything must fit in the page.
           ============================================================ */
        @media (orientation: landscape) and (max-height: 540px) {
            html, body { height: 100%; overflow: hidden; }
            .join-container { height: 100vh; max-height: 100vh; overflow: hidden; }
            /* Slim masthead, inline wordmark + lobby code */
            .join-header {
                padding: 10px 18px 10px;
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 16px;
                text-align: left;
            }
            .join-header::after { left: 0; right: 0; }
            .join-header .word { font-size: clamp(18px, 3vw, 26px); }
            .join-header .ball { width: 9px; height: 9px; }
            .join-header .lobby-code { margin-top: 0; }

            /* ===== Select screen — 2-column: search left, list right ===== */
            .select-layout {
                display: grid;
                grid-template-columns: minmax(220px, 38%) 1fr;
                gap: 14px;
                padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
                flex: 1;
                min-height: 0;
            }
            .select-layout .create-player-section {
                padding: 0;
                flex-direction: column;
                gap: 10px;
            }
            .select-layout .create-player-section .search-input { padding: 10px 12px; }
            .select-layout .create-player-section .create-btn { width: 100%; padding: 12px; }
            .select-layout .player-list {
                padding: 0;
                margin: 0;
            }
            .select-layout .player-item {
                padding: 10px 12px;
                margin-bottom: 5px;
            }
            .select-layout .player-item .name { font-size: 1rem; }
            .select-layout .player-item .elo { font-size: 0.75rem; }

            /* ===== Waiting screen — 2-column: QR left, side panels right ===== */
            .waiting-layout {
                display: grid;
                grid-template-columns: minmax(220px, 40%) 1fr;
                grid-template-rows: auto 1fr auto;
                grid-template-areas:
                    "header  side"
                    "qr      side"
                    "qr      start";
                gap: 10px 16px;
                padding: 10px 16px calc(10px + env(safe-area-inset-bottom));
                flex: 1;
                min-height: 0;
            }
            .waiting-layout .reselect-row { grid-area: header; text-align: left; padding: 0; }
            .waiting-layout .qr-section {
                grid-area: qr;
                padding: 0;
                gap: 6px;
                align-self: start;
            }
            .waiting-layout .qr-container {
                padding: 4px;
                width: 96px;
                height: 96px;
                box-sizing: border-box;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .waiting-layout #joinQrContainer img {
                width: 100% !important;
                height: 100% !important;
                display: block !important;
            }
            .waiting-layout #joinQrContainer canvas { display: none !important; }
            .waiting-layout .qr-lobby-code { font-size: 1.3rem; letter-spacing: 0.14em; }
            .waiting-layout .qr-join-url { display: none; }
            .waiting-layout .qr-label { font-size: 9px; letter-spacing: 0.22em; }

            .waiting-layout .side-panels {
                grid-area: side;
                grid-template-columns: 1fr 1fr;
                gap: 10px;
                padding: 0;
                align-self: center;     /* vertically center within the grid row */
                align-items: stretch;   /* still match the two panels in height */
            }
            .waiting-layout .side-panel {
                padding: 10px;
                min-height: 0;
                height: auto;            /* size to content (label + up to 2 cards) */
            }
            .waiting-layout .side-panel .side-label { margin-bottom: 6px; font-size: 9px; }
            .waiting-layout .side-player { padding: 6px 8px; font-size: 0.85rem; margin-bottom: 4px; }

            .waiting-layout .start-row {
                grid-area: start;
                padding: 0;
            }
            .waiting-layout .start-btn { padding: 12px; font-size: 1rem; }
            .waiting-layout .waiting-indicator { padding: 8px; font-size: 10px; }

            .reselect-hint { font-size: 9px; letter-spacing: 0.14em; }
        }
    </style>
</head>
<body>
    <div class="join-container" x-data="lobbyJoin()" x-init="init()">
        <div class="join-header">
            <div class="wordmark">
                <span class="word red">PING</span>
                <span class="ball" aria-hidden="true"></span>
                <span class="word blue">PONG</span>
            </div>
            <div class="lobby-code">
                Lobby <strong x-text="lobbyCode"></strong> · <span x-text="lobbyMode"></span>
            </div>
        </div>

        <!-- Screen 1: Player Selection -->
        <template x-if="screen === 'select'">
            <div class="select-layout">
                <div class="create-player-section">
                    <input type="text"
                           class="search-input"
                           placeholder="Search or type new name…"
                           x-model="searchQuery"
                           @keydown.enter="handleEnter()">
                    <button class="create-btn"
                            :disabled="!canCreate"
                            @click="createAndJoin()">
                        Join
                    </button>
                </div>

                <div class="player-list">
                    <template x-for="player in filteredPlayers" :key="player.id">
                        <div class="player-item" @click="joinAsPlayer(player)">
                            <span class="name" x-text="player.name"></span>
                            <span class="elo" x-text="'ELO ' + player.elo_rating"></span>
                        </div>
                    </template>
                    <div class="empty-hint" x-show="filteredPlayers.length === 0 && searchQuery.length > 0">
                        No players found — press Join to create
                        <span class="query">"<span x-text="searchQuery"></span>"</span>
                    </div>
                </div>
            </div>
        </template>

        <!-- Screen 2: Side Selection + Waiting -->
        <template x-if="screen === 'waiting'">
            <div class="waiting-layout">
                <div class="reselect-row" style="padding: 14px 16px; text-align: center;">
                    <div class="reselect-player"
                         @click="reselectPlayer()">
                        <span x-text="'You · ' + myPlayerName"></span>
                    </div>
                    <div class="reselect-hint">Tap name to change · Tap a side to switch</div>
                </div>

                <div class="qr-section" x-init="$nextTick(() => generateQr())">
                    <div class="qr-label">Share with opponent</div>
                    <div class="qr-container" id="joinQrContainer"></div>
                    <div class="qr-lobby-code" x-text="lobbyCode"></div>
                    <div class="qr-join-url" x-text="joinUrl"></div>
                </div>

                <div class="side-panels">
                    <div class="side-panel left" :class="{ 'selected': mySide === 'left' }" @click="switchSide('left')">
                        <div class="side-label">Left</div>
                        <template x-for="p in leftPlayers" :key="p.player_id">
                            <div class="side-player" :class="{ 'is-me': p.player_id === myPlayerId }" x-text="p.player_name"></div>
                        </template>
                    </div>
                    <div class="side-panel right" :class="{ 'selected': mySide === 'right' }" @click="switchSide('right')">
                        <div class="side-label">Right</div>
                        <template x-for="p in rightPlayers" :key="p.player_id">
                            <div class="side-player" :class="{ 'is-me': p.player_id === myPlayerId }" x-text="p.player_name"></div>
                        </template>
                    </div>
                </div>

                <div class="start-row">
                    <template x-if="mySide === 'left'">
                        <button class="start-btn"
                                :disabled="!lobbyReady || starting"
                                @click="startGame()">
                            <span x-show="!starting">Start match →</span>
                            <span x-show="starting">Starting…</span>
                        </button>
                    </template>
                    <template x-if="mySide === 'right'">
                        <div class="waiting-indicator">
                            Waiting for left to start<span class="dots"></span>
                        </div>
                    </template>
                </div>
                <div class="waiting-indicator" x-show="!lobbyReady">
                    Waiting for players<span class="dots"></span>
                </div>
            </div>
        </template>

        <!-- Expired / error state -->
        <template x-if="screen === 'error'">
            <div class="error-screen">
                <div>
                    <div class="error-title" x-text="errorTitle"></div>
                    <div class="error-message" x-text="errorMessage"></div>
                </div>
            </div>
        </template>
    </div>

    <script>
    function lobbyJoin() {
        return {
            lobbyCode: @json($lobbyCode),
            lobbyMode: @json($lobbyMode),
            remoteUrl: window.location.origin,
            joinUrl: window.location.origin + '/games/ping-pong/lobby/' + @json($lobbyCode),
            API: '/games/ping-pong/api',
            csrf: document.querySelector('meta[name="csrf-token"]').content,

            screen: 'select',
            searchQuery: '',
            players: [],
            participants: [],

            myPlayerId: null,
            myPlayerName: '',
            mySide: null,
            sessionToken: null,

            errorTitle: '',
            errorMessage: '',
            starting: false,

            echo: null,

            async init() {
                // Check for stored session
                const stored = localStorage.getItem('lobby_' + this.lobbyCode);
                if (stored) {
                    try {
                        const data = JSON.parse(stored);
                        this.sessionToken = data.session_token;
                        this.myPlayerId = data.player_id;
                        this.myPlayerName = data.player_name;
                        this.mySide = data.side;
                    } catch (e) {
                        localStorage.removeItem('lobby_' + this.lobbyCode);
                    }
                }

                // Load lobby state
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}`);
                    const lobby = await res.json();

                    if (lobby.status === 'started' && lobby.match_id) {
                        // Match already started, redirect
                        if (this.mySide) {
                            window.location.href = `${this.remoteUrl}/games/ping-pong/remote/${lobby.match_id}/${this.mySide}`;
                            return;
                        }
                    }

                    if (lobby.status === 'expired') {
                        this.showError('Lobby Expired', 'This lobby is no longer active.');
                        return;
                    }

                    this.participants = lobby.participants || [];

                    // If we have a session, verify it's still valid
                    if (this.sessionToken) {
                        const stillIn = this.participants.find(p => p.player_id === this.myPlayerId);
                        if (stillIn) {
                            this.mySide = stillIn.side;
                            this.screen = 'waiting';
                            this.subscribeToLobby();
                            return;
                        } else {
                            // Session invalid, clear it
                            this.clearSession();
                        }
                    }
                } catch (err) {
                    this.showError('Error', 'Could not load lobby.');
                    return;
                }

                await this.loadPlayers();
                this.subscribeToLobby();

                // Auto-join with last chosen player if available
                if (this.screen === 'select') {
                    const lastPlayer = this.getLastPlayer();
                    if (lastPlayer) {
                        const player = this.players.find(p => p.id === lastPlayer.player_id);
                        if (player) {
                            await this.joinAsPlayer(player);
                            return;
                        }
                    }
                }
            },

            async loadPlayers() {
                try {
                    const res = await fetch(`${this.API}/players?mode=${this.lobbyMode}`);
                    this.players = await res.json();
                } catch (err) {
                    // Silently ignore
                }
            },

            subscribeToLobby() {
                this.echo = new Echo({
                    broadcaster: 'pusher',
                    key: 'games-hub-key',
                    wsHost: window.location.hostname,
                    wsPort: window.location.port || 80,
                    forceTLS: false,
                    disableStats: true,
                    enabledTransports: ['ws', 'wss'],
                    cluster: 'mt1',
                });

                this.echo.channel('ping-pong.lobby.' + this.lobbyCode)
                    .listen('.lobby.updated', (e) => {
                        this.participants = e.lobby.participants || [];
                        // Update my side if changed
                        if (this.myPlayerId) {
                            const me = this.participants.find(p => p.player_id === this.myPlayerId);
                            if (me) this.mySide = me.side;
                        }
                    })
                    .listen('.lobby.match-started', (e) => {
                        if (this.mySide) {
                            window.location.href = `${this.remoteUrl}/games/ping-pong/remote/${e.matchId}/${this.mySide}`;
                        }
                    });
            },

            get filteredPlayers() {
                if (!this.searchQuery) return this.players;
                const q = this.searchQuery.toLowerCase();
                return this.players.filter(p => p.name.toLowerCase().includes(q));
            },

            get canCreate() {
                return this.searchQuery.trim().length > 0;
            },

            get leftPlayers() {
                return this.participants.filter(p => p.side === 'left');
            },

            get rightPlayers() {
                return this.participants.filter(p => p.side === 'right');
            },

            get lobbyReady() {
                const needed = this.lobbyMode === '2v2' ? 2 : 1;
                return this.leftPlayers.length === needed && this.rightPlayers.length === needed;
            },

            handleEnter() {
                if (this.filteredPlayers.length === 1) {
                    this.joinAsPlayer(this.filteredPlayers[0]);
                } else if (this.filteredPlayers.length === 0 && this.canCreate) {
                    this.createAndJoin();
                }
            },

            async joinAsPlayer(player) {
                await this.doJoin({ player_id: player.id }, player.name);
            },

            async createAndJoin() {
                const name = this.searchQuery.trim();
                if (!name) return;
                await this.doJoin({ player_name: name }, name);
            },

            async doJoin(params, playerName) {
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/join`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify(params),
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || 'Could not join lobby');
                        return;
                    }

                    const data = await res.json();
                    this.sessionToken = data.session_token;
                    this.myPlayerId = data.player_id;
                    this.myPlayerName = playerName;
                    this.mySide = data.side;

                    this.saveSession();
                    this.saveLastPlayer(this.myPlayerId, playerName);

                    // Refresh lobby state
                    const lobbyRes = await fetch(`${this.API}/lobbies/${this.lobbyCode}`);
                    const lobby = await lobbyRes.json();
                    this.participants = lobby.participants || [];

                    this.screen = 'waiting';
                } catch (err) {
                    alert('Error joining lobby');
                }
            },

            async reselectPlayer() {
                if (!this.sessionToken) return;
                try {
                    await fetch(`${this.API}/lobbies/${this.lobbyCode}/leave`, {
                        method: 'DELETE',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify({ session_token: this.sessionToken }),
                    });
                } catch (err) {
                    // Continue anyway so user can try again
                }
                this.clearSession();
                this.screen = 'select';
                await this.loadPlayers();
            },

            async switchSide(side) {
                if (!this.sessionToken || side === this.mySide) return;
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/side`, {
                        method: 'PATCH',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify({
                            session_token: this.sessionToken,
                            side: side,
                        }),
                    });

                    if (res.ok) {
                        this.mySide = side;
                        this.saveSession();
                    } else {
                        const err = await res.json();
                        // Side full — silently ignore
                    }
                } catch (err) {
                    // Silently ignore
                }
            },

            async startGame() {
                if (this.starting || !this.lobbyReady || !this.sessionToken) return;
                this.starting = true;
                try {
                    const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/start`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-CSRF-TOKEN': this.csrf,
                        },
                        body: JSON.stringify({ session_token: this.sessionToken }),
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || 'Could not start game');
                    }
                    // The LobbyMatchStarted WebSocket event will redirect us
                } catch (err) {
                    alert('Error starting game');
                }
                this.starting = false;
            },

            saveSession() {
                localStorage.setItem('lobby_' + this.lobbyCode, JSON.stringify({
                    session_token: this.sessionToken,
                    player_id: this.myPlayerId,
                    player_name: this.myPlayerName,
                    side: this.mySide,
                }));
            },

            getLastPlayer() {
                try {
                    const stored = localStorage.getItem('ping_pong_last_player');
                    if (!stored) return null;
                    const data = JSON.parse(stored);
                    return data.player_id && data.player_name ? data : null;
                } catch (e) {
                    return null;
                }
            },

            saveLastPlayer(playerId, playerName) {
                localStorage.setItem('ping_pong_last_player', JSON.stringify({
                    player_id: playerId,
                    player_name: playerName,
                }));
            },

            clearSession() {
                localStorage.removeItem('lobby_' + this.lobbyCode);
                this.sessionToken = null;
                this.myPlayerId = null;
                this.myPlayerName = '';
                this.mySide = null;
            },

            generateQr() {
                const el = document.getElementById('joinQrContainer');
                if (el) {
                    el.innerHTML = '';
                    new QRCode(el, { text: this.joinUrl, width: 180, height: 180 });
                }
            },

            showError(title, message) {
                this.errorTitle = title;
                this.errorMessage = message;
                this.screen = 'error';
            },
        };
    }
    </script>
</body>
</html>
