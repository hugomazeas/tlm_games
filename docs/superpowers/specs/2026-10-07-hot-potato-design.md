# Hot potato — design

Date: 2026-10-07
Status: approved design, pending implementation plan

## Goal

A short, live, multiplayer arcade game everyone in an office can jump into
from the Games Hub: bumper-car avatars in a generated arena pass a ticking
potato by touching each other, and whoever holds it when it blows is out.
It gives people a reason to keep the Hub open and to play together.

Success: three people open `/hot-potato` on their computers, one hosts, the
others join, they play a 2-minute game with at least one boom, see results,
and the host starts a second game from the same lobby without anyone
reloading.

## Decisions

| Question | Decision |
|---|---|
| Where it lives | Games Hub, as a game module (`app/Games/HotPotato/`). No Buro integration. |
| Identity | Pick your player, as in ping pong (remembered in `localStorage`). Honour system. |
| Who can play | Anyone who picked a player. No "in the office today" rule. |
| Live engine | A server-authoritative Bun WebSocket sidecar in the Hub container. Laravel keeps pages, players, results and the leaderboard. |
| Session shape | A host opens a session per office. Lobby has no countdown; the host presses Start. Many games in a row from the same lobby. |
| Game length | Host picks 1, 2, 3, 4 or 5 minutes. |
| End condition | Several booms, survival: each boom eliminates the holder; at time-out all survivors win; the last one standing wins early. |
| Arena | Procedurally generated from a seed every game, with a theme. |
| Stakes | Persistent leaderboard. |
| Devices | Keyboard only. Touch devices can watch, not play. |
| Language | English, matching the rest of the Hub. Copy lives in one `strings.ts`. |

## Rules

### Session and lobby

- A session belongs to one Hub office (`offices.id`). At most one session per
  office at a time.
- Whoever opens it is the **host**. Opening sends a Web Push invite to that
  office's players who opted in.
- The lobby has no timer. Players join or leave freely, up to **12**.
- The host picks the duration (1–5 min) and the theme (random by default) and
  presses **Start**, enabled at **3+** players.
- After results, everyone returns to the lobby automatically after 8 s;
  newcomers can join; the host may start again immediately. No cooldown.
- The session ends when the host closes it, or when the last player leaves.
  If the host leaves, hosting passes to the earliest-joined remaining player.

### Game

- Countdown 3-2-1, then play. Players spawn at generated spawn points.
- **Movement:** arrow keys or WASD, diagonals normalised. Avatars have
  momentum and bounce off each other and off obstacles.
- **Potato:** starts with a random player.
  - Touching another player passes it. The receiver is **frozen for 2 s**
    (cannot move, cannot pass), giving the passer time to escape.
  - The holder moves **10% faster**.
- **Fuse:** each potato burns for a random **15–30 s**. The fuse time is
  never sent to clients; they receive only a `shake` level (0–1) that rises
  over the last seconds.
- **Boom:** the holder is out (pie splat) and becomes a spectator. After a
  2 s pause a new potato goes to a random survivor (frozen 2 s like a pass).
- **End:** when the host's chosen duration elapses, all survivors win. If one
  player remains earlier, they win immediately.
- **Disconnect** mid-game counts as out. If they held the potato, it moves to
  a random survivor (with the 2 s freeze). A tab reconnecting within 10 s
  rejoins the lobby.

### Spectators

Anyone on the page for that office can **Watch** a game live, without input.
Eliminated players keep watching.

## Architecture

```
browser (Blade + Alpine shell, canvas)  ──ws /hot-potato/ws──▶ nginx ──▶ Bun sidecar :8090
        │                                                           │
        └── HTTP pages, push opt-in ──▶ nginx ──▶ php-fpm (Laravel) ◀──┘ internal HTTP
                                                     │                  (players, results)
                                                  SQLite
```

### Laravel module `app/Games/HotPotato/`

Follows the existing game-module pattern (Controllers, Models, Services,
Providers, `routes.php`, views in `resources/views/games/hot-potato/`,
provider listed in `config/games.php`, a `game_types` row).

