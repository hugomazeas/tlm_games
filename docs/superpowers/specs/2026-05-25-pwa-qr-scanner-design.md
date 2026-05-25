# PWA QR Scanner

**Date:** 2026-05-25
**Status:** Approved (design)

## Goal

When the Games Hub is installed and launched as a PWA, show a floating camera button on most pages. Tapping it opens a fullscreen scanner. Scanning a same-origin QR code (e.g. a ping-pong match remote URL) closes the modal and navigates the user to that URL.

## Why

Ping-pong match QR codes already exist (generated in `resources/views/games/ping-pong/play.blade.php` at the `qrscan` screen, pointing at `/games/ping-pong/remote/{id}/{side}`). Today a player has to switch to their device's native camera app, decode the QR, then tap the resulting link. A built-in scanner that lives inside the installed PWA makes that flow one tap.

The PWA-only gating gives the install state a tangible benefit — only installed users get the shortcut.

## Scope decisions

| Decision | Choice |
|---|---|
| Accepted scan URLs | **Same-origin only.** `new URL(decoded).origin === window.location.origin`. Anything else → inline error, keep scanning. |
| FAB visibility | **Standalone display-mode only.** `matchMedia('(display-mode: standalone)').matches \|\| navigator.standalone === true`. Hidden in regular browser tabs. |
| PWA scope | **Minimal install shell.** Manifest + empty service worker just enough to be installable. No offline caching, no precache. |
| Pages showing the FAB | **Home, players (list/detail/edit), leaderboards (index, per-game, per-mode).** Hidden on all `/games/*` routes. |
| Scan UX | **Auto-redirect on first valid scan.** No confirmation step. Inline errors for invalid scans. |
| Scanner library | **`html5-qrcode` via CDN.** Matches existing CDN-only frontend (Tailwind, Alpine, qrcodejs). |

## Architecture

Pure frontend. No controllers, routes, migrations, config, or models change.

### 1. PWA shell

**New files:**

- `public/manifest.webmanifest`
  ```json
  {
    "name": "Games Hub",
    "short_name": "Games",
    "display": "standalone",
    "start_url": "/",
    "theme_color": "#0f172a",
    "background_color": "#0f172a",
    "icons": [
      { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
      { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
  }
  ```
- `public/sw.js` — minimal worker. Empty `install`, `activate`, and `fetch` listeners; just enough to satisfy install-prompt criteria. No caching strategy.
- `public/icons/icon-192.png`, `public/icons/icon-512.png` — placeholder icons (solid theme-colored background + the 🎮 glyph). Replaceable later without code changes.

**Modified — `resources/views/layouts/app.blade.php`:**

In `<head>`:
- `<link rel="manifest" href="/manifest.webmanifest">`
- `<meta name="theme-color" content="#0f172a">`
- `<meta name="apple-mobile-web-app-capable" content="yes">`
- `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- `<link rel="apple-touch-icon" href="/icons/icon-192.png">`

Before `</body>`:
- Inline `<script>` that registers `/sw.js` on `load`.

### 2. Camera FAB component

**New file — `resources/views/components/camera-fab.blade.php`** — single Blade component containing:

- The FAB button (`fixed bottom-5 right-5 z-40`, 56×56 circle, indigo→purple gradient, camera SVG, safe-area-inset-bottom padding).
- The fullscreen modal markup (initially hidden via `x-show="isOpen"`).
- Alpine component `cameraFab()` defined in an inline `<script>` block.
- `<script src="https://unpkg.com/html5-qrcode">` (deferred).

Included from the layout only when not on a game route:

```blade
@unless(request()->is('games/*'))
    <x-camera-fab />
