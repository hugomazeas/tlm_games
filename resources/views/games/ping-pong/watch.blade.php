@extends('layouts.app')

@section('title', 'Watch Live - Ping Pong')
@section('main-class', 'p-0')

@section('content')
<link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">

<div x-data="watchLive()" x-init="init()" style="width:100%;height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0a;">

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
            <!-- Video player (only when HLS stream available) -->
            <template x-if="hasVideo">
                <video id="watchPlayer" muted autoplay playsinline
                       style="width:100%;height:100%;object-fit:contain;background:#000;position:absolute;inset:0;"></video>
            </template>

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

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                this.hlsInstance = new Hls({
                    liveSyncDuration: 3,
                    liveMaxLatencyDuration: 6,
                    enableWorker: true,
                });
                this.hlsInstance.loadSource(hlsUrl);
                this.hlsInstance.attachMedia(video);
                this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play());
                this.hlsInstance.on(Hls.Events.ERROR, (event, data) => {
                    if (data.fatal) {
                        this.hasVideo = false;
                        this.destroyPlayer();
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = hlsUrl;
                video.play();
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
