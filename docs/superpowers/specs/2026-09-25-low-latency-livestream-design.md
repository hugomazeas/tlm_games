# Low-latency livestream through a go2rtc sidecar

Date: 2026-09-25
Status: approved design, pending implementation plan

## Goal

Cut the ping pong livestream delay from 5–7 s (plain HLS) to well under a second
for people in the office and about 1 s for remote viewers, without putting match
recordings at risk and without keeping the webcam open between matches.

Success: during a match, `/watch` on an office laptop shows the table under a
second behind real life; the match recording is as complete as today; after the
match, nothing holds `/dev/video0`.

## Why the stream is slow today (measured on match #1889)

| Step | Measured |
|---|---|
| Camera → FFmpeg → finished 2 s HLS segment | 0–2 s (real-time encoder, 590.9 s of video for a 590 s match) |
| Segment → viewer (Cloudflare → Caddy → nginx) | median 1 s, max 3 s |
| hls.js deliberately playing behind the edge | 3 s, drifting to 6 s before it skips |

Nothing is broken; HLS just cannot go much lower with 2 s segments.

## Decisions

| Question | Decision |
|---|---|
| Technology | go2rtc v1.9.14 sidecar container (`alexxit/go2rtc:1.9.14`). Rejected: tuning HLS (saves ~2 s, needs a Caddy rate-limit change), MediaMTX, Cloudflare Stream (no recording), Media over QUIC (still beta). |
| Office viewers | WebRTC straight to `192.168.1.134:8555` on the LAN. |
| Remote viewers | MSE over a WebSocket through Cloudflare → Caddy → nginx → go2rtc. No router port. |
| Fallback | Existing hls.js player on the HLS files the recorder still writes. |
| Who opens the camera | go2rtc runs our existing FFmpeg capture command as an `exec:` source, only while something reads the stream. |
| Who controls it | The games hub. Match start: `PUT /api/streams`. Match end: `POST /api/exit?code=0`. The container restarts clean, which drops every viewer and kills the FFmpeg holding the camera. Needed because go2rtc's `DELETE` leaves a running producer alive while any viewer tab is still connected. |
| Between matches | go2rtc has no stream defined, so no request can open the camera. go2rtc runs from a throwaway copy of its config, because `PUT`/`DELETE` on `/api/streams` rewrite the config file. |
| Recording | Recorder FFmpeg reads `rtsp://go2rtc:8554/pingpong` with `-c copy` (one encode instead of two) and writes the same HLS files as today. `FinalizeRecordingJob` and clips are unchanged. |
| When go2rtc fails | Try go2rtc with mic → go2rtc video-only → reset go2rtc and open the camera directly exactly as today (itself mic → video-only). A recording never depends on go2rtc. |
| Kill switch | `GO2RTC_URL` empty in `.env` → exactly today's behavior. Empty by default, and forced empty in tests. |
| Audio | Captured inside go2rtc's FFmpeg (AAC), copied into the recording. Live players stay muted, as today. |

## Security

- go2rtc's API (`:1984`) and RTSP (`:8554`) are never published. They are reachable only on a
  dedicated `games-hub-camera` Docker network shared with the app container.
- `exec: allow_paths: [ffmpeg]`: the API can run nothing but FFmpeg.
- nginx proxies exactly one path, `/live/ws`, and only with `src=pingpong`. Every
  other go2rtc endpoint stays unreachable from the internet.
- WebRTC `8555/tcp+udp` is published on the LAN address only; the router is not touched.
- No change to Caddy, Cloudflare or the router.

## Costs and known limits

- Match start takes 1–3 s longer: the hub waits for the recorder's first segment
  to confirm the go2rtc path works before committing to it.
- go2rtc restarts after every match (~1–2 s). A match started in that window uses the
  direct path: it still records, just without low latency.
- If go2rtc dies mid-match, that match's recording ends there, just as it does today
  when FFmpeg dies.
- Remote iPhones on iOS < 17.1 have no MSE and get HLS.

## Out of scope

Cleaning up the 292 GB of leftover `storage/app/recordings/live/*` directories,
Firefox DNS-over-HTTPS on office machines, audio in the live players, JS test tooling.

## Addendum (2026-10-14): latency measured on the real remote path, recommendation revised

Before committing to go2rtc we validated the latency assumptions by standing up
both engines on the games hub and viewing them remotely through the actual
Cloudflare → Caddy path, not just on the LAN.

**Method.** A wall-clock (NTP-synced) was burned into the camera feed with
ffmpeg `drawtext`. The feed was published through each engine and viewed from an
off-site laptop at `https://streamtest.tlmhub.space` with the browser's own
NTP clock overlaid on the page. Glass-to-glass latency = browser clock − the
SERVER time visible in the video. Everything was torn down after.

**Results.**

| Path | go2rtc | MediaMTX |
|---|---|---|
| Remote, through Cloudflare | MSE-over-WS ≈ **2 s** | LL-HLS ≈ **2 s** |
| Local HLS, no proxy (ffmpeg pull) | — | ≈ **1 s** |
| Today (HLS, 2 s segments, hls.js 3 behind) | 5–7 s | 5–7 s |

**Findings.**

1. **The ~1 s remote figure for MSE did not materialize.** go2rtc (MSE) and
   MediaMTX (LL-HLS) both land at ~2 s remotely. Remote latency is dominated by
   the Cloudflare hop and player buffering, **not** by the streaming engine, so
   latency does not distinguish the two. (The office LAN uses WebRTC for both and
   is sub-second — not separately measured here, but it is the same transport for
   either engine.)
2. **Neither remote path reaches < 1 s.** ~2 s is the realistic remote number
   through Cloudflare with either tool; the design's "~1 s for remote" is optimistic.
3. **The camera is single-owner.** Only one process can hold `/dev/video0` (V4L2,
   no concurrent readers), so both designs must funnel through one camera owner —
   this is why go2rtc owns the camera in the current plan.
4. **Recording is where the two genuinely differ.** MediaMTX records to disk
   natively and **independently of any viewer** (verified: recording kept writing
   valid 1280×720/30 H.264 with zero readers connected). go2rtc has no native
   recording — which is exactly why this plan adds a second FFmpeg that pulls
   `rtsp://go2rtc:8554/pingpong -c copy`. That couples the match recording — and
   therefore the ball-detection training videos uploaded to the frame-labeler at
   `192.168.1.141` — to go2rtc staying alive. A go2rtc crash *mid-match* truncates
   that match's recording; the plan's fallbacks only cover failures at match start.

**Revised recommendation.** Since latency is a wash on both the remote (~2 s each)
and LAN (WebRTC, sub-second each) paths, the decision should turn on recording.
Prefer **MediaMTX**: same latency as go2rtc, but recording is native and decoupled
from the live path, removing the mid-match truncation risk to the training
recordings. The per-match lifecycle is unchanged (the hub starts/stops the
publisher; the camera is closed between matches). One open item: MediaMTX records
in time-based segments, so produce one `{matchId}.mp4` per match — either a long
`recordSegmentDuration` plus a rename on match end, or concatenation inside
`FinalizeRecordingJob` (which already runs an ffmpeg mux step). `UploadRecordingJob`
and the frame-labeler are unchanged either way.

**Caveats.** Only the remote path was measured; the LAN WebRTC sub-second case is
inferred from the shared transport, not measured. Timezone and clock sync were
NTP-based; readings are ±~0.5 s.
