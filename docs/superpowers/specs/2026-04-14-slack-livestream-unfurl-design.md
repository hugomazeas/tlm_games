# Slack Livestream Unfurl — Design Spec

**Date:** 2026-04-14
**Scope:** When a user shares the ping pong livestream link in Slack, the stream plays inline (like YouTube) via a Block Kit video unfurl.

---

## Problem

Sharing `https://<domain>/games/ping-pong/watch` in Slack currently produces a plain text link. We want YouTube-style inline video playback so people can watch the live ping pong stream without leaving Slack.

## Approach

Slack only plays inline video for links handled by a registered Slack app responding to `link_shared` events with a Block Kit `video` block pointing at an embeddable iframe URL. We build:

1. A minimal embed page that Slack can iframe
2. A Slack app that intercepts shared links and responds with an unfurl containing that embed

## Architecture

```
User pastes link in Slack
        |
        v
Slack fires `link_shared` event
        |
        v
POST /api/slack/events
        |
        v
SlackEventController
  -> verifies HMAC signature (VerifySlackSignature middleware)
  -> delegates to SlackUnfurlService
        |
        v
SlackUnfurlService calls Slack `chat.unfurl` API
  -> video block pointing at /games/ping-pong/embed/live
  -> static thumbnail from /images/pingpong-live-thumb.png
        |
        v
Slack renders iframe with embed page
  -> hls.js plays the HLS stream
  -> Reverb/Echo updates scores in real time
```

## Components

### 1. Embed Page

**Route:** `GET /games/ping-pong/embed/live`
**Controller:** `PingPongController@embedLive`
**View:** `resources/views/games/ping-pong/embed-live.blade.php`

A standalone Blade view (no `layouts.app`, no nav). Contains:

- Full-viewport `<video>` element with hls.js autoplay (muted, as browsers require)
- LIVE badge overlay (top-left)
- Score overlay (bottom corners) — same markup pattern as `watch.blade.php`
- Reverb/Echo subscription on `ping-pong.match.{id}` for live score updates
- "No Live Match" centered message when no active match
- Polls `/games/ping-pong/api/recordings/live` on load (same as watch page)

**Response headers** (set in controller or middleware):
- `X-Frame-Options: ALLOWALL` (allow Slack to iframe)
- `Content-Security-Policy: frame-ancestors *`

