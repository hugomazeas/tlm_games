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
GET  /games/hot-potato              Hot potato: pick office + player, lobby, live game
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
GET  /games/racing/garage/{player}  Garage: paint a player's kart (body + accent)
PUT  /games/racing/garage/{player}  Save a player's kart colours
POST /push/hot-potato/subscribe     Opt a player's browser into "a hot potato opened" pushes
POST /push/hot-potato/unsubscribe   Opt out of those pushes
GET  /push/config                   VAPID public key + whether push is set up
POST /push/subscribe                Register a browser against a player
POST /push/unsubscribe              Drop a browser registration
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
  generated per arena; items and their effects live in `sim/items.ts` + `sim/game.ts`.
- **Open tabs pick up a deploy on their own.** The bundle is stamped with a
  build id (`client/build.ts`); `welcome` carries the server's, and a tab on an
  older one reloads once it isn't mid-game. `client.js` is `no-cache` + ETag.
- **AI players.** The host adds them in the lobby (`addBot` / `removeBot`, negative
  ids, up to the 12 seats; they count toward the 3-player minimum, so one person
  and two AIs is a solo game). They are never hosts and never reach Laravel:
  results keep only people. Each AI seat is a `TrainedPilot` (`game-server/src/ai/`)
  running a neural policy trained by self-play on this simulation
  (`ai/trained-policy.json`, loaded at start-up; missing or mismatched → AIs off,
  `NO_BOTS`). The policy only knows the rules it trained on: changing the sim
  (items, physics, arenas) or the observation means retraining. How to train and
  ship a new policy: `game-server/src/ai/README.md`.
- **Killer Potato** (`mode: 'killer'`): the session adds its own AI hunter seat
  (`HUNTER_NAME`, not a lobby member, `hunter: true` in the view during its games)
  that holds the potato all game, has no fuse and knocks out whoever it touches;
  added AIs sit out, one person can start, the game ends at one person left (zero
  when it started with one) or at the timer. Needs the policy (`NO_BOTS` otherwise).
  A leaver during its countdown calls the game off rather than hand someone a win.
- Tests: `cd game-server && bun test` (sim, arenas, sessions);
  `bun run typecheck`; `bun run format`. Laravel side: `tests/Feature/HotPotatoTest.php`.

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
- **Keys:** racing is drive-only (W/S, A/D, Space/Shift drift, R back on track); flying
  and I (identify) are free roam's (`/games/racing/roam`). The standalone viewer keeps both (F).
- **Drivers:** the track list's "Driving as" picker (remembered in localStorage) adds
  `?player=` to Play; `RacingKart::lookOf()` gives the game their name and garage
  colours (`racing_karts`), or a guest's. The kart (`client/kart.ts`) is painted body
  (chassis, nose) + accent (wing, suit), with a name tag sprite over other drivers' karts (not your own).
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
  speed). The viewer starts driving unless the URL has a view; F switches to flying.
- **Tracks** (`Course` in the TS code; `map/courses.ts` projects lat/lon checkpoints):
  circuits only, gate 0 the start/finish, the grid behind it. `drive/laps.ts` counts
  gates only in order and the right way; `drive/trial.ts` is the step-counted clock.
  A track must pass `drive/checks.ts` (streets join every gate, nothing built across
  one, the 8-kart grid fits): the editor won't save one that doesn't, and
  `pipeline.test.ts` holds the default tracks to it after a map refresh. The editor
  (`client/track-editor.ts`): click a street to add a checkpoint, click the route to
  insert, drag to move, right-click to remove; each points to the next
  (`drive/editing.ts`). Laravel validates shape and that checkpoints are on the map.
- **Race HUD:** the course's route along the streets (`drive/route.ts`, Dijkstra gate to
  gate) feeds the minimap, chevron boards and road arrows at bends, the HUD arrow, and
  the standings (`drive/standings.ts`, shared with the future server).
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
