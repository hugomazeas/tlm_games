@extends('layouts.app')

@section('title', 'Ping Pong - Games Hub')
@section('main-class', 'px-4 py-4')

@section('content')
<link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">

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

                <!-- ELO Distribution Chart -->
                <div x-show="leaderboard.length > 0" class="pp-elo-distribution" style="flex-shrink: 0; margin-bottom: 8px;">
                    <div style="position: relative; overflow: visible;">
                        <canvas id="eloDistCanvas" height="100" style="width: 100%;"></canvas>
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
            this.$nextTick(() => this.renderEloDistribution());
        },

        renderEloDistribution() {
            const canvas = document.getElementById('eloDistCanvas');
            if (!canvas || !this.leaderboard.length) return;

            const dpr = window.devicePixelRatio || 1;
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * dpr;
            canvas.height = rect.height * dpr;
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            const W = rect.width;
            const H = rect.height;

            const players = this.leaderboard.map(e => ({
                name: e.player_name, elo: e.elo_rating, id: e.player_id,
                streak: e.win_streak > 0 ? e.win_streak : -(e.losing_streak || 0)
            }));
            const elos = players.map(p => p.elo);
            const streaks = players.map(p => p.streak);
            const minElo = Math.min(...elos);
            const maxElo = Math.max(...elos);
            const eloRange = maxElo - minElo || 100;
            const maxStreak = Math.max(1, Math.max(...streaks));
            const minStreak = Math.min(-1, Math.min(...streaks));

            const padL = 50;  // left padding for Y-axis labels
            const padR = 36;
            const padTop = 14;
            const padBot = 24;
            const dotR = 14;
            const nameLabelOffsetY = dotR + 4;

            // Chart area
            const chartL = padL;
            const chartR = W - padR;
            const chartT = padTop;
            const chartB = H - padBot;
            const chartH = chartB - chartT;
            const chartW = chartR - chartL;

            // Y=0 line position (proportional split between positive and negative streak range)
            const totalStreakRange = maxStreak - minStreak;
            const zeroY = chartT + (maxStreak / totalStreakRange) * chartH;

            ctx.clearRect(0, 0, W, H);

            // --- Horizontal grid lines for streak values ---
            ctx.font = '500 20px "Outfit", system-ui, sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'right';
            const yTicks = [];
            for (let v = minStreak; v <= maxStreak; v++) {
                yTicks.push(v);
            }
            for (const v of yTicks) {
                const y = chartT + ((maxStreak - v) / totalStreakRange) * chartH;
                // Grid line
                ctx.strokeStyle = v === 0 ? 'rgba(59,130,246,0.2)' : 'rgba(148,163,184,0.06)';
                ctx.lineWidth = v === 0 ? 1 : 0.5;
                ctx.beginPath();
                ctx.moveTo(chartL, y);
                ctx.lineTo(chartR, y);
                ctx.stroke();
                // Label
                if (v === 0) continue; // skip 0 label to keep it clean
                const label = v > 0 ? `W${v}` : `L${Math.abs(v)}`;
                ctx.fillStyle = v > 0 ? 'rgba(52,211,153,0.45)' : 'rgba(248,113,113,0.45)';
                ctx.fillText(label, chartL - 8, y);
            }

            // --- X axis gradient line at Y=0 ---
            const axisGrad = ctx.createLinearGradient(chartL, 0, chartR, 0);
            axisGrad.addColorStop(0, 'rgba(59,130,246,0.0)');
            axisGrad.addColorStop(0.15, 'rgba(59,130,246,0.22)');
            axisGrad.addColorStop(0.5, 'rgba(59,130,246,0.3)');
            axisGrad.addColorStop(0.85, 'rgba(59,130,246,0.22)');
            axisGrad.addColorStop(1, 'rgba(59,130,246,0.0)');
            ctx.strokeStyle = axisGrad;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(chartL, zeroY);
            ctx.lineTo(chartR, zeroY);
            ctx.stroke();

            // --- X axis tick marks & ELO labels ---
            const nTicks = 5;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (let i = 0; i <= nTicks; i++) {
                const val = Math.round(minElo - eloRange * 0.1 + (eloRange * 1.2) * i / nTicks);
                const x = chartL + chartW * i / nTicks;
                ctx.fillStyle = 'rgba(148,163,184,0.35)';
                ctx.font = '500 20px "Outfit", system-ui, sans-serif';
                ctx.fillText(val, x, chartB + 2);
                ctx.strokeStyle = 'rgba(148,163,184,0.12)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, zeroY - 3);
                ctx.lineTo(x, zeroY + 3);
                ctx.stroke();
            }

            // --- Vertical line at ELO 1200 (starting point) ---
            const startElo = 1200;
            const startX = chartL + (startElo - (minElo - eloRange * 0.1)) / (eloRange * 1.2) * chartW;
            if (startX >= chartL && startX <= chartR) {
                const startLineGrad = ctx.createLinearGradient(0, chartT, 0, chartB);
                startLineGrad.addColorStop(0, 'rgba(148,163,184,0)');
                startLineGrad.addColorStop(0.2, 'rgba(148,163,184,0.18)');
                startLineGrad.addColorStop(0.5, 'rgba(148,163,184,0.25)');
                startLineGrad.addColorStop(0.8, 'rgba(148,163,184,0.18)');
                startLineGrad.addColorStop(1, 'rgba(148,163,184,0)');
                ctx.strokeStyle = startLineGrad;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.beginPath();
                ctx.moveTo(startX, chartT);
                ctx.lineTo(startX, chartB);
                ctx.stroke();
                ctx.setLineDash([]);
                // Label
                ctx.fillStyle = 'rgba(148,163,184,0.5)';
                ctx.font = '500 10px "Outfit", system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.fillText('1200', startX, chartT - 2);
            }

            // --- Position dots ---
            const xScale = (elo) => chartL + (elo - (minElo - eloRange * 0.1)) / (eloRange * 1.2) * chartW;
            const yScale = (streak) => chartT + ((maxStreak - streak) / totalStreakRange) * chartH;
            const sorted = [...players].sort((a, b) => a.elo - b.elo);
            const positions = sorted.map(p => ({ ...p, x: xScale(p.elo), y: yScale(p.streak) }));

            // Name labels: hide when bounding boxes would overlap (leaderboard order wins)
            const nameLabelFontSize = 22;
            ctx.font = `600 ${nameLabelFontSize}px "Outfit", system-ui, sans-serif`;
            const nameLabelPad = 3;
            const nameLabelLineH = nameLabelFontSize * 1.2;
            const nameLabelRect = (pos) => {
                const w = ctx.measureText(pos.name).width;
                const bottom = pos.y - nameLabelOffsetY;
                return {
                    left: pos.x - w / 2 - nameLabelPad,
                    right: pos.x + w / 2 + nameLabelPad,
                    top: bottom - nameLabelLineH - nameLabelPad,
                    bottom: bottom + nameLabelPad,
                };
            };
            const nameRectsOverlap = (a, b) =>
                !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom);
            const keptNameRects = [];
            const showNameLabel = new Set();
            for (const entry of this.leaderboard) {
                const pos = positions.find((pp) => pp.id === entry.player_id);
                if (!pos) continue;
                const r = nameLabelRect(pos);
                let clash = false;
                for (const k of keptNameRects) {
                    if (nameRectsOverlap(r, k)) {
                        clash = true;
                        break;
                    }
                }
                if (!clash) {
                    keptNameRects.push(r);
                    showNameLabel.add(pos.id);
                }
            }

            // --- Vertical drop lines from dot to X axis ---
            for (const p of positions) {
                if (p.streak === 0) continue;
                const grad = ctx.createLinearGradient(0, p.y, 0, zeroY);
                if (p.streak > 0) {
                    grad.addColorStop(0, 'rgba(52,211,153,0.25)');
                    grad.addColorStop(1, 'rgba(52,211,153,0.0)');
                } else {
                    grad.addColorStop(0, 'rgba(248,113,113,0.25)');
                    grad.addColorStop(1, 'rgba(248,113,113,0.0)');
                }
                ctx.strokeStyle = grad;
                ctx.lineWidth = 1;
                ctx.setLineDash([3, 3]);
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x, zeroY);
                ctx.stroke();
                ctx.setLineDash([]);
            }

            // --- Draw dots with glow ---
            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                const rank = players.findIndex(pl => pl.id === p.id);
                const t = players.length > 1 ? rank / (players.length - 1) : 0.5;
                const brightness = 0.5 + t * 0.5;

                // Pick color based on streak: green for win, red for lose, blue for neutral
                let baseR, baseG, baseB;
                if (p.streak > 0) {
                    baseR = 52; baseG = 211; baseB = 153;  // emerald
                } else if (p.streak < 0) {
                    baseR = 248; baseG = 113; baseB = 113; // red
                } else {
                    baseR = 59; baseG = 130; baseB = 246;  // blue
                }
                p.color = [baseR, baseG, baseB];

                // Outer glow
                const glow = ctx.createRadialGradient(p.x, p.y, dotR * 0.3, p.x, p.y, dotR * 2.2);
                glow.addColorStop(0, `rgba(${baseR},${baseG},${baseB},${0.25 * brightness})`);
                glow.addColorStop(1, `rgba(${baseR},${baseG},${baseB},0)`);
                ctx.fillStyle = glow;
                ctx.beginPath();
                ctx.arc(p.x, p.y, dotR * 2.2, 0, Math.PI * 2);
                ctx.fill();

                // Dot fill
                const dotGrad = ctx.createRadialGradient(p.x - dotR * 0.25, p.y - dotR * 0.25, 0, p.x, p.y, dotR);
                const alpha = 0.65 + brightness * 0.35;
                const lighter = [Math.min(255, baseR + 40), Math.min(255, baseG + 40), Math.min(255, baseB + 40)];
                dotGrad.addColorStop(0, `rgba(${lighter[0]},${lighter[1]},${lighter[2]},${alpha})`);
                dotGrad.addColorStop(1, `rgba(${baseR},${baseG},${baseB},${alpha})`);
                ctx.beginPath();
                ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
                ctx.fillStyle = dotGrad;
                ctx.fill();

                // Ring
                ctx.strokeStyle = `rgba(${lighter[0]},${lighter[1]},${lighter[2]},${0.25 + brightness * 0.3})`;
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, dotR, 0, Math.PI * 2);
                ctx.stroke();

                // Specular highlight
                ctx.beginPath();
                ctx.arc(p.x - dotR * 0.28, p.y - dotR * 0.28, dotR * 0.3, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(255,255,255,${0.12 + brightness * 0.13})`;
                ctx.fill();
            }

            // --- Draw name labels + clickable dot overlays ---
            const container = canvas.parentElement;
            container.querySelectorAll('.elo-name-label, .elo-dot-hit, .elo-dist-player').forEach(el => el.remove());
            const fontSize = nameLabelFontSize;
            const labelLineH = nameLabelFontSize * 1.2;
            ctx.font = `600 ${fontSize}px "Outfit", system-ui, sans-serif`;

            for (let i = 0; i < positions.length; i++) {
                const p = positions[i];
                const rank = players.findIndex(pl => pl.id === p.id);
                const t = players.length > 1 ? rank / (players.length - 1) : 0.5;
                const brightness = 0.5 + t * 0.5;
                const labelAlpha = 0.55 + brightness * 0.45;
                const url = '/games/ping-pong/players/' + p.id;
                const peekLabel = !showNameLabel.has(p.id);

                const [cR, cG, cB] = p.color;
                const dotSize = dotR * 2;
                const labelW = ctx.measureText(p.name).width;
                const stackW = Math.max(dotSize, labelW) + 12;
                const stackH = labelLineH + nameLabelOffsetY + dotSize / 2;
                const stackLeft = p.x - stackW / 2;
                const stackTop = p.y - nameLabelOffsetY - labelLineH;

                const stack = document.createElement('div');
                stack.className = 'elo-dist-player';
                stack.style.cssText = `position:absolute;left:${stackLeft}px;top:${stackTop}px;width:${stackW}px;height:${stackH}px;z-index:3;`;

                const labelColor = `rgba(191,219,254,${labelAlpha})`;
                const label = document.createElement('a');
                label.className = 'elo-name-label';
                label.href = url;
                label.textContent = p.name;
                const baseTf = 'translateX(-50%)';
                label.style.cssText = [
                    `position:absolute;left:50%;top:0;transform:${baseTf}`,
                    `font-family:"Outfit",system-ui,sans-serif;font-size:${fontSize}px;font-weight:600;color:${labelColor}`,
                    'white-space:nowrap;text-decoration:none;line-height:1;letter-spacing:-0.01em;cursor:pointer;z-index:2',
                    'transition:color 0.2s,transform 0.2s,opacity 0.15s',
                    peekLabel ? 'opacity:0;pointer-events:none' : 'opacity:1;pointer-events:auto',
                ].join(';') + ';';

                const dot = document.createElement('a');
                dot.className = 'elo-dot-hit';
                dot.href = url;
                dot.style.cssText = `position:absolute;left:50%;bottom:0;width:${dotSize}px;height:${dotSize}px;transform:translateX(-50%);border-radius:50%;cursor:pointer;z-index:3;background:rgba(${cR},${cG},${cB},0.85);border:1.5px solid rgba(${Math.min(255,cR+40)},${Math.min(255,cG+40)},${Math.min(255,cB+40)},0.4);transition:transform 0.2s,box-shadow 0.2s;`;

                stack.appendChild(label);
                stack.appendChild(dot);
                container.appendChild(stack);

                stack.addEventListener('mouseenter', () => {
                    stack.style.zIndex = '50';
                    dot.style.transform = 'translateX(-50%) scale(1.45)';
                    dot.style.boxShadow = `0 0 18px 6px rgba(${cR},${cG},${cB},0.55)`;
                    label.style.color = 'rgba(96,165,250,1)';
                    label.style.transform = `${baseTf} scale(${peekLabel ? 1.1 : 1.08})`;
                    if (peekLabel) {
                        label.style.opacity = '1';
                        label.style.pointerEvents = 'auto';
                    }
                });
                stack.addEventListener('mouseleave', () => {
                    stack.style.zIndex = '3';
                    dot.style.transform = 'translateX(-50%) scale(1)';
                    dot.style.boxShadow = 'none';
                    label.style.color = labelColor;
                    label.style.transform = `${baseTf} scale(1)`;
                    if (peekLabel) {
                        label.style.opacity = '0';
                        label.style.pointerEvents = 'none';
                    }
                });
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
                // Add new match if not already in the list
                if (!this.liveMatches.find(m => m.id === e.match.id)) {
                    this.liveMatches.unshift(e.match);
                }
            }).listen('.match.score-updated', (e) => {
                const data = e.match;
                const idx = this.liveMatches.findIndex(m => m.id === data.id);
                if (idx !== -1) {
                    if (data.is_complete) {
                        // Remove completed match after a short delay
                        this.liveMatches[idx] = { ...this.liveMatches[idx], ...data, _flash: true };
                        setTimeout(() => {
                            this.liveMatches = this.liveMatches.filter(m => m.id !== data.id);
                            // Refresh leaderboard when a match completes
                            if (this.screen === 'home') this.loadLeaderboard();
                        }, 3000);
                    } else {
                        // Flash effect on score update
                        this.liveMatches[idx] = { ...this.liveMatches[idx], ...data, _flash: true };
                        setTimeout(() => {
                            const i = this.liveMatches.findIndex(m => m.id === data.id);
                            if (i !== -1) {
                                this.liveMatches[i] = { ...this.liveMatches[i], _flash: false };
                            }
                        }, 600);
                    }
                }
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

                this.subscribeToLobby();
                // Wait for x-if to render the QR container
                this.$nextTick(() => setTimeout(() => this.generateLobbyQr(), 100));

                // On mobile, auto-join with cached player
                if (window.innerWidth < 768) {
                    this.autoJoinCachedPlayer();
                }
            } catch (err) {
                console.error('Error creating lobby:', err);
            }
            this.loading = false;
        },

        async autoJoinCachedPlayer() {
            try {
                const stored = localStorage.getItem('ping_pong_last_player');
                if (!stored) return;
                const last = JSON.parse(stored);
                if (!last?.player_id) return;

                const res = await fetch(`${this.API}/lobbies/${this.lobbyCode}/join`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf },
                    body: JSON.stringify({ player_id: last.player_id }),
                });
                if (!res.ok) return;
            } catch (e) {
                console.warn('Auto-join failed:', e);
            }
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
