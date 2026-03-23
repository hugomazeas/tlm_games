@extends('layouts.app')

@section('title', 'Ping Pong - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')
<style>
    .pp-container {
        height: calc(100vh - 80px);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .pp-grid {
        display: grid;
        grid-template-columns: 1fr 3fr;
        gap: 20px;
        flex: 1;
        min-height: 0;
    }

    @media (max-width: 768px) {
        .pp-grid {
            grid-template-columns: 1fr;
            gap: 12px;
        }

        .pp-container {
            height: auto;
            min-height: calc(100vh - 80px);
            overflow: auto;
        }

        .pp-panel {
            overflow: visible !important;
        }

        .pp-lb-tabs-row {
            scrollbar-width: none;
        }

        .pp-grid .pp-panel.pp-start-panel {
            padding: 12px 16px;
            flex-direction: row;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .pp-grid .pp-start-panel .pp-header,
        .pp-grid .pp-start-panel .pp-hint {
            display: none;
        }

        .pp-grid .pp-start-panel .pp-mode-toggle {
            margin-top: 0;
        }

        .pp-grid .pp-start-panel .pp-mode-btn {
            padding: 8px 16px;
            font-size: 1rem;
        }

        .pp-grid .pp-start-panel .pp-start-btn {
            margin-top: 0;
            padding: 10px 20px;
            font-size: 1rem;
            border-radius: 12px;
            white-space: nowrap;
        }

        .pp-leaderboard-table {
            font-size: 0.95rem;
        }

        .pp-leaderboard-table th,
        .pp-leaderboard-table td {
            padding: 8px 6px;
        }

        .pp-leaderboard-table {
            table-layout: auto;
        }

        .pp-leaderboard-table th:nth-child(6),
        .pp-leaderboard-table td:nth-child(6),
        .pp-leaderboard-table th:nth-child(7),
        .pp-leaderboard-table td:nth-child(7) {
            display: none;
        }
    }

    .pp-panel {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .pp-leaderboard-table {
        width: 100%;
        table-layout: fixed;
        border-collapse: collapse;
        font-size: 1.2rem;
    }

    .pp-leaderboard-table th,
    .pp-leaderboard-table td {
        width: 14.286%;
    }

    .pp-leaderboard-table th {
        text-align: left;
        padding: 12px 10px;
        color: rgba(255,255,255,0.5);
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        position: sticky;
        top: 0;
        background: rgba(15, 23, 42, 0.95);
    }

    .pp-leaderboard-table td {
        padding: 12px 10px;
        border-bottom: 1px solid rgba(255,255,255,0.05);
    }

    .pp-leaderboard-table tr:hover td {
        background: rgba(255,255,255,0.05);
    }

    .pp-leaderboard-table a {
        color: #3b82f6;
        text-decoration: none;
    }

    .pp-leaderboard-table a:hover {
        text-decoration: underline;
    }

    .pp-leaderboard-table .streak-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 999px;
        font-weight: 700;
        font-size: 0.85rem;
    }

    .pp-leaderboard-table .streak-badge.W {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
    }

    .pp-leaderboard-table .streak-badge.L {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
    }

    /* Mode toggle */
    .pp-mode-toggle {
        display: flex;
        gap: 4px;
        background: rgba(255,255,255,0.05);
        border-radius: 12px;
        padding: 4px;
        border: 1px solid rgba(255,255,255,0.1);
    }

    .pp-mode-btn {
        padding: 8px 24px;
        border-radius: 8px;
        font-weight: 700;
        font-size: 1.15rem;
        cursor: pointer;
        border: none;
        background: transparent;
        color: rgba(255,255,255,0.5);
        transition: all 0.2s;
    }

    .pp-mode-btn.active {
        background: #3b82f6;
        color: white;
    }

    .pp-mode-btn:hover:not(.active) {
        background: rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.8);
    }

    .pp-start-btn {
        padding: 16px 48px;
        border-radius: 16px;
        font-size: 1.5rem;
        font-weight: 700;
        cursor: pointer;
        border: none;
        background: #3b82f6;
        color: white;
        transition: all 0.2s;
        margin-top: 24px;
    }

    .pp-start-btn:hover {
        background: #2563eb;
        transform: scale(1.05);
    }

    .pp-start-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        transform: none;
    }

    /* Lobby waiting screen */
    .pp-lobby-grid {
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        gap: 24px;
        flex: 1;
        min-height: 0;
        align-items: start;
    }

    .pp-lobby-side {
        border-radius: 24px;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        border: 3px solid;
        min-height: 300px;
    }

    .pp-lobby-side.left {
        background: rgba(244, 63, 94, 0.08);
        border-color: rgba(244, 63, 94, 0.25);
    }

    .pp-lobby-side.right {
        background: rgba(6, 182, 212, 0.08);
        border-color: rgba(6, 182, 212, 0.25);
    }

    .pp-lobby-side .side-label {
        font-size: 1.5rem;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        margin-bottom: 20px;
    }

    .pp-lobby-side.left .side-label { color: #fb7185; }
    .pp-lobby-side.right .side-label { color: #22d3ee; }

    .pp-lobby-player-card {
        width: 100%;
        padding: 16px;
        border-radius: 12px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        margin-bottom: 10px;
        text-align: center;
    }

    .pp-lobby-player-card .name {
        font-weight: 700;
        font-size: 1.3rem;
    }

    .pp-lobby-player-card .elo {
        color: rgba(255,255,255,0.4);
        font-size: 0.9rem;
        margin-top: 2px;
    }

    .pp-lobby-empty-slot {
        width: 100%;
        padding: 16px;
        border-radius: 12px;
        border: 2px dashed rgba(255,255,255,0.15);
        margin-bottom: 10px;
        text-align: center;
        color: rgba(255,255,255,0.2);
        font-size: 0.9rem;
    }

    .pp-lobby-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        padding-top: 20px;
    }

    .pp-lobby-qr {
        background: white;
        border-radius: 16px;
        padding: 16px;
    }

    .pp-lobby-code {
        font-size: 3rem;
        font-weight: 900;
        letter-spacing: 0.15em;
        color: #3b82f6;
    }

    .pp-lobby-url {
        font-size: 0.85rem;
        color: rgba(255,255,255,0.3);
        word-break: break-all;
        text-align: center;
        max-width: 250px;
    }

    /* Playing screen */
    .pp-game-topbar {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 32px;
        padding: 10px 0;
        margin-bottom: 16px;
        flex-shrink: 0;
    }

    .pp-badge {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
        padding: 8px 20px;
        border-radius: 999px;
        font-size: 1.25rem;
        font-weight: 700;
    }

    .pp-timer {
        font-family: monospace;
        font-size: 1.5rem;
        color: rgba(255,255,255,0.4);
    }

    .pp-clock {
        font-family: monospace;
        font-size: 3rem;
        font-weight: 700;
        color: rgba(255,255,255,0.85);
        letter-spacing: 0.05em;
    }

    .pp-game-area {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 24px;
        flex: 1;
        min-height: 0;
    }

    .pp-score-panel {
        border-radius: 24px;
        padding: 40px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        position: relative;
        border: 3px solid rgba(255,255,255,0.1);
    }

    .pp-score-panel.left {
        background: rgba(244, 63, 94, 0.08);
        border-color: rgba(244, 63, 94, 0.2);
        transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .pp-score-panel.right {
        background: rgba(6, 182, 212, 0.08);
        border-color: rgba(6, 182, 212, 0.2);
        transition: background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
    }

    .pp-score-panel.left.serving-active {
        background: rgba(244, 63, 94, 0.35);
        border-color: rgba(244, 63, 94, 0.7);
        box-shadow: inset 0 0 60px rgba(244, 63, 94, 0.15), 0 0 30px rgba(244, 63, 94, 0.2);
    }

    .pp-score-panel.right.serving-active {
        background: rgba(6, 182, 212, 0.35);
        border-color: rgba(6, 182, 212, 0.7);
        box-shadow: inset 0 0 60px rgba(6, 182, 212, 0.15), 0 0 30px rgba(6, 182, 212, 0.2);
    }

    .pp-score-panel .player-name {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 4px;
        color: rgba(255,255,255,0.9);
    }

    .pp-score-panel .player-name-doubles {
        font-size: 2.8rem;
        font-weight: 700;
        margin-bottom: 2px;
        line-height: 1.2;
        color: rgba(255,255,255,0.4);
        transition: all 0.3s ease;
    }

    .pp-score-panel .player-name-doubles.serving-player {
        font-size: 3.6rem;
        font-weight: 800;
        color: rgba(255,255,255,1);
    }

    .pp-score-panel.left .player-name-doubles.serving-player {
        color: #fb7185;
        text-shadow: 0 0 30px rgba(251, 113, 133, 0.5);
    }

    .pp-score-panel.right .player-name-doubles.serving-player {
        color: #22d3ee;
        text-shadow: 0 0 30px rgba(34, 211, 238, 0.5);
    }

    .pp-serve-indicator {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 24px;
        min-height: 50px;
        padding: 6px 28px;
        border-radius: 999px;
        visibility: hidden;
    }

    .pp-serve-indicator.serving {
        visibility: visible;
        color: #fca5a5;
        background: rgba(252, 165, 165, 0.12);
        border: 2px solid rgba(252, 165, 165, 0.25);
        animation: pulse-serve 1.5s ease-in-out infinite;
    }

    @keyframes pulse-serve {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
    }

    .pp-score-value {
        font-size: 10rem;
        font-weight: 900;
        line-height: 1;
        margin-bottom: 24px;
    }

    .pp-score-panel.left .pp-score-value { color: #fb7185; }
    .pp-score-panel.right .pp-score-value { color: #22d3ee; }

    .pp-score-buttons {
        display: flex;
        gap: 16px;
    }

    .pp-score-btn {
        width: 84px;
        height: 84px;
        border-radius: 50%;
        border: 3px solid rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.05);
        color: white;
        font-size: 2.4rem;
        font-weight: 700;
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .pp-score-btn:hover {
        background: rgba(255,255,255,0.15);
        transform: scale(1.1);
    }

    .pp-score-btn.plus { border-color: rgba(34, 197, 94, 0.5); }
    .pp-score-btn.plus:hover { border-color: #22c55e; background: rgba(34, 197, 94, 0.2); }
    .pp-score-btn.minus { border-color: rgba(239, 68, 68, 0.5); }
    .pp-score-btn.minus:hover { border-color: #ef4444; background: rgba(239, 68, 68, 0.2); }

    .pp-hint {
        color: rgba(255,255,255,0.3);
        font-size: 1.15rem;
        margin-top: 12px;
    }

    .pp-header {
        margin-bottom: 16px;
        flex-shrink: 0;
    }

    .pp-header h2 {
        font-size: 2.2rem;
        font-weight: 800;
        color: #3b82f6;
    }

    .pp-header-sub {
        color: rgba(255,255,255,0.5);
        font-size: 1.2rem;
    }

    .pp-confirm-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 100;
    }

    .pp-confirm-box {
        background: #1e293b;
        border: 2px solid rgba(255,255,255,0.2);
        border-radius: 20px;
        padding: 40px;
        text-align: center;
        max-width: 480px;
    }

    .pp-confirm-box h3 {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 12px;
    }

    .pp-confirm-box p {
        color: rgba(255,255,255,0.5);
        margin-bottom: 24px;
        font-size: 1.3rem;
    }

    .pp-confirm-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
    }

    .pp-confirm-buttons button {
        padding: 12px 32px;
        border-radius: 12px;
        font-weight: 600;
        cursor: pointer;
        border: none;
        font-size: 1.3rem;
    }

    /* Live Games */
    .pp-live-banner {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        flex-shrink: 0;
    }

    .pp-live-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #ef4444;
        animation: pulse-live 1.5s ease-in-out infinite;
    }

    @keyframes pulse-live {
        0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5); }
        50% { opacity: 0.7; box-shadow: 0 0 8px 4px rgba(239, 68, 68, 0.3); }
    }

    .pp-live-title {
        font-size: 1.1rem;
        font-weight: 800;
        color: #ef4444;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }

    .pp-live-count {
        font-size: 0.9rem;
        color: rgba(255,255,255,0.4);
        font-weight: 600;
    }

    .pp-live-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .pp-live-card {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 14px 18px;
        display: grid;
        grid-template-columns: 1fr auto 1fr;
        align-items: center;
        gap: 12px;
        transition: border-color 0.3s, background 0.3s;
        cursor: pointer;
    }

    .pp-live-card:hover {
        border-color: rgba(255,255,255,0.2);
        background: rgba(255,255,255,0.07);
    }

    .pp-live-card.just-scored {
        border-color: rgba(59, 130, 246, 0.5);
        background: rgba(59, 130, 246, 0.08);
    }

    .pp-live-side {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .pp-live-side.left { text-align: right; }
    .pp-live-side.right { text-align: left; }

    .pp-live-player {
        font-weight: 700;
        font-size: 1.3rem;
        color: rgba(255,255,255,0.9);
    }

    .pp-live-player.serving {
        position: relative;
    }

    .pp-live-player.serving::after {
        content: '●';
        font-size: 0.6rem;
        color: #fbbf24;
        margin-left: 6px;
        vertical-align: middle;
    }

    .pp-live-side.left .pp-live-player.serving::after {
        content: none;
    }

    .pp-live-side.left .pp-live-player.serving::before {
        content: '●';
        font-size: 0.6rem;
        color: #fbbf24;
        margin-right: 6px;
        vertical-align: middle;
    }

    .pp-live-score-center {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .pp-live-score {
        font-size: 2.2rem;
        font-weight: 900;
        font-family: monospace;
        min-width: 38px;
        text-align: center;
    }

    .pp-live-score.left-score { color: #fb7185; }
    .pp-live-score.right-score { color: #22d3ee; }

    .pp-live-dash {
        color: rgba(255,255,255,0.2);
        font-size: 1.5rem;
        font-weight: 300;
    }

    .pp-live-mode {
        font-size: 0.75rem;
        color: rgba(255,255,255,0.3);
        text-transform: uppercase;
        font-weight: 600;
        letter-spacing: 0.05em;
        text-align: center;
        margin-top: 2px;
    }

    .pp-btn-danger {
        background: #ef4444;
        color: white;
    }

    .pp-btn-cancel {
        background: rgba(255,255,255,0.1);
        color: white;
        border: 1px solid rgba(255,255,255,0.2) !important;
    }

    .pp-duration {
        color: rgba(255,255,255,0.5);
        font-size: 1.5rem;
    }

    .pp-lb-panel-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        overflow: hidden;
    }

    .pp-lb-tabs-row {
        display: flex;
        flex-wrap: nowrap;
        gap: 6px;
        margin-bottom: 16px;
        flex-shrink: 0;
        overflow-x: auto;
        padding-bottom: 6px;
        scrollbar-width: thin;
    }

    .pp-lb-tab {
        padding: 6px 14px;
        border-radius: 8px;
        font-weight: 600;
        font-size: 1rem;
        cursor: pointer;
        border: none;
        background: rgba(255,255,255,0.06);
        color: rgba(255,255,255,0.55);
        transition: background 0.2s, color 0.2s;
        flex-shrink: 0;
        white-space: nowrap;
        max-width: 220px;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .pp-lb-tab.active {
        background: #3b82f6;
        color: white;
    }

    .pp-lb-tab:hover:not(.active) {
        background: rgba(255,255,255,0.12);
        color: rgba(255,255,255,0.85);
    }

    .pp-lb-tab-content {
        overflow-y: auto;
        flex: 1;
        min-height: 0;
    }
</style>

<div class="pp-container" x-data="pingPong()" x-init="init()" @keydown.window="handleKeydown($event)">

    <!-- SCREEN: HOME (lobby + leaderboard) -->
    <template x-if="screen === 'home'">
        <div class="pp-grid" style="height: 100%;">
            <!-- Left: Lobby Panel -->
            <div class="pp-panel pp-start-panel" style="align-items: center; justify-content: center;">
                <div style="display:flex;flex-direction:column;align-items:center;width:100%;gap:8px;">
                    <div class="pp-header" style="text-align: center; padding: 8px 0;">
                        <h2>Ping Pong</h2>
                    </div>
                    <div class="pp-mode-toggle">
                        <button class="pp-mode-btn" :class="{ active: mode === '1v1' }" @click="setMode('1v1')">1v1</button>
                        <button class="pp-mode-btn" :class="{ active: mode === '2v2' }" @click="setMode('2v2')">2v2</button>
                    </div>
                    <template x-if="lobbyCode">
                        <div style="display:flex;flex-direction:column;align-items:center;width:100%;gap:8px;">
                            <div class="pp-lobby-qr" id="lobbyQrContainer"></div>
                            <div class="pp-lobby-code" x-text="lobbyCode"></div>
                            <div class="pp-lobby-url" x-text="lobbyJoinUrl"></div>
                            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%;padding:0 12px;">
                                <div class="pp-lobby-side left">
                                    <div class="side-label">Left</div>
                                    <template x-for="p in lobbyLeftPlayers" :key="p.player_id">
                                        <div class="pp-lobby-player-card"><div class="name" x-text="p.player_name"></div></div>
                                    </template>
                                    <template x-for="i in leftEmptySlots" :key="'left-empty-' + i">
                                        <div class="pp-lobby-empty-slot">Waiting...</div>
                                    </template>
                                </div>
                                <div class="pp-lobby-side right">
                                    <div class="side-label">Right</div>
                                    <template x-for="p in lobbyRightPlayers" :key="p.player_id">
                                        <div class="pp-lobby-player-card"><div class="name" x-text="p.player_name"></div></div>
                                    </template>
                                    <template x-for="i in rightEmptySlots" :key="'right-empty-' + i">
                                        <div class="pp-lobby-empty-slot">Waiting...</div>
                                    </template>
                                </div>
                            </div>
                            <button class="pp-start-btn" :disabled="!lobbyReady || loading" @click="startLobbyMatch()">
                                <span x-show="!loading">Start Match</span>
                                <span x-show="loading">Starting...</span>
                            </button>
                            <div class="pp-hint" style="text-align: center;">
                                <span x-show="wsStatus === 'connected'" style="color: #22c55e;">&#9679; Live</span>
                                <span x-show="wsStatus === 'connecting'" style="color: #eab308;">&#9679; Connecting...</span>
                                <span x-show="wsStatus === 'error' || wsStatus === 'disconnected'" style="color: #ef4444;">&#9679; Disconnected</span>
                            </div>
                        </div>
                    </template>
                    <template x-if="!lobbyCode">
                        <div class="pp-hint">Creating lobby...</div>
                    </template>
                </div>
            </div>

            <!-- Right: Live Games + Leaderboards -->
            <div class="pp-panel pp-lb-panel-body">
                <div x-show="liveMatches.length > 0" style="flex-shrink: 0; margin-bottom: 16px;">
                    <div class="pp-live-banner">
                        <div class="pp-live-dot"></div>
                        <span class="pp-live-title">Live</span>
                        <span class="pp-live-count" x-text="liveMatches.length + ' match' + (liveMatches.length !== 1 ? 'es' : '')"></span>
                    </div>
                    <div class="pp-live-list">
                        <template x-for="lm in liveMatches" :key="lm.id">
                            <div class="pp-live-card"
                                 :class="{ 'just-scored': lm._flash }"
                                 @click="spectateMatch(lm.id)">
                                <div class="pp-live-side left">
                                    <div class="pp-live-player"
                                         :class="{ serving: lm.current_server_id === lm.player_left_id }"
                                         x-text="lm.player_left?.name || '?'"></div>
                                    <template x-if="lm.mode === '2v2' && lm.team_left_player2">
                                        <div class="pp-live-player"
                                             :class="{ serving: lm.current_server_id === lm.team_left_player2_id }"
                                             x-text="lm.team_left_player2?.name || '?'"></div>
                                    </template>
                                </div>
                                <div>
                                    <div class="pp-live-score-center">
                                        <span class="pp-live-score left-score" x-text="lm.player_left_score ?? 0"></span>
                                        <span class="pp-live-dash">-</span>
                                        <span class="pp-live-score right-score" x-text="lm.player_right_score ?? 0"></span>
                                    </div>
                                    <div class="pp-live-mode" x-text="lm.mode"></div>
                                </div>
                                <div class="pp-live-side right">
                                    <div class="pp-live-player"
                                         :class="{ serving: lm.current_server_id === lm.player_right_id }"
                                         x-text="lm.player_right?.name || '?'"></div>
                                    <template x-if="lm.mode === '2v2' && lm.team_right_player2">
                                        <div class="pp-live-player"
                                             :class="{ serving: lm.current_server_id === lm.team_right_player2_id }"
                                             x-text="lm.team_right_player2?.name || '?'"></div>
                                    </template>
                                </div>
                            </div>
                        </template>
                    </div>
                </div>
                <div class="pp-lb-tabs-row">
                    <button type="button" class="pp-lb-tab" :class="{ active: leaderboardTab === 'all' }" @click="leaderboardTab = 'all'">
                        All players
                    </button>
                    <template x-for="block in officeLeaderboards" :key="'tab-' + block.id">
                        <button type="button" class="pp-lb-tab" :class="{ active: leaderboardTab === block.id }" @click="leaderboardTab = block.id" x-text="block.name"></button>
                    </template>
                </div>
                <div class="pp-lb-tab-content">
                    <div x-show="leaderboardTab === 'all'">
                        <div class="pp-header">
                            <h2 x-text="mode === '2v2' ? '2v2 ELO Leaderboard' : 'ELO Leaderboard'"></h2>
                        </div>
                        <table class="pp-leaderboard-table" x-show="leaderboard.length > 0">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Player</th>
                                    <th>ELO</th>
                                    <th>W</th>
                                    <th>L</th>
                                    <th>Win %</th>
                                    <th>Streak</th>
                                </tr>
                            </thead>
                            <tbody>
                                <template x-for="(entry, i) in leaderboard" :key="entry.player_id">
                                    <tr>
                                        <td style="color: rgba(255,255,255,0.4); font-family: monospace;" x-text="i + 1"></td>
                                        <td>
                                            <a :href="'/games/ping-pong/players/' + entry.player_id" x-text="entry.player_name"></a>
                                        </td>
                                        <td style="font-weight: 700;" x-text="entry.elo_rating"></td>
                                        <td style="color: #22c55e;" x-text="entry.wins"></td>
                                        <td style="color: #ef4444;" x-text="entry.losses"></td>
                                        <td style="color: rgba(255,255,255,0.7);" x-text="entry.win_rate + '%'"></td>
                                        <td>
                                            <template x-if="entry.win_streak > 0">
                                                <span class="streak-badge W"><span>W</span><span x-text="entry.win_streak"></span></span>
                                            </template>
                                            <template x-if="entry.win_streak === 0 && entry.losing_streak > 0">
                                                <span class="streak-badge L"><span>L</span><span x-text="entry.losing_streak"></span></span>
                                            </template>
                                            <template x-if="entry.win_streak === 0 && !entry.losing_streak">
                                                <span style="color: rgba(255,255,255,0.3);">-</span>
                                            </template>
                                        </td>
                                    </tr>
                                </template>
                            </tbody>
                        </table>
                        <div x-show="leaderboard.length === 0" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.4);">
                            No matches played yet
                        </div>
                    </div>
                    <template x-for="block in officeLeaderboards" :key="'panel-' + block.id">
                        <div x-show="leaderboardTab === block.id">
                            <div class="pp-header">
                                <h2 x-text="officeLeaderboardTitle(block)"></h2>
                            </div>
                            <table class="pp-leaderboard-table" x-show="block.entries.length > 0">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Player</th>
                                        <th>ELO</th>
                                        <th>W</th>
                                        <th>L</th>
                                        <th>Win %</th>
                                        <th>Streak</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <template x-for="(entry, i) in block.entries" :key="entry.player_id">
                                        <tr>
                                            <td style="color: rgba(255,255,255,0.4); font-family: monospace;" x-text="i + 1"></td>
                                            <td>
                                                <a :href="'/games/ping-pong/players/' + entry.player_id" x-text="entry.player_name"></a>
                                            </td>
                                            <td style="font-weight: 700;" x-text="entry.elo_rating"></td>
                                            <td style="color: #22c55e;" x-text="entry.wins"></td>
                                            <td style="color: #ef4444;" x-text="entry.losses"></td>
                                            <td style="color: rgba(255,255,255,0.7);" x-text="entry.win_rate + '%'"></td>
                                            <td>
                                                <template x-if="entry.win_streak > 0">
                                                    <span class="streak-badge W"><span>W</span><span x-text="entry.win_streak"></span></span>
                                                </template>
                                                <template x-if="entry.win_streak === 0 && entry.losing_streak > 0">
                                                    <span class="streak-badge L"><span>L</span><span x-text="entry.losing_streak"></span></span>
                                                </template>
                                                <template x-if="entry.win_streak === 0 && !entry.losing_streak">
                                                    <span style="color: rgba(255,255,255,0.3);">-</span>
                                                </template>
                                            </td>
                                        </tr>
                                    </template>
                                </tbody>
                            </table>
                            <div x-show="block.entries.length === 0" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.4);">
                                No players from this office yet
                            </div>
                        </div>
                    </template>
                </div>
            </div>
        </div>
    </template>

    <!-- SCREEN: PLAYING -->
    <template x-if="screen === 'playing'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-game-topbar">
                <span class="pp-badge" x-text="mode === '2v2' ? '2v2 - First to 11' : 'First to 11'"></span>
                <span class="pp-clock" x-text="clockDisplay"></span>
                <span class="pp-timer" x-text="timerDisplay"></span>
            </div>
            <div class="pp-game-area">
                <!-- Left Team -->
                <div class="pp-score-panel left" :class="{ 'serving-active': isServing('left') }">
                    <template x-if="mode === '1v1'">
                        <div class="player-name" x-text="match.player_left?.name || ''"></div>
                    </template>
                    <template x-if="mode === '2v2'">
                        <div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.player_left_id) }"
                                 x-text="match.player_left?.name || ''"></div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.team_left_player2_id) }"
                                 x-text="match.team_left_player2?.name || ''"></div>
                        </div>
                    </template>
                    <div class="pp-serve-indicator" :class="{ 'serving': isServing('left') }">
                        Serving
                    </div>
                    <div class="pp-score-value" x-text="match.player_left_score ?? 0"></div>
                    <div class="pp-score-buttons">
                        <button class="pp-score-btn minus" @click="updateScore('left', 'decrement')">-</button>
                        <button class="pp-score-btn plus" @click="updateScore('left', 'increment')">+</button>
                    </div>
                </div>
                <!-- Right Team -->
                <div class="pp-score-panel right" :class="{ 'serving-active': isServing('right') }">
                    <template x-if="mode === '1v1'">
                        <div class="player-name" x-text="match.player_right?.name || ''"></div>
                    </template>
                    <template x-if="mode === '2v2'">
                        <div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.player_right_id) }"
                                 x-text="match.player_right?.name || ''"></div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.team_right_player2_id) }"
                                 x-text="match.team_right_player2?.name || ''"></div>
                        </div>
                    </template>
                    <div class="pp-serve-indicator" :class="{ 'serving': isServing('right') }">
                        Serving
                    </div>
                    <div class="pp-score-value" x-text="match.player_right_score ?? 0"></div>
                    <div class="pp-score-buttons">
                        <button class="pp-score-btn minus" @click="updateScore('right', 'decrement')">-</button>
                        <button class="pp-score-btn plus" @click="updateScore('right', 'increment')">+</button>
                    </div>
                </div>
            </div>
            <div class="pp-hint" style="text-align: center; margin-top: 8px;">
                Keys: &uarr; left+1 &darr; left-1 &rarr; right+1 &larr; right-1 | Backspace to abandon
            </div>
        </div>
    </template>

    <!-- Abandon Confirm -->
    <template x-if="showAbandonConfirm">
        <div class="pp-confirm-overlay" @click.self="showAbandonConfirm = false">
            <div class="pp-confirm-box">
                <h3>Abandon Match?</h3>
                <p>This match will be discarded.</p>
                <div class="pp-confirm-buttons">
                    <button class="pp-btn-cancel" @click="showAbandonConfirm = false">Cancel</button>
                    <button class="pp-btn-danger" @click="abandonMatch()">Abandon</button>
                </div>
            </div>
        </div>
    </template>
