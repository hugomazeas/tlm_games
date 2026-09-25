<style>
    .qr-frame {
        position: relative;
        width: min(92vmin, 640px);
        aspect-ratio: 1 / 1;
        background: #000;
        border-radius: 1rem;
        overflow: hidden;
    }
    #qr-video {
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
        background: #000;
    }
    .qr-reticle {
        position: absolute;
        inset: 10%;
        pointer-events: none;
    }
    .qr-reticle::before,
    .qr-reticle::after,
    .qr-reticle > span::before,
    .qr-reticle > span::after {
        content: "";
        position: absolute;
        width: 28px;
        height: 28px;
        border-color: rgba(255, 255, 255, 0.9);
        border-style: solid;
        border-width: 0;
    }
    .qr-reticle::before { top: 0; left: 0; border-top-width: 3px; border-left-width: 3px; border-top-left-radius: 6px; }
    .qr-reticle::after  { top: 0; right: 0; border-top-width: 3px; border-right-width: 3px; border-top-right-radius: 6px; }
    .qr-reticle > span::before { bottom: 0; left: 0; border-bottom-width: 3px; border-left-width: 3px; border-bottom-left-radius: 6px; }
    .qr-reticle > span::after  { bottom: 0; right: 0; border-bottom-width: 3px; border-right-width: 3px; border-bottom-right-radius: 6px; }
</style>