@endunless
```

The Alpine component handles the standalone check internally and renders nothing visible when `!isStandalone` — that way the component is server-rendered uniformly but only visually present in PWA mode.

### 3. Standalone detection

Runs once on Alpine `init()`:

```js
isStandalone:
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true
```

FAB element uses `x-show="isStandalone"` with `x-cloak` to avoid a flash in normal browser tabs.

### 4. Scanner lifecycle

```js
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

    async open() {
      this.error = null;
      this.isOpen = true;
      document.body.style.overflow = 'hidden';
      await this.$nextTick();
      this.scanner = new Html5Qrcode('qr-reader');
      try {
        await this.scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: 250 },
          (decoded) => this.onScan(decoded),
          () => { /* per-frame decode failures: ignore */ }
        );
      } catch (e) {
        this.error = e?.name === 'NotAllowedError'
          ? 'Camera permission is needed to scan. Enable it in your browser settings.'
          : 'No camera available on this device.';
      }
    },

    async close() {
      if (this.scanner) {
        try { await this.scanner.stop(); } catch {}
        try { await this.scanner.clear(); } catch {}
        this.scanner = null;
      }
      this.isOpen = false;
      document.body.style.overflow = '';
    },

    onScan(decodedText) {
      let url;
      try {
        url = new URL(decodedText);
      } catch {
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
  };
}
```

Esc key closes the modal (Alpine `@keydown.escape.window`).

### 5. Modal layout

Fixed full-screen overlay (`fixed inset-0 z-50 bg-black`):
- Top-right close (✕) button — 44×44 tap target, `pt-[env(safe-area-inset-top)]`.
- Centered viewfinder container `<div id="qr-reader">` clamped to ~80vmin square.
- Instruction text below: *"Point camera at a game QR code"*.
- Error slot below the instruction (`x-show="error"`), with a "Try again" button that clears `error` and re-runs `open()` if the scanner failed to start.

## Error semantics

| Condition | Message | Scanner state |
|---|---|---|
| Permission denied | "Camera permission is needed to scan. Enable it in your browser settings." | Stopped; "Try again" re-attempts |
| No camera found | "No camera available on this device." | Stopped; "Try again" re-attempts |
| Decoded text isn't a URL | "That QR code is not a valid link." | Keeps running |
| Decoded URL is cross-origin | "That QR code is not for this app." | Keeps running |
| Valid same-origin URL | (n/a — modal closes and navigates) | Stopped |

**Cross-deployment QRs are intentionally rejected.** A QR encoded with `https://staging.example.com/...` will not redirect locally — same-origin is the trust boundary.

## Files changed

**New:**
- `public/manifest.webmanifest`
- `public/sw.js`
- `public/icons/icon-192.png`
- `public/icons/icon-512.png`
- `resources/views/components/camera-fab.blade.php`

**Modified:**
- `resources/views/layouts/app.blade.php`

That is the full change surface.

## Testing plan

Manual; no JS test infrastructure exists in the repo.

1. **PWA installability.** Chrome DevTools → Application → Manifest shows no errors. "Install" prompt available; iOS "Add to Home Screen" produces an icon.
2. **FAB visibility gating.** In a normal browser tab → no FAB. In the installed PWA → FAB visible on `/`, `/players`, `/players/{id}`, `/leaderboards`, `/leaderboards/{slug}`. On any `/games/*` route → no FAB (server-side excluded).
3. **Happy path.** Open a ping-pong match on a laptop (renders left/right QR codes). On a phone running the installed PWA, tap the camera button, scan one of the QR codes, confirm the phone navigates to `/games/ping-pong/remote/{id}/{side}`.
4. **Error paths.** Deny camera permission; scan a Wi-Fi-config QR; scan a QR whose text is not a URL; scan a QR pointing to a different origin. Each must show its inline error and (where applicable) keep the scanner running.
5. **iOS specifically.** Safari → Share → Add to Home Screen → launch from home screen → `navigator.standalone === true` triggers the FAB. Confirm `getUserMedia` works inside the installed PWA (historically an iOS pain point).
6. **Body scroll lock.** While the modal is open, the page underneath does not scroll. Closing the modal restores scrolling.

## Out of scope

- Offline support / response caching / background sync.
- Generating new QR codes for games other than ping-pong.
- Desktop / non-standalone scanner UI.
- Permission-recovery deep links into OS settings (browsers do not allow this).
- Replacing the placeholder icons with branded artwork (drop-in later).
