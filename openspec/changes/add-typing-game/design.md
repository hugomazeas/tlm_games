## Context

The hub is a Laravel 12 app (SQLite, Blade + Alpine from CDN, no frontend build). Each game is a module under `app/Games/{Name}/`, registered through `config/games.php`. Putter is the smallest example: one page, one POST, one table, one leaderboard provider. Two realtime stacks already exist:

- **Reverb**: public channels, no auth. Ping-pong uses it for lobbies and livestreams (`ShouldBroadcastNow` events such as `LobbyUpdated`).
- **The Hot Potato Bun sidecar**: a 20 Hz, server-authoritative simulation.

A default `queue:work` service runs in docker-compose.

There is no authentication. Players pick their name from a dropdown, so every rule against cheating has to rely on the server's own data (the text it issued, its clock), never on who the client says it is.

## Goals / Non-Goals

**Goals:**
- A monkeytype-like solo 30s test in FR/EN, with a random-words or quote source.
- A single live race for the whole hub, where the server decides finish times and scores.
- Scoring that doesn't trust the client's WPM or clock.
- One leaderboard ranked by average WPM, then average accuracy.

**Non-Goals:**
- Other durations (15/60/120s) and word-count modes, punctuation and numbers modes.
- Several races at once, or a separate race per office.
- Stopping a determined autotyper bot.
- Replays, keystroke heatmaps, per-test history pages.

## Decisions

### Race realtime goes through Laravel + Reverb, not the Bun sidecar
Progress is HTTP POST → Laravel → `ShouldBroadcastNow` on public channel `typing.race`, with the same pattern as ping-pong's `LobbyUpdated`.
- **Why:** a race only needs a few updates per second per player and one start time everyone agrees on. That's the same load as ping-pong's lobby. It adds no container, no protocol and no TypeScript.
- **Alternative:** a second session type in `game-server/`. Rejected because it's built for tick-based simulation, and it would need its own internal endpoints just to write results.

### Pending solo tests live in `typing_tests`
Issuing a solo test inserts a `typing_tests` row with `text`, `issued_at`, and null `submitted_at`/`wpm`. Submitting fills those columns in. The leaderboard reads only rows where `submitted_at` is not null.
- **Why:** one table holds everything. "One submission per test" becomes `submitted_at IS NULL`, and "≥ 30s" uses `issued_at` from the same row.
- **Alternative:** a signed token holding the text and issue time. Rejected: it still needs replay protection, which means storage anyway.
- Abandoned pending rows are harmless and are not pruned.

### Columns (sketch)
```
typing_tests         id, player_id, race_id?, language, source, text, typed?,
                     wpm?, raw_wpm?, accuracy?, duration_ms?, issued_at, submitted_at?, timestamps
                     index (player_id, submitted_at)
typing_races         id, language, source, text, status (lobby|running|finished), starts_at?, timestamps
typing_race_players  id, race_id, player_id, typed, progress_chars, keystrokes, errors,
                     finished_at?, place?, timestamps   unique (race_id, player_id)
```
There's no separate `countdown` status. A race is in countdown when it is `running` and `starts_at` is in the future.

### One pure scoring class
`TypingScorer` (no database, no clock) provides:
- `correctChars(text, typed)`: monkeytype-style. Count the characters of typed words that exactly match the words at the same position, plus one space between consecutive matching words.
- `prefixChars(text, typed)`: the longest matching prefix, used for race progress.
- `accuracy(keystrokes, errors, text, typed)`: the reported ratio, capped at the share of typed characters that match.
- `wpm(chars, ms)`.

Solo, race progress and race results all call it. It is unit-tested on its own.

### Ending a race happens exactly once
`RaceFinisher::finish(race)` runs `UPDATE typing_races SET status='finished' WHERE id=? AND status='running'`. It writes results only if that update changed one row. Two things call it:
1. the progress request that makes the last racer finish;
2. `FinishTypingRaceJob`, dispatched on start with `delay(starts_at + 120s)` onto the existing default queue.

The conditional update makes the second call a no-op. That works on SQLite without row locks.

**Fallback:** any race endpoint, and the typing page, also call `finish` on a running race past its cap. Results still get written if the queue worker is down.

### Clock alignment for the countdown
Start broadcasts include `starts_at` and the server's `now`. The client computes its offset from them and counts down on `starts_at + offset`. Finish times are never measured on the client.

### Content as PHP arrays
`app/Games/Typing/Content/{fr,en}.php` each return `['words' => [200 strings], 'quotes' => [['text' => …, 'source' => 'Author, Title'], …]]`. They're loaded through a small `TypingContent` service, which also picks random words and quotes.

- No database table: the content changes only by deploy.
- About 50 quotes per language, 1–3 sentences each, from public-domain authors: Hugo, Verne, Maupassant, Dumas, Zola; Austen, Twain, Dickens, Wilde.
- Text is normalized: straight quotes and apostrophes, no em dashes. French keeps its accents.
- Solo words mode issues 150 words, which nobody types in 30s.

### Frontend
There is one Blade page, `games/typing/play.blade.php`, with one Alpine component that switches between Solo and Race tabs, and one shared typing-area partial.

**Input** comes from a visually hidden `<input>` that has focus. It listens to `input` and `compositionend` events, not `keydown`, so dead keys produce one composed character. Space moves to the next word. Paste is blocked with `@paste.prevent` and `@drop.prevent`.

**Keystrokes and errors** are counted on the client, per inserted character.

**Echo:** the page reuses whatever Echo/Reverb setup ping-pong pages already load (see `resources/views/games/ping-pong/play.blade.php`).

### Leaderboard as one SQL aggregate
`AverageWpmProvider` runs one query: `GROUP BY player_id HAVING COUNT(*) >= 5`, with `AVG(wpm)` and `AVG(accuracy)`, sorted by both.

The favourite language comes from a second grouped query (`player_id, language, COUNT, MAX(submitted_at)`), reduced in PHP. That avoids the per-row `Player::find` that Putter's provider does.

## Risks / Trade-offs

- **[Risk] Accuracy is still reported by the client.** → It is capped at the accuracy of the final text, so it can't be inflated above what the typed text shows. It's only the leaderboard's tiebreaker.
- **[Risk] An autotyper script can post plausible text.** → The 250 WPM cap catches the obvious ones. Accepted for an office game.
- **[Risk] Many writes to SQLite during a race** (one per word per racer). → About 10 racers × ~1 write/s is well within SQLite's capacity. The writes are short single-row updates.
- **[Risk] The queue worker is down, so the 2-minute job never runs.** → Endpoints and page loads finish the overdue race as a fallback.
- **[Trade-off] Race and solo WPM are averaged together,** even though races are measured on finish time and solo on 30 seconds. Accepted by decision: WPM is WPM.
- **[Trade-off] French is mixed into one leaderboard,** and French is typically slower to type. Accepted by decision; the favourite-language column makes it visible.
- **[Trade-off] A stale lobby blocks new races for up to 10 minutes.** → Anyone can join it, and it expires on its own.

## Migration Plan

1. Run the three migrations and re-run `GameTypeSeeder` (`updateOrCreate`, safe to run again).
2. Add the provider to `config/games.php`.
3. Deploy with the usual pull and restart. There's no new container and no nginx change.

**Rollback:** remove the module from `config/games.php` and set the game type `is_active=false`. The tables can stay.

## Open Questions

- Curating the quotes is manual content work and needs a review pass for length and typability.
- The final French 200-word list (frequency source) still needs to be chosen.