<div x-data="cameraFab()" x-cloak>
    <button
        x-show="isMobile"
        @click="open()"
        type="button"
        aria-label="Scan QR code"
        class="fixed bottom-5 right-5 z-40 w-14 h-14 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-900/40 flex items-center justify-center text-white hover:scale-105 active:scale-95 transition-transform"
        style="bottom: calc(1.25rem + env(safe-area-inset-bottom));"
    >
        <svg xmlns="http://www.w3.org/2000/svg" class="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 9a2 2 0 0 1 2-2h2l1.5-2h7L17 7h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/>
            <circle cx="12" cy="13" r="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    </button>

    <div
        x-show="isOpen"
        x-transition.opacity
        @keydown.escape.window="close()"
        @click.self="bumpDebugTaps()"
        class="fixed inset-0 z-50 bg-black text-white flex flex-col"
        style="touch-action: manipulation;"
        role="dialog"
        aria-modal="true"
        aria-label="QR code scanner"
    >
        <div class="flex justify-between items-center p-2" style="padding-top: calc(0.5rem + env(safe-area-inset-top));">
            <button
                x-show="cameras.length > 1"
                @click="switchCamera()"
                type="button"
                :aria-label="'Switch camera (current: ' + shortLabel(cameras[currentCameraIndex]?.label) + ')'"
                class="h-11 px-4 rounded-full bg-white/10 hover:bg-white/20 flex items-center gap-2 text-sm font-medium"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 0 0 4.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 0 1-15.357-2m15.357 2H15"/>
                </svg>
                <span x-text="shortLabel(cameras[currentCameraIndex]?.label) || 'Camera'"></span>
            </button>
            <div x-show="cameras.length <= 1"></div>
            <button
                @click="close()"
                type="button"
                aria-label="Close scanner"
                class="w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
            >
                <svg xmlns="http://www.w3.org/2000/svg" class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </div>

        <div
            @click.self="bumpDebugTaps()"
            class="flex-1 flex flex-col items-center justify-center px-4 pb-8"
        >
            <div class="qr-frame">
                <video
                    id="qr-video"
                    x-ref="video"
                    @click="focusAt($event)"
                    autoplay
                    muted
                    playsinline
                ></video>
                <div class="qr-reticle"><span></span></div>

                {{-- Live status pill --}}
                <div
                    x-show="isOpen && !error"
                    class="absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium backdrop-blur-md"
                    :class="status === 'found' ? 'bg-emerald-500/30 text-emerald-100' : 'bg-black/50 text-white/90'"
                >
                    <span class="relative flex h-2 w-2">
                        <span
                            x-show="status !== 'found'"
                            class="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
                            :class="status === 'idle' ? 'bg-amber-400' : 'bg-indigo-400'"
                        ></span>
                        <span
                            class="relative inline-flex rounded-full h-2 w-2"
                            :class="status === 'found' ? 'bg-emerald-400' : status === 'idle' ? 'bg-amber-400' : 'bg-indigo-400'"
                        ></span>
                    </span>
                    <span x-text="hint"></span>
                </div>
            </div>

            {{-- Debug HUD (hidden by default; tap the modal's black background 5× within 3s to toggle) --}}
            <div x-show="debug" class="mt-3 w-full max-w-[min(92vmin,640px)] grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] font-mono text-white/60 bg-white/5 rounded-lg px-3 py-2">
                <div>lens</div>           <div class="text-right text-white/80" x-text="shortLabel(cameras[currentCameraIndex]?.label) || '—'"></div>
                <div>stream</div>         <div class="text-right text-white/80" x-text="streamResolution || '—'"></div>
                <div>scan rate</div>      <div class="text-right text-white/80" x-text="detectFps ? detectFps + ' fps' : '—'"></div>
                <div>elapsed</div>        <div class="text-right text-white/80" x-text="elapsedDisplay"></div>
                <div>frames</div>         <div class="text-right text-white/80" x-text="framesScanned"></div>
                <div>last</div>           <div class="text-right text-white/80 truncate" x-text="lastResultPreview || '—'"></div>
            </div>

            {{-- Full error (wraps; no truncation) --}}
            <div
                x-show="debug && lastErrorFull"
                class="mt-2 w-full max-w-[min(92vmin,640px)] text-[11px] font-mono text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2 break-words whitespace-pre-wrap"
                x-text="lastErrorFull"
            ></div>

            <div x-show="error" class="mt-4 max-w-sm w-full bg-red-500/15 border border-red-400/30 text-red-200 rounded-lg px-4 py-3 text-sm text-center">
                <p x-text="error"></p>
                <button
                    @click="retry()"
                    type="button"
                    class="mt-2 text-xs font-semibold underline underline-offset-2"
                >Try again</button>
            </div>
        </div>
    </div>
</div>

<script>
    function cameraFab() {
        // Non-reactive state. Alpine wraps every property of the returned
        // object in a Proxy for reactivity, which breaks class instances that
        // use #privateFields — the proxy is not the original receiver, so
        // internal-slot checks throw 'Private element is not present on this
        // object'. The ZXing-WASM polyfill's BarcodeDetector hits exactly that.
        // So we keep instance references in a closure rather than on `this`.
        const internals = {
            detector: null,
            detectorPromise: null,
            detectorClassPromise: null,
            stream: null,
            scanCanvas: null,
            scanCtx: null,
        };

        return {
            isMobile: false,
            isOpen: false,
            error: null,
            cameras: [],
            currentCameraIndex: 0,
            detectLoopActive: false,
            debug: false,
            _debugTaps: 0,
            _debugLastTapAt: 0,
            // Debug / hint state
            status: 'idle',              // 'idle' | 'searching' | 'found'
            hint: 'Initializing…',
            streamResolution: '',
            framesScanned: 0,
            detectFps: 0,
            lastResultPreview: '',
            lastErrorFull: '',
            _fpsFrameCount: 0,
            _fpsWindowStart: 0,
            _scanStartedAt: 0,
            _elapsedTick: 0,
            _elapsedTimer: null,

            init() {
                // Show on any mobile device (not just installed PWAs). A coarse
                // pointer is the most reliable "this is a phone/tablet" signal;
                // fall back to a UA sniff for the rare browser that misreports it.
                this.isMobile =
                    window.matchMedia('(pointer: coarse)').matches ||
                    /Android|iPhone|iPad|iPod|Mobile|IEMobile|Opera Mini/i.test(navigator.userAgent);
                // Load persisted debug preference. Toggle by tapping the small
                // instruction line under the viewfinder 5 times within 3s.
                // (No URL-query toggle: installed PWAs launch from the manifest
                // start_url with no way to inject query strings.)
                try {
                    this.debug = localStorage.getItem('qr_debug') === '1';
                } catch (_) { /* localStorage may be unavailable in some private modes */ }
                // Fetch the decoder module while the page is idle so tapping the
                // button only has to start the camera. The service worker keeps
                // the pinned files in Cache Storage, so after the first visit this
                // is a local read rather than a network round trip.
                if (this.isMobile) {
                    const prefetch = () => this.loadDetectorClass().catch(() => {});
                    if ('requestIdleCallback' in window) requestIdleCallback(prefetch, { timeout: 3000 });
                    else setTimeout(prefetch, 1500);
                }
            },

            bumpDebugTaps() {
                const now = performance.now();
                if (now - (this._debugLastTapAt || 0) > 3000) this._debugTaps = 0;
                this._debugLastTapAt = now;
                this._debugTaps += 1;
                if (this._debugTaps >= 5) {
                    this._debugTaps = 0;
                    this.debug = !this.debug;
                    try {
                        if (this.debug) localStorage.setItem('qr_debug', '1');
                        else localStorage.removeItem('qr_debug');
                    } catch (_) {}
                }
            },

            loadDetectorClass() {
                // Always import the polyfill — never use window.BarcodeDetector
                // even if it exists. Native implementations are inconsistent:
                // some Chromium builds throw "Private element is not present on
                // this object" on detect(); iOS Safari is flaky with canvas/video
                // input. The polyfill (ZXing-WASM) behaves the same on every
                // device. The `/pure` entry never delegates to the native one.
                //
                // Versions are pinned so every URL — and the ~1MB zxing .wasm the
                // module pulls in — is immutable, letting the browser and the
                // service worker cache them for good instead of revalidating a
                // semver range on every page load. Bump together with
                // DECODER_URL_PATTERN in public/sw.js.
                if (internals.detectorClassPromise) return internals.detectorClassPromise;
                const sources = [
                    'https://cdn.jsdelivr.net/npm/barcode-detector@3.2.2/pure/+esm',
                    'https://esm.sh/barcode-detector@3.2.2/pure?bundle',
                    'https://unpkg.com/barcode-detector@3.2.2/dist/es/pure.min.js',
                ];
                internals.detectorClassPromise = (async () => {
                    let lastErr = null;
                    for (const url of sources) {
                        try {
                            const mod = await import(url);
                            const cls = mod.BarcodeDetector || mod.default?.BarcodeDetector || mod.default;
                            if (typeof cls === 'function') return cls;
                        } catch (e) { lastErr = e; }
                    }
                    throw new Error('QR decoder failed to load (' + (lastErr?.message || 'no source worked') + ')');
                })();
                // A failed load must not poison a later "Try again".
                internals.detectorClassPromise.catch(() => { internals.detectorClassPromise = null; });
                return internals.detectorClassPromise;
            },

            ensureDetector() {
                if (!internals.detectorPromise) {
                    internals.detectorPromise = this.createDetector();
                    internals.detectorPromise.catch(() => { internals.detectorPromise = null; });
                }
                return internals.detectorPromise;
            },

            async createDetector() {
                const DetectorClass = await this.loadDetectorClass();
                const detector = new DetectorClass({ formats: ['qr_code'] });
                // Soft pre-warm: a small filled canvas triggers WASM initialization.
                // If it throws, surface the message in the HUD but do NOT abort —
                // some polyfill builds fail on tiny canvases yet work fine on real
                // video frames.
                const warm = document.createElement('canvas');
                warm.width = warm.height = 64;
                const wctx = warm.getContext('2d');
                wctx.fillStyle = '#ffffff';
                wctx.fillRect(0, 0, 64, 64);
                try {
                    await detector.detect(warm);
                } catch (e) {
                    const name = e?.name || 'Error';
                    const msg = (e?.message || String(e) || '').toString();
                    this.lastResultPreview = 'warmup: ' + msg.slice(0, 60);
                    this.lastErrorFull = 'warmup ' + name + ': ' + msg;
                }
                internals.detector = detector;
            },

            async open() {
                this.error = null;
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
                await this.$nextTick();
                // Ask for the camera straight away and load the decoder in
                // parallel. Running them one after the other left people staring
                // at a black frame for seconds before the permission prompt.
                const detectorReady = this.ensureDetector();
                detectorReady.catch(() => {});
                try {
                    await this.startInitialStream();
                    await detectorReady;
                    // Closed while we were waiting: don't leave the camera on.
                    if (!this.isOpen) { this.stopStream(); return; }
                    this.startDetectionLoop();
                } catch (e) {
                    if (!this.isOpen) { this.stopStream(); return; }
                    const name = e?.name || 'Error';
                    const msg = (e?.message || String(e) || '').slice(0, 140);
                    if (name === 'NotAllowedError' || name === 'SecurityError') {
                        this.error = 'Camera permission is needed to scan. Enable it in your browser settings.';
                    } else if (name === 'NotFoundError') {
                        this.error = 'No camera available on this device.';
                    } else {
                        // Surface the real cause so it's debuggable instead of a generic message.
                        this.error = 'Could not start the scanner — ' + name + ': ' + msg;
                    }
                }
            },

            rememberedCameraId() {
                try { return localStorage.getItem('qr_camera_id') || null; } catch (_) { return null; }
            },

            rememberCamera(id) {
                if (!id) return;
                try { localStorage.setItem('qr_camera_id', id); } catch (_) {}
            },

            async startInitialStream() {
                // One getUserMedia call per open: the lens used last time is
                // requested directly, otherwise the browser's own back-camera
                // pick. Devices are enumerated only once a stream is live (labels
                // are populated by then), which replaces the old throwaway probe
                // stream that booted the camera twice on every open.
                const rememberedId = this.rememberedCameraId();
                let activeId = await this.startStream(rememberedId);
                if (this.cameras.length === 0) {
                    await this.enumerateCameras(activeId);
                }
                let index = this.cameras.findIndex((c) => c.id === activeId);
                // First run on this device: if the browser handed us a lens we
                // rank lower (composite, ultra-wide), move to the best one once;
                // it is remembered, so later opens go straight there.
                if (!rememberedId && this.cameras.length > 1 && index !== 0) {
                    activeId = await this.startStream(this.cameras[0].id);
                    index = this.cameras.findIndex((c) => c.id === activeId);
                }
                this.currentCameraIndex = Math.max(0, index);
                this.rememberCamera(activeId);
            },

            async enumerateCameras(activeId) {
                // activeId is the camera currently streaming — the browser picked
                // it for facingMode 'environment' (or it was remembered), which is
                // a high-confidence "this is a back camera" signal we can use as a
                // tiebreaker when labels are missing or ambiguous.
                const probeBackId = activeId;
                const devices = await navigator.mediaDevices.enumerateDevices();
                const all = devices
                    .filter((d) => d.kind === 'videoinput')
                    .map((d) => ({ id: d.deviceId, label: d.label }));

                // Only keep back-facing cameras. A camera counts as "back" if:
                // - the browser picked it for facingMode: environment (probeBackId), OR
                // - its label looks back-ish (back/rear/environment), OR
                // - its label is empty (some browsers refuse to label idle cameras
                //   — better to keep it than to drop a possibly-valid back camera).
                // Always exclude obvious front/selfie labels.
                const isObviousFront = (l) => /front|user|face|selfie|facetime/i.test(l || '');
                const looksBack = (l) => /back|rear|environment/i.test(l || '');
                const backs = all.filter((c) => {
                    if (isObviousFront(c.label)) return false;
                    if (c.id === probeBackId) return true;
                    if (looksBack(c.label)) return true;
                    return !c.label; // no label → keep, can't classify
                });

                this.cameras = this.orderCameras(backs.length ? backs : all, probeBackId);
            },

            orderCameras(cams, preferredId) {
                // Lens preference: main 1x first, ultra-wide last, composites in
                // between. iPhone exposes individual lenses (Back Wide / Back
                // Telephoto / Back Ultra Wide). Picking the specific 1x ("Wide")
                // lens avoids the slow auto-switch behaviour of the composite
                // 'Back Triple/Dual Camera'. On Android, labels are usually
                // generic ('0', 'camera2 ...') so all score the same and we
                // fall back to enumeration order, which is typically the OEM's
                // default back camera first.
                const score = (c) => {
                    const l = (c.label || '').toLowerCase();
                    if (/ultra[- ]?wide|ultrawide/.test(l)) return 50;
                    if (/triple|dual/.test(l)) return 20;
                    if (/telephoto/.test(l)) return 5;
                    if (/wide/.test(l)) return 0;
                    return 10;
                };
                return [...cams].sort((a, b) => {
                    const sa = score(a);
                    const sb = score(b);
                    if (sa !== sb) return sa - sb;
                    // Same score: the browser-picked back camera wins the tiebreak.
                    if (preferredId && a.id === preferredId) return -1;
                    if (preferredId && b.id === preferredId) return 1;
                    return 0;
                });
            },

            shortLabel(label) {
                if (!label) return '';
                return label
                    .replace(/^(Back|Rear)\s+/i, '')
                    .replace(/\s*Camera\s*$/i, '')
                    .trim() || 'Camera';
            },

            /** Starts the given camera, or the default back camera, and returns the live deviceId. */
            async startStream(deviceId = null) {
                this.stopStream();
                // Progressive fallback: some devices reject the exact-device +
                // high-resolution combo (OverconstrainedError) or hold a brief
                // lock after the enumerate probe. Walk down to broader
                // constraints until something works.
                const attempts = [];
                if (deviceId) {
                    attempts.push({ deviceId: { exact: deviceId }, width: { ideal: 1920 }, height: { ideal: 1080 } });
                    attempts.push({ deviceId: { exact: deviceId } });
                }
                attempts.push({ facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } });
                attempts.push({ facingMode: { ideal: 'environment' } });
                attempts.push(true);

                let stream = null;
                let lastErr = null;
                for (const v of attempts) {
                    try {
                        stream = await navigator.mediaDevices.getUserMedia({ video: v });
                        break;
                    } catch (e) { lastErr = e; }
                }
                if (!stream) throw lastErr || new Error('No camera constraint succeeded.');

                internals.stream = stream;
                const video = this.$refs.video;
                video.srcObject = stream;
                try { await video.play(); } catch (_) { /* iOS sometimes throws on autoplay; the muted/playsinline attrs handle it */ }
                const track = stream.getVideoTracks()[0];
                const s = track?.getSettings?.() || {};
                this.streamResolution = (s.width && s.height) ? `${s.width}×${s.height}` : '';
                return s.deviceId || deviceId;
            },

            stopStream() {
                this.detectLoopActive = false;
                if (this._elapsedTimer) { clearInterval(this._elapsedTimer); this._elapsedTimer = null; }
                if (internals.stream) {
                    internals.stream.getTracks().forEach((t) => t.stop());
                    internals.stream = null;
                }
                const video = this.$refs?.video;
                if (video) video.srcObject = null;
            },

            get elapsedDisplay() {
                if (!this._scanStartedAt) return '—';
                const s = Math.max(0, this._elapsedTick - this._scanStartedAt) / 1000;
                return s.toFixed(1) + 's';
            },

            updateHint() {
                if (this.status === 'found') { this.hint = 'Got it!'; return; }
                const elapsed = (performance.now() - this._scanStartedAt) / 1000;
                if (elapsed < 3) this.hint = 'Looking for a QR code…';
                else if (elapsed < 6) this.hint = 'Try moving the phone closer';
                else if (elapsed < 10) this.hint = 'Hold steady';
                else this.hint = 'Make sure the code is well-lit and unblocked';
            },

            startDetectionLoop() {
                this.detectLoopActive = true;
                this.status = 'searching';
                this.framesScanned = 0;
                this.detectFps = 0;
                this.lastResultPreview = '';
                this._fpsFrameCount = 0;
                this._fpsWindowStart = performance.now();
                this._scanStartedAt = performance.now();
                this._elapsedTick = this._scanStartedAt;
                this.hint = 'Looking for a QR code…';
                if (this._elapsedTimer) clearInterval(this._elapsedTimer);
                this._elapsedTimer = setInterval(() => {
                    this._elapsedTick = performance.now();
                    this.updateHint();
                }, 500);

                const video = this.$refs.video;
                // Reuse a single offscreen canvas — feeding a canvas to detect()
                // is universally supported, while feeding <video> directly is
                // flaky on some polyfill + browser combinations. Stored on the
                // closure-scoped `internals` to avoid Alpine's reactive Proxy.
                if (!internals.scanCanvas) {
                    internals.scanCanvas = document.createElement('canvas');
                    internals.scanCtx = internals.scanCanvas.getContext('2d', { willReadFrequently: true });
                }
                const canvas = internals.scanCanvas;
                const ctx = internals.scanCtx;

                const tick = async () => {
                    if (!this.detectLoopActive || !this.isOpen) return;
                    if (video && video.readyState >= 2 && video.videoWidth > 0) {
                        try {
                            if (canvas.width !== video.videoWidth) {
                                canvas.width = video.videoWidth;
                                canvas.height = video.videoHeight;
                            }
                            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                            const codes = await internals.detector.detect(canvas);
                            this.framesScanned += 1;
                            this._fpsFrameCount += 1;
                            const now = performance.now();
                            if (now - this._fpsWindowStart >= 1000) {
                                this.detectFps = Math.round(this._fpsFrameCount * 1000 / (now - this._fpsWindowStart));
                                this._fpsFrameCount = 0;
                                this._fpsWindowStart = now;
                            }
                            if (codes && codes.length > 0) {
                                const raw = codes[0].rawValue || '';
                                this.lastResultPreview = raw.length > 40 ? raw.slice(0, 40) + '…' : raw;
                                this.status = 'found';
                                this.hint = 'Got it!';
                                if (this.handleDecoded(raw)) return;
                                this.status = 'searching';
                                this._scanStartedAt = performance.now();
                            }
                        } catch (e) {
                            const name = e?.name || 'Error';
                            const msg = (e?.message || String(e) || 'unknown').toString();
                            this.lastResultPreview = 'err: ' + msg.slice(0, 60);
                            this.lastErrorFull = name + ': ' + msg;
                        }
                    }
                    // Throttle to ~10 detections/sec: plenty for QR codes and far
                    // gentler on the CPU than running every animation frame.
                    setTimeout(tick, 100);
                };
                tick();
            },

            handleDecoded(text) {
                let url;
                try {
                    url = new URL(text);
                } catch (_) {
                    this.error = 'That QR code is not a valid link.';
                    return false;
                }
                if (url.origin !== window.location.origin) {
                    this.error = 'That QR code is not for this app.';
                    return false;
                }
                this.close();
                window.location.href = url.pathname + url.search + url.hash;
                return true;
            },

            async switchCamera() {
                if (this.cameras.length < 2) return;
                this.currentCameraIndex = (this.currentCameraIndex + 1) % this.cameras.length;
                try {
                    const cam = this.cameras[this.currentCameraIndex];
                    await this.startStream(cam.id);
                    this.rememberCamera(cam.id);
                    if (!this.detectLoopActive) this.startDetectionLoop();
                } catch (_) {
                    this.error = 'Could not switch to that camera.';
                }
            },

            async focusAt(event) {
                // Tap-to-focus where the browser supports it (most Android Chrome). iOS
                // Safari does not expose pointsOfInterest / focusMode constraints — the
                // call no-ops silently in that case.
                if (!internals.stream) return;
                const track = internals.stream.getVideoTracks()[0];
                if (!track || !track.applyConstraints) return;
                const video = this.$refs.video;
                const rect = video.getBoundingClientRect();
                const x = (event.clientX - rect.left) / rect.width;
                const y = (event.clientY - rect.top) / rect.height;
                try {
                    await track.applyConstraints({
                        advanced: [{ focusMode: 'single-shot', pointsOfInterest: [{ x, y }] }],
                    });
                } catch (_) { /* unsupported */ }
            },

            close() {
                this.stopStream();
                this.isOpen = false;
                document.body.style.overflow = '';
            },

            async retry() {
                this.error = null;
                this.close();
                await this.open();
            },
        };
    }
</script>
