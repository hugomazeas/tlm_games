@extends('layouts.app')

@section('title', 'Watch Live - Ping Pong')
@section('main-class', 'p-0')

@section('content')
@include('games.ping-pong.partials.chrome')

<div class="pph-stage w-full h-screen max-h-[calc(100dvh-60px)] flex items-center justify-center !rounded-none !p-0" x-data="watchLive()" x-init="init()">

    {{-- No live match --}}
    <template x-if="!matchActive">
        <div class="text-center text-[#f5ecd6]/70">
            <div class="text-5xl mb-4">🏓</div>
            <h2 class="pph-display text-[clamp(28px,3vw,40px)] tracking-[0.04em] uppercase text-[#f5ecd6] mb-2">No live match</h2>
            <p class="pph-mono text-[12px] tracking-[0.14em] uppercase text-[#f5ecd6]/45 mb-5">No match is being played right now.</p>
            <p class="pph-mono text-[10px] tracking-[0.2em] uppercase text-[#f5ecd6]/30" x-text="'Re-checking in ' + countdown + 's…'"></p>
            <a href="/games/ping-pong"
               class="inline-block mt-5 px-5 py-2 rounded-full bg-[#f5ecd6] text-[#06081b] no-underline pph-display text-base tracking-[0.04em] uppercase hover:bg-white transition">
                ← Back to Ping Pong
            </a>
        </div>
    </template>

    {{-- Match active --}}
    <template x-if="matchActive">
        <div class="relative w-full h-full flex items-center justify-center">
            {{-- Video --}}
            <video x-show="hasVideo" id="watchPlayer" muted autoplay playsinline
                   class="w-full h-full object-contain bg-black absolute inset-0"></video>

            {{-- Score-only mode --}}
            <template x-if="!hasVideo">
                <div class="flex flex-col items-center gap-6">
                    <div class="flex items-center gap-8">
                        <div class="text-center">
                            <div class="text-[#ff5a4a] text-[1.6rem] font-bold pph-glow-red" x-text="match?.player_left?.name || 'Left'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_left_player2">
                                <div class="text-[#ff5a4a]/70 text-base font-medium" x-text="match.team_left_player2.name"></div>
                            </template>
                        </div>
                        <div class="flex items-center gap-3 pph-mono tabular-nums">
                            <span class="text-white text-[5rem] font-extrabold" x-text="match?.player_left_score ?? 0"></span>
                            <span class="text-white/20 text-5xl">·</span>
                            <span class="text-white text-[5rem] font-extrabold" x-text="match?.player_right_score ?? 0"></span>
                        </div>
                        <div class="text-center">
                            <div class="text-[#3ec8ff] text-[1.6rem] font-bold pph-glow-blue" x-text="match?.player_right?.name || 'Right'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_right_player2">
                                <div class="text-[#3ec8ff]/70 text-base font-medium" x-text="match.team_right_player2.name"></div>
                            </template>
                        </div>
                    </div>
                    <div class="pph-mono text-[11px] tracking-[0.3em] uppercase text-[#f5ecd6]/30" x-text="match?.mode?.toUpperCase()"></div>
                </div>
            </template>

            {{-- LIVE badge --}}
            <div class="absolute top-4 left-4 flex items-center gap-1.5 bg-black/70 px-3 py-1 rounded-md backdrop-blur-sm">
                <span class="pph-flicker w-2 h-2 rounded-full bg-[#ff5a4a]"></span>
                <span class="pph-mono text-white text-[11px] font-bold tracking-[0.18em]">LIVE</span>
            </div>

            {{-- Corner scores over video --}}
            <template x-if="hasVideo && match">
                <div>
                    <div class="absolute bottom-6 left-6 flex flex-col items-center">
                        <span class="text-[#ff5a4a] text-[2.5rem] font-bold pph-glow-red [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]" x-text="match?.player_left?.name || 'Left'"></span>
                        <span x-show="isServingLeft()" class="pph-mono text-[#ffd166] text-[10px] tracking-[0.22em] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">SERVING</span>
                        <span class="text-white text-[10rem] font-black leading-none pph-mono [text-shadow:0_4px_16px_rgba(0,0,0,0.8)]" x-text="match?.player_left_score ?? 0"></span>
                    </div>
                    <div class="absolute bottom-6 right-6 flex flex-col items-center">
                        <span class="text-[#3ec8ff] text-[2.5rem] font-bold pph-glow-blue [text-shadow:0_2px_8px_rgba(0,0,0,0.8)]" x-text="match?.player_right?.name || 'Right'"></span>
                        <span x-show="isServingRight()" class="pph-mono text-[#ffd166] text-[10px] tracking-[0.22em] font-bold [text-shadow:0_1px_4px_rgba(0,0,0,0.8)]">SERVING</span>
                        <span class="text-white text-[10rem] font-black leading-none pph-mono [text-shadow:0_4px_16px_rgba(0,0,0,0.8)]" x-text="match?.player_right_score ?? 0"></span>
                    </div>
                </div>
            </template>

            {{-- Top-right chip cluster --}}
            <div class="absolute top-4 right-4 flex items-center gap-2">
                <button type="button" @click="shareEmbed()"
                        class="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-black/70 text-white text-xs border-0 cursor-pointer backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
                    </svg>
                    <span x-text="shareLabel"></span>
                </button>
                <a x-show="matchId" :href="'/games/ping-pong/matches/' + matchId + '/scoreboard'"
                   class="px-3 py-1 rounded-md bg-black/70 text-white no-underline text-xs backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">Scoreboard →</a>
                <a href="/games/ping-pong"
                   class="px-3 py-1 rounded-md bg-black/70 text-white no-underline text-xs backdrop-blur-sm pph-mono uppercase tracking-[0.12em]">← Back</a>
            </div>
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
        healthCheckTimer: null,
        hlsNetworkErrorCount: 0,
        echo: null,
        shareLabel: 'Share embed',
        shareResetTimer: null,

        async shareEmbed() {
            const url = window.location.origin + '/games/ping-pong/embed-live';
            try {
                if (navigator.share) {
                    await navigator.share({ title: 'Ping Pong Live', url });
                    return;
                }
            } catch (e) {
                if (e && e.name === 'AbortError') return;
            }
            try {
                await navigator.clipboard.writeText(url);
                this.flashShareLabel('Copied!');
            } catch (e) {
                window.prompt('Copy embed link:', url);
            }
        },

        flashShareLabel(text) {
            this.shareLabel = text;
            if (this.shareResetTimer) clearTimeout(this.shareResetTimer);
            this.shareResetTimer = setTimeout(() => {
                this.shareLabel = 'Share embed';
            }, 1500);
        },

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
                        this.hlsNetworkErrorCount = 0;
                        this.stopPolling();
                        this.$nextTick(() => this.initPlayer(recData.hls_url));
                        this.subscribeToScores();
                        this.startHealthCheck();
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
                })
                .listen('.match.abandoned', () => {
                    this.handleMatchEnd();
                });
        },
    };
}
</script>
@endsection
