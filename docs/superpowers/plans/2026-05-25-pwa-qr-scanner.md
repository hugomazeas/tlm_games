# PWA QR Scanner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal PWA shell and a camera FAB that — only when the app is launched as an installed PWA — opens a fullscreen html5-qrcode scanner and auto-redirects on the first same-origin URL scanned.

**Architecture:** Pure frontend feature. New `manifest.webmanifest`, minimal `sw.js`, two PNG icons, and one Blade component (`<x-camera-fab />`) that contains the button, modal, and Alpine.js logic. The component is conditionally included in `layouts/app.blade.php` only on non-`/games/*` routes; standalone-mode detection runs client-side to gate visibility further.

**Tech Stack:** Laravel 12 / Blade, Alpine.js (CDN), Tailwind CDN, `html5-qrcode` (CDN), vanilla service worker.

**Spec:** [`docs/superpowers/specs/2026-05-25-pwa-qr-scanner-design.md`](../specs/2026-05-25-pwa-qr-scanner-design.md)

**Testing note:** The repo has no JS test harness and the feature is UI/permissions-driven. Verification is **manual** in Chrome DevTools and on a real iPhone for the installed-PWA path. Each task ends with explicit manual checks. Do not skip them.

---

## File Map

**New files:**
- `public/manifest.webmanifest` — PWA manifest (Task 1)
- `public/sw.js` — minimal service worker (Task 1)
- `public/icons/icon-192.png` — 192×192 PWA icon (Task 1)
- `public/icons/icon-512.png` — 512×512 PWA icon (Task 1)
- `resources/views/components/camera-fab.blade.php` — FAB + modal + Alpine component (Tasks 3–6)

**Modified files:**
- `resources/views/layouts/app.blade.php` — PWA `<head>` tags + SW registration (Task 2) + conditional `<x-camera-fab />` include (Task 7)

---

### Task 1: PWA shell files

**Files:**
- Create: `public/manifest.webmanifest`
- Create: `public/sw.js`
- Create: `public/icons/icon-192.png`
- Create: `public/icons/icon-512.png`

- [ ] **Step 1: Create the manifest**

Create `public/manifest.webmanifest` with this exact content:

```json
{
    "name": "Games Hub",
    "short_name": "Games",
    "description": "Office gaming dashboard for archery, ping pong, and more.",
    "start_url": "/",
    "scope": "/",
    "display": "standalone",
    "orientation": "portrait",
    "theme_color": "#0f172a",
    "background_color": "#0f172a",
    "icons": [
        {
            "src": "/icons/icon-192.png",
            "sizes": "192x192",
            "type": "image/png",
            "purpose": "any maskable"
        },
        {
            "src": "/icons/icon-512.png",
            "sizes": "512x512",
            "type": "image/png",
            "purpose": "any maskable"
        }
    ]
}
```

- [ ] **Step 2: Create the minimal service worker**

Create `public/sw.js` with this exact content:

```js
// Minimal service worker — exists only to satisfy PWA install criteria.
// No caching, no offline handling. See design spec for rationale.
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
    // Pass-through. Letting fetch fall through to network without responding
    // keeps the SW from interfering with normal request handling.
});
```

- [ ] **Step 3: Generate the placeholder icons**

The icons need to be real PNG files of the exact dimensions. Generate them with ImageMagick (preferred) **or** the PHP/GD fallback below.

**Primary path (ImageMagick on host):**
```bash
mkdir -p public/icons
# 192x192
convert -size 192x192 \
    gradient:'#1e1b4b'-'#0f172a' \
    -gravity center \
    -pointsize 110 -fill '#a5b4fc' \
    -font 'Apple-Color-Emoji' \
    -annotate +0+0 '🎮' \
    public/icons/icon-192.png
# 512x512
convert -size 512x512 \
    gradient:'#1e1b4b'-'#0f172a' \
    -gravity center \
    -pointsize 300 -fill '#a5b4fc' \
    -font 'Apple-Color-Emoji' \
    -annotate +0+0 '🎮' \
    public/icons/icon-512.png
```

