# Ping pong lights (Home Assistant)

## Intent

Each office can have lights over its ping pong table that react to the match being played, so
the people at the table (and anyone walking by) see **who scored** and **who won**. Quebec is
first: a Globe light strip (Tuya, cloud) on the ceiling above the table, already in its Home
Assistant at `https://home.tlmhub.space`. Any other office can set up the same integration with
its own Home Assistant and light.

## Goals

- A point scored flashes the strip in the scoring side's colour; a won match plays a longer
  animation in the winner's colour. Afterwards the strip returns to what it was.
- Everything is configured per office on a new page, `/games/ping-pong/lights`: the Home
  Assistant address, the token, the light, each side's colour, each event on/off and its
  animation, brightness.
- Animations can be tested from that page: on the real strip (Test buttons) and on a preview
  strip drawn on the page.
- Each match carries the office it is played in.

## Non-goals

- Other moments (match started, game point, deuce, abandon). The design should make adding an
  event easy, but only *point* and *win* ship now.
- Per-segment / addressable effects: the Tuya strip is one colour light in Home Assistant.
- Light integrations for other games.
- Auth on the page (the Hub has none); the token is protected by never being readable back.

## Anti-goals

- Lights firing for the wrong office, or for score corrections (a decrement / undo).
- Lights making scoring slow or fail: Home Assistant down, slow or misconfigured must never
  affect the score request.
- The strip left stuck in a flash colour after an animation.
- The token ever appearing in a page, a response, a log or the repo.

## Constraints

- Tuya goes through the cloud: each state change takes ~0.5–1 s to show. Animations are a few
  strong steps (≥ ~0.7 s each), not strobes; the page says so next to the timing fields.
- No frontend build: Blade + Tailwind CDN + Alpine.
- `docker/supervisor/supervisord.conf` is baked into the image and `deploy.sh` never rebuilds,
  so a new queue worker needs one image rebuild on the server (flag it in the PR).
- Points can come fast (a quick rally, two taps): a newer animation must cut the running one
  short, never queue behind it.

## Approaches

1. **Hub drives the light through Home Assistant's REST API** (chosen). The office stores the
   HA address, a long-lived token and the light's entity; the Hub sequences the `light.turn_on`
   / `turn_off` calls itself and restores the previous state. Everything lives and is tested in
   the Hub; any office configures it from one page. Cost: the Hub holds a token able to control
   that whole Home Assistant (stored encrypted), and restore is ours to build.
2. Hub calls a per-office HA webhook and an HA blueprint runs the show. Safer (no token) and
   restore is native (`scene.create`), but animations live in HA YAML outside this repo and
   aren't testable from the Hub. Not picked: the user wants it all configurable and testable
   in the Hub.

## Design

### Data

- `ping_pong_matches.office_id`, `ping_pong_lobbies.office_id`, `ping_pong_tournaments.office_id`:
  nullable FK to `offices`, `nullOnDelete`. Existing rows stay null (never fire lights).
- `ping_pong_light_settings`, one row per office (unique `office_id`):
  - `enabled` bool (default false)
  - `ha_url` string, `ha_token` text (Laravel `encrypted` cast), `entity_id` string
  - `left_color`, `right_color` (hex, defaults `#2563eb` / `#f97316`)
  - `brightness` (1–100, default 100)
  - `animations` JSON keyed by event (`point`, `win`), each
    `{enabled, flashes, on_ms, off_ms}`; defaults point `{true, 1, 1500, 0}`, win
    `{true, 3, 1200, 800}`. Shaped so a new event is a new key.

### Office on a match

- Lobby creation and the direct match form get an office select; the choice is remembered in
  `localStorage` on that device and pre-selected next time. Lobby → match copies it; a rematch
  keeps it. A tournament has an office (picked when it's created) that its matches copy.
- Validation: `nullable|exists:offices,id`. No office = no lights.

### Which colour is whose

The strip is one colour light, so orientation doesn't matter: `left` / `right` are the
scoreboard's sides, not the table's ends (decided with the user). To teach players their
colour, the scoreboard and the remote tint each side with its light colour when the match's
office has lights enabled (the match payload carries the two colours, or null).

### Triggering

- In `PingPongApiController::updateScore`, after the save: on `increment` dispatch the
  `point` event for the scoring side; if that point won the match, dispatch `win` for the
  winner's side instead (the win animation replaces the point flash). `decrement` never fires.
- Every live match lights up: ranked, free play and tournament alike (*builder's call*: free
  play still has someone scoring). Logged results never go through `updateScore`, so never fire.
- A small service (e.g. `PingPongLights::trigger($match, $event, $side)`) does the checks
  (match has office, settings enabled and complete, event enabled) and dispatches the job.
  It never throws into the request.

### Playing an animation

- A queued job on its own `lights` queue (new supervisord program, short timeout) plays the
  steps with sleeps between them.
- **Newest wins:** each trigger bumps a per-office counter in the cache; the job checks it
  before every step and stops when it is no longer the newest. Only the job that started from
  a "resting" strip captures the state to restore, so a burst of points restores to the real
  original state, not to a flash colour (e.g. keep the captured state in the cache per office
  until a restore completes).
- Capture: `GET /api/states/{entity_id}` (on/off, brightness, `rgb_color` or colour temp).
  Restore: turn back on with those attributes, or off if it was off. If the capture fails,
  restore to off is wrong for a lit room, so restore to the state captured by the last
  successful job, else leave the strip on in a neutral white.
- HTTP timeouts short (~3 s); failures logged without the token; job never retried.

### Settings page `/games/ping-pong/lights`

- One card per office (all offices listed). Fields as above; the token is write-only (shows
  "saved", a Replace button; empty input keeps the stored one).
- **The stored token only ever goes to the saved address** (*builder's call*, the page has no
  login): a save, Test or Test connection whose address differs from the saved one must come
  with a token, else it's refused (422). Otherwise anyone could point the address at their own
  server and press Test to receive the office's token.
- **Test connection**: calls HA's `/api/` and lists its `light.*` entities to fill the light
  dropdown (falls back to free text).
- **Test** per event and side (`◀` left, `▶` right): plays that animation on the real strip
  with the form's current (unsaved) values.
- **Preview strip**: a bar on the card that plays the same animation in the browser from the
  form's current values, including the timing.
- Linked from the ping pong page / nav like the other ping pong pages.

### Routes

```
GET  /games/ping-pong/lights                         settings page
PUT  /games/ping-pong/lights/{office}                save an office's settings
POST /games/ping-pong/lights/{office}/test-connection check HA, list lights
POST /games/ping-pong/lights/{office}/test           play {event, side} with posted values
```

### Tests

Feature tests with `Http::fake()` and the queue faked / run sync: settings save (token kept
when blank, never in responses), office on lobby/match/tournament/rematch, point vs win vs
decrement dispatching, no office / disabled → nothing, the job's step calls and restore,
newest-wins cut-off, HA failure doesn't fail scoring.

## Left to the builder

Exact class names and file placement within `app/Games/PingPong/`, the page's styling (follow
the existing ping pong pages), the restore details per colour mode, and where the nav link goes.
