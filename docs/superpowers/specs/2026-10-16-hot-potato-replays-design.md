# Hot potato replays

Watch any finished hot potato game again: from the results screen, the hot potato
page's recent games, or a player's profile.

First of four hot potato sub-projects (replays → cosmetics → challenges → sim content:
Infection mode, teleport pads, new arenas). Each gets its own spec and plan.

## Goals

- Every game whose results are saved gets a replay, kept for the newest 100 games per office.
- Playback looks like the live game (same renderer), with pause, speed, scrubbing and a jump
  to each elimination.
- Replays keep working when the simulation changes (sub-project 4 changes it).

## Non-goals

- No re-simulation, no deterministic-sim refactor.
- No replays for racing.
- No following camera; the camera is the spectator overview.
- No downloading or sharing outside the Hub.

## Approach: record the broadcast

The game server steps games with `Math.random` and a real-time `dt`, so inputs can't be
replayed. Instead the session records what it already broadcasts: snapshots are full state
(positions, effects, items, holder, shake), so playing them back needs no simulation.

## Recording (game server)

- `game-server/src/replay.ts` (pure): `ReplayRecorder`, attached to a session when a game's
  countdown starts.
  - First entry `meta`: `version: 1`, mode, theme, duration, roster
    `{ id, name, avatarUrl, bot, hunter }` (names and avatars as they were, AIs included).
  - Then every game message the session broadcasts, as `[msSinceCountdown, message]`:
    `countdown`, `snapshot`, `pass`, `boom`, `newPotato`, `pickup`, `emote`, `results`.
    Lobby messages (`office`, `welcome`, `error`) are not recorded.
  - Size cap 20 MB (serialised): past it the recording is dropped and results go without a replay.
- At game end the recording is gzipped (`Bun.gzipSync`) and handed to `onResults` with the results.
- `LaravelClient.postResults` becomes multipart: the existing fields plus an optional `replay`
  file, in one request, so there is never a replay without a game row or the reverse.
  It returns the game id Laravel answers.
- After the save, the session broadcasts `{ type: 'replayReady', gameId }` to the office.
  If the save fails (logged as today), no `replayReady` is sent.
- Games that end without results (host closes mid-game, server restart) record nothing.

## Storage (Laravel)

- Migration: nullable `replay_path` on `hot_potato_games`.
- `HotPotatoInternalController::results` accepts an optional `replay` file (max 20 MB),
  stored on the local disk at `hot-potato/replays/{game_id}.json.gz`, and sets `replay_path`.
- `ReplayPruner` runs after each save: for that game's office (null office is its own group),
  it deletes replay files and nulls `replay_path` beyond the newest N games. Result rows stay.
- `config/games.php`: `hot_potato.replays_per_office`, from `HOT_POTATO_REPLAYS_PER_OFFICE`,
  default 100.

## Playback

- `GET /games/hot-potato/replays/{game}`: Blade page `replay.blade.php` (canvas, header with
  mode, arena, date and players, control bar). 404 when `replay_path` is null.
- `GET /games/hot-potato/replays/{game}/data`: the stored gzip with `Content-Encoding: gzip`
  and `Content-Type: application/json`. 404 when there's no replay or the file is gone.
- `client/replay.ts`: a second bundle entry, served as `/games/hot-potato/live/replay.js`,
  built at start-up like `client.js`. Alpine app `hotPotatoReplay`, reusing `Renderer` and
  `STRINGS`. The results and banner text move from `main.ts` to a shared `client/describe.ts`
  (no behaviour change to the live page).
- `ReplayPlayer` (pure, the time is passed in): holds the timeline and `currentTime`, returns
  the messages due since the last frame.
  - Play/pause, speed 0.5× / 1× / 2×; Space toggles, ←/→ jump 5 s.
  - Seeking applies the latest snapshot at or before the target. Transient effects (bursts,
    emotes, banners) fire only during forward play, never while seeking.
  - Scrub bar with a red tick at every boom; a list of eliminations, each with "▶ 3 s before".
  - Clicking a player in the roster follows them: the renderer's `myId` ring marks them.
  - At the end: the results card and a "Replay again" button.
- A recording with another `version`, or a failed fetch, shows "This replay is no longer available".

## Entry points

- Results screen: "▶ Watch replay" when `replayReady` for this game arrives; opens a new tab.
- `/games/hot-potato`: the office's last 20 games (date, mode, arena, winner), Watch when the
  replay still exists.
- `/players/{player}`: "Recent hot potato games", their last 10 (placement, mode, date), with
  Watch links when the replay still exists.

## Testing

- `bun test`:
  - `replay.test.ts`: records game messages, skips lobby ones, stamps times, `meta` roster, size cap.
  - `replay-player.test.ts`: due messages, speeds, seeking to the right snapshot, no transient
    events while seeking.
  - `sessions.test.ts`: a finished game hands a recording to `onResults`; `replayReady` is
    broadcast after the save, not when it fails.
- `tests/Feature/HotPotatoReplayTest.php`: results with and without a replay file, the secret
  still required, pruning (cap 2 in the test) per office, the page 200/404, `data` serves gzip,
  recent games and profile show Watch only when the replay exists.
- End to end: play one real game (`make up`), watch its replay.