</div>

<script src="https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
<script>
function pingPong() {
    return {
        API: '/games/ping-pong/api',
        csrf: document.querySelector('meta[name="csrf-token"]').content,

        screen: 'home',
        mode: '1v1',
        leaderboard: [],
        offices: [],
        officeLeaderboards: [],
        leaderboardTab: 'all',

        // Lobby state
        lobbyCode: '',
        hostToken: '',
        lobbyParticipants: [],
        lobbyJoinUrl: '',

        // Live matches
        liveMatches: [],
        liveChannel: null,

        // Match state
        match: {},

        // Timer
        timerDisplay: '00:00',
        clockDisplay: '',
        timerInterval: null,
        clockInterval: null,
        matchStartTime: null,

        showAbandonConfirm: false,
        loading: false,

        echo: null,
        lobbyChannel: null,
        matchChannel: null,
        wsStatus: 'connecting',

        async init() {
            await this.loadLeaderboard();
            await this.loadLiveMatches();
            this.subscribeLive();
            this.startClock();
            await this.createLobby();
        },

        async setMode(newMode) {
            this.mode = newMode;
            await this.loadLeaderboard();
            // Re-create lobby with new mode
            await this.createLobby();
        },

        startClock() {
            this.updateClock();
            this.clockInterval = setInterval(() => this.updateClock(), 1000);
        },

        updateClock() {
            const now = new Date();
            this.clockDisplay = now.toLocaleTimeString('en-US', { hour12: false });
            this.pruneStaleLiveMatches();
        },

        // Must match PingPongApiController::LIVE_MATCH_MAX_IDLE_SECONDS (60s)
        pruneStaleLiveMatches() {
            const staleMs = 60_000;
            const cutoff = Date.now() - staleMs;
            this.liveMatches = this.liveMatches.filter((m) => {
                const raw = m.last_score_activity_at || m.started_at;
                if (!raw) return true;
                return new Date(raw).getTime() >= cutoff;
            });
        },

        startTimer() {
            this.matchStartTime = Date.now();
            this.timerDisplay = '00:00';
            if (this.timerInterval) clearInterval(this.timerInterval);
            this.timerInterval = setInterval(() => {
                const elapsed = Math.floor((Date.now() - this.matchStartTime) / 1000);
                const m = String(Math.floor(elapsed / 60)).padStart(2, '0');
                const s = String(elapsed % 60).padStart(2, '0');
                this.timerDisplay = `${m}:${s}`;
            }, 1000);
        },

        stopTimer() {
            if (this.timerInterval) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        },

        officeLeaderboardTitle(block) {
            const suffix = this.mode === '2v2' ? '2v2 ELO Leaderboard' : 'ELO Leaderboard';
            return `${block.name} — ${suffix}`;
        },

        async loadOffices() {
            const res = await fetch(`${this.API}/offices`);
            this.offices = await res.json();
        },

        async loadLeaderboard() {
            if (!this.offices.length) {
                await this.loadOffices();
            }
            const mode = this.mode;
            const res = await fetch(`${this.API}/leaderboard?mode=${mode}`);
            this.leaderboard = await res.json();
            this.officeLeaderboards = await Promise.all(
                this.offices.map(async (office) => {
                    const r = await fetch(`${this.API}/leaderboard?mode=${mode}&office_id=${office.id}`);
                    const entries = await r.json();
                    return { id: office.id, name: office.name, entries };
                })
            );
            if (this.leaderboardTab !== 'all' && !this.officeLeaderboards.some((b) => b.id === this.leaderboardTab)) {
                this.leaderboardTab = 'all';
            }
        },

        // --- LIVE MATCHES ---

        async loadLiveMatches() {
            try {
                const res = await fetch(`${this.API}/matches/live`);
                this.liveMatches = await res.json();
            } catch (err) {
                console.error('Error loading live matches:', err);
            }
        },

        subscribeLive() {
            if (!this.echo) {
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
            }

            this.liveChannel = this.echo.channel('ping-pong.live');
            this.liveChannel.listen('.match.started', (e) => {
                if (!this.liveMatches.find(m => m.id === e.match.id)) {
                    this.liveMatches = [e.match, ...this.liveMatches];
                }
            }).listen('.match.score-updated', (e) => {
                const data = e.match;
                const idx = this.liveMatches.findIndex(m => m.id === data.id);
                if (data.is_complete) {
                    if (idx !== -1) {
                        this.liveMatches = this.liveMatches.map((m, i) =>
                            i === idx ? { ...m, ...data, _flash: true } : m
                        );
                        setTimeout(() => {
                            this.liveMatches = this.liveMatches.filter(m => m.id !== data.id);
                            if (this.screen === 'home') this.loadLeaderboard();
                        }, 3000);
                    }
                    return;
                }
                // In-list update, or re-add after idle prune (new score = fresh last_score_activity_at)
                const entry = idx !== -1
                    ? { ...this.liveMatches[idx], ...data, _flash: true }
                    : { ...data, _flash: true };
                if (idx !== -1) {
                    this.liveMatches = this.liveMatches.map((m, i) => (i === idx ? entry : m));
                } else {
                    this.liveMatches = [entry, ...this.liveMatches.filter(m => m.id !== data.id)];
                }
                setTimeout(() => {
                    this.liveMatches = this.liveMatches.map((m) =>
                        m.id === data.id ? { ...m, _flash: false } : m
                    );
                }, 600);
            });
        },

        spectateMatch(matchId) {
            // Load the match and show the playing screen in spectate mode
            this.loadAndStartMatch(matchId);
        },

        // --- LOBBY ---

        async createLobby() {
            if (this.loading) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/lobbies`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ mode: this.mode }),
                });
                const data = await res.json();
                this.lobbyCode = data.code;
                this.hostToken = data.host_token;
                this.lobbyParticipants = [];

                this.lobbyJoinUrl = `${window.location.origin}/games/ping-pong/lobby/${this.lobbyCode}`;

                // On mobile, redirect to join page for unified phone experience
                if (window.innerWidth < 768) {
                    window.location.href = '/games/ping-pong/lobby/' + this.lobbyCode;
                    return;
                }

                this.subscribeToLobby();
                // Wait for x-if to render the QR container
                this.$nextTick(() => setTimeout(() => this.generateLobbyQr(), 100));
            } catch (err) {
                console.error('Error creating lobby:', err);
            }
            this.loading = false;
        },

        generateLobbyQr() {
            const el = document.getElementById('lobbyQrContainer');
            if (el) {
                el.innerHTML = '';
                new QRCode(el, { text: this.lobbyJoinUrl, width: 220, height: 220 });
            }
        },

        subscribeToLobby() {
            this.unsubscribeAll();

            this.wsStatus = 'connecting';

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

            this.echo.connector.pusher.connection.bind('connected', () => {
                console.log('[WS] Connected to Reverb');
                this.wsStatus = 'connected';
            });
            this.echo.connector.pusher.connection.bind('error', (err) => {
                console.error('[WS] Connection error:', err);
                this.wsStatus = 'error';
            });
            this.echo.connector.pusher.connection.bind('disconnected', () => {
                console.warn('[WS] Disconnected');
                this.wsStatus = 'disconnected';
            });

            this.lobbyChannel = this.echo.channel('ping-pong.lobby.' + this.lobbyCode);
            this.lobbyChannel.listen('.lobby.updated', (e) => {
                console.log('[WS] Lobby updated:', e);
                this.lobbyParticipants = e.lobby.participants || [];
            }).listen('.lobby.match-started', (e) => {
                console.log('[WS] Match started:', e);
                this.loadAndStartMatch(e.matchId);
            });
        },

        subscribeToMatch(matchId) {
            if (!this.echo) {
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
            }

            if (this.matchChannel) {
                this.echo.leave(this.matchChannel.name);
            }

            this.matchChannel = this.echo.channel('ping-pong.match.' + matchId);
            this.matchChannel.listen('.match.score-updated', (e) => {
                const data = e.match;
                if (data.player_left_score !== this.match.player_left_score ||
                    data.player_right_score !== this.match.player_right_score ||
                    data.is_complete !== this.match.is_complete) {
                    // Preserve points data if WS event doesn't include it
                    if (!data.points && this.match.points) {
                        data.points = this.match.points;
                    }
                    this.match = data;

                    if (data.is_complete && this.screen === 'playing') {
                        this.stopTimer();
                        window.location.href = '/games/ping-pong/matches/' + data.id + '?from=game';
                    }
                }
            });
        },

        unsubscribeAll() {
            if (this.echo) {
                if (this.lobbyChannel) {
                    this.echo.leave(this.lobbyChannel.name);
                    this.lobbyChannel = null;
                }
                if (this.matchChannel) {
                    this.echo.leave(this.matchChannel.name);
                    this.matchChannel = null;
                }
                if (this.liveChannel) {
                    this.echo.leave(this.liveChannel.name);
                    this.liveChannel = null;
                }
            }
        },

        get lobbyLeftPlayers() {
            return this.lobbyParticipants.filter(p => p.side === 'left');
        },

        get lobbyRightPlayers() {
            return this.lobbyParticipants.filter(p => p.side === 'right');
        },

        get leftEmptySlots() {
            const needed = this.mode === '2v2' ? 2 : 1;
            return Math.max(0, needed - this.lobbyLeftPlayers.length);
        },

        get rightEmptySlots() {
            const needed = this.mode === '2v2' ? 2 : 1;
            return Math.max(0, needed - this.lobbyRightPlayers.length);
        },

        get lobbyReady() {
            const needed = this.mode === '2v2' ? 2 : 1;
            return this.lobbyLeftPlayers.length === needed && this.lobbyRightPlayers.length === needed;
        },

        async startLobbyMatch() {
            if (this.loading || !this.lobbyReady) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ host_token: this.hostToken }),
                });
                const data = await res.json();
                this.match = data.match;


                // Subscribe to match channel for score updates
                this.subscribeToMatch(this.match.id);

                this.startTimer();
                this.screen = 'playing';
            } catch (err) {
                console.error('Error starting match:', err);
            }
            this.loading = false;
        },

        async loadAndStartMatch(matchId) {
            try {
                const res = await fetch(`${this.API}/matches/${matchId}`);
                const data = await res.json();
                this.match = data;

                this.subscribeToMatch(matchId);
                this.startTimer();
                this.screen = 'playing';
            } catch (err) {
                console.error('Error loading match:', err);
            }
        },

        // --- PLAYING ---

        isServing(side) {
            if (!this.match || !this.match.current_server_id) return false;
            if (side === 'left') {
                return this.match.current_server_id === this.match.player_left_id
                    || this.match.current_server_id === this.match.team_left_player2_id;
            }
            return this.match.current_server_id === this.match.player_right_id
                || this.match.current_server_id === this.match.team_right_player2_id;
        },

        isPlayerServing(playerId) {
            if (!this.match || !this.match.current_server_id || !playerId) return false;
            return this.match.current_server_id === playerId;
        },

        async updateScore(side, action) {
            if (this.loading || !this.match.id) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/matches/${this.match.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ side, action }),
                });
                const data = await res.json();
                this.match = data;

                if (data.is_complete) {
                    this.stopTimer();
                    window.location.href = '/games/ping-pong/matches/' + data.id + '?from=game';
                }
            } catch (err) {
                console.error('Error updating score:', err);
            }
            this.loading = false;
        },

        // --- NAVIGATION ---

        handleKeydown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            if (this.showAbandonConfirm) {
                if (e.key === 'Escape' || e.key === 'Backspace') {
                    e.preventDefault();
                    this.showAbandonConfirm = false;
                } else if (e.key === 'Enter') {
                    e.preventDefault();
                    this.abandonMatch();
                }
                return;
            }

            switch (this.screen) {
                case 'home':
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.startLobbyMatch();
                    } else if (e.key === 'Backspace') {
                        e.preventDefault();
                        window.location.href = '/';
                    }
                    break;
                case 'playing':
                    this.handlePlayingNav(e);
                    break;
            }
        },

        handlePlayingNav(e) {
            if (this.loading) return;
            switch (e.key) {
                case 'ArrowUp':
                    e.preventDefault();
                    this.updateScore('left', 'increment');
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.updateScore('left', 'decrement');
                    break;
                case 'ArrowRight':
                    e.preventDefault();
                    this.updateScore('right', 'increment');
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.updateScore('right', 'decrement');
                    break;
                case 'Backspace':
                    e.preventDefault();
                    this.showAbandonConfirm = true;
                    break;
            }
        },

        async cancelLobby() {
            if (this.lobbyCode && this.hostToken) {
                try {
                    await fetch(`${this.API}/lobbies/${this.lobbyCode}`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                        body: JSON.stringify({ host_token: this.hostToken }),
                    });
                } catch (err) {
                    // Silently ignore
                }
            }
            this.goToHome();
        },

        abandonMatch() {
            this.showAbandonConfirm = false;
            this.stopTimer();
            this.goToHome();
        },

        async goToHome() {
            this.unsubscribeAll();
            this.match = {};
            this.lobbyCode = '';
            this.hostToken = '';
            this.lobbyParticipants = [];
            this.stopTimer();
            this.timerDisplay = '00:00';
            this.leaderboardTab = 'all';
            await this.loadLeaderboard();
            await this.loadLiveMatches();
            this.subscribeLive();
            this.screen = 'home';
            await this.createLobby();
        },
    };
}
</script>
@endsection