**Fallback (PHP/GD inside the container) — if ImageMagick isn't installed on the host.** Uses only GD primitives (no external fonts), since the Alpine PHP image doesn't ship TTF fonts.

```bash
make shell
```
Then inside the container:
```bash
php -r '
foreach ([192, 512] as $size) {
    $im = imagecreatetruecolor($size, $size);
    // Vertical gradient #1e1b4b -> #0f172a
    for ($y = 0; $y < $size; $y++) {
        $t = $y / ($size - 1);
        $r = (int)(30 + (15 - 30) * $t);
        $g = (int)(27 + (23 - 27) * $t);
        $b = (int)(75 + (42 - 75) * $t);
        $color = imagecolorallocate($im, $r, $g, $b);
        imageline($im, 0, $y, $size, $y, $color);
    }
    // Indigo accent circle in the center
    $accent = imagecolorallocate($im, 99, 102, 241); // #6366f1
    imagefilledellipse($im, $size / 2, $size / 2, $size / 2, $size / 2, $accent);
    // Inner dark dot for visual interest
    $inner = imagecolorallocate($im, 15, 23, 42);    // #0f172a
    imagefilledellipse($im, $size / 2, $size / 2, $size / 3, $size / 3, $inner);
    imagepng($im, "/var/www/html/public/icons/icon-{$size}.png");
    imagedestroy($im);
}
echo "icons written\n";
'
```
Branded artwork is explicitly out of scope per the spec — these placeholders are replaceable later with no code changes.

- [ ] **Step 4: Verify icons exist and have correct dimensions**

Run:
```bash
file public/icons/icon-192.png public/icons/icon-512.png
```
Expected: each line says `PNG image data, 192 x 192` or `512 x 512` respectively.

- [ ] **Step 5: Verify manifest is served**

Start the app (`make up`) if not running, then:
```bash
curl -sI http://localhost:8080/manifest.webmanifest | head -5
curl -sI http://localhost:8080/sw.js | head -5
curl -sI http://localhost:8080/icons/icon-192.png | head -5
```
Expected: each returns `HTTP/1.1 200 OK`.

- [ ] **Step 6: Commit**

```bash
git add public/manifest.webmanifest public/sw.js public/icons/
git commit -m "feat(pwa): add manifest, service worker, and icons"
```

---

### Task 2: Wire PWA into the layout

**Files:**
- Modify: `resources/views/layouts/app.blade.php`

- [ ] **Step 1: Add PWA meta tags to `<head>`**

In `resources/views/layouts/app.blade.php`, immediately after the existing `<title>` line (currently around line 7), insert:

```blade
    <link rel="manifest" href="{{ url('/manifest.webmanifest') }}">
    <meta name="theme-color" content="#0f172a">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <meta name="apple-mobile-web-app-title" content="Games">
    <link rel="apple-touch-icon" href="{{ url('/icons/icon-192.png') }}">
```

- [ ] **Step 2: Register the service worker**

In the same file, immediately before `</body>` (currently around line 89), insert:

```blade
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch((err) => {
                    console.warn('SW registration failed:', err);
                });
            });
        }
    </script>
```

- [ ] **Step 3: Manual verification — manifest parses**

Reload `http://localhost:8080/` in Chrome. Open DevTools → Application → Manifest.

Expected:
- Name: "Games Hub"
- Short name: "Games"
- Start URL: `/`
- Display: standalone
- Both icons render in the preview
- No red errors at the top of the panel

- [ ] **Step 4: Manual verification — service worker registers**

DevTools → Application → Service Workers.

Expected:
- One worker listed for `localhost:8080`, status `activated and is running`
- Source: `/sw.js`

- [ ] **Step 5: Manual verification — installability**

DevTools → Application → Manifest panel, scroll to the bottom.

Expected: the "Installability" section shows no errors (or only the "page must be served over HTTPS" warning on localhost, which is fine — Chrome treats localhost as secure). On a Chromium-based browser the address bar shows an install icon.

