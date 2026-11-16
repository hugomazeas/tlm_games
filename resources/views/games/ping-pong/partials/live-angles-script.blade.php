<script>
const PING_PONG_ANGLES = ['main', 'wide', 'both'];
// How much later the wide camera delivers the same moment than the main one (a clap test)
const PING_PONG_WIDE_LATENCY_SECONDS = {{ (int) config('pingpong.wide_camera.latency_ms') }} / 1000;

/** The angle this viewer last picked (?angle= in the URL wins): main, wide or both. */
function pingPongStoredAngle() {
    const fromUrl = new URLSearchParams(window.location.search).get('angle');
    if (PING_PONG_ANGLES.includes(fromUrl)) return fromUrl;
    try {
        const stored = localStorage.getItem('ping_pong_angle');
        if (PING_PONG_ANGLES.includes(stored)) return stored;
    } catch (e) {
        // Storage blocked: start on the main angle
    }
    return 'main';
}

/**
 * The second camera on the live pages: a wide-angle player instead of, or beside, the main one.
 * ffmpeg stamps both streams' segments with the wall-clock time they were filmed, so the wide
 * player is nudged onto the main one's moment. It only loads while it's on screen.
 *
 * Mix into a component that has `hlsInstance` (the main player) and, for sound, `audioOn`.
 */
function pingPongLiveAngles(mainId, wideId) {
    return {
        angle: pingPongStoredAngle(),
        wideUrl: null,
        wideHls: null,
        wideRetryTimer: null,
        wideSyncHandler: null,
        wideSyncedAt: 0,

        /** What's on screen: the main angle until the match has a wide one. (A method: a getter wouldn't survive being spread into a component.) */
        shownAngle() {
            return this.wideUrl ? this.angle : 'main';
        },

        setAngle(angle) {
            this.angle = angle;
            try {
                localStorage.setItem('ping_pong_angle', angle);
            } catch (e) {
                // Not remembered, still switched
            }
            if (this.shownAngle() === 'main') {
                this.destroyWide();
            } else if (!this.wideHls) {
                this.$nextTick(() => this.initWide());
            }
            this.applyAngleAudio();
        },

        attachWide(url) {
            if (!url) {
                this.detachWide();
                return;
            }
            if (url === this.wideUrl && this.wideHls) return;
            this.wideUrl = url;
            if (this.shownAngle() !== 'main') this.$nextTick(() => this.initWide());
        },

        detachWide() {
            this.destroyWide();
            this.wideUrl = null;
        },

        initWide() {
            const video = document.getElementById(wideId);
            if (!video || !this.wideUrl) return;

            this.destroyWide();

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                const hls = new Hls({ liveSyncDuration: 3, liveMaxLatencyDuration: 6, enableWorker: true });
                this.wideHls = hls;
                hls.loadSource(this.wideUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => this.playWide(video));
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                        return;
                    }
                    this.retryWide();
                });
                // Checked as the main player plays (at most once a second), so no timer of its own
                this.wideSyncHandler = () => {
                    if (Date.now() - this.wideSyncedAt < 1000) return;
                    this.wideSyncedAt = Date.now();
                    this.syncWide();
                };
                document.getElementById(mainId)?.addEventListener('timeupdate', this.wideSyncHandler);
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.onerror = () => this.retryWide();
                video.src = this.wideUrl;
                this.playWide(video);
            }
        },

        /** The wide stream dropped: try again in a bit (the main player decides whether the match is still on). */
        retryWide() {
            if (this.wideRetryTimer || !this.wideUrl) return;
            this.wideRetryTimer = setTimeout(() => {
                this.wideRetryTimer = null;
                if (this.wideUrl && this.shownAngle() !== 'main') this.initWide();
            }, 3000);
        },

        destroyWide() {
            clearTimeout(this.wideRetryTimer);
            this.wideRetryTimer = null;
            if (this.wideSyncHandler) {
                document.getElementById(mainId)?.removeEventListener('timeupdate', this.wideSyncHandler);
                this.wideSyncHandler = null;
            }
            const video = document.getElementById(wideId);
            if (video) {
                video.onerror = null;
                video.playbackRate = 1;
            }
            if (this.wideHls) {
                this.wideHls.destroy();
                this.wideHls = null;
            }
        },

        playWide(video) {
            video.muted = !this.wideHasSound();
            video.play().catch(() => {
                video.muted = true;
                video.play().catch(() => {});
            });
        },

        /** Sound comes from the angle on screen; side by side, from the main one. */
        wideHasSound() {
            return !!this.audioOn && this.shownAngle() === 'wide';
        },

        applyAngleAudio() {
            const main = document.getElementById(mainId);
            const wide = document.getElementById(wideId);
            if (main) main.muted = !this.audioOn || this.shownAngle() === 'wide';
            if (wide) {
                wide.muted = !this.wideHasSound();
                if (!wide.muted) wide.play().catch(() => {});
            }
        },

        /** A seek when the wide angle is far off the main one's moment, a slightly faster or slower rate when close. */
        syncWide() {
            const wide = document.getElementById(wideId);
            const mainDate = this.hlsInstance?.playingDate;
            const wideDate = this.wideHls?.playingDate;
            if (!wide || !mainDate || !wideDate || wide.paused) return;

            const ahead = (wideDate - mainDate) / 1000 - PING_PONG_WIDE_LATENCY_SECONDS;
            if (Math.abs(ahead) > 1) {
                wide.currentTime -= ahead;
                wide.playbackRate = 1;
            } else if (Math.abs(ahead) < 0.05) {
                wide.playbackRate = 1;
            } else {
                wide.playbackRate = ahead > 0 ? 0.9 : 1.1;
            }
        },
    };
}
</script>
