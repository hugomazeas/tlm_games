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
                                 style="position:relative;"
                                 @click="window.location.href='/games/ping-pong/watch'">
                                <template x-if="lm.recording && lm.recording.status === 'recording'">
                                    <div style="position:absolute;top:4px;right:4px;display:flex;align-items:center;gap:3px;background:rgba(239,68,68,0.2);padding:2px 6px;border-radius:4px;">
                                        <span class="pp-rec-dot" style="width:6px;height:6px;"></span>
                                        <span style="font-size:0.65rem;color:#ef4444;font-weight:600;">REC</span>
                                    </div>
                                </template>
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

                <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 8px; flex-shrink: 0;">
                    <h2 style="font-size: 1.2rem; font-weight: 700; color: #fff; margin: 0; white-space: nowrap;" x-text="mode === '2v2' ? '2v2 ELO Leaderboard' : 'ELO Leaderboard'"></h2>
                    <div class="pp-lb-tabs-row" style="margin-bottom: 0; flex: 1; justify-content: center;">
                        <button type="button" class="pp-lb-tab" :class="{ active: leaderboardTab === 'all' }" @click="leaderboardTab = 'all'">
                            All players
                        </button>
                        <template x-for="block in officeLeaderboards" :key="'tab-' + block.id">
                            <button type="button" class="pp-lb-tab" :class="{ active: leaderboardTab === block.id }" @click="leaderboardTab = block.id" x-text="block.name"></button>
                        </template>
                    </div>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <a x-show="leaderboard.length > 0" href="/games/ping-pong/stats" style="padding: 6px 16px; background: #3b82f6; border-radius: 8px; color: #fff; font-size: 0.85rem; font-weight: 700; text-decoration: none; white-space: nowrap; transition: all 0.2s;" onmouseenter="this.style.background='#2563eb'" onmouseleave="this.style.background='#3b82f6'">Stats &rarr;</a>
                        <a href="/games/ping-pong/recordings" style="padding: 6px 16px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: rgba(255,255,255,0.7); font-size: 0.85rem; font-weight: 600; text-decoration: none; white-space: nowrap; transition: all 0.2s;" onmouseenter="this.style.background='rgba(255,255,255,0.12)';this.style.color='#fff'" onmouseleave="this.style.background='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.7)'">Recordings</a>
                    </div>
                </div>
                <div class="pp-lb-tab-content">
                    <div x-show="leaderboardTab === 'all'">
                        <table class="pp-leaderboard-table" x-show="leaderboard.length > 0">
                            <thead>
                                <tr>
                                    <th>#</th>
                                    <th>Player</th>
                                    <th>ELO</th>
                                    <th style="text-align: center;">W-L</th>
                                    <th style="text-align: center;">Last 10</th>
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
                                        <td style="white-space: nowrap;">
                                            <div style="display: flex; flex-direction: column; align-items: center;">
                                                <span><span style="color: #22c55e; font-size: 15px; font-weight: 600;" x-text="entry.wins"></span><span style="color: rgba(255,255,255,0.3); font-size: 15px;">-</span><span style="color: #ef4444; font-size: 15px; font-weight: 600;" x-text="entry.losses"></span></span>
                                                <span style="font-size: 13px; color: rgba(255,255,255,0.4);" x-text="entry.win_rate + '%'"></span>
                                            </div>
                                        </td>
                                        <td style="text-align: center;">
                                            <template x-if="entry.last_10 && entry.last_10.length > 0">
                                                <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                                    <span style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8);" x-text="entry.last_10.filter(r => r === 'W').length + '-' + entry.last_10.filter(r => r === 'L').length"></span>
                                                    <div style="display: flex; align-items: center; gap: 3px;">
                                                        <template x-for="(r, j) in entry.last_10" :key="j">
                                                            <span :style="'width: 7px; height: 7px; border-radius: 50%; background:' + (r === 'W' ? '#22c55e' : '#ef4444')"></span>
                                                        </template>
                                                        <span style="font-size: 9px; color: rgba(255,255,255,0.25); margin-left: 1px;">&#9656;</span>
                                                    </div>
                                                </div>
                                            </template>
                                            <template x-if="!entry.last_10 || entry.last_10.length === 0">
                                                <span style="color: rgba(255,255,255,0.3);">-</span>
                                            </template>
                                        </td>
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
                            <table class="pp-leaderboard-table" x-show="block.entries.length > 0">
                                <thead>
                                    <tr>
                                        <th>#</th>
                                        <th>Player</th>
                                        <th>ELO</th>
                                        <th style="text-align: center;">W-L</th>
                                        <th style="text-align: center;">Last 10</th>
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
                                            <td style="white-space: nowrap;">
                                                <div style="display: flex; flex-direction: column; align-items: center;">
                                                    <span><span style="color: #22c55e; font-size: 15px; font-weight: 600;" x-text="entry.wins"></span><span style="color: rgba(255,255,255,0.3); font-size: 15px;">-</span><span style="color: #ef4444; font-size: 15px; font-weight: 600;" x-text="entry.losses"></span></span>
                                                    <span style="font-size: 13px; color: rgba(255,255,255,0.4);" x-text="entry.win_rate + '%'"></span>
                                                </div>
                                            </td>
                                            <td style="text-align: center;">
                                                <template x-if="entry.last_10 && entry.last_10.length > 0">
                                                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px;">
                                                        <span style="font-size: 14px; font-weight: 600; color: rgba(255,255,255,0.8);" x-text="entry.last_10.filter(r => r === 'W').length + '-' + entry.last_10.filter(r => r === 'L').length"></span>
                                                        <div style="display: flex; align-items: center; gap: 3px;">
                                                            <template x-for="(r, j) in entry.last_10" :key="j">
                                                                <span :style="'width: 7px; height: 7px; border-radius: 50%; background:' + (r === 'W' ? '#22c55e' : '#ef4444')"></span>
                                                            </template>
                                                            <span style="font-size: 9px; color: rgba(255,255,255,0.25); margin-left: 1px;">&#9656;</span>
                                                        </div>
                                                    </div>
                                                </template>
                                                <template x-if="!entry.last_10 || entry.last_10.length === 0">
                                                    <span style="color: rgba(255,255,255,0.3);">-</span>
                                                </template>
                                            </td>
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
            <div x-show="hlsInstance"
                 style="display:flex;justify-content:center;margin:0 0 8px;">
                <div style="position:relative;width:100%;max-width:480px;aspect-ratio:16/9;background:#000;border-radius:8px;overflow:hidden;">
                    <video id="livePlayer" muted autoplay playsinline
                           style="width:100%;height:100%;object-fit:cover;"></video>
                    <div style="position:absolute;top:8px;left:8px;display:flex;align-items:center;gap:4px;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px;">
                        <span class="pp-rec-dot"></span>
                        <span style="color:white;font-size:0.75rem;font-weight:600;">LIVE</span>
                    </div>
                    <a :href="'/games/ping-pong/watch'" target="_blank"
                       style="position:absolute;top:8px;right:8px;background:rgba(0,0,0,0.6);padding:2px 8px;border-radius:4px;color:white;font-size:0.7rem;text-decoration:none;">
                        Full Screen &rarr;
                    </a>
                </div>
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
<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
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
        hlsInstance: null,

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

        // Must match PingPongApiController::LIVE_MATCH_MAX_IDLE_SECONDS (120s)
        pruneStaleLiveMatches() {
            const staleMs = 120_000;
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

        ensureEcho() {
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
            }
            return this.echo;
        },

        subscribeLive() {
            this.ensureEcho();

            if (this.liveChannel) {
                this.echo.leave(this.liveChannel.name);
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
            // Leave old lobby/match channels but keep live channel
            if (this.echo && this.lobbyChannel) {
                this.echo.leave(this.lobbyChannel.name);
                this.lobbyChannel = null;
            }
            if (this.echo && this.matchChannel) {
                this.echo.leave(this.matchChannel.name);
                this.matchChannel = null;
            }

            this.ensureEcho();

            this.lobbyChannel = this.echo.channel('ping-pong.lobby.' + this.lobbyCode);
            this.lobbyChannel.listen('.lobby.updated', (e) => {
                console.log('[WS] Lobby updated:', e);
                this.lobbyParticipants = e.lobby.participants || [];
            }).listen('.lobby.match-started', (e) => {
                console.log('[WS] Match started:', e);
                this.loadAndStartMatch(e.matchId);
            });

            // Re-subscribe to live channel if it was lost
            if (!this.liveChannel) {
                this.subscribeLive();
            }
        },

        subscribeToMatch(matchId) {
            this.ensureEcho();

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

                // Redirect desktop to livestream page
                window.location.href = '/games/ping-pong/watch';
            } catch (err) {
                console.error('Error starting match:', err);
            }
            this.loading = false;
        },

        async loadAndStartMatch(matchId) {
            // Redirect desktop to livestream page
            window.location.href = '/games/ping-pong/watch';
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
            this.destroyLivePlayer();
            this.goToHome();
        },

        async goToHome() {
            this.destroyLivePlayer();
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

        initLivePlayer(hlsUrl) {
            this.$nextTick(() => {
                const video = document.getElementById('livePlayer');
                if (!video) return;
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    this.hlsInstance = new Hls({
                        liveSyncDuration: 3,
                        liveMaxLatencyDuration: 6,
                        enableWorker: true,
                    });
                    this.hlsInstance.loadSource(hlsUrl);
                    this.hlsInstance.attachMedia(video);
                    this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play());
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = hlsUrl;
                    video.play();
                }
            });
        },

        destroyLivePlayer() {
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },
    };
}
</script>
@endsection
