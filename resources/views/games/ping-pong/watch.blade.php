@extends('layouts.app')

@section('title', 'Watch Live - Ping Pong')
@section('main-class', 'p-0')

@section('content')
<link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">

<div x-data="watchLive()" x-init="init()" style="width:100%;height:100vh;max-height:calc(100dvh - 60px);display:flex;align-items:center;justify-content:center;background:#0a0a0a;">

    <!-- No live match -->
    <template x-if="!matchActive">
        <div style="text-align:center;color:rgba(255,255,255,0.6);">
            <div style="font-size:3rem;margin-bottom:16px;">&#127955;</div>
            <h2 style="color:#fff;font-size:1.4rem;margin-bottom:8px;">No Live Match</h2>
            <p style="font-size:0.9rem;margin-bottom:20px;">No match is being played right now.</p>
            <p style="font-size:0.8rem;color:rgba(255,255,255,0.3);" x-text="'Checking again in ' + countdown + 's...'"></p>
            <a href="/games/ping-pong" style="display:inline-block;margin-top:16px;padding:8px 20px;background:#3b82f6;border-radius:8px;color:#fff;text-decoration:none;font-size:0.85rem;font-weight:600;">
                &larr; Back to Ping Pong
            </a>
        </div>
    </template>

    <!-- Match active (with or without video) -->
    <template x-if="matchActive">
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <!-- Video player (always in DOM, hidden when no video) -->
            <video x-show="hasVideo" id="watchPlayer" muted autoplay playsinline
                   style="width:100%;height:100%;object-fit:contain;background:#000;position:absolute;inset:0;"></video>

            <!-- Score-only mode (no video) -->
            <template x-if="!hasVideo">
                <div style="display:flex;flex-direction:column;align-items:center;gap:24px;">
                    <div style="display:flex;align-items:center;gap:32px;">
                        <div style="text-align:center;">
                            <div style="color:#fb7185;font-size:1.6rem;font-weight:700;" x-text="match?.player_left?.name || 'Left'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_left_player2">
                                <div style="color:#fb7185;font-size:1rem;font-weight:500;opacity:0.7;" x-text="match.team_left_player2.name"></div>
                            </template>
                        </div>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="color:white;font-size:5rem;font-weight:800;" x-text="match?.player_left_score ?? 0"></span>
                            <span style="color:rgba(255,255,255,0.2);font-size:3rem;">-</span>
                            <span style="color:white;font-size:5rem;font-weight:800;" x-text="match?.player_right_score ?? 0"></span>
                        </div>
                        <div style="text-align:center;">
                            <div style="color:#22d3ee;font-size:1.6rem;font-weight:700;" x-text="match?.player_right?.name || 'Right'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_right_player2">
                                <div style="color:#22d3ee;font-size:1rem;font-weight:500;opacity:0.7;" x-text="match.team_right_player2.name"></div>
                            </template>
                        </div>
                    </div>
                    <div style="color:rgba(255,255,255,0.3);font-size:0.9rem;" x-text="match?.mode?.toUpperCase()"></div>
                </div>
            </template>

            <!-- Overlay: LIVE badge -->
            <div style="position:absolute;top:16px;left:16px;display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;">
                <span class="pp-rec-dot"></span>
                <span style="color:white;font-size:0.9rem;font-weight:700;">LIVE</span>
            </div>

            <!-- Overlay: Score (only on top of video) -->
            <template x-if="hasVideo && match">
                <div style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.8);padding:8px 24px;border-radius:12px;display:flex;align-items:center;gap:16px;">
                    <span style="color:#fb7185;font-size:1.1rem;font-weight:700;" x-text="match?.player_left?.name || 'Left'"></span>
                    <span style="color:white;font-size:2rem;font-weight:800;letter-spacing:2px;">
                        <span x-text="match?.player_left_score ?? 0"></span>
                        <span style="color:rgba(255,255,255,0.3);margin:0 4px;">-</span>
                        <span x-text="match?.player_right_score ?? 0"></span>
                    </span>
                    <span style="color:#22d3ee;font-size:1.1rem;font-weight:700;" x-text="match?.player_right?.name || 'Right'"></span>
                </div>
            </template>

            <!-- Back link -->
            <a href="/games/ping-pong" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;color:white;text-decoration:none;font-size:0.8rem;">
                &larr; Back
            </a>
        </div>
    </template>

    @if(config('app.debug'))
    <!-- Dev controls -->
    <div style="position:fixed;bottom:16px;right:16px;background:rgba(0,0,0,0.85);border:1px solid rgba(255,255,255,0.15);border-radius:10px;padding:12px;display:flex;flex-direction:column;gap:8px;z-index:100;min-width:220px;max-height:80vh;overflow-y:auto;">
        <div style="color:rgba(255,255,255,0.4);font-size:0.65rem;text-transform:uppercase;letter-spacing:1px;">Dev Controls</div>
        <div style="display:flex;align-items:center;gap:6px;">
            <span style="width:8px;height:8px;border-radius:50%;" :style="hasVideo ? 'background:#22c55e' : 'background:#ef4444'"></span>
            <span style="color:rgba(255,255,255,0.6);font-size:0.75rem;" x-text="hasVideo ? 'Stream active' : (matchActive ? 'Score only' : 'No stream')"></span>
        </div>
        <div style="display:flex;gap:4px;flex-wrap:wrap;">
            <template x-if="matchActive && !hasVideo">
                <button @click="devStartStream()" style="padding:5px 10px;background:#22c55e;border:none;border-radius:6px;color:white;font-size:0.7rem;font-weight:600;cursor:pointer;">
                    Start Stream
                </button>
            </template>
            <template x-if="hasVideo">
                <button @click="devStopStream()" style="padding:5px 10px;background:#ef4444;border:none;border-radius:6px;color:white;font-size:0.7rem;font-weight:600;cursor:pointer;">
                    Stop Stream
                </button>
            </template>
            <template x-if="!matchActive">
                <button @click="devQuickMatch()" style="padding:5px 10px;background:#3b82f6;border:none;border-radius:6px;color:white;font-size:0.7rem;font-weight:600;cursor:pointer;">
                    Quick Match + Stream
                </button>
            </template>
            <button @click="devLoadRecordings()" style="padding:5px 10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:6px;color:white;font-size:0.7rem;font-weight:600;cursor:pointer;">
                Refresh
            </button>
        </div>
        <span x-show="devStatus" style="color:#eab308;font-size:0.7rem;" x-text="devStatus"></span>

        <!-- Recordings list -->
        <div x-show="devRecordings.length > 0" style="border-top:1px solid rgba(255,255,255,0.1);padding-top:8px;margin-top:4px;">
            <div style="color:rgba(255,255,255,0.4);font-size:0.6rem;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px;">
                Recordings (<span x-text="devRecordings.length"></span>)
            </div>
            <div style="display:flex;flex-direction:column;gap:4px;">
                <template x-for="rec in devRecordings" :key="rec.id">
                    <div style="display:flex;align-items:center;gap:6px;padding:4px 6px;background:rgba(255,255,255,0.05);border-radius:4px;">
                        <span style="width:6px;height:6px;border-radius:50%;flex-shrink:0;"
                              :style="rec.status === 'recording' ? 'background:#22c55e' : 'background:#6b7280'"></span>
                        <div style="flex:1;min-width:0;">
                            <div style="color:rgba(255,255,255,0.8);font-size:0.7rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"
                                 x-text="(rec.player_left || '?') + ' vs ' + (rec.player_right || '?')"></div>
                            <div style="color:rgba(255,255,255,0.35);font-size:0.6rem;"
                                 x-text="rec.status + (rec.file_size ? ' · ' + (rec.file_size / 1048576).toFixed(1) + ' MB' : '') + (rec.duration_seconds ? ' · ' + Math.floor(rec.duration_seconds / 60) + ':' + String(rec.duration_seconds % 60).padStart(2, '0') : '')">
                            </div>
                        </div>
                        <template x-if="rec.status === 'completed' && rec.video_url">
                            <a :href="rec.video_url" target="_blank" style="color:#3b82f6;font-size:0.65rem;font-weight:600;text-decoration:none;flex-shrink:0;">Play</a>
                        </template>
                    </div>
                </template>
            </div>
        </div>
    </div>
    @endif
