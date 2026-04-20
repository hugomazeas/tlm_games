<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ping Pong Live</title>
    <meta property="og:title" content="Ping Pong Live">
    <meta property="og:description" content="Watch the live ping pong match">
    <meta property="og:image" content="{{ url('/images/pingpong-live-thumb.png') }}">
    <meta property="og:type" content="video.other">
    <link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
        @keyframes servePulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.05); }
        }
    </style>
</head>
<body>

<div x-data="embedLive()" x-init="init()" style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;">

    <!-- No live match -->
    <template x-if="!matchActive">
        <div style="text-align:center;color:rgba(255,255,255,0.6);">
            <div style="font-size:3rem;margin-bottom:16px;">&#127955;</div>
            <h2 style="color:#fff;font-size:1.4rem;margin-bottom:8px;">No Live Match</h2>
            <p style="font-size:0.9rem;">No match is being played right now.</p>
            <p style="font-size:0.8rem;color:rgba(255,255,255,0.3);margin-top:12px;" x-text="'Checking again in ' + countdown + 's...'"></p>
        </div>
    </template>

    <!-- Match active -->
    <template x-if="matchActive">
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <!-- Video player -->
            <video x-show="hasVideo" id="embedPlayer" muted autoplay playsinline
                   style="width:100%;height:100%;object-fit:contain;background:#000;position:absolute;inset:0;transform:scaleX(-1);"></video>

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

            <!-- Overlay: Corner scores (on top of video) -->
            <template x-if="hasVideo && match">
                <div>
                    <div style="position:absolute;bottom:24px;left:24px;display:flex;flex-direction:column;align-items:center;">
                        <span style="color:#fb7185;font-size:2.5rem;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,0.8);" x-text="match?.player_left?.name || 'Left'"></span>
                        <span x-show="isServingLeft()" style="background:#fbbf24;color:#000;font-size:1.4rem;font-weight:800;padding:4px 20px;border-radius:999px;animation:servePulse 1.5s ease-in-out infinite;text-transform:uppercase;letter-spacing:0.05em;">SERVING</span>
                        <span style="color:white;font-size:10rem;font-weight:900;line-height:1;text-shadow:0 4px 16px rgba(0,0,0,0.8);" x-text="match?.player_left_score ?? 0"></span>
                    </div>
                    <div style="position:absolute;bottom:24px;right:24px;display:flex;flex-direction:column;align-items:center;">
                        <span style="color:#22d3ee;font-size:2.5rem;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,0.8);" x-text="match?.player_right?.name || 'Right'"></span>
                        <span x-show="isServingRight()" style="background:#fbbf24;color:#000;font-size:1.4rem;font-weight:800;padding:4px 20px;border-radius:999px;animation:servePulse 1.5s ease-in-out infinite;text-transform:uppercase;letter-spacing:0.05em;">SERVING</span>
                        <span style="color:white;font-size:10rem;font-weight:900;line-height:1;text-shadow:0 4px 16px rgba(0,0,0,0.8);" x-text="match?.player_right_score ?? 0"></span>
                    </div>
                </div>
            </template>
        </div>
    </template>

</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
<script>
function embedLive() {
    return {
        matchActive: false,
        hasVideo: false,
        hlsInstance: null,
        match: null,
        matchId: null,
        countdown: 10,
        countdownTimer: null,
        healthCheckTimer: null,
        hlsNetworkErrorCount: 0,
        echo: null,

        async init() {
            await this.checkForLiveMatch();
            if (!this.matchActive) {
                this.startPolling();
            }
        },

        async checkForLiveMatch() {
            try {
                const recRes = await fetch('/games/ping-pong/api/recordings/live');
                if (recRes.ok) {
                    const recData = await recRes.json();
                    if (recData.active && recData.hls_url) {
                        this.match = recData.match;
                        this.matchId = recData.match_id;
                        this.matchActive = true;
                        this.hasVideo = true;
                        this.hlsNetworkErrorCount = 0;
                        this.stopPolling();
                        this.$nextTick(() => this.initPlayer(recData.hls_url));
                        this.subscribeToScores();
                        this.startHealthCheck();
                        return;
                    }
                }

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
                        this.startHealthCheck();
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

        startHealthCheck() {
            this.stopHealthCheck();
            this.healthCheckTimer = setInterval(() => this.runHealthCheck(), 15000);
        },

        stopHealthCheck() {
            if (this.healthCheckTimer) {
                clearInterval(this.healthCheckTimer);
                this.healthCheckTimer = null;
            }
        },

        async runHealthCheck() {
            if (!this.matchId) return;
            try {
                const res = await fetch('/games/ping-pong/api/matches/' + this.matchId);
                if (res.ok) {
                    const data = await res.json();
                    if (data.is_complete) {
                        this.handleMatchEnd();
                        return;
                    }
                }
            } catch (e) {
                // Ignore transient fetch errors
            }
        },

        handleMatchEnd() {
            this.stopHealthCheck();
            this.matchActive = false;
            this.hasVideo = false;
            this.destroyPlayer();
            this.startPolling();
        },

        initPlayer(hlsUrl) {
            const video = document.getElementById('embedPlayer');
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
                        this.hlsNetworkErrorCount++;
                        if (this.hlsNetworkErrorCount >= 3) {
                            this.runHealthCheck();
                            this.hlsNetworkErrorCount = 0;
                        }
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

        isServingLeft() {
            if (!this.match?.current_server) return false;
            return this.match.current_server.id === this.match.player_left_id
                || this.match.current_server.id === this.match.team_left_player2_id;
        },

        isServingRight() {
            if (!this.match?.current_server) return false;
            return this.match.current_server.id === this.match.player_right_id
                || this.match.current_server.id === this.match.team_right_player2_id;
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
                            setTimeout(() => this.handleMatchEnd(), 3000);
                        }
                    }
                });
        },
    };
}
</script>

</body>
</html>