**Open Graph meta tags** (in `<head>`, for Slack's crawler):
- `og:title`: "Ping Pong Live"
- `og:description`: "Watch the live ping pong match"
- `og:image`: `https://<domain>/images/pingpong-live-thumb.png`
- `og:type`: `video.other`

No authentication. No CSRF. Read-only page.

### 2. Slack Event Webhook

**Route:** `POST /api/slack/events`
**Controller:** `App\Integrations\Slack\Controllers\SlackEventController@handle`

Handles two event types:

**`url_verification`** (one-time setup handshake):
- Slack sends `{ "type": "url_verification", "challenge": "xyz" }`
- Return `{ "challenge": "xyz" }` with 200

**`link_shared`** (runtime):
- Extract `event.links[].url` from payload
- Filter for URLs matching `/games/ping-pong/watch`
- For each matching URL, call `SlackUnfurlService::unfurl()` with the event metadata

### 3. Slack Signature Verification Middleware

**Class:** `App\Integrations\Slack\Middleware\VerifySlackSignature`

Applied to all `/api/slack/*` routes. Verifies every request using Slack's signing secret:

1. Read `X-Slack-Request-Timestamp` header — reject if older than 5 minutes (replay protection)
2. Compute `v0=HMAC-SHA256(SLACK_SIGNING_SECRET, "v0:{timestamp}:{raw_body}")`
3. Compare with `X-Slack-Signature` header using `hash_equals()`
4. Return 403 on mismatch

### 4. Unfurl Service

**Class:** `App\Integrations\Slack\Services\SlackUnfurlService`

Single method: `unfurl(string $channel, string $messageTs, array $links): void`

Calls Slack's `chat.unfurl` API via Laravel's HTTP client:

```
POST https://slack.com/api/chat.unfurl
Authorization: Bearer {SLACK_BOT_TOKEN}

{
  "channel": "<channel>",
  "ts": "<message_ts>",
  "unfurls": {
    "https://<domain>/games/ping-pong/watch": {
      "blocks": [
        {
          "type": "video",
          "title": { "type": "plain_text", "text": "Ping Pong Live" },
          "video_url": "https://<domain>/games/ping-pong/embed/live",
          "thumbnail_url": "https://<domain>/images/pingpong-live-thumb.png",
          "alt_text": "Ping Pong Livestream",
          "author_name": "Games Hub"
        }
      ]
    }
  }
}
```

Uses `config('services.slack.bot_token')` and `config('services.slack.signing_secret')`.

### 5. Service Provider

**Class:** `App\Integrations\Slack\Providers\SlackServiceProvider`

Registered in `config/app.php` `providers` array. On boot:

- Loads `app/Integrations/Slack/routes.php`
- Binds `SlackUnfurlService` as singleton

### 6. Static Thumbnail

**Path:** `public/images/pingpong-live-thumb.png`

A static 1280x720 dark image with Games Hub branding and a "LIVE" badge. Created once manually, no dynamic generation.

## File Plan

### Files to create

| File | Purpose |
|------|---------|
| `app/Integrations/Slack/Controllers/SlackEventController.php` | Webhook handler for Slack events |
| `app/Integrations/Slack/Middleware/VerifySlackSignature.php` | HMAC-SHA256 request verification |
| `app/Integrations/Slack/Services/SlackUnfurlService.php` | Calls `chat.unfurl` API |
| `app/Integrations/Slack/Providers/SlackServiceProvider.php` | Registers routes + bindings |
| `app/Integrations/Slack/routes.php` | Slack webhook routes |
| `resources/views/games/ping-pong/embed-live.blade.php` | Chrome-less HLS player for iframe |
| `public/images/pingpong-live-thumb.png` | Static unfurl thumbnail |

### Files to modify

| File | Change |
|------|--------|
| `config/app.php` | Add `SlackServiceProvider` to providers |
| `config/services.php` | Add `slack` config block (bot_token, signing_secret) |
| `app/Games/PingPong/routes.php` | Add `GET /games/ping-pong/embed/live` route |
| `app/Games/PingPong/Controllers/PingPongController.php` | Add `embedLive()` method |

### Environment variables

| Variable | Source |
|----------|--------|
| `SLACK_SIGNING_SECRET` | Slack app settings > Basic Information > Signing Secret |
| `SLACK_BOT_TOKEN` | Slack app settings > OAuth & Permissions > Bot User OAuth Token |

## Slack App Setup (Manual, in Slack UI)

1. Go to https://api.slack.com/apps and create a new app
2. Name: "TLM Games Live" (or similar)
3. **Event Subscriptions:**
   - Enable events
   - Request URL: `https://<domain>/api/slack/events`
   - Subscribe to `link_shared` workspace event
4. **App Unfurl Domains:**
   - Add your domain (e.g. `games.yourdomain.com`)
5. **OAuth & Permissions:**
   - Bot scopes: `links:read`, `links:write`
6. Install to workspace (requires admin approval)
7. Copy Bot Token and Signing Secret to `.env`

## What's NOT in scope

- Live chat / Twitch-style messages overlay (future feature)
- Dynamic thumbnails showing player names
- Any database changes or migrations
- Changes to the existing `/watch` page
- Changes to HLS / Nginx / Reverb configuration

## Testing

- **Unit:** Test `VerifySlackSignature` with valid/invalid/expired signatures
- **Unit:** Test `SlackEventController` handles `url_verification` and `link_shared` correctly
- **Integration:** Test embed page loads, plays HLS when a match is live, shows "no match" otherwise
- **Manual:** Paste the watch URL in Slack and verify the unfurl renders with inline video