</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
<script>
function watchLive() {
    return {
        matchActive: false,
        hasVideo: false,
        hlsInstance: null,
        match: null,
        matchId: null,
        countdown: 10,
        countdownTimer: null,
        echo: null,

        async init() {
            await this.checkForLiveMatch();
            if (!this.matchActive) {
                this.startPolling();
            }
            this.devLoadRecordings();
        },

        async checkForLiveMatch() {
            try {
                // First check for a recording with video stream
                const recRes = await fetch('/games/ping-pong/api/recordings/live');
                if (recRes.ok) {
                    const recData = await recRes.json();
                    if (recData.active && recData.hls_url) {
                        this.match = recData.match;
                        this.matchId = recData.match_id;
                        this.matchActive = true;
                        this.hasVideo = true;
                        this.stopPolling();
                        this.$nextTick(() => this.initPlayer(recData.hls_url));
                        this.subscribeToScores();
                        return;
                    }
                }

                // Fall back to any live match (score-only mode)
                const liveRes = await fetch('/games/ping-pong/api/matches/live');
                if (liveRes.ok) {
                    const matches = await liveRes.json();
                    if (matches.length > 0) {
                        this.match = matches[0];
                        this.matchId = matches[0].id;
                        this.matchActive = true;
                        this.hasVideo = false;
                        this.stopPolling();
                        this.subscribeToScores();
                        return;
                    }
                }
            } catch (e) {
                console.error('Error checking for live match:', e);
            }
        },

        startPolling() {
            this.countdown = 10;
            this.countdownTimer = setInterval(() => {
                this.countdown--;
                if (this.countdown <= 0) {
                    this.countdown = 10;
                    this.checkForLiveMatch();
                }
            }, 1000);
        },

        stopPolling() {
            if (this.countdownTimer) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
        },

        initPlayer(hlsUrl) {
            const video = document.getElementById('watchPlayer');
            if (!video) return;

            this.destroyPlayer();

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDuration: 3,
                    liveMaxLatencyDuration: 6,
                    enableWorker: true,
                });
                this.hlsInstance = hls;
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        this.hasVideo = false;
                        this.destroyPlayer();
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = hlsUrl;
                video.play().catch(() => {});
            }
        },

        destroyPlayer() {
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },

        devStatus: '',
        devRecordings: [],
        csrf: document.querySelector('meta[name="csrf-token"]')?.content,

        async devLoadRecordings() {
            try {
                const res = await fetch('/games/ping-pong/api/recordings');
                if (res.ok) this.devRecordings = await res.json();
            } catch (e) { console.error('Failed to load recordings:', e); }
        },

        async devStartStream() {
            if (!this.matchId) return;
            this.devStatus = 'Starting...';
            try {
                const res = await fetch('/games/ping-pong/api/recordings/start', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf, 'Accept': 'application/json' },
                    body: JSON.stringify({ match_id: this.matchId }),
                });
                const data = await res.json();
                if (!res.ok) { this.devStatus = data.error; return; }
                this.devStatus = 'Started! Loading...';
                await new Promise(r => setTimeout(r, 3000));
                await this.checkForLiveMatch();
                this.devLoadRecordings();
                this.devStatus = '';
            } catch (e) { this.devStatus = e.message; }
        },

        async devStopStream() {
            this.devStatus = 'Stopping...';
            try {
                const res = await fetch('/games/ping-pong/api/recordings/stop', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf, 'Accept': 'application/json' },
                });
                const data = await res.json();
                if (!res.ok) { this.devStatus = data.error; return; }
                this.hasVideo = false;
                this.destroyPlayer();
                this.devStatus = 'Stopped: ' + data.status;
                this.devLoadRecordings();
                setTimeout(() => this.devStatus = '', 3000);
            } catch (e) { this.devStatus = e.message; }
        },

        async devQuickMatch() {
            this.devStatus = 'Creating match...';
            try {
                const playersRes = await fetch('/games/ping-pong/api/players');
                const players = await playersRes.json();
                if (players.length < 2) { this.devStatus = 'Need 2+ players'; return; }
                const res = await fetch('/games/ping-pong/api/matches', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': this.csrf, 'Accept': 'application/json' },
                    body: JSON.stringify({
                        player_left_id: players[0].id, player_right_id: players[1].id,
                        mode: '1v1', first_server_id: players[0].id, record: true,
                    }),
                });
                const data = await res.json();
                if (!res.ok) { this.devStatus = data.message || data.error; return; }
                this.devStatus = 'Match #' + data.id + ' created, loading...';
                await new Promise(r => setTimeout(r, 3000));
                await this.checkForLiveMatch();
                this.devLoadRecordings();
                this.devStatus = '';
            } catch (e) { this.devStatus = e.message; }
        },

        subscribeToScores() {
            if (!this.matchId) return;

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

            this.echo.channel('ping-pong.match.' + this.matchId)
                .listen('.match.score-updated', (e) => {
                    if (e.match) {
                        this.match = { ...this.match, ...e.match };
                        if (e.match.is_complete) {
                            setTimeout(() => {
                                this.matchActive = false;
                                this.hasVideo = false;
                                this.destroyPlayer();
                                this.startPolling();
                            }, 3000);
                        }
                    }
                });
        },
    };
}
</script>
@endsection
