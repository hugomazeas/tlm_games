# Games Hub

Office gaming dashboard — a unified Laravel app to host multiple game trackers (archery, ping pong, and future games).

## Quick Start

```bash
make build && make up    # Build & start (accessible at http://localhost:8080)
make down                # Stop
make fresh               # Reset DB (migrate:fresh --seed)
make shell               # Shell into container
make logs                # Tail container logs
```

## Tech Stack

- **Laravel 12** with **PHP 8.3**
- **SQLite** database (no external DB needed)
- **Blade + Tailwind CDN + Alpine.js CDN** (no frontend build step)
- **Docker**: PHP-FPM Alpine + Nginx + Supervisor (single container)

## Makefile Commands

| Command | Description |
|---------|-------------|
| `make build` | Build Docker image |
| `make up` | Start container (detached) |
| `make down` | Stop container |
| `make restart` | Restart container |
| `make shell` | Open shell in container |
| `make logs` | Follow container logs |
| `make migrate` | Run migrations |
| `make seed` | Run seeders |
| `make fresh` | Fresh migration + seed |
| `make test` | Run tests |
| `make tinker` | Open Tinker REPL |
| `make status` | Show container status |

## Routes

```
GET  /                              Dashboard with game cards
GET  /players                       Player list + inline create form
POST /players                       Create player
GET  /players/{player}              Player detail + game stats
GET  /players/{player}/edit         Edit player form
PUT  /players/{player}              Update player
DELETE /players/{player}            Delete player
GET  /leaderboards                  All game types
GET  /leaderboards/{gameType:slug}  Per-game leaderboard (dynamic columns)
GET  /notifications                 Web push opt-in (pick your player, enable)
GET  /games/hot-potato              Hot potato: pick office + player, lobby, live game, the office's recent games
GET  /games/hot-potato/locker/{player}      Locker: a player's hot potato look (colour, hat, trail, boom; the potato is always a potato)
PUT  /games/hot-potato/locker/{player}      Save it (needs the profile claimed with a PIN and unlocked)
GET  /games/hot-potato/replays/{game}       Watch a finished game again (404 once its replay is pruned)
GET  /games/hot-potato/replays/{game}/data  The recording, gzipped JSON
GET  /games/typing                  Typing: solo 30s test + hub-wide race
POST /games/typing/tests            Issue a solo test (server picks the text)
POST /games/typing/tests/{test}/submit  Submit a solo test (server scores it)
GET  /games/typing/race             The open race, if any
POST /games/typing/race             Join the open race, or create one
POST /games/typing/race/{race}/leave|start|progress  Lobby actions and live progress
GET  /games/racing                  Racing: live lobby list (Join / Watch), tracks (Play opens a lobby), Free roam
GET  /games/racing/roam             Free roam: fly over the map, I identifies buildings (no race)
GET  /games/racing/tracks/create    Track editor, new track (2D map; the editor comes from the game server)
POST /games/racing/tracks           Save a new track (JSON from the editor)
GET  /games/racing/tracks/{track}/edit  Track editor on a track
PUT  /games/racing/tracks/{track}   Save a track's changes
DELETE /games/racing/tracks/{track} Delete a track
GET  /games/racing/tracks/{track}/play  Race a track in a lobby (?lobby= joins one, none opens one; ?player= drives as them)
GET  /games/racing/tracks/{track}/records  The track's records (JSON): each player's best time, the fastest lap
POST /games/racing/drivers          Add yourself as a player from the game's welcome screen (JSON)
GET  /games/office-fps              Office FPS: pick who's playing, then the one always-open game (?player= or ?guest=1)
GET  /games/office-fps/players/{player}  A player's office FPS stats (totals, records, weapons, rivals, recent matches)
GET  /games/racing/garage/{player}  Garage: paint a player's kart (body + accent)
PUT  /games/racing/garage/{player}  Save a player's kart colours
POST /push/hot-potato/subscribe     Opt a player's browser into "a hot potato opened" pushes
POST /push/hot-potato/unsubscribe   Opt out of those pushes
GET  /push/config                   VAPID public key + whether push is set up
POST /push/subscribe                Register a browser against a player
POST /push/unsubscribe              Unlink a browser from its player (the row stays while it has match alerts)
POST /push/status                   What the server holds for a browser endpoint (player, match alerts)
POST /push/test                     Send yourself a test notification
POST /push/match-starts/subscribe   Opt a browser (no player needed) into "match started" alerts
POST /push/match-starts/unsubscribe Opt a browser out of "match started" alerts
```

## Web Push

Livestream viewers can opt in from the watch page to a "match just started"
push (`SendMatchStartedNotificationJob`, queued from match creation and lobby
start). No player is needed for that.

**Setup:** `php artisan pingpong:vapid-keys` once per environment, put the pair
in `.env`. Rotating them invalidates every stored browser subscription.

## Architecture

### Game Module Pattern

Each game lives under `app/Games/{GameName}/` with its own:
- `Controllers/`, `Models/`, `Services/`
- `Providers/{Game}ServiceProvider.php`
- `routes.php`
- Views in `resources/views/games/{slug}/`
- Migration in `database/migrations/`

### LeaderboardProviderInterface

Games expose leaderboard data by implementing `App\Contracts\LeaderboardProviderInterface`:

```php
interface LeaderboardProviderInterface
{
    public function getGameTypeSlug(): string;
    public function getLeaderboard(): Collection;        // Returns ranked entries
    public function getPlayerStats(int $playerId): ?array; // Per-player stats
}
```

The game's ServiceProvider registers its provider with `LeaderboardService`:

```php
public function boot(): void
{
    $leaderboard = $this->app->make(LeaderboardService::class);
    $leaderboard->register(new ArcheryLeaderboardProvider());
}
```

### Adding a New Game Module

1. Create `app/Games/{Name}/` with Controllers, Models, Services, Providers
2. Implement `LeaderboardProviderInterface` in a provider class
3. Create a ServiceProvider that registers routes and the leaderboard provider
4. Add the ServiceProvider to `config/games.php` `modules` array
5. Set `is_active = true` on the corresponding `game_types` row
6. Add migration for game-specific tables in `database/migrations/`
7. Add views in `resources/views/games/{slug}/`

### Config

- `config/games.php` — lists game module ServiceProvider classes to auto-register
- `game_types` DB table — metadata for each game (icon, color, leaderboard column definitions)
- Leaderboard columns are defined as JSON on the `game_types` table and rendered dynamically

### Hot Potato (live game sidecar)

Spec: `docs/superpowers/specs/2026-10-07-hot-potato-design.md`. The one game
that is played live, in real time, rather than scored afterwards.

- **Two halves.** `app/Games/HotPotato/` is a normal module: the page
  (`/games/hot-potato`), results tables, `SurvivalsProvider`, the push opt-in,
  and `/internal/hot-potato/*` endpoints. `game-server/` is a Bun + TypeScript
  WebSocket server that runs the game itself, one in-memory session per office,
  20 ticks a second, server-authoritative.
- **It runs as the `hot-potato` compose service** (`oven/bun` image, mounted
  repo, `bun install --frozen-lockfile` then `bun game-server/src/server.ts`: the
  racing bundles need `three`), not inside the app image, so
  `deploy.sh` (pull + restart, never rebuild) ships it. nginx sends
  `/games/hot-potato/live/` to `games-hub-hot-potato:8090`; supervisord copies
  `docker/nginx/default.conf` from the repo at start for the same reason.
- **The sidecar never opens SQLite.** It looks players up and posts results
  through `/internal/hot-potato/*`, guarded by `HOT_POTATO_INTERNAL_SECRET`
  (`RequireInternalSecret`: 403 on a wrong secret, 503 when unset). Bun reads
  the same `.env` from its working directory, so the secret lives in one place.
- **No frontend build.** The sidecar bundles `game-server/src/client` with
  `Bun.build` at startup and serves `/games/hot-potato/live/client.js`; the
  Blade page loads it as a blocking classic script so `hotPotatoApp` exists
  before Alpine starts. Restarting the container ships client changes.
- **The fuse is secret.** It never leaves the server; clients only get a
  0–1 `shake` level. Keep it that way: `sessions.test.ts` checks it.