- [ ] **Step 6: Commit**

```bash
git add resources/views/layouts/app.blade.php
git commit -m "feat(pwa): register manifest and service worker in layout"
```

---

### Task 3: Camera FAB component (button + standalone gating only)

**Files:**
- Create: `resources/views/components/camera-fab.blade.php`

This task creates the FAB button alone — no modal yet, no scanner. It verifies the standalone-mode gate works before we add the harder parts.

- [ ] **Step 1: Create the component file**

Create `resources/views/components/camera-fab.blade.php` with this content:

```blade
<div x-data="cameraFab()" x-cloak>
    <button
        x-show="isStandalone"
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
</div>

<script>
    function cameraFab() {
        return {
            isStandalone: false,
            isOpen: false,
            error: null,
            scanner: null,

            init() {
                this.isStandalone =
                    window.matchMedia('(display-mode: standalone)').matches ||
                    window.navigator.standalone === true;
            },

            open() {
                // Placeholder — modal arrives in Task 4.
                alert('FAB tapped. Modal coming in Task 4.');
            },
        };
    }
</script>
```

- [ ] **Step 2: Temporarily include the component for testing**

Edit `resources/views/layouts/app.blade.php`. Immediately before `</body>` (after the SW registration script you added in Task 2), add:

```blade
    <x-camera-fab />
```

Note: This is the *temporary* unconditional include for visual verification. Task 7 will replace it with the `@unless(request()->is('games/*'))` guard.

- [ ] **Step 3: Manual verification — FAB hidden in normal tab**

Open `http://localhost:8080/` in a regular Chrome tab.

Expected: **no** floating button is visible in the bottom-right.

- [ ] **Step 4: Manual verification — FAB visible in standalone mode**

In Chrome DevTools, open Command Menu (Cmd+Shift+P) → run "Show Rendering". In the Rendering tab, find "Emulate CSS media feature display-mode" and set it to `standalone`. Reload.

Expected: the gradient camera button appears in the bottom-right. Clicking it shows the placeholder alert.

Set the emulation back to `no override` before continuing.

- [ ] **Step 5: Commit**

```bash
git add resources/views/components/camera-fab.blade.php resources/views/layouts/app.blade.php
git commit -m "feat(pwa): add camera FAB with standalone-mode gating"
```

---

### Task 4: Modal markup + open/close lifecycle (no scanner)

**Files:**
- Modify: `resources/views/components/camera-fab.blade.php`

Add the fullscreen modal and open/close behavior, still without the scanner. Verify the modal lifecycle in isolation.

- [ ] **Step 1: Add the modal markup**

In `resources/views/components/camera-fab.blade.php`, inside the existing root `<div x-data="cameraFab()" x-cloak>`, **after** the `<button>` but before the closing `</div>`, add:

```blade
    <div
        x-show="isOpen"
        x-transition.opacity
        @keydown.escape.window="close()"
        class="fixed inset-0 z-50 bg-black text-white flex flex-col"
        role="dialog"
        aria-modal="true"
        aria-label="QR code scanner"
    >
        <div class="flex justify-end p-2" style="padding-top: calc(0.5rem + env(safe-area-inset-top));">
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

        <div class="flex-1 flex flex-col items-center justify-center px-4 pb-8">
            <div id="qr-reader" class="w-[80vmin] max-w-[420px] aspect-square rounded-2xl overflow-hidden bg-white/5"></div>
            <p class="mt-6 text-sm text-white/70 text-center">Point camera at a game QR code</p>

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
```

- [ ] **Step 2: Replace the placeholder `open()` with real lifecycle methods**

Still in `resources/views/components/camera-fab.blade.php`, replace the entire `open()` method in the Alpine component with:

```js
            async open() {
                this.error = null;
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
                // Scanner attach moved to Task 5.
            },

            async close() {
                // Scanner detach moved to Task 5.
                this.isOpen = false;
                document.body.style.overflow = '';
            },

            async retry() {
                this.error = null;
                await this.close();
                await this.open();
            },
```

