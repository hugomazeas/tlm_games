## 1. Module scaffolding & data

- [ ] 1.1 Create `app/Games/Typing/` (Controllers, Models, Services, Events, Jobs, Providers, routes.php) and `TypingServiceProvider` registering routes and the leaderboard provider; add it to `config/games.php`
- [ ] 1.2 Migrations for `typing_tests`, `typing_races`, `typing_race_players` (columns and indexes as in design.md)
- [ ] 1.3 Models `TypingTest`, `TypingRace`, `TypingRacePlayer` with casts, relations, and factories
- [ ] 1.4 `GameTypeSeeder`: `typing` game type (icon ⌨️) and `average-wpm` game mode with columns Avg WPM, Accuracy, Language, Tests

## 2. Content

- [ ] 2.1 `Content/en.php`: 200 most common English words + ~50 public-domain quotes (Austen, Twain, Dickens, Wilde) with source
- [ ] 2.2 `Content/fr.php`: 200 most common French words (accents kept) + ~50 public-domain quotes (Hugo, Verne, Maupassant, Dumas, Zola) with source
- [ ] 2.3 `TypingContent` service: `words(lang, n)`, `quote(lang)`, `text(lang, source, wordCount)`; normalize punctuation

## 3. Scoring

- [ ] 3.1 `TypingScorer` (pure): `correctChars`, `prefixChars`, `accuracy` (capped), `wpm(chars, ms)`
- [ ] 3.2 Unit tests for `TypingScorer`: exact match, wrong word mid-text, extra/missing chars, accents, empty input, inflated accuracy cap

## 4. Solo test

- [ ] 4.1 `GET /games/typing` page (players, recent 10 results) and `POST /games/typing/tests` issuing a pending test (validate player, language, source; 150 words for `words`)
- [ ] 4.2 `POST /games/typing/tests/{test}/submit`: reject if < 30s since `issued_at`, already submitted, or wpm > 250; compute and store wpm, raw_wpm, accuracy, duration 30000
- [ ] 4.3 Feature tests: issue, invalid language/source/player, too early, double submit, > 250 wpm, correct scoring, accuracy cap

## 5. Race backend

- [ ] 5.1 `TypingRaceService`: find open race (lobby < 10 min old or running), create-or-join, leave (delete when empty), start (≥ 2 players, starts_at = now + 3s, 40 words or a quote)
- [ ] 5.2 Events on channel `typing.race`: `RaceUpdated` (status, participants, starts_at, server now), `RaceProgress` (per-racer progress_chars, wpm), `RaceFinished` (standings)
- [ ] 5.3 Progress endpoint: reject non-participant / before starts_at / finished race; compute prefix progress; set `finished_at` + place on full match; finish race when everyone is done
- [ ] 5.4 `RaceFinisher::finish` with conditional status update; writes one `typing_tests` row per racer (finisher vs DNF formulas from spec)
- [ ] 5.5 `FinishTypingRaceJob` dispatched on start with delay to starts_at + 120s; lazy finish of overdue races in race endpoints and page load
- [ ] 5.6 Routes: `GET /games/typing/race`, `POST /games/typing/race` (create/join), `POST …/leave`, `POST …/start`, `POST …/progress`
- [ ] 5.7 Feature tests: one open race, join/leave/delete when empty, join running rejected, start with < 2 rejected, progress validation, finish order and places, everyone-finished ends race, cap via job writes DNF results, finish called twice writes results once, expired lobby, `Event::fake` broadcasts

## 6. Frontend

- [ ] 6.1 `games/typing/play.blade.php`: player/language/source pickers (localStorage), Solo/Race tabs, recent results
- [ ] 6.2 Typing-area partial + Alpine: hidden input with `input`/`compositionend`, paste/drop blocked, word/caret rendering with correct/wrong/extra colours, backspace within word, keystroke/error counters
- [ ] 6.3 Solo flow: request test, 30s timer on first key, auto-submit, results screen (wpm, raw, accuracy), restart
- [ ] 6.4 Race flow: Echo subscription to `typing.race` (reuse ping-pong setup), lobby list, create/join/leave/start, clock-offset countdown, POST progress per word, live progress bars, standings
- [ ] 6.5 Dashboard card / nav link shows Typing (via active game type)

## 7. Leaderboard

- [ ] 7.1 `AverageWpmProvider`: aggregate over submitted tests, `HAVING COUNT >= 5`, order by avg wpm then avg accuracy; favourite language by count then latest
- [ ] 7.2 `getPlayerStats`: Avg WPM, Accuracy, Best WPM, Tests, Language (null when no results)
- [ ] 7.3 Feature tests: ordering, accuracy tiebreak, < 5 excluded, race+solo counted, favourite language and tie, player stats with 0/2 results

## 8. Finish

- [ ] 8.1 Update CLAUDE.md routes table with the typing routes
- [ ] 8.2 Run `vendor/bin/pint --dirty --format agent` and the typing test files; manual check in two browsers (accents on FR-CA layout, race end-to-end)