- `game-server/src/sim/` is pure (seeded RNG, no clock, no I/O) and shared by
  server and browser. Arena themes are data in `sim/themes.ts`: furniture,
  L/T/U walls (blocks sharing a `group`), movers and physics. Boost pads are
  generated per arena; items and their effects live in `sim/items.ts` + `sim/game.ts`. A theme can
  set a `centerpiece` (the boardroom's table), placed in the middle before anything else.
  Each obstacle carries its `look` (its theme's name for it) and is drawn as that by
  `client/obstacles.ts` (a desk with its monitor, a car, a rack with LEDs), inside its hitbox:
  a new name in a theme needs a drawing there (`obstacles.test.ts` checks).
- **Open tabs pick up a deploy on their own.** The bundle is stamped with a
  build id (`client/build.ts`); `welcome` carries the server's, and a tab on an
  older one reloads once it isn't mid-game, at most once per build, after fetching the
  bundle past every cache (`client/freshness.ts`; still old after that, it asks for a hard
  refresh). The pages load the bundles as `client.js?v=…` / `replay.js?v=…` (`BundleVersion`:
  from the game server's sources, so every deploy changes it), because Cloudflare rewrites
  the sidecar's `no-cache` into a 4-hour browser cache for `.js`.
- **AI players.** The host adds them in the lobby (`addBot` / `removeBot`, negative
  ids, up to the 12 seats; they count toward the 3-player minimum, so one person
  and two AIs is a solo game). They are never hosts and never reach Laravel:
  results keep only people. Each AI seat is a `TrainedPilot` (`game-server/src/ai/`)
  running a neural policy trained by self-play on this simulation, at the level the
  host picked (`addBot {level}`, `easy` when absent; the seat's `botLevel` shows as an
  "Easy AI" / "Hard AI" badge). Easy plays one policy (`ai/easy-policy.json`); Hard plays
  a stronger one with a memory (`hard-policy.json`) and its own King of the potato policy
  (`hard-king-policy.json`); a Killer hunter of either level plays `hunter-policy.json`,
  and an AI that takes the knife mid-game switches to it. They load at start-up; a
  missing or mismatched file turns off the levels that use it (`NO_BOTS`). The policies
  only know the rules they trained on: changing the sim (items, physics, arenas) or the
  observation means retraining. How to train and ship a policy:
  `game-server/src/ai/README.md`.
- **Infection** (`mode: 'infection'`): people only (3+, added AIs sit out: no policy was
  trained for it). A random patient zero (`infectedAtMs`) starts frozen; a touch infects, the
  infected move 10% faster, nobody is knocked out. If the last infected player leaves, a clean
  one becomes patient zero (same head start). Ends at the timer or at one clean player left; the clean win. Always the big 80 × 50 arena (`generateArena(…, { big })`).
  Results: `passes` = people infected, `holdMs` = time clean; its own leaderboard (`InfectionProvider`).
- **Portals** (every mode): a linked pair opens on open floor every 25–40 s (first at 20 s),
  lasts 12 s; stepping in one end puts you out of the other. AIs don't observe them (the
  observation's item list is fixed) until the policy is retrained.
- **Killer Potato** (`mode: 'killer'`): one of the seated (a person or an added AI), picked at
  random at the start, hunts (`hunterId` in the view and the results): they hold the potato all
  game, it has no fuse, and their touch knocks you out. Needs three seated. An AI hunter plays
  its level's hunter policy (`hunter-policy.json`, shared by both levels). If the hunter leaves with three or more left, someone else takes the knife
  (`newHunter`). Ends at one player left or at the timer. In Killer and Infection, a countdown
  leaver who leaves fewer than three calls the game off rather than hand someone a win.
- **Replays** (`src/replay.ts`): the session records what it broadcasts from a game's
  countdown to its results (snapshots are full state, so playback never re-simulates and
  survives sim changes). The sidecar posts the gzipped recording to
  `/internal/hot-potato/games/{id}/replay` after the results, then sends `replayReady`.
  Laravel keeps the newest `HOT_POTATO_REPLAYS_PER_OFFICE` (100) per office (`ReplayPruner`).
  The replay page loads `/games/hot-potato/live/replay.js` (`client/replay-page.ts`,
  `ReplayPlayer` in `client/replay-player.ts`), reusing the live renderer.
- **Looks** (`src/cosmetics.json`, the one catalogue: TS imports it, Laravel's `Cosmetics`
  reads it to validate): stored in `hot_potato_looks`, sent with the player by
  `/internal/hot-potato/players/{id}` (`PlayerInfo.look`), drawn by the renderer, kept in
  replays' rosters. AIs get a random one. Back on the hot potato tab after the locker, the page
  sends `refreshLook` (lobby only) so the sidecar fetches the player again.
- **Watchers and chat** (`src/chat.ts`, pure): the sidecar sends each office who's on its page
  without a seat (`watchers`: named once each, guests counted) and runs one chat room per
  office: messages from named people (5 per 10 s) and event lines it narrates (joins and leaves,
  a game's start and results, its replay; nothing mid-game), stored as data and worded by `client/describe.ts`.
  Lines go to `/internal/hot-potato/chat` in batches every 2 s (`hot_potato_chat_lines`, the
  newest 1 000 per office); after a restart an office's last 100 come back from
  `/internal/hot-potato/offices/{id}/chat`.
- Tests: `cd game-server && bun test` (sim, arenas, sessions);
  `bun run typecheck`; `bun run format`. Laravel side: `tests/Feature/HotPotatoTest.php`.

### Office FPS (in progress, `game-server/src/fps/`)

Minis (40 cm) with guns, staplers and jetpacks in the office (3rd floor), server-authoritative.
Playable at `/games/office-fps`.

- **In the Hub:** `app/Games/OfficeFps/` serves the game page: without `?player=` / `?guest=1` it
  asks who's playing (and shows who's in, from the game server's `/games/office-fps/live/state`),
  with them it loads `play.js?v=…` (`BundleVersion`) with `window.officeFpsConfig`.
- **Stats:** when a match ends the game server posts it to `/internal/office-fps/results`
  (`OfficeFpsInternalController`, the shared secret): `office_fps_matches` (rules, size),
  `office_fps_results` (one row per Hub player: place, kills, deaths, headshots, damage, shots,
  hits, melee kills, backstabs, best streak, time played, left, won, team, zone time, pickups)
  and `office_fps_kills` (who killed whom with what; a guest's side null). Matches carry their
  `mode`. `OfficeFpsStats` adds them up: the leaderboard (mode
  `kills`: kills, K/D, wins, matches, accuracy; also the home card's podium and the player
  profile's line) and each player's page `/games/office-fps/players/{player}` (totals and rates,
  records, per weapon, per mode, nemesis and favourite target, recent matches). The `game_types` and
  `game_modes` rows come from migrations (deploys don't seed).
- **Host and rules:** no match starts by itself. Everyone warms up until the host (the longest
  seated; it passes on when they leave) picks a mode, a limit and a length (`Rules`: `MODES`,
  `FRAG_LIMITS`, `MATCH_MINUTES`) on their Esc menu and sends `start`; after the scoreboard
  (12 s, with awards) it's warmup again.
- **Modes** (`lobby.ts`): `ffa` free-for-all; `tdm` red vs blue (shuffled at the start, a
  latecomer joins the smaller side, no friendly fire, spawns away from enemies only, first team
  to the limit); `koth` King of the meeting room: one of four `ZONES` (`sim/places.ts`) is live,
  moving every `ZONE_MS` (60 s); alone in it you score a second a second (`points`), contested
  scores nobody; the limit is ×`ZONE_SECONDS_PER_POINT` seconds, else most zone time at the
  end. Snapshots carry `zone`; the HUD shows a status line and an on-screen marker (`showZone`).
  `siege` Siege (red vs blue like `tdm`, `isTeamMode`): one of `SIEGE_SPOTS` (`sim/places.ts`: the
  middle room, the closed office, the meeting room, the ping-pong lounge) is rolled per match and
  played two halves (`SIEGE`: 45 s head start, then 5 min; the host's minutes don't apply). Each
  half the defenders spawn anywhere in the spot but its middle (`spotSpawns`: the outer ring of a
  5 × 5 grid; the arena picks one where a mini fits) and build while the attackers wait in their
  dome (`domeSpawns`, at the far end on foot: `world.dome`, a half sphere `collideCapsule` keeps
  bodies on their side of and `rayHit`/`rayStop` stop at, both ways; the arena also ignores targets
  across it, since hit boxes poke through). Then an attacker who stays `SIEGE.holdMs` in the spot
  (a `SPOT_SIDE` 1.5 m square squared to the office, `SPOT_HEIGHT` 1.2 m up (two walls; feet below
  its top count), `inSpot`; defenders in it don't block; leaving
  or dying starts over) scores a point for their side
  (`captured` event, `Score.points`) and respawns in the dome. A half ends at the limit
  (`fragLimit` points) or its time; the sides swap and the walls go (`respawnAll`). Most points
  wins, the faster to them on a tie (`siegeWinner`); the second half ends early once it can't change
  that. The sides stay even with the attackers taking the odd one (2 v 1 is two attacking:
  `rebalance`, on joins, leaves and each half's start; the last in on the bigger side moves, a
  `switched` event, back at once on their new side). Only defenders build, never within
  `SIEGE.noBuild` of the dome (`siegeForbidsBuild`, also checked in the browser). `MatchView.siege` (spot, half, attackers, dome, points, times), snapshots'
  `holds` (each attacker's stay); the browser puts the dome in its world for prediction
  (`syncDome`) and draws it (`DomeView`) and the spot (`ZoneView` over `SIEGE_SPOTS`). Laravel
  stores the mode and the sides; a player's points aren't stored yet.
- **Pickups** (`sim/places.ts`: `PICKUP_SPOTS`, `PICKUPS` and each power's numbers; collected in
  `arena.ts`, part of `FpsWorld` so test rooms have none). What lies on a spot is rolled
  (`rollPickup`, `PICKUP_WEIGHTS`: the basics most) at each match and each time it comes back; a
  Promotion only on `roomy` spots (a giant fits: `places.test.ts`), no power on two spots at once; a
  test room's spot may fix its `kind`. Snapshots send each spot's kind (null: taken), the `pickup`
  event its `kind`. Kinds: health (+50, only when hurt), big
  magazine (×1.5, 60 s), jetpack extender (fuel ×4, 60 s), headshot rounds (any headshot kills,
  a giant and a firewall too, 30 s), and the office powers: **Overtime** (walk ×0.6, no jetpack or
  dodge, +100 health, never reloads, 30 s), **Promotion** (3× the size, 500 health, walk ×0.8,
  20 s), **Firewall** (soaks the next 75 damage, ≤30 s), **Espresso** (walk ×1.6, dodge cooldown
  halved, 20 s), **Intern** (half size, 60 health, 30 s), **Bonus** (double damage, 15 s), **Org
  chart** (everyone shows through walls, to you, 15 s). Opposites end each other (Overtime /
  Espresso, Promotion / Intern). Powers that change how you move live in the `Body`
  (`jetBoost`, `overtime`, `espresso`, `big`, `small`: steps left), so `stepBody` runs them and your
  browser predicts them; the rest are the fighter's. Size (`scaleOf`, `sizeAt`) scales the collision
  capsule, the eyes (`eyeOf`), the hit capsule (`Target.scale` in `rayCapsule`, the rewind keeps
  it), the stapler's reach and the avatar; an Intern grows back only where a mini fits. Full health
  is `maxHealthOf` (from the body, or from a player's buffs via `powersOf`). All lost on death and
  shown to everyone (`PlayerState.buffs`: a halo, the firewall's cage, the size, icons on the target
  label, a kill-feed line on `pickup`; your own buffs carry the firewall's `points`).
- **Jump pads and portals** (`PADS`, `PORTALS` in `sim/places.ts`, in `FpsWorld`; drawn by
  `PadViews` / `PortalViews` in `client/pickups.ts`): standing on a pad throws you about 2 m up, no
  fuel; a portal (in pairs: 0 ↔ 1, the kitchen ↔ the far end of office 2) puts you out of its
  partner on its `out` side, moving as you were, and none takes you again for a second. Both are in
  `stepBody`, so they're predicted; `places.test.ts` keeps them on open floor (giant-sized at the
  portals' exits and the big powers' spots) and clear of spawns and pickups.
- **Callouts** (`client/callouts.ts`, pure): kill events carry `killerStreak`, `victimStreak`,
  `firstBlood`; `announce` turns them into feed lines and your banner (double kill … shutdown),
  `taunt` the line under "Fragged by". Awards (`awardsFor` in `lobby.ts`) show on the scoreboard.
- **Weapons:** a loadout (`Loadout`: a primary, rifle / sniper / shotgun, and a secondary,
  pistol / launcher; rifle + pistol by default), picked on the Esc menu, remembered in the
  browser (`officeFps.loadout`), sent with `hello` and as `loadout`; it applies at the next spawn
  (at once while still spawn-shielded). Slots 1 primary, 2 secondary, 3 stapler (the wheel, Q the
  last), the slot sent in each frame (the 8th element); a switch takes `SWITCH_MS`, and each gun
  keeps its rounds while holstered. Guns are data (`GUNS`, `LAUNCHER` in `sim/combat.ts`):
  damage, headshot ×, cadence, auto or a click a shot (a click is kept until the gun can use
  it), magazine, reload, pellets, range, falloff, spread (hip / aiming via `BUTTON.aim` / moving /
  in the air) and aiming field of view (the sniper's scope: 14°, a scope overlay). Spread is
  seeded by the frame (`spreadDirection`), so your tracers land where the server's rounds do.
  The launcher fires a rocket the arena flies each step (`rockets` in snapshots; `launch` and
  `explode` events): splash with falloff behind cover-checks, knockback (rocket jumps), half
  damage to yourself, and a self-kill counts for nobody (`killer: null`). Kills name the gun;
  Laravel keeps `blaster` for older matches (`OfficeFpsKill::RETIRED_WEAPONS`). The stapler
  (`swingStapler`): 0.45 m reach in a ~35° cone, 50 damage, 100 from behind (a backstab), a
  swing every 0.55 s; `swing` events, kills carry `weapon` and `backstab`.
- **Your gun in your hands** (`client/viewmodel.ts`, models in `client/guns.ts`): drawn in its own
  little scene with its own light after the world, over a cleared depth (`Viewmodel.render`), so it
  never sinks into walls. Each gun is data plus an `animate` that poses its moving parts and says
  where the gloved hands go (`HandPoses`, keyframed with `keyed` on the reload's 0–1 progress; the
  sleeves run from fixed elbows); static parts are merged per material. Spent cases fly from
  `eject`; reloads swing the gun up and round (`reloadPose`) so the hands' work shows.
- **Finishes** (`client/finish.ts`, `applyFinish`): what the guns, gloves and troopers are made
  of, made in the shader from each part's own coordinates (no textures): brushed `metal`,
  `parkerized` mottle, stippled `polymer` and `rubber`, `cloth`, chipped `paint`, smudged
  `polished`; worn edges come from each face's UVs (round parts' UVs are flattened in `placed`,
  so a barrel's seam doesn't show as wear), and detail finer than a pixel fades out. A kit's
  materials get theirs in `kitFor` (`FINISHES`). The troopers' visors reflect the office glass's
  map (`AvatarsOptions.reflections`).
- **Others' troopers** (`client/avatars.ts`): they hold the same gun models (`buildGuns`, at
  `GUN_SCALE`), animated by the same `animate`, the arms stretched to where it puts the hands, so a
  reload plays as in yours: `PlayerState.reload` (0–1) and `aiming` come from the server, the reload
  run smoothly on this browser's clock (`reloadStart`). The gun sits at the chest, comes to the eye
  aiming, dips on a switch, drops in a dodge; shots and launches kick it, flash and throw cases
  (`fire`). Hits rock them away from the shooter, the head back on a headshot (`hit`); killed, they
  fall that way, drop their gun and sink away before the respawn. Each has a soft contact shadow
  (a blob, `BLOB`) on whatever is under them (`AvatarsOptions.groundBelow`: a ray down in `main.ts`),
  fainter the higher they are: the office's shadow map is drawn once, so players cast none.
- **Gun lab** (`bun run fps:guns`, http://localhost:8097, `FPS_LAB_PORT`): the viewmodel alone on a
  page (`client/gun-lab.ts`, served by `fps/gun-lab.ts`): pick a weapon, fire, reload, aim, scrub a
  reload frame by frame, slow time, turn the gun round (inspect). It rebuilds and reloads itself
  when a file under `src/fps` is saved, keeping its state in the URL's hash (`#gun=rifle&t=0.42`),
  so `tools/aerial/shot.mjs` can render stills of it (`… http://localhost:8097 900 600 out.png
  "gun=sniper&view=inspect&speed=0"`; shot.mjs hides everything but the canvas, panel included).
  **Debug mode** (the panel's checkbox, `debug=1`): a target mini at a set distance (its hit capsule,
  head band in gold, the mini inside) on a 10 cm grid, the crosshair on its head or body; the cone
  as a circle round the crosshair (in 3D when inspecting); each round drawn and dotted where it
  stops, with a tally; and the numbers (spread by hip/aim/moving/air, hit chance, damage and
  falloff graph, pulls and time to kill, rate, live state, fps and draws). The numbers come from
  `client/gun-debug.ts` (pure, tested), which fires through `combat.ts`'s own seeded spread and
  `rayCapsule`, so they are what the server would judge.
- **Impacts** (`client/impacts.ts`): where the server says a round stopped on the office (the shot
  event's ends, cast again with `rayHit`), a hole (a crack in glass and screens) that stays and what
  flies off by what it hit: dust and chips, splinters, paper off desks, sparks off metal, shards off
  glass; a rocket leaves a scorch. What a triangle is made of comes from the browser's build
  (`buildOffice` passes `surfaces: true`: `collision.solid.userData.surfaces`, indexing `SURFACES`
  in office.js, by material); the collision itself is the same with or without (a test checks).
  Everything is a few fixed instanced pools, never a mesh per bit.
- **Stats** (top left, `hud.stats`): frames a second and the ping (a frame sent → the snapshot
  acknowledging it, smoothed), green / yellow / red.
- **Performance overlay** (`client/perf.ts`, Esc → Settings → Performance overlay, under the stats):
  a frame-time graph, fps / 95% / worst / 1% low, hitches (≥ 50 ms, flagged when a shader compiled
  that frame), CPU per section (`sim`, `scene`, `hud`, `render`, timed in `main.ts`), the GPU's own
  time (`GpuTimer`, EXT_disjoint_timer_query_webgl2, when the browser has it) and what bounds the
  frame (`bottleneck`), draw calls / triangles / shaders over the whole frame (`renderer.info`
  reset per frame), the resolution drawn and the graphics card, JS heap, network rates, and the
  mouse. GPU-bound: the **Resolution** setting draws a share (50–100%) of the full pixel ratio.
  The overlay judges the CPU on the game's code only: `render` includes waiting for the GPU.
- **GPU budget:** the cost is lighting each pixel, not triangles or textures. The office has no
  `scene.environment` (room reflections were ~half the GPU's work at 5.5 MP): an AmbientLight
  stands in, and only the glass keeps a reflection map. Don't give the scene an environment back.
- **Baked light** (`map/light.ts`, `map/office-light.b64`, browser side `client/office-light.ts`):
  what makes the office look real, for one 3D texture read a pixel (no difference measurable in
  software GL; not yet checked on a real GPU with the overlay). A grid of 12.5 cm cells over the office holds
  the ambient light reaching each point and from where (`a + b·n` for a surface facing `n`): the
  ceiling panels with their shadows, the sky through the windows, one bounce off what's around (by
  `ALBEDO` per surface). The lit materials' ambient and sky light is multiplied by it (`patch`: one
  3D texture read a pixel), so corners, under desks, behind sofas and round chair feet come out
  darker; the troopers (`AvatarsOptions.dress`), built walls and pickups too; the gun in your hands
  dims with the light at your eye (`Viewmodel.shade`). The sun stays a real light (`BAKED` levels in
  office.js; without `opts.lighting` buildOffice keeps the old flat light). **Change the office's
  shapes → `bun run fps:light`** (~2.5 min on every core) and commit `office-light.b64`:
  `light.test.ts` fails on a stale bake (a fingerprint of the collision triangles). `--reuse`
  re-finishes the last bake's rays (kept in the temp folder) to tune `RADIANCE`, the blur or the
  scale in seconds. It's base64 of gzipped, delta-coded bytes (~540 KB), inlined in `play.js`.
  Tone mapping is **Neutral** at exposure 0.9 (game and gun lab): ACES clipped the white walls into
  one glare; whites are real paint (~70%), so textures' own noise now shows (keep it faint). **Anti-aliasing** (MSAA, ~a third of
  the rest) is a setting, applied on the next load. The sky has `renderOrder` 1 (drawn after the
  office, shaded only where it shows).
- **Shader warm-up** (`warmShaders` in `main.ts`, `Viewmodel.prepare`): at load, effects go off
  under the floor and every hidden object is shown for `compileAsync` (frames skipped meanwhile),
  then textures are uploaded (`initTexture`); a compile on Windows stalls 50–200 ms. Shaders die
  with their last material: a hidden stand-in trooper (`STAND_IN` in `avatars.ts`) and pickup
  models stay for good, and `Effects` never disposes its materials. Something new drawn with a new
  kind of material: make sure the warm-up meets it (show it hidden, or set it off under the floor).
- **Building** (`sim/walls.ts`, `sim/building.ts`, drawn by `client/building.ts`): B toggles build
  mode (the gun put away: no fire, reload or aim goes out), a click puts up a wall, R turns it a
  quarter, the wheel lays it flat or stands it up, E takes back one of yours, 1/2/3/Q back to the
  guns. A wall is a 0.6 m panel, 6 cm thick, squared to the office (`axis`: its normal, x/z standing,
  y flat), 1050 health, within 1 m of the eyes, one every second
  (the reload's ring by the crosshair fills meanwhile, counted from the click); no limit per player, `BUILD.max` (120) on the map (past it the builder's
  oldest goes). `buildSlot` (shared): aimed at a built wall, the new one locks on to the edge nearest
  the crosshair, in line with it or turned a quarter on your side (corners, roofs); anywhere else it
  goes where the crosshair is, set out of the surface. Never in mid air: a wall must touch the floor,
  the office (walls, glass, furniture) or a built wall within `SUPPORT_REACH` (`supported`; the ghost
  shows red otherwise). The browser sends the slot (`build`), the
  arena checks reach (from the eyes, with `BUILD.slack`), that it's free, supported and the pace. Walls live in the world
  (`FpsWorld.walls`, each lobby its own): `collideCapsule` (upright capsules: a wall put on a player
  pushes them out), `rayHit`/`rayStop`/`rayDistance` (shots, rockets ×5.5 `ROCKET_WALL_FACTOR`: two take one down, cover, name tags, the
  third-person camera) all meet them. Events `built` / `wallHit` / `wallGone` / `walls` (a new match
  wipes them; a leaver's stay up, nobody's: `by` and `team` null, so no one, their side or their
  next connection included, takes them back or works their doors), the list in `welcome`. Hits on them leave no hole (it would
  hang in the air once the wall is down). **Doors and windows** (`WallState.kind`): in build mode F
  makes a standing plain wall a door, G a window (a 12 cm slit at a mini's eye height: seen and shot
  through, not walked through); neither turns back. F opens and shuts a door any time (`open`): the
  one under the crosshair, else the nearest of your side's within `doorReach` (0.5 m; an open door leaves
  little to aim at), with an "F Open / Close door" prompt under the crosshair. Only the builder, or
  their side in team deathmatch, may (`Arena.usable`). A wall is then a few boxes (`partsOf`: posts,
  lintel, leaf, the open leaf swung a quarter out and as solid; or the panel round the slit), a
  wall's box encloses them all; the leaf swings on its hinge in the browser (`WallViews.update`).
  `reshape` / `door` messages, `wallChanged` events.
- **Mouse spikes** (`MouseFilter` in `client/controls.ts`): Chrome under pointer lock now and then
  reports one huge bogus movement (a sudden half turn). The lock asks for raw input
  (`unadjustedMovement`, falling back to a plain lock), and a movement far bigger than the last
  few is held one event: applied with the next if that carries on the same way (a real flick,
  which at 40 fps can start that suddenly), thrown away otherwise.
- **Settings** (`client/settings.ts`, in this browser): sensitivity, aiming sensitivity, field
  of view, invert Y, sound volume, on the Esc menu.
- **Sound** (`client/sounds.ts`): every effect synthesized with Web Audio (oscillator sweeps and
  filtered noise, no files), unlocked by the click that takes the mouse. Others' shots and
  swings are panned and faded by `spatial()`. Reloads: `SelfState.reloadLeftMs` drives the ring
  by the crosshair (`reloadProgress`) and each gun's own reload animation.
  Headshots: gold "HEADSHOT" by the crosshair when you land one, red across the screen with a
  flash when you take one.
- **In the game server:** `fps/live.ts` (the one `FpsLobby`, players looked up with
  `findPlayer`, ticked every 4 ms: steps run on their own 60 Hz clock), `fps/serve.ts` (the
  bundle), wired into `server.ts` at `/games/office-fps/live/ws`; nginx proxies the prefix to the
  game server like racing's.
- **The browser** (`fps/client/`): builds the office with `buildOffice` and collides with that
  same build (`worldFrom`). `prediction.ts` applies each frame at once and replays the
  unacknowledged ones on every snapshot (small corrections glide, a respawn jumps);
  `timeline.ts` draws the others 4 steps (67 ms) in the past between snapshots, and that step
  is each frame's `view`. Your shot's tracer is drawn at once; the server's event only adds the
  hit marker. A hidden tab sends one idle frame first (the server repeats your last frame).
- **Jump and prone** (`stepBody`, predicted like everything in the body): Space pressed on the
  ground jumps 35 cm (`MOVE.jump`; a fresh press: `Body.spaceHeld`, so holding it on landing doesn't
  hop again); held past the jump's top (`Body.jumped` clears there), or pressed in the air, the
  jetpack burns (`jetBurns`). Hold C to lie prone (`BUTTON.prone`, `PRONE`): a 16 cm capsule, eyes
  11 cm up, crawling at 0.6 m/s, spread ×0.6, no jump, dodge or jetpack; up again once C is let go,
  only where a standing mini fits. Prone, the hit capsule lies along where they face (`rayCapsule`
  with `Target.prone` and `yaw`: their length, thin, the head end for headshots), and their trooper
  lies face down over it (`Avatars`, `down`). C, not Ctrl: Chrome closes the tab on Ctrl+W. While
  playing, closing or reloading asks first (`beforeunload`), and in the page's fullscreen W, S and D
  are keyboard-locked so Ctrl+W/S/D reach the game (`guardShortcuts`).
- **Controls:** WASD walk, Space jump / jetpack, C prone, Shift + a direction (either order: the key that
  completes the pair fires it) dodges (`BUTTON.dash`: a 5 m/s burst for 12 steps that way,
  20% fuel, 1.5 s cooldown; walking is 2 m/s, kept slow enough to track a 24 cm mini, in `stepBody` so it's predicted and checked), click fires,
  right-click aims (the gun's zoom, mouse slowed to match, the gun on its sights), V
  first/third person.
- **Health comes back** (`REGEN` in `sim/combat.ts`, `Arena.regenerate`): 3 s after it last went
  down, 10 a second, up to 80 (never past full). Health is sent rounded up. Under 50 the screen's
  edges bleed (`.blood` in `hud.ts`, `LOW_HEALTH`), under 30 with a heartbeat and the health blinking.
  The blood is pixel blocks (`bloodCells`, `BLOOD`): a 64-wide canvas stretched with hard edges,
  drawn again only when it creeps a step; the heartbeat and the blink animate opacity only. Keep
  full-screen HUD layers cheap: no big blurs or gradients repainted, no `backdrop-filter` (it
  re-blurs the canvas under it every frame).
- **Crosshair:** four ticks on the hip-fire cone (`spreadOf` through the camera's field of view,
  `hud.spread`): wider walking and in the air, gone while aiming. Shots are judged from the eyes,
  but every tracer is drawn from a muzzle: yours from the viewmodel's, others' from their trooper's
  gun (`Avatars.muzzleOf`); the gun lab's 3D cone runs from the muzzle to the circle at the target.
- **Feedback:** shot events carry the `damage` they did (0 on a spawn shield). Your hits: a
  marker (gold on a headshot), the number where it landed, a big red marker and "Eliminated"
  on a kill. Hits on you: a red arc toward the shooter. Names and health show only over the
  player under your crosshair (`client/targeting.ts`: nearest the view's centre within a body's
  width, not through walls); `PlayerState.health` is sent for it. Going down, the death screen
  shows a recap under "Fragged by" (`deathRecap` in `hud.ts`): the kill event's `recap`
  (`KillRecap`, built by `Arena.recap` from each fighter's `taken` this life) gives the distance,
  the killer's health, rounds left and powers, their hits and damage on you, the time it took, and
  damage from others.

- **The map** (`fps/map/office.js`, typed by `office.d.ts`; brought over from `~/office-map`,
  this copy is the source): `buildOfficeGeometry()` runs anywhere (no DOM) and gives the exact
  collision triangles with their BVH (`three-mesh-bvh`), coarse colliders, doors, spawn points;
  `buildOffice(scene, renderer)` adds the browser's canvas textures, sky, sun and baking on top.
  Both place everything from the same seeded random numbers: keep anything that calls `R()` in
  the geometry, never in the materials, or the server's collision drifts from what's drawn.
- **Sim** (`fps/sim/`, pure): `movement.ts` steps a body at 60 Hz (collision sub-steps by speed,
  `SUBSTEP_REACH` of the radius each: one walking, up to 8 falling; collision is most of the
  server's time, so keep `collideCapsule` allocation-free; walk/run/jetpack tuning at the top),
  shared with the browser for prediction; `combat.ts` has
  the guns and hitscan (walls and glass stop shots, headshots on the top of the capsule, which
  shots take `HITBOX_SCALE` 1.25× wider than it collides);
  `arena.ts` runs everyone: one input frame per step (the last one repeated, without firing,
  when none came), shots judged where the shooter saw the target (up to 200 ms back), respawns
  at the spawn point furthest from everyone with a short shield.
- **One game** (`fps/lobby.ts`, pure, like racing's lobbies): always open, everyone who connects
  is in it. Warmup until the host starts a match (a countdown, the match, a scoreboard, warmup
  again). Joining mid-match drops you straight in at 0; who
  leaves keeps their kills in the results; rejoining the same match gets your score back; a
  second tab of the same player replaces the first; past 12 seated you watch until a seat frees.
  Fewer than two calls a match off. Results (people only) go out through `onResults`.
- **Protocol** (`fps/protocol.ts`): input frames as arrays `[seq, forward, strafe, yaw, pitch,
  buttons, view]`, each sent as soon as it's made; snapshots at 30 Hz with your full state and
  `ack` (your last frame used). The server uses every frame of yours that has arrived each step
  (never a queue: that once held input 500 ms behind), within a budget of one a step banked up to
  `MAX_BURST` (no faster than real time), and the guns' timings run on your frames' clock;
  no frames for 0.5 s and gravity takes over.
  A snapshot's `players` lists everyone seated, you included: draw others from it, yourself
  from your prediction.
- `fps/map/office.js` no longer carries the viewer's `collideCapsule`/`createCapsulePlayer`
  (they live in `fps/sim/`), so it isn't a drop-in for `~/office-map/office.html`.
- Tests: `bun test src/fps` (the office builds without a DOM, spawns are clear, nobody tunnels
  out in 20 s of wild flying; matches run in `sim/testing.ts`'s open test room; prediction and
  interpolation in `client/client.test.ts`). Laravel side: `tests/Feature/OfficeFpsTest.php`.

### Racing map (POC, `game-server/src/race/`)

A kart racing game on a 3D city map of Québec (Plains of Abraham to Old Québec),
built from OpenStreetMap and federal elevation data, drawn with Three.js.

- **In the Hub:** `app/Games/Racing/` keeps tracks (`racing_tracks`: name, laps,
  checkpoints as lat/lon JSON, lap length) and serves three pages: the track list,
  the 2D track editor and the play page. The editor and the game are bundles from the
  game server (`game-server/src/race/serve.ts`: `play.js`, `editor.js`, `map.json`
  under `/games/racing/live/`, proxied by nginx to the hot-potato container like hot
  potato's client; restart it to ship client changes). Pages hand them a config
  (`window.racingConfig`, `window.trackEditorConfig`). `RacingTrackSeeder` adds the
  default tracks from `game-server/maps/<map>/courses/*.json` when missing.
  `RacingTrack::MAPS` must match `MAPS` in `map/pipeline.ts` (a test checks).
- **Lobbies** (`race/lobbies.ts`, pure; `race/live.ts` wires it to the socket at
  `/games/racing/live/ws` and the list at `/games/racing/live/lobbies`, which the track
  list polls). Play joins the lobby already on that track (one getting ready first, else
  one racing, to watch) or opens one; up to 8, the host starts, late joiners watch
  (camera on the leader) and race the next one. The host's Close lobby, or Close on the
  Hub's list (`POST /games/racing/live/lobbies/{id}/close`, open to anyone like deleting
  a track), ends a lobby for everyone. A dropped socket reconnects to the same lobby. Each tab
  drives its own kart and sends poses at 20 Hz plus every physics step while racing
  (`client/lobby.ts`); the server re-runs `drive/laps.ts` over those steps on the tab's
  step clock, refusing clocks ahead of real time and jumps that gain ground (only R
  back to the last checkpoint passes). Race over when all are in, or 30 s after the
  winner (DNF). Results go to `/internal/racing/*` (`RacingInternalController`, same
  `HOT_POTATO_INTERNAL_SECRET`: racing lobbies need it set too) → `racing_results`.
  No kart-to-kart collisions; a reconnect mid-race comes back as a watcher.
- **Keys:** racing is drive-only (W/S, steer with the mouse or A/D, left click or Space/Shift
  drift, right click or E nitro, R back on track). Mouse steering (`drive.ts`, default; Options
  can switch to keyboard only, `racing.steering` in localStorage): the cursor's offset from the
  screen's middle is the steer, A/D win while held, a bar over the speedometer shows it. The
  nitro (`kart.ts`: `NITRO_CHARGE` 15 s, `NITRO_KICK` +20 km/h on the current speed, and every
  limit 20 higher for 2.5 s, so it stacks with a drift or pad boost: ~190 km/h) shows as the speedometer's outer ring and a blue
  flame; R starts its charge over. Flying
  and I (identify) are free roam's (`/games/racing/roam`). The standalone viewer keeps both (F).
- **Drivers:** the track list's "Driving as" picker (remembered in localStorage) adds
  `?player=` to Play; `RacingKart::lookOf()` gives the game their name and garage
  colours (`racing_karts`), or a guest's.
- **Welcome screen** (`client/welcome.ts`), for colleagues opening a shared lobby link: on a
  browser's first race (no `racing_welcomed` in localStorage) the game opens it before joining
  the lobby. Pick yourself from `RacingKart::drivers()` (or add yourself: `POST
  /games/racing/drivers`, or race as a guest), paint the kart (saved through the garage's PUT)
  while the camera circles it on the start line (`driver.showcase`), read Controls / Rules /
  Options (graphics). Ready remembers the choice (`racing_player`, shared with the track list)
  and joins. "Driver & kart" reopens it (a change reloads into the same lobby as the new
  driver); "?" opens only the guide. The kart (`client/kart.ts`) is painted body
  (chassis, nose, pods) + accent (wings, suit, helmet stripe) in clear-coated paint reflecting
  the race's sky (`setKartEnvironment`, rendered by the atmosphere per sky; the garage uses a
  studio), carbon floor, wings with endplates, engine with fins and glowing exhaust tips, a roll
  hoop; wheels with tread, rims, brake discs that glow after hard braking, callipers, wishbones
  and coil springs. Static parts are merged per material (one draw each). The livery
  (`race/livery.ts`, `racing_karts.number/pattern/stickers/sponsor`, edited in the welcome
  screen): race number on the pods and nose, a pattern (stripes, flames, maple, checker,
  lightning), stickers, and a sponsor of up to 10 characters on the rear wing (the dépanneur's
  by default). The viewer tries one with `?livery=7,flames` and circles the kart with
  `?showcase[=angle]`. The driver's arms really turn the wheel, the head leans and glances
  back, and they punch the air on an overtake or at the finish. Name tag over other drivers'
  karts (not your own). It rides on springs (squat, dive, roll, landing bounce), brake lights
  glow when slowing, exhausts pop when lifting off.
- **Cinema** (`client/cinema.ts`): the countdown is a drone flying the whole lap, start line to
  start line (`introFor`: ~140 m/s, 6–14 s; higher over a long lap), then 3-2-1. The lobby
  works it out per track (`countdownFor`) and sends it in `countdown.seconds`; the client's
  trial counts that (`startTrial(intro)`). Every racing frame of every kart is
  kept 8 s; crossing the line replays your last 6 s at half speed from trackside cameras
  (letterbox, REPLAY), then when the race ends the top three stand on a podium at the start
  line with confetti. Any key skips or leaves. `client/effects.ts` gives every
  kart (yours and the lobby's) its dust, spray, drift smoke and sparks, skid marks, splashes,
  wall sparks, landing dust, boost fire and exhaust puffs, from two fixed particle pools (fewer
  alive on Low); plus speed lines near top speed and confetti at your finish.
- **Standalone viewer:** `bun run race:viewer` on http://localhost:8091 (`RACE_POC_PORT`
  to change it), free roam and landmark work (click, WASD, I identifies the building under
  the crosshair). A view link `#lat,lon,altitude,heading,pitch[,fov]` takes an optional
  vertical field of view, to line up with a photo's lens.

- **Layers, one direction.** `maps/<slug>/snapshot/` (raw data, gzipped, committed: OSM,
  elevation, the city's trees, the lidar heights) plus hand-made `landmarks/*.json`,
  `decor/*.json` and `looks.json` build `maps/<slug>/map.json`. **Never edit `map.json`**;
  `pipeline.test.ts` fails if it differs from what they build.
- **`bun run race:map`** rebuilds offline in seconds. `--refresh` downloads fresh OSM and
  the city's trees into the snapshot, `--refresh-elevation` elevation too (~10 min, flaky
  service, retries), `--refresh-trees` only the trees, `--refresh-lidar` only the lidar
  (an hour: a slow server whose firewall refuses more than ~5 ranges a request).
  Refreshes are deliberate: review the diff, commit snapshot and map together. Area,
  grid and lidar sheets live in `MAPS` (`map/pipeline.ts`).
- **Lidar** (`map/lidar.ts`, MRNF "Produits dérivés du lidar", CC BY 4.0): heights above
  the ground every metre (roofs, crowns), kept as a 2 m byte grid (`snapshot/lidar.bin.gz`).
  The build takes each building's height from it (median over the footprint, away from
  the walls), fits gable and hip roofs where the heights pitch, and finds tree crowns.
  Only sheet 21L14SE is fetched: the westmost 180 m (in 21L14SO) keep OSM's guesses.
- **Trees** (`map/trees.ts`): the city's inventory (`Arbres répertoriés`, CC BY 4.0: species,
  trunk diameter) sizes and shapes them (broadleaf, conifer, columnar, ornamental,
  purple-leaved); lidar crowns take their measured size, and add the trees nobody
  inventoried (yards, the Plains); OSM trees fill in outside the survey; woods outside it
  are filled. `client/trees.ts` draws them instanced, in 500 m tiles, rougher far away.
- **Decor** (`map/decor.ts`, `decor.schema.json`): fountains, statues (standing, horseback,
  bust, seated), structures of boxes/cylinders/cones/spheres/pyramids, hedges, fences
  and walls, lamps, trees (points, rows, groves), flowerbeds, paint (lawn, paving, gravel,
  water, soil), benches, umbrellas, flags. OSM gives the basics city-wide (statue nodes,
  fountains, hedges, flowerbeds, tree rows); a file in `decor/` places a spot's detail in
  lat/lon and lists the OSM elements it `replaces`. All expand to plain shapes in
  map.json; solid ones (pools, plinths, stone walls) collide.
- **Looks** (`map/looks.ts`, `looks.schema.json`): ordinary buildings' wall and roof colours,
  material, windows and glass, keyed `way/123`, sampled from aerial photos and checked by
  eye. Every building is drawn by `client/landmarks.ts` in a few shared meshes: walls per
  window style (`punched`, `square`, `arched`, `ribbon`, `curtain`) with wall and glass
  colours per vertex and a faint material (`brick`, `stone`, `concrete`, `siding`; red-brown
  walls default to brick), and one mesh for everything solid.
- **OSM says where, landmarks say how it looks.** A landmark file is keyed by OSM
  element (`osm` + `id`: ways and relations share numbers), placed in lat/lon, and
  only changes looks; collision stays the OSM footprint. Schema:
  `maps/landmark.schema.json`; `parseLandmark` is authoritative and rejects unknown keys.
- **Fingerprints catch drift.** Each landmark records the footprint it was made
  against. After a refresh, the build refuses to write the map while a landmark
  is orphaned (element gone: fix the id or delete the file) or stale (footprint
  moved > 5 m or changed > 10% in area: check it in the viewer, then
  `bun run race:map --accept`). New landmarks are unstamped until accepted.
- **Adding detail to a building:** identify it in the viewer (I, Copy reference),
  then, before writing any JSON, **analyse the photos and write a plan**:
  1. Orient each photo: which street is in front, which end is which (match road
     names to the OSM footprint in the façade's frame; print its corners as along/out).
  2. Wall treatment, per section: windows grid, or concrete `fins` (spacing, width,
     depth, recess colour); an `arcade` at street level; parapets; materials and colours.
  3. Massing: every volume that reads as its own height (wings, blocks, towers,
     plant rooms, decks, skylights), with storeys counted (~3.4 m each) and positions
     in along/out.
  4. Note what the format can't express yet and extend `format.ts`/`facades.ts`
     rather than settling for a window grid everywhere.

  Then write `landmarks/<id>-<name>.json` (heights are above the highest ground
  under the footprint), `bun run race:map`, and compare in the viewer from the same
  angles as the photos (`#lat,lon,altitude,heading,pitch`; heading 0 looks north,
  90 west). Iterate, `--accept`, and commit the landmark file with the rebuilt map.
  Reference photos are the user's own, kept in `maps/<slug>/reference/<id>/`.
- **Walls** (`client/facades.ts`): `windows` paints a grid in a style, behind `glass`;
  `fins` are real ribs (they run up past a flat roof's `parapet`); `bands` are balconies
  or floor slabs; `arcade` sets arched openings into the street-facing walls
  (`faces: front`, within 45° of the façade's way). Roofs: `flat`, `mansard`, `hip`,
  `gable` (ridge along the footprint's length, ends walled up), `pyramid`. Parts inherit
  the building's look; a part's `wall`/`material`/`windows`/`glass`/`fins`/`bands`/`arcade`
  override it, `false` removes one, and raised parts never get an arcade.
- **Parts** are boxes, `shape: round` (cylinders, elliptical if width ≠ depth), or
  terraced with `steps` (sliced into boxes falling toward one side). A landmark with
  parts replaces OSM's `building:part`s for that building; one without keeps them.
- **Orienting a photo:** match the road labels in it to the streets around the
  footprint before deciding which end is which; a wrong guess mirrors the building.
- **Aerial screenshots** (Google Earth 3D views and the like; `game-server/tools/aerial/`,
  python3 with numpy, pillow and scipy): drop them in `maps/<map>/aerial/` (git-ignored: the
  imagery isn't ours to commit). Fit each one's camera once (`aerial.py fit IMAGE` from an
  `IMAGE.points.json` of 6+ pixel ↔ world pairs: street intersections, tower tops), then
  `overlay` shows the map through it (which OSM building is which), `ground` turns pixels
  into lat/lon (decor), `building`/`heights`/`facade-heights` give a building's views and
  lidar volumes in a landmark's frame, `looks` + `merge-looks` sample colours into
  `looks.json`. `view` gives the viewer link that sees what the camera saw (a field of view
  included); `shot.mjs` renders it in a private headless Chrome (software WebGL, ~20 s a
  view) and `compare` stacks render and screenshot. Check renders this way, not in the
  shared Playwright browser.
- **Driving** (`src/race/drive/`, pure like `sim/`): `world.ts` turns the map into
  what a kart needs (ground height, a 2 m road/offroad/water raster, building and
  wall colliders in a grid, nearest road, generated boost pads on long straights);
  `kart.ts` steps an arcade kart at a fixed 60 Hz (slow pull to 150 km/h, offroad
  cap, drift → mini-turbo, jumps off crests, bounce off walls). Tuning constants sit
  at the top of `kart.ts`; `kart.test.ts` pins the feel (0–60 in 3 s, ~700 m to top
  speed, in kart terms). `PACE` (1.5): karts cover the real-size map, and turn, that much
  faster than their speed says, so 150 km/h feels like it; speeds and the speedometer stay
  nominal, positions and the server's speed checks are real metres. The chase camera keeps
  its distance at any speed (only its swing is smoothed), widens with speed and shakes near
  the top. The viewer starts driving unless the URL has a view; F switches to flying.
- **Tracks** (`Course` in the TS code; `map/courses.ts` projects lat/lon checkpoints):
  circuits only, gate 0 the start/finish, the grid behind it. Gates have no direction:
  `drive/laps.ts` counts them only in order, crossed either way; the route between them
  decides the way round, and `orientAlongRoute` (`drive/route.ts`) turns a course to face
  it for the grid, resets and the wrong-way warning (client, server and the editor's
  checks alike); a gate laid more than ~25° off square to the route (across a path where it
  meets the street) is turned square across it. `drive/trial.ts` is the step-counted clock.
  The grid (`gridSlot`): two abreast 2.4 m apart, rows 5.5 m; with `gridFits` a slot that
  doesn't fit slides in towards the middle, then steps back. A track must pass
  `drive/checks.ts` (streets join every gate, nothing built across one, the 8-kart grid
  fits: grass or a sidewalk will do, not water, a wall or inside a building): the editor
  won't save one that doesn't, and `pipeline.test.ts` holds the default tracks to it after
  a map refresh. The editor (`client/track-editor.ts`): click a street to add a checkpoint,
  click the route to insert, drag to move, right-click to remove (`drive/editing.ts`);
  checkpoints show as bars across the road (as the race lays them, and saved that way); one
  green arrow on the start line shows the way round, and "⇄ Reverse direction" (`reversed`:
  the start kept, the others in the opposite order) flips it. Street names label the map
  (`Road.name`, OSM's, kept for drivable roads by `map/streets.ts`): major roads from any
  zoom, streets from 0.45 px/m, service roads from 1.5, each along its straightest run,
  never overlapping. Laravel validates shape and that checkpoints are on the map.
- **Snacks** (`drive/snacks.ts` pure and shared, `client/snacks.ts`, `client/snack-models.ts`):
  the office dépanneur's 12 real items lie along a race's route, anywhere across the
  street (up to 6.5 m off the route's line), as many as the host's slider says (`density`
  0–10, default 3: one every 320 / density m; how often each kind turns up follows the
  fridge's stock as `dep items` gave it, square-rooted). Drive through one and you eat it: the tab sends `eat`, the server checks
  it's there and you're next to it, tells everyone `ate`, and brings it back after 12 s.
  Each tab applies effects to its own kart as `KartMods` for `stepKart` (limit, accel,
  off-road as road, nitro rate, grip, frozen): Coke rush then crash, Bubly, chips (fat, a
  crumb trail), Montellier (cures), Fuze (frost trail others slide on), chocolate (+25%
  nitro), Kirkland, Go Krisp (nitro ×3), TrailMix (off-road, a nut trail that bounces).
  Popcorn turns everyone else's camera to the eater, a Drumsticks freezes the others 2 s,
  a Chipwich is the server's (`sandwich`: just ahead of the kart in front, level with it in
  the race, the jump allowed). Trails come from the eater's poses on every tab. The host's
  Snacks slider (`setDensity`) and a checkbox per snack (`setKinds`, `LobbyView.kinds`, all on
  by default; only the ticked are placed): a race with any snacks isn't sent to the Hub's records.
  After a race the lobby panel shows the joke dépanneur bill (nothing is charged; never
  `dep log`). The welcome screen lists them down its left side (a panel of its own, under
  900 px wide it hides): each model rendered to a picture, its effect, how rare it is.
- **Sky and weather** (`drive/weather.ts`, `client/atmosphere.ts`): each race runs under a
  time of day (morning, noon, sunset, night) and weather (clear, rain, snow). The lobby rolls
  it when it opens and after each race (`LobbyView.sky`), so a lobby races under one sky; the
  panel says "Next race: Snow at sunset". The host can pick the time of day between races
  (`setTime`, `LobbyView.time`; Random by default), kept for every race; weather stays random. Rain and snow cut grip (`GRIP`, passed to `stepKart`:
  momentum lags the heading, drifts slide wide); night is only a look (stars, lit windows from
  the wall shader's `WINDOWS_LIT`, a lamp over your kart). Out of a race: `?sky=sunset,snow`
  in the URL, else random in free roam, else clear noon. The atmosphere draws a sky dome, the
  sun's shadows (one 4096 map fitted over the whole map, drawn only when the sky or quality
  changes, since nothing that casts moves; `shade()` says what casts and receives; karts have a
  blob under them instead), fog the
  horizon's colour, rain/snow in a box around the camera, and on High bloom and a colour grade.
  The Graphics button (top right) switches High/Low (no shadows, no bloom, fewer drops, pixel
  ratio 1), remembered in localStorage. Under it, fps, the slowest frame, the JS heap (Chrome
  and Edge only) and the GPU's mesh/texture counts (`frameStats` in main.ts).
- **Race HUD:** the course's route along the streets (`drive/route.ts`, Dijkstra gate to
  gate) feeds the minimap, the HUD arrow, and the standings (`drive/standings.ts`, shared
  with the server). No signs at bends (chevron boards and road arrows were removed as
  misleading), and the checkpoints' holograms carry no arrows either.
- Install packages with Bun 1.4 (the container's: `docker run oven/bun:1.4.0-alpine`);
  an older local Bun rewrites `bun.lock` in an old format.

## Related Apps

- `../arc_tracker/` — Standalone archery tracker (to be migrated into this hub)
- `../ping_ping_app/` — Standalone ping pong tracker (to be migrated into this hub)

===

<laravel-boost-guidelines>
=== foundation rules ===

# Laravel Boost Guidelines

The Laravel Boost guidelines are specifically curated by Laravel maintainers for this application. These guidelines should be followed closely to ensure the best experience when building Laravel applications.

## Foundational Context

This application is a Laravel application and its main Laravel ecosystems package & versions are below. You are an expert with them all. Ensure you abide by these specific packages & versions.

- php - 8.3
- laravel/framework (LARAVEL) - v12
- laravel/prompts (PROMPTS) - v0
- laravel/reverb (REVERB) - v1
- laravel/boost (BOOST) - v2
- laravel/mcp (MCP) - v0
- laravel/pail (PAIL) - v1
- laravel/pint (PINT) - v1
- laravel/sail (SAIL) - v1
- phpunit/phpunit (PHPUNIT) - v11

## Skills Activation

This project has domain-specific skills available in `**/skills/**`. You MUST activate the relevant skill whenever you work in that domain—don't wait until you're stuck.

## Conventions

- You must follow all existing code conventions used in this application. When creating or editing a file, check sibling files for the correct structure, approach, and naming.
- Use descriptive names for variables and methods. For example, `isRegisteredForDiscounts`, not `discount()`.
- Check for existing components to reuse before writing a new one.

## Verification Scripts

- Do not create verification scripts or tinker when tests cover that functionality and prove they work. Unit and feature tests are more important.

## Application Structure & Architecture

- Stick to existing directory structure; don't create new base folders without approval.
- Do not change the application's dependencies without approval.

## Frontend Bundling

- If the user doesn't see a frontend change reflected in the UI, it could mean they need to run `npm run build`, `npm run dev`, or `composer run dev`. Ask them.

## Documentation Files

- You must only create documentation files if explicitly requested by the user.

## Replies

- Be concise in your explanations - focus on what's important rather than explaining obvious details.

=== boost rules ===

# Laravel Boost

## Tools

- Laravel Boost is an MCP server with tools designed specifically for this application. Prefer Boost tools over manual alternatives like shell commands or file reads.
- Use `database-query` to run read-only queries against the database instead of writing raw SQL in tinker.
- Use `database-schema` to inspect table structure before writing migrations or models.
- Use `get-absolute-url` to resolve the correct scheme, domain, and port for project URLs. Always use this before sharing a URL with the user.
- Use `browser-logs` to read browser logs, errors, and exceptions. Only recent logs are useful, ignore old entries.

## Searching Documentation (IMPORTANT)

- Always use `search-docs` before making code changes. Do not skip this step. It returns version-specific docs based on installed packages automatically.
- Pass a `packages` array to scope results when you know which packages are relevant.
- Use multiple broad, topic-based queries: `['rate limiting', 'routing rate limiting', 'routing']`. Expect the most relevant results first.
- Do not add package names to queries because package info is already shared. Use `test resource table`, not `filament 4 test resource table`.

### Search Syntax

1. Use words for auto-stemmed AND logic: `rate limit` matches both "rate" AND "limit".
2. Use `"quoted phrases"` for exact position matching: `"infinite scroll"` requires adjacent words in order.
3. Combine words and phrases for mixed queries: `middleware "rate limit"`.
4. Use multiple queries for OR logic: `queries=["authentication", "middleware"]`.

## Artisan

- Run Artisan commands directly via the command line (e.g., `php artisan route:list`). Use `php artisan list` to discover available commands and `php artisan [command] --help` to check parameters.
- Inspect routes with `php artisan route:list`. Filter with: `--method=GET`, `--name=users`, `--path=api`, `--except-vendor`, `--only-vendor`.
- Read configuration values using dot notation: `php artisan config:show app.name`, `php artisan config:show database.default`. Or read config files directly from the `config/` directory.

## Tinker

- Execute PHP in app context for debugging and testing code. Do not create models without user approval, prefer tests with factories instead. Prefer existing Artisan commands over custom tinker code.
- Always use single quotes to prevent shell expansion: `php artisan tinker --execute 'Your::code();'`
  - Double quotes for PHP strings inside: `php artisan tinker --execute 'User::where("active", true)->count();'`

=== php rules ===

# PHP

- Always use curly braces for control structures, even for single-line bodies.
- Use PHP 8 constructor property promotion: `public function __construct(public GitHub $github) { }`. Do not leave empty zero-parameter `__construct()` methods unless the constructor is private.
- Use explicit return type declarations and type hints for all method parameters: `function isAccessible(User $user, ?string $path = null): bool`
- Use TitleCase for Enum keys: `FavoritePerson`, `BestLake`, `Monthly`.
- Prefer PHPDoc blocks over inline comments. Only add inline comments for exceptionally complex logic.
- Use array shape type definitions in PHPDoc blocks.

=== deployments rules ===

# Deployment

- Laravel can be deployed using [Laravel Cloud](https://cloud.laravel.com/), which is the fastest way to deploy and scale production Laravel applications.

=== tests rules ===

# Test Enforcement

- Every change must be programmatically tested. Write a new test or update an existing test, then run the affected tests to make sure they pass.
- Run the minimum number of tests needed to ensure code quality and speed. Use `php artisan test --compact` with a specific filename or filter.

=== laravel/core rules ===

# Do Things the Laravel Way

- Use `php artisan make:` commands to create new files (i.e. migrations, controllers, models, etc.). You can list available Artisan commands using `php artisan list` and check their parameters with `php artisan [command] --help`.
- If you're creating a generic PHP class, use `php artisan make:class`.
- Pass `--no-interaction` to all Artisan commands to ensure they work without user input. You should also pass the correct `--options` to ensure correct behavior.

### Model Creation

- When creating new models, create useful factories and seeders for them too. Ask the user if they need any other things, using `php artisan make:model --help` to check the available options.

## APIs & Eloquent Resources

- For APIs, default to using Eloquent API Resources and API versioning unless existing API routes do not, then you should follow existing application convention.

## URL Generation

- When generating links to other pages, prefer named routes and the `route()` function.

## Testing

- When creating models for tests, use the factories for the models. Check if the factory has custom states that can be used before manually setting up the model.
- Faker: Use methods such as `$this->faker->word()` or `fake()->randomDigit()`. Follow existing conventions whether to use `$this->faker` or `fake()`.
- When creating tests, make use of `php artisan make:test [options] {name}` to create a feature test, and pass `--unit` to create a unit test. Most tests should be feature tests.

## Vite Error

- If you receive an "Illuminate\Foundation\ViteException: Unable to locate file in Vite manifest" error, you can run `npm run build` or ask the user to run `npm run dev` or `composer run dev`.

=== laravel/v12 rules ===

# Laravel 12

- CRITICAL: ALWAYS use `search-docs` tool for version-specific Laravel documentation and updated code examples.
- Since Laravel 11, Laravel has a new streamlined file structure which this project uses.

## Laravel 12 Structure

- In Laravel 12, middleware are no longer registered in `app/Http/Kernel.php`.
- Middleware are configured declaratively in `bootstrap/app.php` using `Application::configure()->withMiddleware()`.
- `bootstrap/app.php` is the file to register middleware, exceptions, and routing files.
- `bootstrap/providers.php` contains application specific service providers.
- The `app/Console/Kernel.php` file no longer exists; use `bootstrap/app.php` or `routes/console.php` for console configuration.
- Console commands in `app/Console/Commands/` are automatically available and do not require manual registration.

## Database

- When modifying a column, the migration must include all of the attributes that were previously defined on the column. Otherwise, they will be dropped and lost.
- Laravel 12 allows limiting eagerly loaded records natively, without external packages: `$query->latest()->limit(10);`.

### Models

- Casts can and likely should be set in a `casts()` method on a model rather than the `$casts` property. Follow existing conventions from other models.

=== pint/core rules ===

# Laravel Pint Code Formatter

- If you have modified any PHP files, you must run `vendor/bin/pint --dirty --format agent` before finalizing changes to ensure your code matches the project's expected style.
- Do not run `vendor/bin/pint --test --format agent`, simply run `vendor/bin/pint --format agent` to fix any formatting issues.

=== phpunit/core rules ===

# PHPUnit

- This application uses PHPUnit for testing. All tests must be written as PHPUnit classes. Use `php artisan make:test --phpunit {name}` to create a new test.
- If you see a test using "Pest", convert it to PHPUnit.
- Every time a test has been updated, run that singular test.
- When the tests relating to your feature are passing, ask the user if they would like to also run the entire test suite to make sure everything is still passing.
- Tests should cover all happy paths, failure paths, and edge cases.
- You must not remove any tests or test files from the tests directory without approval. These are not temporary or helper files; these are core to the application.

## Running Tests

- Run the minimal number of tests, using an appropriate filter, before finalizing.
- To run all tests: `php artisan test --compact`.
- To run all tests in a file: `php artisan test --compact tests/Feature/ExampleTest.php`.
- To filter on a particular test name: `php artisan test --compact --filter=testName` (recommended after making a change to a related file).

</laravel-boost-guidelines>