- `GET /hot-potato` — the page: office + player picker, lobby, game, results.
- Migrations:
  - `hot_potato_games`: `id`, `office_id`, `seed`, `theme`, `duration_seconds`,
    `started_at`, `ended_at`.
  - `hot_potato_game_players`: `game_id`, `player_id`, `position` (1 = last
    standing; survivors share 1), `survived` (bool), `eliminated_at_ms`
    (null for survivors), `hold_ms`, `passes`.
- `HotPotatoLeaderboardProvider` implements `LeaderboardProviderInterface`:
  wins (games survived), games played, survival rate, passes. Columns
  declared on the `game_types` row like the other games.
- Internal endpoints for the sidecar, guarded by the `X-Internal-Secret`
  header matching `HOT_POTATO_INTERNAL_SECRET` (403 otherwise; 503 if unset):
  - `GET /internal/hot-potato/players/{player}` → `{id, name, office_id}`.
  - `POST /internal/hot-potato/sessions/opened` `{office_id, host_player_id}`
    → sends the Web Push invite.
  - `POST /internal/hot-potato/results` → stores one game and its players.
- Push: an opt-in toggle "Notify me when a game opens" on the page, reusing
  the Hub's `push_subscriptions` per player. Invites go only to subscribers
  whose player belongs to that office, excluding the host.

### Bun sidecar `game-server/`

TypeScript, run as a new supervisord program `hot-potato` on
`127.0.0.1:8090`. nginx proxies `location /hot-potato/ws` to it with the
WebSocket upgrade headers, as it already does for Reverb on `/app/`. It never
touches the database.

- `src/sim/` — pure, no I/O, no clock, injected RNG:
  - `generateArena(seed, theme, playerCount)`
  - `createGame(arena, players, durationMs, rng)`
  - `step(state, inputs, dtMs) → { state, events }` with events `pass`,
    `boom`, `eliminated`, `newPotato`, `ended`.
- `src/sessions.ts` — in-memory session per office; state machine
  `lobby → countdown → playing → results → lobby`, `closed`. Runs a 20 Hz
  loop (50 ms) only while `playing`. Clock and RNG injectable.
- `src/server.ts` — `Bun.serve` WebSocket, message validation, wiring.
- `src/laravel.ts` — the internal HTTP client (base URL `http://127.0.0.1`,
  secret from env).

On `join`/`open` the sidecar fetches the player from Laravel, so a browser
cannot invent players. On game end it POSTs the results; a failed POST is
logged and not retried (a lost result is acceptable; the game itself is not
affected).

### Protocol

JSON messages, types in `game-server/src/protocol.ts`, every inbound message
validated (unknown or malformed → `error {code: 'BAD_MESSAGE'}`).

Client → server:

| Type | Payload | Who |
|---|---|---|
| `hello` | `{officeId, playerId \| null}` | everyone on connect; `null` = watch-only |
| `open` | `{}` | a player, when the office has no session |
| `join` / `leave` | `{}` | a player, in lobby |
| `start` | `{durationMin: 1..5, theme: ThemeId \| 'random'}` | host, 3–12 players |
| `input` | `{dx, dy}` (normalised, sent on change, ≤ 20/s) | a living player |
| `close` | `{}` | host |

Server → client:

| Type | Payload |
|---|---|
| `office` | `{session: null \| {hostId, phase, players}}` — state on hello and on change |
| `lobby` | `{hostId, players: [{id, name}], settings}` |
| `countdown` | `{arena, spawns, startsInMs}` — the arena is sent once here |
| `snapshot` | `{t, players: [{id, x, y, vx, vy, frozenMs, out}], holderId, shake}` |
| `event` | `{kind: 'pass' \| 'boom' \| 'newPotato', ...}` |
| `results` | `{survivors, eliminated: [{id, atMs}], stats}` |
| `closed` | `{}` |
| `error` | `{code}` — e.g. `SESSION_EXISTS`, `NOT_HOST`, `NOT_ENOUGH_PLAYERS`, `LOBBY_FULL`, `UNKNOWN_PLAYER` |

The fuse time never appears in any server message.

### Browser

A Vite entry `resources/js/hot-potato/` (added to `vite.config.js` inputs)
renders on a `<canvas>`; the page shell is Blade + Alpine.

