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

    .pp-player-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
        gap: 16px;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
    }

    .pp-player-card {
        background: rgba(255,255,255,0.05);
        border: 3px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        aspect-ratio: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        cursor: pointer;
        transition: all 0.2s;
    }

    .pp-player-card:hover, .pp-player-card.focused {
        background: rgba(59, 130, 246, 0.15);
        border-color: #3b82f6;
        transform: translateY(-3px);
    }

    .pp-player-card .name {
        font-weight: 700;
        font-size: 1.6rem;
        margin-bottom: 8px;
    }

    .pp-player-card .elo {
        color: rgba(255,255,255,0.5);
        font-size: 1.15rem;
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

    .pp-sides-panel {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 28px;
        min-height: 0;
    }

    .pp-side-box {
        flex: 1;
        max-width: 450px;
        padding: 60px 40px;
        border-radius: 24px;
        text-align: center;
        border: 3px solid rgba(255,255,255,0.1);
    }

    .pp-side-box.left {
        background: rgba(244, 63, 94, 0.1);
        border-color: rgba(244, 63, 94, 0.3);
    }

    .pp-side-box.right {
        background: rgba(6, 182, 212, 0.1);
        border-color: rgba(6, 182, 212, 0.3);
    }

    .pp-side-box .label {
        font-size: 1.3rem;
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: rgba(255,255,255,0.5);
        margin-bottom: 12px;
    }

    .pp-side-box .player-name {
        font-size: 2.8rem;
        font-weight: 800;
    }

    .pp-side-box .player-name-sub {
        font-size: 2rem;
        font-weight: 700;
        margin-top: 4px;
        opacity: 0.7;
    }

    .pp-swap-btn {
        background: rgba(255,255,255,0.1);
        border: 2px solid rgba(255,255,255,0.2);
        border-radius: 50%;
        width: 76px;
        height: 76px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
        color: white;
        font-size: 2rem;
        flex-shrink: 0;
    }

    .pp-swap-btn:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: #3b82f6;
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
        font-size: 1.7rem;
        color: rgba(255,255,255,0.7);
    }

    .pp-clock {
        font-family: monospace;
        font-size: 1.3rem;
        color: rgba(255,255,255,0.4);
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

    .pp-score-panel .player-name-sub {
        font-size: 1.6rem;
        font-weight: 600;
        margin-bottom: 8px;
        color: rgba(255,255,255,0.5);
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

    /* QR Scan screen */
    .pp-qr-panel {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 120px;
        min-height: 0;
    }

    .pp-qr-box {
        text-align: center;
    }

    .pp-qr-box .qr-label {
        font-size: 1.8rem;
        font-weight: 700;
        margin-bottom: 16px;
    }

    .pp-qr-box .qr-canvas {
        background: white;
        border-radius: 16px;
        padding: 16px;
        display: inline-block;
    }

    .pp-qr-start-btn {
        margin-top: 24px;
        padding: 16px 48px;
        border-radius: 16px;
        font-size: 1.5rem;
        font-weight: 700;
        cursor: pointer;
        border: none;
        background: #3b82f6;
        color: white;
        transition: all 0.2s;
    }

    .pp-qr-start-btn:hover {
        background: #2563eb;
        transform: scale(1.05);
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

    <!-- SCREEN: LOBBY -->
    <template x-if="screen === 'lobby'">
        <div class="pp-grid" style="height: 100%;">
            <!-- Left: Player Grid -->
            <div class="pp-panel">
                <div class="pp-header" style="display: flex; align-items: center; justify-content: space-between;">
                    <div>
                        <h2>Select Player</h2>
                        <div class="pp-header-sub">Choose who's playing</div>
                    </div>
                    <div class="pp-mode-toggle">
                        <button class="pp-mode-btn" :class="{ active: mode === '1v1' }" @click="setMode('1v1')">1v1</button>
                        <button class="pp-mode-btn" :class="{ active: mode === '2v2' }" @click="setMode('2v2')">2v2</button>
                    </div>
                </div>
                <div class="pp-player-grid">
                    <template x-for="(player, index) in players" :key="player.id">
                        <div class="pp-player-card"
                             :class="{ 'focused': selectedIndex === index }"
                             @click="selectPlayer(player)">
                            <div class="name" x-text="player.name"></div>
                            <div class="elo" x-text="'ELO ' + player.elo_rating"></div>
                        </div>
                    </template>
                </div>
                <div class="pp-hint" style="margin-top: 12px;">Arrow keys to navigate, Enter to select, Backspace for home</div>
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

    <!-- SCREEN: PARTNER (2v2 only) -->
    <template x-if="screen === 'partner'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-header" style="text-align: center; padding: 16px 0;">
                <h2 style="font-size: 2.8rem;"><span x-text="player1.name" style="color: #3b82f6;"></span>'s Partner</h2>
                <div class="pp-header-sub">Pick a teammate</div>
            </div>
            <div class="pp-panel" style="flex: 1;">
                <div class="pp-player-grid">
                    <template x-for="(player, index) in availableForPartner" :key="player.id">
                        <div class="pp-player-card"
                             :class="{ 'focused': selectedIndex === index }"
                             @click="selectPartner(player)">
                            <div class="name" x-text="player.name"></div>
                            <div class="elo" x-text="'ELO ' + player.elo_rating"></div>
                        </div>
                    </template>
                </div>
                <div class="pp-hint" style="margin-top: 12px;">Arrow keys to navigate, Enter to select, Backspace to go back</div>
            </div>
        </div>
    </template>

    <!-- SCREEN: OPPONENT -->
    <template x-if="screen === 'opponent'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-header" style="text-align: center; padding: 16px 0;">
                <template x-if="mode === '1v1'">
                    <div>
                        <h2 style="font-size: 2.8rem;">Ready, <span x-text="player1.name" style="color: #3b82f6;"></span>?</h2>
                        <div class="pp-header-sub">Pick your opponent</div>
                    </div>
                </template>
                <template x-if="mode === '2v2'">
                    <div>
                        <h2 style="font-size: 2.8rem;">Pick Opponent 1</h2>
                        <div class="pp-header-sub">
                            Team: <span x-text="player1.name" style="color: #fb7185;"></span> &amp; <span x-text="player1Partner.name" style="color: #fb7185;"></span>
                        </div>
                    </div>
                </template>
            </div>
            <div class="pp-panel" style="flex: 1;">
                <div class="pp-player-grid">
                    <template x-for="(player, index) in opponents" :key="player.id">
                        <div class="pp-player-card"
                             :class="{ 'focused': selectedIndex === index }"
                             @click="selectOpponent(player)">
                            <div class="name" x-text="player.name"></div>
                            <div class="elo" x-text="'ELO ' + player.elo_rating"></div>
                        </div>
                    </template>
                </div>
                <div class="pp-hint" style="margin-top: 12px;">Arrow keys to navigate, Enter to select, Backspace to go back</div>
            </div>
        </div>
    </template>

    <!-- SCREEN: OPPONENT2 (2v2 only) -->
    <template x-if="screen === 'opponent2'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-header" style="text-align: center; padding: 16px 0;">
                <h2 style="font-size: 2.8rem;"><span x-text="player2.name" style="color: #22d3ee;"></span>'s Partner</h2>
                <div class="pp-header-sub">Pick the last player</div>
            </div>
            <div class="pp-panel" style="flex: 1;">
                <div class="pp-player-grid">
                    <template x-for="(player, index) in availableForOpponent2" :key="player.id">
                        <div class="pp-player-card"
                             :class="{ 'focused': selectedIndex === index }"
                             @click="selectOpponent2(player)">
                            <div class="name" x-text="player.name"></div>
                            <div class="elo" x-text="'ELO ' + player.elo_rating"></div>
                        </div>
                    </template>
                </div>
                <div class="pp-hint" style="margin-top: 12px;">Arrow keys to navigate, Enter to select, Backspace to go back</div>
            </div>
        </div>
    </template>

    <!-- SCREEN: SIDES -->
    <template x-if="screen === 'sides'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-header" style="text-align: center; padding: 16px 0;">
                <h2 style="font-size: 2.8rem;">Choose Sides</h2>
                <div class="pp-header-sub">Left/Right arrows to swap, Enter to start</div>
            </div>
            <div class="pp-sides-panel">
                <div class="pp-side-box left">
                    <div class="label">Left Side</div>
                    <div class="player-name" style="color: #fb7185;" x-text="leftPlayer.name"></div>
                    <template x-if="mode === '2v2'">
                        <div class="player-name-sub" style="color: #fb7185;" x-text="leftPlayer2.name"></div>
                    </template>
                </div>
                <button class="pp-swap-btn" @click="swapSides()">
                    &#8644;
                </button>
                <div class="pp-side-box right">
                    <div class="label">Right Side</div>
                    <div class="player-name" style="color: #22d3ee;" x-text="rightPlayer.name"></div>
                    <template x-if="mode === '2v2'">
                        <div class="player-name-sub" style="color: #22d3ee;" x-text="rightPlayer2.name"></div>
                    </template>
                </div>
            </div>
            <div class="pp-hint" style="text-align: center;">Backspace to go back</div>
        </div>
    </template>

    <!-- SCREEN: QR SCAN -->
    <template x-if="screen === 'qrscan'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-header" style="text-align: center; padding: 16px 0;">
                <h2 style="font-size: 2.8rem;">Scan to Score</h2>
                <div class="pp-header-sub">Use your phone as a remote</div>
            </div>
            <div class="pp-qr-panel">
                <div class="pp-qr-box">
                    <div class="qr-label" style="color: #fb7185;">
                        <template x-if="mode === '1v1'">
                            <span x-text="leftPlayer.name"></span>
                        </template>
                        <template x-if="mode === '2v2'">
                            <span x-text="leftPlayer.name + ' & ' + leftPlayer2.name"></span>
                        </template>
                    </div>
                    <div class="qr-canvas" x-ref="qrLeft"></div>
                </div>
                <div class="pp-qr-box">
                    <div class="qr-label" style="color: #22d3ee;">
                        <template x-if="mode === '1v1'">
                            <span x-text="rightPlayer.name"></span>
                        </template>
                        <template x-if="mode === '2v2'">
                            <span x-text="rightPlayer.name + ' & ' + rightPlayer2.name"></span>
                        </template>
                    </div>
                    <div class="qr-canvas" x-ref="qrRight"></div>
                </div>
            </div>
            <div style="text-align: center;">
                <button class="pp-qr-start-btn" @click="beginPlaying()">Start Match</button>
            </div>
            <div class="pp-hint" style="text-align: center;">Enter to start | Backspace to go back</div>
        </div>
    </template>

    <!-- SCREEN: PLAYING -->
    <template x-if="screen === 'playing'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-game-topbar">
                <span class="pp-badge" x-text="mode === '2v2' ? '2v2 - First to 11' : 'First to 11'"></span>
                <span class="pp-timer" x-text="timerDisplay"></span>
                <span class="pp-clock" x-text="clockDisplay"></span>
            </div>
            <div class="pp-game-area">
                <!-- Left Team -->
                <div class="pp-score-panel left" :class="{ 'serving-active': isServing('left') }">
                    <template x-if="mode === '1v1'">
                        <div class="player-name" x-text="match.player_left?.name || leftPlayer.name"></div>
                    </template>
                    <template x-if="mode === '2v2'">
                        <div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.player_left_id || leftPlayer?.id) }"
                                 x-text="match.player_left?.name || leftPlayer.name"></div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.team_left_player2_id || leftPlayer2?.id) }"
                                 x-text="match.team_left_player2?.name || leftPlayer2?.name"></div>
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
                        <div class="player-name" x-text="match.player_right?.name || rightPlayer.name"></div>
                    </template>
                    <template x-if="mode === '2v2'">
                        <div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.player_right_id || rightPlayer?.id) }"
                                 x-text="match.player_right?.name || rightPlayer.name"></div>
                            <div class="player-name-doubles"
                                 :class="{ 'serving-player': isPlayerServing(match.team_right_player2_id || rightPlayer2?.id) }"
                                 x-text="match.team_right_player2?.name || rightPlayer2?.name"></div>
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
                        <div class="name" x-text="match.player_left?.name || leftPlayer.name"></div>
                        <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.left?.before ?? '') + ' &rarr; ' + (eloChanges?.left?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_right?.name || rightPlayer.name"></div>
                        <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.right?.before ?? '') + ' &rarr; ' + (eloChanges?.right?.after ?? '')"></div>
                    </div>
                </div>
            </template>

            <!-- 2v2 ELO changes -->
            <template x-if="mode === '2v2' && eloChanges">
                <div class="pp-elo-changes doubles">
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_left?.name || leftPlayer.name"></div>
                        <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.left?.player1?.before ?? '') + ' &rarr; ' + (eloChanges?.left?.player1?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.team_left_player2?.name || leftPlayer2?.name"></div>
                        <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.left?.player2?.before ?? '') + ' &rarr; ' + (eloChanges?.left?.player2?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.player_right?.name || rightPlayer.name"></div>
                        <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.right?.player1?.before ?? '') + ' &rarr; ' + (eloChanges?.right?.player1?.after ?? '')"></div>
                    </div>
                    <div class="pp-elo-card">
                        <div class="name" x-text="match.team_right_player2?.name || rightPlayer2?.name"></div>
                        <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                             x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                        <div class="detail" x-text="(eloChanges?.right?.player2?.before ?? '') + ' &rarr; ' + (eloChanges?.right?.player2?.after ?? '')"></div>
                    </div>
                </div>
            </template>

            <div class="pp-hint">Enter for rematch | Backspace for lobby</div>
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
<script>
function pingPong() {
    return {
        API: '/games/ping-pong/api',
        csrf: document.querySelector('meta[name="csrf-token"]').content,

        screen: 'lobby',
        mode: '1v1',
        players: [],
        leaderboard: [],
        opponents: [],
        availableForPartner: [],
        availableForOpponent2: [],
        selectedIndex: 0,

        player1: null,
        player1Partner: null,
        player2: null,
        player2Partner: null,
        leftPlayer: null,
        leftPlayer2: null,
        rightPlayer: null,
        rightPlayer2: null,

        match: {},
        eloChanges: null,
        winnerName: '',

        timerDisplay: '00:00',
        clockDisplay: '',
        timerInterval: null,
        clockInterval: null,
        matchStartTime: null,

        showAbandonConfirm: false,
        loading: false,
        pollInterval: null,

        async init() {
            await this.loadPlayers();
            await this.loadLeaderboard();
            this.startClock();
        },

        async setMode(newMode) {
            this.mode = newMode;
            this.selectedIndex = 0;
            await this.loadPlayers();
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

        async loadPlayers() {
            const res = await fetch(`${this.API}/players?mode=${this.mode}`);
            this.players = await res.json();
        },

        async loadLeaderboard() {
            const res = await fetch(`${this.API}/leaderboard?mode=${this.mode}`);
            this.leaderboard = await res.json();
        },

        gridColumns() {
            const container = document.querySelector('.pp-player-grid');
            if (!container) return 4;
            const style = window.getComputedStyle(container);
            return style.gridTemplateColumns.split(' ').length;
        },

        selectedPlayers() {
            const ids = [];
            if (this.player1) ids.push(this.player1.id);
            if (this.player1Partner) ids.push(this.player1Partner.id);
            if (this.player2) ids.push(this.player2.id);
            if (this.player2Partner) ids.push(this.player2Partner.id);
            return ids;
        },

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
                case 'lobby':
                case 'opponent':
                case 'partner':
                case 'opponent2':
                    this.handleGridNav(e);
                    break;
                case 'sides':
                    this.handleSidesNav(e);
                    break;
                case 'qrscan':
                    this.handleQrScanNav(e);
                    break;
                case 'playing':
                    this.handlePlayingNav(e);
                    break;
                case 'gameover':
                    this.handleGameoverNav(e);
                    break;
            }
        },

        currentGridList() {
            switch (this.screen) {
                case 'lobby': return this.players;
                case 'partner': return this.availableForPartner;
                case 'opponent': return this.opponents;
                case 'opponent2': return this.availableForOpponent2;
                default: return [];
            }
        },

        handleGridNav(e) {
            const list = this.currentGridList();
            if (list.length === 0) return;

            const cols = this.gridColumns();

            switch (e.key) {
                case 'ArrowRight':
                    e.preventDefault();
                    this.selectedIndex = Math.min(this.selectedIndex + 1, list.length - 1);
                    break;
                case 'ArrowLeft':
                    e.preventDefault();
                    this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
                    break;
                case 'ArrowDown':
                    e.preventDefault();
                    this.selectedIndex = Math.min(this.selectedIndex + cols, list.length - 1);
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.selectedIndex = Math.max(this.selectedIndex - cols, 0);
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.handleGridSelect(list[this.selectedIndex]);
                    break;
                case 'Backspace':
                    e.preventDefault();
                    this.handleGridBack();
                    break;
            }
        },

        handleGridSelect(player) {
            switch (this.screen) {
                case 'lobby': this.selectPlayer(player); break;
                case 'partner': this.selectPartner(player); break;
                case 'opponent': this.selectOpponent(player); break;
                case 'opponent2': this.selectOpponent2(player); break;
            }
        },

        handleGridBack() {
            switch (this.screen) {
                case 'lobby':
                    window.location.href = '/';
                    break;
                case 'partner':
                    this.player1 = null;
                    this.screen = 'lobby';
                    this.selectedIndex = 0;
                    break;
                case 'opponent':
                    if (this.mode === '2v2') {
                        this.player1Partner = null;
                        this.screen = 'partner';
                    } else {
                        this.player1 = null;
                        this.screen = 'lobby';
                    }
                    this.selectedIndex = 0;
                    break;
                case 'opponent2':
                    this.player2 = null;
                    this.screen = 'opponent';
                    this.selectedIndex = 0;
                    break;
            }
        },

        handleSidesNav(e) {
            switch (e.key) {
                case 'ArrowLeft':
                case 'ArrowRight':
                    e.preventDefault();
                    this.swapSides();
                    break;
                case 'Enter':
                    e.preventDefault();
                    this.startMatch();
                    break;
                case 'Backspace':
                    e.preventDefault();
                    if (this.mode === '2v2') {
                        this.screen = 'opponent2';
                    } else {
                        this.screen = 'opponent';
                    }
                    this.selectedIndex = 0;
                    break;
            }
        },

        handleQrScanNav(e) {
            switch (e.key) {
                case 'Enter':
                    e.preventDefault();
                    this.beginPlaying();
                    break;
                case 'Backspace':
                    e.preventDefault();
                    this.screen = 'sides';
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

        handleGameoverNav(e) {
            switch (e.key) {
                case 'Enter':
                    e.preventDefault();
                    this.rematch();
                    break;
                case 'Backspace':
                    e.preventDefault();
                    this.goToLobby();
                    break;
            }
        },

        selectPlayer(player) {
            this.player1 = player;
            this.selectedIndex = 0;

            if (this.mode === '2v2') {
                this.availableForPartner = this.players.filter(p => p.id !== player.id);
                this.screen = 'partner';
            } else {
                this.opponents = this.players.filter(p => p.id !== player.id);
                this.screen = 'opponent';
            }
        },

        selectPartner(player) {
            this.player1Partner = player;
            const taken = [this.player1.id, player.id];
            this.opponents = this.players.filter(p => !taken.includes(p.id));
            this.selectedIndex = 0;
            this.screen = 'opponent';
        },

        selectOpponent(player) {
            this.player2 = player;
            this.selectedIndex = 0;

            if (this.mode === '2v2') {
                const taken = [this.player1.id, this.player1Partner.id, player.id];
                this.availableForOpponent2 = this.players.filter(p => !taken.includes(p.id));
                this.screen = 'opponent2';
            } else {
                this.leftPlayer = { ...this.player1 };
                this.rightPlayer = { ...this.player2 };
                this.screen = 'sides';
            }
        },

        selectOpponent2(player) {
            this.player2Partner = player;
            this.leftPlayer = { ...this.player1 };
            this.leftPlayer2 = { ...this.player1Partner };
            this.rightPlayer = { ...this.player2 };
            this.rightPlayer2 = { ...this.player2Partner };
            this.selectedIndex = 0;
            this.screen = 'sides';
        },

        swapSides() {
            const tmpL = this.leftPlayer;
            const tmpL2 = this.leftPlayer2;
            this.leftPlayer = this.rightPlayer;
            this.leftPlayer2 = this.rightPlayer2;
            this.rightPlayer = tmpL;
            this.rightPlayer2 = tmpL2;
        },

        async startMatch() {
            this.loading = true;
            try {
                const body = {
                    mode: this.mode,
                    player_left_id: this.leftPlayer.id,
                    player_right_id: this.rightPlayer.id,
                    first_server_id: this.leftPlayer.id,
                };

                if (this.mode === '2v2') {
                    body.team_left_player2_id = this.leftPlayer2.id;
                    body.team_right_player2_id = this.rightPlayer2.id;
                }

                const res = await fetch(`${this.API}/matches`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify(body),
                });
                this.match = await res.json();
                this.eloChanges = null;
                this.screen = 'qrscan';
                this.$nextTick(() => this.generateQrCodes());
            } catch (err) {
                console.error('Error starting match:', err);
            }
            this.loading = false;
        },

        generateQrCodes() {
            const origin = @json(config('games.remote_url'));
            const baseUrl = `${origin}/games/ping-pong/remote/${this.match.id}`;

            const leftEl = this.$refs.qrLeft;
            const rightEl = this.$refs.qrRight;
            if (leftEl) {
                leftEl.innerHTML = '';
                new QRCode(leftEl, { text: `${baseUrl}/left`, width: 200, height: 200 });
            }
            if (rightEl) {
                rightEl.innerHTML = '';
                new QRCode(rightEl, { text: `${baseUrl}/right`, width: 200, height: 200 });
            }
        },

        beginPlaying() {
            this.startTimer();
            this.startPolling();
            this.screen = 'playing';
        },

        startPolling() {
            this.stopPolling();
            this.pollInterval = setInterval(() => this.pollMatch(), 1500);
        },

        stopPolling() {
            if (this.pollInterval) {
                clearInterval(this.pollInterval);
                this.pollInterval = null;
            }
        },

        async pollMatch() {
            if (!this.match.id) return;
            try {
                const res = await fetch(`${this.API}/matches/${this.match.id}`);
                const data = await res.json();

                if (data.player_left_score !== this.match.player_left_score ||
                    data.player_right_score !== this.match.player_right_score ||
                    data.is_complete !== this.match.is_complete) {
                    this.match = data;

                    if (data.is_complete && this.screen === 'playing') {
                        this.stopTimer();
                        this.stopPolling();
                        this.eloChanges = data.elo_changes || null;
                        this.setWinnerName(data);
                        this.screen = 'gameover';
                    }
                }
            } catch (err) {
                // Silently ignore polling errors
            }
        },

        isServing(side) {
            if (!this.match || !this.match.current_server_id) return false;
            if (side === 'left') {
                return this.match.current_server_id === (this.match.player_left_id || this.leftPlayer?.id)
                    || this.match.current_server_id === (this.match.team_left_player2_id || this.leftPlayer2?.id);
            }
            return this.match.current_server_id === (this.match.player_right_id || this.rightPlayer?.id)
                || this.match.current_server_id === (this.match.team_right_player2_id || this.rightPlayer2?.id);
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
                    this.stopPolling();
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
                const p1 = leftWon
                    ? (data.player_left?.name || this.leftPlayer.name)
                    : (data.player_right?.name || this.rightPlayer.name);
                const p2 = leftWon
                    ? (data.team_left_player2?.name || this.leftPlayer2?.name)
                    : (data.team_right_player2?.name || this.rightPlayer2?.name);
                this.winnerName = p1 + ' & ' + p2 + ' Win!';
            } else {
                const name = leftWon
                    ? (data.player_left?.name || this.leftPlayer.name)
                    : (data.player_right?.name || this.rightPlayer.name);
                this.winnerName = name + ' Wins!';
            }
        },

        async rematch() {
            if (this.loading || !this.match.id) return;
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/matches/${this.match.id}/rematch`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                });
                this.match = await res.json();
                this.eloChanges = null;
                this.screen = 'qrscan';
                this.$nextTick(() => this.generateQrCodes());
            } catch (err) {
                console.error('Error creating rematch:', err);
            }
            this.loading = false;
        },

        abandonMatch() {
            this.showAbandonConfirm = false;
            this.stopTimer();
            this.stopPolling();
            this.goToLobby();
        },

        async goToLobby() {
            this.stopPolling();
            this.match = {};
            this.eloChanges = null;
            this.player1 = null;
            this.player1Partner = null;
            this.player2 = null;
            this.player2Partner = null;
            this.leftPlayer = null;
            this.leftPlayer2 = null;
            this.rightPlayer = null;
            this.rightPlayer2 = null;
            this.selectedIndex = 0;
            this.stopTimer();
            this.timerDisplay = '00:00';
            await this.loadPlayers();
            await this.loadLeaderboard();
            this.screen = 'lobby';
        },
    };
}
</script>
@endsection
