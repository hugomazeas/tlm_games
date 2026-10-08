# typing-leaderboard Specification

## Purpose
The global typing leaderboard and per-player typing stats exposed through the hub's leaderboard system.

## Requirements

### Requirement: Global typing leaderboard
The system SHALL provide one typing leaderboard (game type `typing`, mode `average-wpm`). It covers every result, solo and race, in both languages and both sources. Players are ranked by average `wpm` descending, then by average `accuracy` descending.

#### Scenario: Ranking by average wpm
- **WHEN** player A averages 72 wpm and player B averages 65 wpm
- **THEN** A is ranked above B

#### Scenario: Tie broken by accuracy
- **WHEN** players A and B both average 70.0 wpm, with average accuracy 96.1 and 94.3
- **THEN** A is ranked above B

#### Scenario: Race and solo both count
- **WHEN** a player has 3 solo results and 2 race results
- **THEN** all 5 are included in their averages

### Requirement: Every player with a result is ranked
A player SHALL appear on the leaderboard as soon as they have one result. There is no minimum number of tests.

#### Scenario: First test
- **WHEN** a player completes their first test
- **THEN** they appear on the leaderboard

### Requirement: Favourite language shown
Each leaderboard entry SHALL show the player's favourite language: the language with the most results. If both languages have the same count, the language of the most recent result wins.

#### Scenario: Mostly French
- **WHEN** a player has 7 French and 3 English results
- **THEN** their favourite language is shown as French

#### Scenario: Tie
- **WHEN** a player has 5 French and 5 English results and the latest is English
- **THEN** their favourite language is shown as English

### Requirement: Leaderboard columns
Each entry SHALL include average wpm (1 decimal), average accuracy (1 decimal, %), favourite language, number of tests, and number of restarts.

#### Scenario: Columns rendered
- **WHEN** the typing leaderboard page is viewed
- **THEN** each row shows Avg WPM, Accuracy, Language, Tests and Restarts

### Requirement: Per-player typing stats
The player detail page SHALL show the player's average wpm, average accuracy, best wpm, test count, favourite language and restart count. These appear as soon as the player has at least one result. A player with no results shows no typing stats.

#### Scenario: Player stats
- **WHEN** a player with 2 results is viewed
- **THEN** their typing stats are shown on their player page

#### Scenario: No results
- **WHEN** a player with no typing results is viewed
- **THEN** no typing stats are shown