- [ ] **Step 3: Manual verification — modal opens and closes**

With standalone display-mode emulation still on:

1. Reload `http://localhost:8080/`. Tap the FAB.
   - Expected: black fullscreen modal appears, close button visible top-right, empty viewfinder placeholder in the center, instruction text below.
2. Click the close (✕) button.
   - Expected: modal disappears, FAB visible again.
3. Tap the FAB again, then press the `Esc` key.
   - Expected: modal closes via Esc.
4. With the modal open, try scrolling the underlying page.
   - Expected: page does not scroll. (Verify by opening the modal on a long page like `/players` if needed.)
5. Close the modal and scroll the underlying page.
   - Expected: scrolling works again.

- [ ] **Step 4: Commit**

```bash
git add resources/views/components/camera-fab.blade.php
git commit -m "feat(pwa): add fullscreen scanner modal shell"
```

---

### Task 5: Wire html5-qrcode scanner + same-origin redirect

**Files:**
- Modify: `resources/views/components/camera-fab.blade.php`

- [ ] **Step 1: Add the html5-qrcode CDN script**

In `resources/views/components/camera-fab.blade.php`, at the very top of the file (before the root `<div>`), add:

```blade
<script src="https://unpkg.com/html5-qrcode" defer></script>
```

- [ ] **Step 2: Wire scanner start in `open()` and stop in `close()`**

Replace the `open()` and `close()` methods you wrote in Task 4 with:

```js
            async open() {
                this.error = null;
                this.isOpen = true;
                document.body.style.overflow = 'hidden';
                await this.$nextTick();
                try {
                    this.scanner = new Html5Qrcode('qr-reader');
                    await this.scanner.start(
                        { facingMode: 'environment' },
                        { fps: 10, qrbox: 250 },
                        (decoded) => this.onScan(decoded),
                        () => { /* per-frame decode misses are normal — ignore */ }
                    );
                } catch (e) {
                    this.error = (e && e.name === 'NotAllowedError')
                        ? 'Camera permission is needed to scan. Enable it in your browser settings.'
                        : 'No camera available on this device.';
                    this.scanner = null;
                }
            },

            async close() {
                if (this.scanner) {
                    try { await this.scanner.stop(); } catch (e) { /* ignore */ }
                    try { await this.scanner.clear(); } catch (e) { /* ignore */ }
                    this.scanner = null;
                }
                this.isOpen = false;
                document.body.style.overflow = '';
            },
```

- [ ] **Step 3: Add the `onScan` handler**

In the Alpine component object, after the `retry()` method, add:

```js
            onScan(decodedText) {
                let url;
                try {
                    url = new URL(decodedText);
                } catch (_) {
                    this.error = 'That QR code is not a valid link.';
                    return;
                }
                if (url.origin !== window.location.origin) {
                    this.error = 'That QR code is not for this app.';
                    return;
                }
                this.close().then(() => {
                    window.location.href = url.pathname + url.search + url.hash;
                });
            },
```

- [ ] **Step 4: Manual verification — happy path (cross-device)**

This is the end-to-end test of the feature. You need two devices: a laptop and a phone.

1. **Laptop:** open `http://<your-LAN-IP>:8080/games/ping-pong`. Pick two players and advance to the screen that shows two QR codes (the "qrscan" screen).
2. **Phone (same Wi-Fi):** open Chrome to `http://<your-LAN-IP>:8080/`. Open DevTools remotely or simply use Chrome's `chrome://flags/#unsafely-treat-insecure-origin-as-secure` and add the LAN URL — the camera API requires a secure origin, and `http://localhost` works for the desktop but a LAN IP does not unless flagged. (Alternative: use a tunneling tool such as `cloudflared tunnel --url http://localhost:8080` to get an HTTPS URL.)
3. **Phone:** in the DevTools rendering panel emulate `display-mode: standalone` (or once installed, launch from the home screen). Tap the camera FAB.
4. Allow camera permission when prompted.
5. Point the phone camera at one of the QR codes on the laptop screen.

   Expected: phone briefly shows the camera feed, then the modal closes and the phone navigates to `/games/ping-pong/remote/{id}/left` (or `/right`).

