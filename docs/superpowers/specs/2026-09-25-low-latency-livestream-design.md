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
