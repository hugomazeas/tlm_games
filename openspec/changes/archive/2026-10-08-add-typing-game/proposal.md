## Why

The hub has physical games (archery, ping pong, putter) and one live arena game, but nothing people can play from their desk in under a minute. A monkeytype-style typing test fills that gap. A live race mode gives the office something to do together.

## What Changes

- New `Typing` game module (`app/Games/Typing/`, `/games/typing`), with French and English content.
- Each test uses one of two text sources: **random words** (the 200 most common words of the language) or a **quote** from a public-domain book.
- **Solo mode**: a 30-second test. The server issues the text and computes WPM itself from what was typed.
- **Race mode**: one open race across the whole hub. Players join a lobby and the host starts a countdown. Everyone types the same text, and live progress is broadcast over Reverb. The race ends when everyone finishes or after 2 minutes. Racers who haven't finished are scored on their progress over the full 2 minutes.
- Basic anti-cheat. The server issues every text and enforces solo's 30s minimum using its own clock. It computes WPM, times race finishes, caps WPM at 250, accepts one submission per test, and the page blocks pasting.
- One global leaderboard: average WPM, then average accuracy as the tiebreaker. Every player with a result is ranked, and the board shows each player's favourite language.
- New `game_types` / `game_modes` seed rows and a registration in `config/games.php`.

## Capabilities

### New Capabilities
- `typing-test`: the solo 30s test, the typing UI (words/quote, FR/EN, accent-safe input, no paste), how the server issues and scores a test, and its anti-cheat rules.
- `typing-race`: the single hub-wide race: lobby, countdown, live progress, finishing, the 2-minute cap, scoring for players who don't finish (DNF), and the result rows.
- `typing-leaderboard`: global ranking by average WPM, then average accuracy; favourite language; per-player stats.

### Modified Capabilities
<!-- none: no existing specs -->

## Impact

- **New code**: `app/Games/Typing/` (controllers, models, services, events, job, provider, routes), `resources/views/games/typing/`, content files for word lists and quotes.
- **Database**: three new tables (`typing_tests`, `typing_races`, `typing_race_players`), plus seeder rows in `GameTypeSeeder`.
- **Realtime**: new public Reverb channel `typing.race`. It reuses the existing Reverb setup and Echo usage from ping-pong.
- **Queue**: one delayed job that closes a race at its 2-minute cap, run by the existing default `queue` worker.
- **Dependencies**: none added.