If the cross-device setup is impractical right now, the minimum local check is: on the laptop in standalone-emulation, open the FAB, allow webcam permission, and hold up a phone showing any same-origin QR (you can generate one quickly at e.g. `https://www.qrcode-monkey.com/` encoding `http://localhost:8080/players`). Verify the page navigates to `/players`.

- [ ] **Step 5: Commit**

```bash
git add resources/views/components/camera-fab.blade.php
git commit -m "feat(pwa): wire QR scanner with same-origin redirect"
```

---

### Task 6: Error path verification

**Files:**
- (no code changes — verification only; the error handling shipped in Tasks 4 and 5)

This task adds no code. It is dedicated verification time for the four error paths the spec calls out. If any path is broken, fix it before moving on.

- [ ] **Step 1: Verify "Camera permission denied"**

1. In Chrome: Settings → Privacy and security → Site Settings → Camera → set `localhost:8080` to "Block". (Or use the lock icon in the address bar.)
2. Reload, enable standalone emulation, tap the FAB.

   Expected: modal opens with red error box: *"Camera permission is needed to scan. Enable it in your browser settings."* "Try again" button visible.
3. Click "Try again" → same error reappears (still blocked). Click ✕ → modal closes.

Reset the permission to "Ask (default)" before continuing.

- [ ] **Step 2: Verify "No camera available"**

In DevTools → Sensors → "Override" → there is no direct way to remove webcams; the easiest substitute is to deny permission once and confirm the fallback message, then re-test on a device with no camera if available. Acceptable to skip this specific sub-check if no cameraless test device is on hand — the code path is the same as permission-denied.

- [ ] **Step 3: Verify "QR is not a valid link"**

Generate a QR code containing literal text (not a URL) — e.g. encode `hello world` via any online QR generator. Display it on a second screen / phone.

1. Open the scanner. Point at the QR.

   Expected: red error box: *"That QR code is not a valid link."* Scanner keeps running underneath.
2. Without closing the modal, swap to a valid same-origin URL QR and point at it.

   Expected: modal closes and the page navigates. (The previous error does not block subsequent scans.)

- [ ] **Step 4: Verify "QR is not for this app"**

Generate a QR encoding a different origin — e.g. `https://example.com/`.

1. Open the scanner. Point at the QR.

   Expected: red error box: *"That QR code is not for this app."* Scanner keeps running.

- [ ] **Step 5: Commit (only if you had to fix anything)**

If you found a bug and fixed it:
```bash
git add resources/views/components/camera-fab.blade.php
git commit -m "fix(pwa): <describe the fix>"
```
Otherwise no commit is needed for this verification-only task.

---

### Task 7: Conditional include in layout (final wiring)

**Files:**
- Modify: `resources/views/layouts/app.blade.php`

The component was unconditionally included for testing in Task 3. Replace that with the `@unless(request()->is('games/*'))` guard.

- [ ] **Step 1: Wrap the include**

In `resources/views/layouts/app.blade.php`, find the line you added in Task 3 step 2:

```blade
    <x-camera-fab />
```

Replace it with:

```blade
    @unless(request()->is('games/*'))
        <x-camera-fab />
    @endunless
```

- [ ] **Step 2: Manual verification — included on allowed routes**

With standalone display-mode emulation on, visit each of these and confirm the FAB renders:
- `http://localhost:8080/`
- `http://localhost:8080/players`
- `http://localhost:8080/players/1` (or any existing player id from `make tinker` if needed)
- `http://localhost:8080/leaderboards`
- `http://localhost:8080/leaderboards/ping-pong`

Expected: FAB visible on all five.

- [ ] **Step 3: Manual verification — excluded on game routes**