- Page states: pick (office + player) → office idle ("Open a hot potato" /
  "Samuel is hosting — 4 players": Join, Watch) → lobby (player chips;
  host: duration, theme, Start) → countdown → game → results → lobby.
- HUD: elapsed timer, players left, an edge arrow pointing at the potato.
- Interpolation: draw remote players ~100 ms behind the latest snapshots.
  The local avatar is predicted with `sim/step` and eased toward server state.
- Visuals: initials + colour per player with a name label; holder shows 🥔
  and a glow that shakes with `shake`; frozen = blue tint, ❄️, 2 s ring;
  eliminated = 🥧 splat, then a faded ghost. "🥔 YOU HAVE IT" flash on receipt.
- No audio. No vibration.
- Touch devices without a keyboard (`(pointer: coarse)` and no keydown seen):
  Watch only; Join/Open are replaced by "Play from a computer 💻".
- `prefers-reduced-motion: reduce`: shake becomes a colour pulse, splats a
  static icon, no screen flashes. Movement itself stays.

## Procedural arenas

`generateArena(seed, theme, playerCount)` is deterministic.

- **Field:** 16:10, area scaled with player count, from about 40×25 units
  (3 players) to 64×40 (12). Avatar radius 1 unit.
- **Obstacles:** 6–14 rectangles and circles depending on size, placed by
  rejection sampling under these constraints:
  - every passage at least 3 avatar diameters wide;
  - free space rasterised to a grid and flood-filled: fully connected;
  - no obstacle within 4 units of a spawn.
  After 50 failed attempts, retry with fewer obstacles; with zero obstacles
  the constraints always hold, so generation always returns.
- **Spawns:** evenly spaced on an ellipse at 70% of the field, nudged off
  obstacles.
- **Themes** are data (palette, obstacle shapes and mix, physics multipliers,
  optional mover), not code:

| Theme | Look | Twist |
|---|---|---|
| `open_space` | Desks, plants | None (baseline) |
| `ice_rink` | Ice, snowbanks | Low friction: you slide |
| `parking_lot` | Cars, cones | Many small cones |
| `cafeteria` | Round tables | Bouncy tables (higher restitution) |
| `ping_pong_hall` | Tables | One table drifts back and forth (moving obstacle) |

The server picks seed and theme at Start and sends the arena once in
`countdown`; snapshots carry positions only.

## Testing

Sidecar (`bun test` in `game-server/`), deterministic with a seeded RNG and
fixed `dt`:

- `sim`: touch passes; receiver frozen exactly 2 s; frozen player can't move
  or pass; holder 10% faster; boom eliminates holder; new potato after 2 s to
  a survivor; last standing ends early; time-out → all survivors win;
  disconnecting holder hands the potato on.
- Arena generator: same seed → same arena; property test over 500 seeds ×
  every theme × 3–12 players — connected, minimum gap, spawns clear, always
  returns.
- Sessions (fake clock, fake sockets): host-only start/close; 3–12 players;
  host handover; one session per office; lobby → … → lobby cycle; no
  outbound message contains the fuse.

Laravel (PHPUnit, `make test`): internal endpoints refuse a missing or wrong
secret and return 503 when it is unset; results are stored; the leaderboard
provider ranks correctly; invites go only to opted-in players of that office
and never to the host.

Manual: three browser windows on `make up` — open, join, start, pass, boom,
results, back to lobby, second game.

## Rollout

- Same single container; `docker-compose.yml` unchanged.
- Dockerfile: copy the Bun binary from a pinned `oven/bun:<version>-alpine`
  stage; build `game-server/` in the image; add the `hot-potato` supervisord
  program and the nginx `location`.
- Env: `HOT_POTATO_INTERNAL_SECRET` (both Laravel and the sidecar).
- Ships behind `game_types.is_active`, so it can be switched off without a
  deploy.

## Accepted limits

- Sessions live in memory; a container restart ends them.
- Identity is an honour system: anyone can pick any player.

## Out of scope

Buro integration, mobile play, audio, French, other arena games (sumo,
light cycles — the sim and session manager are written so a variant can
reuse them), arena shrinking, spectating from other offices.
