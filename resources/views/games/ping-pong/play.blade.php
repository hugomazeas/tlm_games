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
    }

    .pp-score-panel.right {
        background: rgba(6, 182, 212, 0.08);
        border-color: rgba(6, 182, 212, 0.2);
    }

    .pp-score-panel .player-name {
        font-size: 2.5rem;
        font-weight: 700;
        margin-bottom: 12px;
        color: rgba(255,255,255,0.9);
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

    <!-- SCREEN: LOBBY -->
    <template x-if="screen === 'lobby'">
        <div class="pp-grid" style="height: 100%;">
            <!-- Left: Player Grid -->
            <div class="pp-panel">
                <div class="pp-header">
                    <h2>Select Player</h2>
                    <div class="pp-header-sub">Choose who's playing</div>
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
                    <h2>ELO Leaderboard</h2>
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

    <!-- SCREEN: OPPONENT -->
    <template x-if="screen === 'opponent'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-header" style="text-align: center; padding: 16px 0;">
                <h2 style="font-size: 2.8rem;">Ready, <span x-text="player1.name" style="color: #3b82f6;"></span>?</h2>
                <div class="pp-header-sub">Pick your opponent</div>
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
                </div>
                <button class="pp-swap-btn" @click="swapSides()">
                    &#8644;
                </button>
                <div class="pp-side-box right">
                    <div class="label">Right Side</div>
                    <div class="player-name" style="color: #22d3ee;" x-text="rightPlayer.name"></div>
                </div>
            </div>
            <div class="pp-hint" style="text-align: center;">Backspace to go back</div>
        </div>
    </template>

    <!-- SCREEN: PLAYING -->
    <template x-if="screen === 'playing'">
        <div style="display: flex; flex-direction: column; height: 100%;">
            <div class="pp-game-topbar">
                <span class="pp-badge">First to 11</span>
                <span class="pp-timer" x-text="timerDisplay"></span>
                <span class="pp-clock" x-text="clockDisplay"></span>
            </div>
            <div class="pp-game-area">
                <!-- Left Player -->
                <div class="pp-score-panel left">
                    <div class="player-name" x-text="match.player_left?.name || leftPlayer.name"></div>
                    <div class="pp-serve-indicator" :class="{ 'serving': isServing('left') }">
                        Serving
                    </div>
                    <div class="pp-score-value" x-text="match.player_left_score ?? 0"></div>
                    <div class="pp-score-buttons">
                        <button class="pp-score-btn minus" @click="updateScore('left', 'decrement')">-</button>
                        <button class="pp-score-btn plus" @click="updateScore('left', 'increment')">+</button>
                    </div>
                </div>
                <!-- Right Player -->
                <div class="pp-score-panel right">
                    <div class="player-name" x-text="match.player_right?.name || rightPlayer.name"></div>
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
            <div class="pp-winner-text" x-text="winnerName + ' Wins!'"></div>
            <div class="pp-final-score">
                <span style="color: #fb7185;" x-text="match.player_left_score"></span>
                <span style="color: rgba(255,255,255,0.3);"> - </span>
                <span style="color: #22d3ee;" x-text="match.player_right_score"></span>
            </div>
            <div class="pp-duration" x-text="match.duration_formatted ? 'Duration: ' + match.duration_formatted : ''"></div>

            <div class="pp-elo-changes" x-show="eloChanges">
                <div class="pp-elo-card">
                    <div class="name" x-text="match.player_left?.name || leftPlayer.name"></div>
                    <div class="change" :class="eloChanges?.left?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                         x-text="(eloChanges?.left?.change >= 0 ? '+' : '') + (eloChanges?.left?.change ?? 0)"></div>
                    <div class="detail" x-text="(eloChanges?.left?.before ?? '') + ' → ' + (eloChanges?.left?.after ?? '')"></div>
                </div>
                <div class="pp-elo-card">
                    <div class="name" x-text="match.player_right?.name || rightPlayer.name"></div>
                    <div class="change" :class="eloChanges?.right?.change >= 0 ? 'pp-elo-positive' : 'pp-elo-negative'"
                         x-text="(eloChanges?.right?.change >= 0 ? '+' : '') + (eloChanges?.right?.change ?? 0)"></div>
                    <div class="detail" x-text="(eloChanges?.right?.before ?? '') + ' → ' + (eloChanges?.right?.after ?? '')"></div>
                </div>
            </div>

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

<script>
function pingPong() {
    return {
        API: '/games/ping-pong/api',
        csrf: document.querySelector('meta[name="csrf-token"]').content,

        screen: 'lobby',
        players: [],
        leaderboard: [],
        opponents: [],
        selectedIndex: 0,

        player1: null,
        player2: null,
        leftPlayer: null,
        rightPlayer: null,

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

        async init() {
            await this.loadPlayers();
            await this.loadLeaderboard();
            this.startClock();
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
            const res = await fetch(`${this.API}/players`);
            this.players = await res.json();
        },

        async loadLeaderboard() {
            const res = await fetch(`${this.API}/leaderboard`);
            this.leaderboard = await res.json();
        },

        gridColumns() {
            const container = document.querySelector('.pp-player-grid');
            if (!container) return 4;
            const style = window.getComputedStyle(container);
            return style.gridTemplateColumns.split(' ').length;
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
                    this.handleGridNav(e);
                    break;
                case 'sides':
                    this.handleSidesNav(e);
                    break;
                case 'playing':
                    this.handlePlayingNav(e);
                    break;
                case 'gameover':
                    this.handleGameoverNav(e);
                    break;
            }
        },

        handleGridNav(e) {
            const list = this.screen === 'lobby' ? this.players : this.opponents;
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
                    if (this.screen === 'lobby') {
                        this.selectPlayer(list[this.selectedIndex]);
                    } else {
                        this.selectOpponent(list[this.selectedIndex]);
                    }
                    break;
                case 'Backspace':
                    e.preventDefault();
                    if (this.screen === 'opponent') {
                        this.screen = 'lobby';
                        this.selectedIndex = 0;
                    } else {
                        window.location.href = '/';
                    }
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
                    this.screen = 'opponent';
                    this.selectedIndex = 0;
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
            this.opponents = this.players.filter(p => p.id !== player.id);
            this.selectedIndex = 0;
            this.screen = 'opponent';
        },

        selectOpponent(player) {
            this.player2 = player;
            this.leftPlayer = { ...this.player1 };
            this.rightPlayer = { ...this.player2 };
            this.screen = 'sides';
        },

        swapSides() {
            const tmp = this.leftPlayer;
            this.leftPlayer = this.rightPlayer;
            this.rightPlayer = tmp;
        },

        async startMatch() {
            this.loading = true;
            try {
                const res = await fetch(`${this.API}/matches`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({
                        player_left_id: this.leftPlayer.id,
                        player_right_id: this.rightPlayer.id,
                        first_server_id: this.leftPlayer.id,
                    }),
                });
                this.match = await res.json();
                this.eloChanges = null;
                this.startTimer();
                this.screen = 'playing';
            } catch (err) {
                console.error('Error starting match:', err);
            }
            this.loading = false;
        },

        isServing(side) {
            if (!this.match || !this.match.current_server_id) return false;
            if (side === 'left') return this.match.current_server_id === (this.match.player_left_id || this.leftPlayer.id);
            return this.match.current_server_id === (this.match.player_right_id || this.rightPlayer.id);
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
                    this.winnerName = data.winner_id === data.player_left_id
                        ? (data.player_left?.name || this.leftPlayer.name)
                        : (data.player_right?.name || this.rightPlayer.name);
                    this.screen = 'gameover';
                }
            } catch (err) {
                console.error('Error updating score:', err);
            }
            this.loading = false;
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
                this.startTimer();
                this.screen = 'playing';
            } catch (err) {
                console.error('Error creating rematch:', err);
            }
            this.loading = false;
        },

        abandonMatch() {
            this.showAbandonConfirm = false;
            this.stopTimer();
            this.goToLobby();
        },

        async goToLobby() {
            this.match = {};
            this.eloChanges = null;
            this.player1 = null;
            this.player2 = null;
            this.leftPlayer = null;
            this.rightPlayer = null;
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
