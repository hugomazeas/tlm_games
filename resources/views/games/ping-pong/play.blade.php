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
        grid-template-columns: 1fr 1fr;
        gap: 20px;
        flex: 1;
        min-height: 0;
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
        border-collapse: collapse;
        font-size: 1.2rem;
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

    /* Game Over */
    .pp-gameover {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex: 1;
        gap: 28px;
        min-height: 0;
    }

    .pp-winner-text {
        font-size: 4.5rem;
        font-weight: 900;
        background: linear-gradient(135deg, #3b82f6, #06b6d4);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
    }

    .pp-final-score {
        font-size: 5rem;
        font-weight: 800;
        color: rgba(255,255,255,0.9);
    }

    .pp-elo-changes {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 32px;
        width: 100%;
        max-width: 700px;
    }

    .pp-elo-changes.doubles {
        grid-template-columns: 1fr 1fr 1fr 1fr;
        max-width: 1000px;
    }

    .pp-elo-card {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 28px;
        text-align: center;
    }

    .pp-elo-card .name { font-weight: 700; margin-bottom: 10px; font-size: 1.5rem; }
    .pp-elo-card .change { font-size: 2.5rem; font-weight: 800; }
    .pp-elo-card .detail { font-size: 1.15rem; color: rgba(255,255,255,0.5); margin-top: 6px; }

    .pp-elo-positive { color: #22c55e; }
    .pp-elo-negative { color: #ef4444; }

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
</style>

<div class="pp-container" x-data="pingPong()" x-init="init()" @keydown.window="handleKeydown($event)">

    <!-- SCREEN: HOME -->
    <template x-if="screen === 'home'">
        <div class="pp-grid" style="height: 100%;">
            <!-- Left: Start Game -->
            <div class="pp-panel" style="align-items: center; justify-content: center;">
                <div class="pp-header" style="text-align: center;">
                    <h2>Ping Pong</h2>
                    <div class="pp-header-sub">Start a new game</div>
                </div>
                <div class="pp-mode-toggle" style="margin-top: 20px;">
                    <button class="pp-mode-btn" :class="{ active: mode === '1v1' }" @click="setMode('1v1')">1v1</button>
                    <button class="pp-mode-btn" :class="{ active: mode === '2v2' }" @click="setMode('2v2')">2v2</button>
                </div>
                <button class="pp-start-btn" :disabled="loading" @click="createLobby()">
                    <span x-show="!loading">Start Game</span>
                    <span x-show="loading">Creating...</span>
                </button>
                <div class="pp-hint" style="margin-top: 16px;">Players join via QR code on their phones</div>
            </div>

            <!-- Right: Leaderboard -->
            <div class="pp-panel">
                <div class="pp-header">
                    <h2 x-text="mode === '2v2' ? '2v2 ELO Leaderboard' : 'ELO Leaderboard'"></h2>
                </div>
                <div style="overflow-y: auto; flex: 1; min-height: 0;">
                    <table class="pp-leaderboard-table" x-show="leaderboard.length > 0">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Player</th>
                                <th>ELO</th>
                                <th>W</th>
                                <th>L</th>
                                <th>Win %</th>
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
                                </tr>
                            </template>
                        </tbody>
                    </table>
                    <div x-show="leaderboard.length === 0" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.4);">
                        No matches played yet
                    </div>
                </div>
            </div>
        </div>
    </template>

    <!-- SCREEN: LOBBY WAITING -->
    <template x-if="screen === 'lobby_waiting'">
        <div style="display: flex; flex-direction: column; height: 100%;" x-init="setTimeout(() => generateLobbyQr(), 50)">
            <div class="pp-header" style="text-align: center; padding: 12px 0;">
                <h2 style="font-size: 2.4rem;">Waiting for Players</h2>
                <div class="pp-header-sub" x-text="'Mode: ' + mode + ' • Lobby: ' + lobbyCode"></div>
            </div>
            <div class="pp-lobby-grid" style="flex: 1; padding: 0 24px;">
                <!-- Left Side -->
                <div class="pp-lobby-side left">
                    <div class="side-label">Left</div>
                    <template x-for="p in lobbyLeftPlayers" :key="p.player_id">
                        <div class="pp-lobby-player-card">
                            <div class="name" x-text="p.player_name"></div>
                        </div>
                    </template>
                    <template x-for="i in leftEmptySlots" :key="'left-empty-' + i">
                        <div class="pp-lobby-empty-slot">Waiting...</div>
                    </template>
                </div>

                <!-- Center: QR + Code -->
                <div class="pp-lobby-center">
                    <div class="pp-lobby-qr" id="lobbyQrContainer"></div>
                    <div class="pp-lobby-code" x-text="lobbyCode"></div>
                    <div class="pp-lobby-url" x-text="lobbyJoinUrl"></div>
                    <button class="pp-start-btn"
                            :disabled="!lobbyReady || loading"
                            @click="startLobbyMatch()">
                        <span x-show="!loading">Start Match</span>
                        <span x-show="loading">Starting...</span>
                    </button>
                </div>

                <!-- Right Side -->
                <div class="pp-lobby-side right">
                    <div class="side-label">Right</div>
                    <template x-for="p in lobbyRightPlayers" :key="p.player_id">
                        <div class="pp-lobby-player-card">
                            <div class="name" x-text="p.player_name"></div>
                        </div>
                    </template>
                    <template x-for="i in rightEmptySlots" :key="'right-empty-' + i">
                        <div class="pp-lobby-empty-slot">Waiting...</div>
                    </template>
                </div>
            </div>
            <div class="pp-hint" style="text-align: center;">
                <span x-show="wsStatus === 'connected'" style="color: #22c55e;">&#9679; Live</span>
                <span x-show="wsStatus === 'connecting'" style="color: #eab308;">&#9679; Connecting...</span>
                <span x-show="wsStatus === 'error' || wsStatus === 'disconnected'" style="color: #ef4444;">&#9679; Disconnected</span>
                &nbsp;| Enter to start when ready | Backspace to cancel
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

    <!-- SCREEN: GAMEOVER -->
    <template x-if="screen === 'gameover'">
        <div class="pp-gameover">
            <div class="pp-winner-text" x-text="winnerName"></div>
            <div class="pp-final-score">
                <span style="color: #fb7185;" x-text="match.player_left_score"></span>
                <span style="color: rgba(255,255,255,0.3);"> - </span>
                <span style="color: #22d3ee;" x-text="match.player_right_score"></span>
            </div>
            <div class="pp-duration" x-text="match.duration_formatted ? 'Duration: ' + match.duration_formatted : ''"></div>

            <!-- 1v1 ELO changes -->
            <template x-if="mode === '1v1' && eloChanges">
                <div class="pp-elo-changes">
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_left?.name"></div>
                        <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.left?.before ?? '') + ' → ' + (eloChanges?.left?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_right?.name"></div>
                        <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.right?.before ?? '') + ' → ' + (eloChanges?.right?.after ?? '')"></div>
                    </div>
                </div>
            </template>

            <!-- 2v2 ELO changes -->
            <template x-if="mode === '2v2' && eloChanges">
                <div class="pp-elo-changes doubles">
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_left?.name"></div>
                        <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.left?.player1?.before ?? '') + ' → ' + (eloChanges?.left?.player1?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.team_left_player2?.name"></div>
                        <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.left?.player2?.before ?? '') + ' → ' + (eloChanges?.left?.player2?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_right?.name"></div>
                        <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.right?.player1?.before ?? '') + ' → ' + (eloChanges?.right?.player1?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.team_right_player2?.name"></div>
                        <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.right?.player2?.before ?? '') + ' → ' + (eloChanges?.right?.player2?.after ?? '')"></div>
                    </div>
                </div>
            </template>

            <div style="display: flex; gap: 16px; margin-top: 8px;">
                <button class="pp-start-btn" style="background: rgba(255,255,255,0.1); border: 2px solid rgba(255,255,255,0.2);"
                        @click="goToHome()">New Game</button>
                <button class="pp-start-btn" @click="rematch()">Rematch</button>
            </div>
            <div class="pp-hint">Enter for rematch | Backspace for new game</div>
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

        // Lobby state
        lobbyCode: '',
        hostToken: '',
        lobbyParticipants: [],
        lobbyJoinUrl: '',

        // Match state
        match: {},
        eloChanges: null,
        winnerName: '',

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
            this.startClock();
        },

        async setMode(newMode) {
            this.mode = newMode;
            await this.loadLeaderboard();
        },

        startClock() {
            this.updateClock();
            this.clockInterval = setInterval(() => this.updateClock(), 1000);
        },

        updateClock() {
            const now = new Date();
            this.clockDisplay = now.toLocaleTimeString('en-US', { hour12: false });
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

        async loadLeaderboard() {
            const res = await fetch(`${this.API}/leaderboard?mode=${this.mode}`);
            this.leaderboard = await res.json();
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

                this.screen = 'lobby_waiting';
                this.subscribeToLobby();
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
                    this.match = data;

                    if (data.is_complete && this.screen === 'playing') {
                        this.stopTimer();
                        this.eloChanges = data.elo_changes || null;
                        this.setWinnerName(data);
                        this.screen = 'gameover';
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
                this.eloChanges = null;

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
                this.eloChanges = null;
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
                    this.eloChanges = data.elo_changes || null;
                    this.setWinnerName(data);
                    this.screen = 'gameover';
                }
            } catch (err) {
                console.error('Error updating score:', err);
            }
            this.loading = false;
        },

        setWinnerName(data) {
            const leftWon = data.winner_id === data.player_left_id;
            if (this.mode === '2v2') {
                const p1 = leftWon ? (data.player_left?.name || '?') : (data.player_right?.name || '?');
                const p2 = leftWon ? (data.team_left_player2?.name || '?') : (data.team_right_player2?.name || '?');
                this.winnerName = p1 + ' & ' + p2 + ' Win!';
            } else {
                const name = leftWon ? (data.player_left?.name || '?') : (data.player_right?.name || '?');
                this.winnerName = name + ' Wins!';
            }
        },

        // --- GAMEOVER ---

        async rematch() {
            // Create a new lobby - phones need to re-scan
            await this.createLobby();
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
                        this.createLobby();
                    } else if (e.key === 'Backspace') {
                        e.preventDefault();
                        window.location.href = '/';
                    }
                    break;
                case 'lobby_waiting':
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.startLobbyMatch();
                    } else if (e.key === 'Backspace') {
                        e.preventDefault();
                        this.cancelLobby();
                    }
                    break;
                case 'playing':
                    this.handlePlayingNav(e);
                    break;
                case 'gameover':
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        this.rematch();
                    } else if (e.key === 'Backspace') {
                        e.preventDefault();
                        this.goToHome();
                    }
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
            this.eloChanges = null;
            this.lobbyCode = '';
            this.hostToken = '';
            this.lobbyParticipants = [];
            this.stopTimer();
            this.timerDisplay = '00:00';
            await this.loadLeaderboard();
            this.screen = 'home';
        },
    };
}
</script>
@endsection