Still with standalone emulation, visit:
- `http://localhost:8080/games/ping-pong`
- `http://localhost:8080/games/ping-pong/remote/1/left` (route exists; the controller may 404 if match id 1 doesn't exist — that's fine, we're checking the layout)

Expected: FAB **not** present in either. (Confirm by inspecting the DOM — there should be no `<button aria-label="Scan QR code">` in the rendered HTML at all on these routes, since the include is server-side gated.)

- [ ] **Step 4: Commit**

```bash
git add resources/views/layouts/app.blade.php
git commit -m "feat(pwa): gate camera FAB include to non-game routes"
```

---

### Task 8: End-to-end smoke test on a real installed PWA

**Files:**
- (no code changes)

The DevTools standalone emulation covers most behaviors but not the real iOS install path, which historically has surprising `getUserMedia` behavior in installed PWAs. This task is the final acceptance gate.

- [ ] **Step 1: Expose the app over HTTPS**

The camera API requires a secure origin. Pick one:
- Run `cloudflared tunnel --url http://localhost:8080` (or `ngrok http 8080`) to get a temporary HTTPS URL.
- Or deploy to a staging environment if one exists.

Note the HTTPS URL.

- [ ] **Step 2: Install the PWA on a phone**

**iOS (Safari):**
1. Open the HTTPS URL in Safari.
2. Share → Add to Home Screen.
3. Launch from the home screen.

**Android (Chrome):**
1. Open the HTTPS URL in Chrome.
2. Menu → "Install app" (or wait for the install banner).
3. Launch from the home screen / app drawer.

Expected on launch: no browser chrome (URL bar, tabs). The dark gradient app fills the screen including under the status bar.

- [ ] **Step 3: Verify FAB visibility**

On the installed PWA, navigate to `/`. Expected: camera FAB visible bottom-right, clear of the home indicator (iOS) / nav bar (Android).

Navigate to `/games/ping-pong`. Expected: FAB not present.

- [ ] **Step 4: End-to-end scan**

On a laptop, open the same HTTPS URL → `/games/ping-pong` → start a match → reach the QR-scan screen.

On the phone (installed PWA): tap the camera FAB → grant permission → scan one of the QR codes on the laptop.

Expected: scanner closes, phone navigates to the corresponding `/games/ping-pong/remote/{id}/{side}` URL — and stays inside the installed PWA (no jump out to Safari/Chrome).

- [ ] **Step 5: Document the result**

If everything works: the feature is complete. Move to merging.

If something is broken on iOS specifically (the most likely failure surface): file the symptom (e.g. "Safari PWA: tapping FAB never prompts for camera"), check html5-qrcode's known iOS issues, and adjust before merging. Common iOS gotchas worth checking first:
- `getUserMedia` in installed PWAs requires Safari 16.4+ on the device.
- The first-ever permission prompt for camera in an installed PWA can require a hard reload of the PWA before it appears.

- [ ] **Step 6: Final commit (only if changes were needed)**

If Step 5 surfaced fixes:
```bash
git add resources/views/components/camera-fab.blade.php
git commit -m "fix(pwa): <describe iOS-specific fix>"
```
Otherwise nothing to commit here.

---

## Done criteria

- [ ] Manifest, service worker, and icons exist under `public/`.
- [ ] Chrome DevTools "Installability" panel reports no errors.
- [ ] FAB renders only when `display-mode: standalone` (or `navigator.standalone`) is true.
- [ ] FAB is excluded server-side on all `/games/*` routes.
- [ ] Tapping the FAB opens a fullscreen modal with a live camera viewfinder.
- [ ] Scanning a same-origin URL QR code closes the modal and navigates to the URL's path.
- [ ] Scanning a non-URL QR shows "That QR code is not a valid link." and keeps scanning.
- [ ] Scanning a cross-origin URL QR shows "That QR code is not for this app." and keeps scanning.
- [ ] Denying camera permission shows the permission-denied message with a "Try again" button.
- [ ] Esc and the ✕ button both close the modal; body scroll is restored after close.
- [ ] End-to-end scan works on a real installed PWA over HTTPS.
