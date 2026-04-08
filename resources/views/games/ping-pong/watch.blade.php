@extends('layouts.app')

@section('title', 'Watch Live - Ping Pong')
@section('main-class', 'p-0')

@section('content')
<link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">
<style>
@keyframes watch-serve-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.4; }
}
</style>

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
                    <div style="display:flex;align-items:center;gap:48px;">
                        <div style="text-align:center;">
                            <div :style="'color:#fb7185;font-size:1.6rem;font-weight:700;' + (match?.current_server_id && (match.current_server_id === match.player_left_id || match.current_server_id === match.team_left_player2_id) ? 'animation:watch-serve-pulse 1.5s ease-in-out infinite;' : '')" x-text="match?.player_left?.name || 'Left'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_left_player2">
                                <div style="color:#fb7185;font-size:1rem;font-weight:500;opacity:0.7;" x-text="match.team_left_player2.name"></div>
                            </template>
                            <div style="color:white;font-size:8rem;font-weight:900;line-height:1.1;" x-text="match?.player_left_score ?? 0"></div>
                            <div x-show="match?.current_server_id && (match.current_server_id === match.player_left_id || match.current_server_id === match.team_left_player2_id)"
                                 style="margin-top:8px;color:#facc15;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;justify-content:center;gap:5px;animation:watch-serve-pulse 1.5s ease-in-out infinite;">
                                <span style="display:inline-block;width:7px;height:7px;background:#facc15;border-radius:50%;box-shadow:0 0 6px 2px rgba(250,204,21,0.5);"></span>
                                Serving
                            </div>
                        </div>
                        <div style="color:rgba(255,255,255,0.15);font-size:4rem;font-weight:300;">-</div>
                        <div style="text-align:center;">
                            <div :style="'color:#22d3ee;font-size:1.6rem;font-weight:700;' + (match?.current_server_id && (match.current_server_id === match.player_right_id || match.current_server_id === match.team_right_player2_id) ? 'animation:watch-serve-pulse 1.5s ease-in-out infinite;' : '')" x-text="match?.player_right?.name || 'Right'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_right_player2">
                                <div style="color:#22d3ee;font-size:1rem;font-weight:500;opacity:0.7;" x-text="match.team_right_player2.name"></div>
                            </template>
                            <div style="color:white;font-size:8rem;font-weight:900;line-height:1.1;" x-text="match?.player_right_score ?? 0"></div>
                            <div x-show="match?.current_server_id && (match.current_server_id === match.player_right_id || match.current_server_id === match.team_right_player2_id)"
                                 style="margin-top:8px;color:#facc15;font-size:0.85rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;justify-content:center;gap:5px;animation:watch-serve-pulse 1.5s ease-in-out infinite;">
                                <span style="display:inline-block;width:7px;height:7px;background:#facc15;border-radius:50%;box-shadow:0 0 6px 2px rgba(250,204,21,0.5);"></span>
                                Serving
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- Overlay: LIVE badge + viewer count -->
            <div style="position:absolute;top:16px;left:16px;display:flex;align-items:center;gap:10px;">
                <div style="display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;">
                    <span class="pp-rec-dot"></span>
                    <span style="color:white;font-size:0.9rem;font-weight:700;">LIVE</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;">
                    <span style="font-size:0.85rem;">👁</span>
                    <span style="color:white;font-size:0.9rem;font-weight:600;" x-text="viewerCount"></span>
                </div>
            </div>

            <!-- Overlay: Current time + game timer (top center) -->
            <div style="position:absolute;top:24px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;">
                <div style="color:white;font-size:4rem;font-weight:800;letter-spacing:2px;text-shadow:0 2px 8px rgba(0,0,0,0.6);" x-text="currentTime"></div>
                <div x-show="gameTimer" style="color:rgba(255,255,255,0.6);font-size:1.5rem;font-weight:600;letter-spacing:1px;" x-text="gameTimer"></div>
            </div>

            <!-- Overlay: Left score (corner) -->
            <template x-if="hasVideo && match">
                <div style="position:absolute;bottom:32px;left:32px;background:rgba(0,0,0,0.8);padding:24px 40px;border-radius:20px;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:200px;">
                    <div :style="'color:#fb7185;font-size:3rem;font-weight:700;white-space:nowrap;' + (match?.current_server_id && (match.current_server_id === match.player_left_id || match.current_server_id === match.team_left_player2_id) ? 'animation:watch-serve-pulse 1.5s ease-in-out infinite;' : '')" x-text="match?.player_left?.name || 'Left'"></div>
                    <template x-if="match?.mode === '2v2' && match?.team_left_player2">
                        <div style="color:#fb7185;font-size:1.6rem;font-weight:500;opacity:0.7;" x-text="match.team_left_player2.name"></div>
                    </template>
                    <div style="color:white;font-size:10rem;font-weight:900;line-height:1;" x-text="match?.player_left_score ?? 0"></div>
                    <div x-show="match?.current_server_id && (match.current_server_id === match.player_left_id || match.current_server_id === match.team_left_player2_id)"
                         style="color:#facc15;font-size:2rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:8px;animation:watch-serve-pulse 1.5s ease-in-out infinite;">
                        <span style="display:inline-block;width:10px;height:10px;background:#facc15;border-radius:50%;box-shadow:0 0 10px 4px rgba(250,204,21,0.5);"></span>
                        Serving
                    </div>
                </div>
            </template>

            <!-- Overlay: Right score (corner) -->
            <template x-if="hasVideo && match">
                <div style="position:absolute;bottom:32px;right:32px;background:rgba(0,0,0,0.8);padding:24px 40px;border-radius:20px;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:200px;">
                    <div :style="'color:#22d3ee;font-size:3rem;font-weight:700;white-space:nowrap;' + (match?.current_server_id && (match.current_server_id === match.player_right_id || match.current_server_id === match.team_right_player2_id) ? 'animation:watch-serve-pulse 1.5s ease-in-out infinite;' : '')" x-text="match?.player_right?.name || 'Right'"></div>
                    <template x-if="match?.mode === '2v2' && match?.team_right_player2">
                        <div style="color:#22d3ee;font-size:1.6rem;font-weight:500;opacity:0.7;" x-text="match.team_right_player2.name"></div>
                    </template>
                    <div style="color:white;font-size:10rem;font-weight:900;line-height:1;" x-text="match?.player_right_score ?? 0"></div>
                    <div x-show="match?.current_server_id && (match.current_server_id === match.player_right_id || match.current_server_id === match.team_right_player2_id)"
                         style="color:#facc15;font-size:2rem;font-weight:700;text-transform:uppercase;letter-spacing:1px;display:flex;align-items:center;gap:8px;animation:watch-serve-pulse 1.5s ease-in-out infinite;">
                        <span style="display:inline-block;width:10px;height:10px;background:#facc15;border-radius:50%;box-shadow:0 0 10px 4px rgba(250,204,21,0.5);"></span>
                        Serving
                    </div>
                </div>
            </template>

            <!-- Back link -->
            <a href="/games/ping-pong" style="position:absolute;top:16px;right:16px;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;color:white;text-decoration:none;font-size:0.8rem;">
                &larr; Back
            </a>
        </div>
    </template>

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
        currentTime: '',
        gameTimer: '',
        clockTimer: null,
        viewerCount: 0,
        presenceChannel: null,

        async init() {
            this.updateClock();
            this.clockTimer = setInterval(() => this.updateClock(), 1000);
            await this.checkForLiveMatch();
            if (!this.matchActive) {
                this.startPolling();
            }
        },

        updateClock() {
            const now = new Date();
            this.currentTime = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            if (this.match?.started_at) {
                const start = new Date(this.match.started_at);
                const diff = Math.max(0, Math.floor((now - start) / 1000));
                const m = Math.floor(diff / 60);
                const s = diff % 60;
                this.gameTimer = String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
            }
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

        subscribeToScores() {
            if (!this.matchId) return;

            const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
            this.echo = new Echo({
                broadcaster: 'pusher',
                key: 'games-hub-key',
                wsHost: window.location.hostname,
                wsPort: window.location.port || 80,
                forceTLS: false,
                disableStats: true,
                enabledTransports: ['ws', 'wss'],
                cluster: 'mt1',
                authEndpoint: '/broadcasting/auth',
                auth: {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                    },
                },
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
                                if (this.presenceChannel) {
                                    this.echo.leave('ping-pong.watch.' + this.matchId);
                                    this.presenceChannel = null;
                                }
                                this.viewerCount = 0;
                                this.startPolling();
                            }, 3000);
                        }
                    }
                });

            // Join presence channel to track viewers
            this.presenceChannel = this.echo.join('ping-pong.watch.' + this.matchId)
                .here((users) => { this.viewerCount = users.length; })
                .joining(() => { this.viewerCount++; })
                .leaving(() => { this.viewerCount = Math.max(0, this.viewerCount - 1); });
        },
    };
}
</script>
@endsection
