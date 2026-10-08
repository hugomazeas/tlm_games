## ADDED Requirements

### Requirement: One open race across the hub
At most one race SHALL be open (status `lobby` or `running`) at any time. Creating a race while one is open MUST join the open race instead. A lobby that nobody starts within 10 minutes of creation SHALL be treated as expired, and a new race can be created.

#### Scenario: Create when none open
- **WHEN** a player creates a race with language `fr` and source `quote` and no race is open
- **THEN** a race is created in `lobby` with that language, source and a server-generated text, and the player joins it

#### Scenario: Create when one is open
- **WHEN** a player creates a race while another race is in `lobby`
- **THEN** no new race is created and the player joins the open race

#### Scenario: Expired lobby
- **WHEN** a lobby was created more than 10 minutes ago and never started
- **THEN** it is not considered open and a new race can be created

### Requirement: Race text
A race text SHALL be either one quote, or 40 random words from the language's 200-word list, depending on the race's source.

#### Scenario: Words race
- **WHEN** a race is created with source `words`
- **THEN** its text is exactly 40 words from that language's list

### Requirement: Lobby membership
Players SHALL be able to join and leave a race while it is in `lobby`. A player MUST NOT be in the same race twice. Joining a race that has already started MUST be rejected. Every change to membership is broadcast on the public channel `typing.race`.

#### Scenario: Join lobby
- **WHEN** a player joins a race in `lobby`
- **THEN** they are added and all subscribers receive the updated participant list

#### Scenario: Join started race
- **WHEN** a player tries to join a race in `running`
- **THEN** the request is rejected

#### Scenario: Last player leaves
- **WHEN** the only participant leaves the lobby
- **THEN** the race is removed

### Requirement: Countdown start
Any participant SHALL be able to start the race once at least 2 players have joined. Starting sets the status to `running` and `starts_at` to 3 seconds in the future on the server clock, and broadcasts the start. Clients show a 3-2-1 countdown up to `starts_at` and keep input locked until then.

#### Scenario: Start with two players
- **WHEN** a participant starts a lobby that has 2 players
- **THEN** the race becomes `running` with `starts_at` = now + 3s and every subscriber receives `starts_at`

#### Scenario: Start alone
- **WHEN** a participant starts a lobby that has 1 player
- **THEN** the request is rejected

### Requirement: Server-verified live progress
Each time a racer completes a word, the client SHALL POST everything typed so far, with keystroke and error counts. The server computes `progress_chars`: the length of the longest prefix of the race text that the typed text matches. It stores this with the counts and broadcasts every racer's progress. Progress posted before `starts_at`, after the race is finished, or by a non-participant MUST be rejected.

#### Scenario: Progress update
- **WHEN** a racer posts typed text that matches the first 57 characters of the race text
- **THEN** their `progress_chars` is 57 and all subscribers receive the updated progress

#### Scenario: Progress before start
- **WHEN** a racer posts progress before `starts_at`
- **THEN** the request is rejected

### Requirement: Finishing uses the server clock
A racer SHALL finish when their typed text equals the full race text. Their `finished_at` is the server time of that request, and their place is the order in which racers finished. When every racer has finished, the race ends immediately.

#### Scenario: First to finish
- **WHEN** the first racer posts typed text equal to the race text
- **THEN** their `finished_at` is set to now and their place is 1

#### Scenario: Everyone finishes
- **WHEN** the last unfinished racer finishes
- **THEN** the race status becomes `finished` and results are written

### Requirement: Two-minute cap
A race SHALL end no later than 2 minutes after `starts_at`, even if some racers have not finished. This applies whether or not those racers still have the page open.

#### Scenario: Cap reached
- **WHEN** 2 minutes have passed since `starts_at` and one racer has not finished
- **THEN** the race status becomes `finished` and results are written for every racer

### Requirement: Race results
When a race ends, the system SHALL write one `typing_tests` result per racer, linked to the race and counted on the leaderboard like any other test:
- **Finished racer:** `wpm` = race text length ÷ 5 ÷ (`finished_at` − `starts_at`) in minutes.
- **Racer who did not finish (DNF):** `wpm` = `progress_chars` ÷ 5 ÷ 2 minutes, with a duration of 2 minutes.
- **Both:** accuracy comes from their last reported keystroke and error counts, capped as in solo. A racer who never typed gets 0 wpm and 0 accuracy.

The final standings are broadcast. Results are written exactly once per race.

#### Scenario: Finisher result
- **WHEN** a racer finished a 300-character text 60 seconds after `starts_at`
- **THEN** their result has wpm 60 and a duration of 60000 ms

#### Scenario: DNF result
- **WHEN** the cap is reached and a racer's `progress_chars` is 200
- **THEN** their result has wpm 20 and a duration of 120000 ms

#### Scenario: Closed tab
- **WHEN** a racer closes the page mid-race and never posts again
- **THEN** they still get a DNF result based on their last progress

#### Scenario: End triggered twice
- **WHEN** the last racer finishes at the same moment the 2-minute cap fires
- **THEN** each racer has exactly one result for that race

### Requirement: Race UI
The typing page SHALL let a player switch between Solo and Race. In Race, it shows the open race (or a create form with language and source), the participant list, a start button, the countdown, and a progress bar per racer with live WPM. The typing area is the same as in solo. When the race ends, it shows the standings.

#### Scenario: Watching others progress
- **WHEN** another racer's progress is broadcast
- **THEN** their progress bar updates without a page reload
