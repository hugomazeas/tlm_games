## ADDED Requirements

### Requirement: Test content in French and English
The system SHALL offer typing content in two languages, `fr` and `en`, and two sources:
- `words`: words drawn at random from the 200 most common words of that language.
- `quote`: a passage from a public-domain book.

French content MUST keep its accents and cedillas.

#### Scenario: Random words in French
- **WHEN** a player requests a test with language `fr` and source `words`
- **THEN** the text consists only of words from the French 200-word list, separated by single spaces

#### Scenario: Quote in English
- **WHEN** a player requests a test with language `en` and source `quote`
- **THEN** the text is exactly one quote from the English quote list

#### Scenario: Invalid language or source
- **WHEN** a player requests a test with a language other than `fr`/`en` or a source other than `words`/`quote`
- **THEN** the request is rejected with a validation error

### Requirement: Server issues solo tests
The system SHALL generate the text of every solo test on the server and store it with the player, language, source, and server `issued_at` timestamp. It SHALL return a test id and the text. In `words` mode, the text MUST contain more words than anyone can type in 30 seconds.

#### Scenario: Issue a test
- **WHEN** a player requests a solo test for an existing player id
- **THEN** a pending test is stored and the response contains its id and text

#### Scenario: Unknown player
- **WHEN** a solo test is requested for a player id that does not exist
- **THEN** the request is rejected with a validation error

### Requirement: Solo test lasts 30 seconds from the first keystroke
The solo test SHALL run for exactly 30 seconds, starting on the player's first typed character. When time is up, input is locked and the client submits automatically.

#### Scenario: Timer starts on first key
- **WHEN** the test text is shown and the player has not typed yet
- **THEN** the timer stays at 30 and does not count down

#### Scenario: Time runs out
- **WHEN** 30 seconds have passed since the first keystroke
- **THEN** input is disabled and the result is submitted

### Requirement: Accent-safe input without paste
The typing UI SHALL read input from a text input's `input` events, so that dead keys and composed characters (e.g. `é`, `ç` on Canadian French layouts) register as one character. Pasting into the test input MUST be blocked.

#### Scenario: Dead key accent
- **WHEN** a player types `é` using a dead key followed by `e`
- **THEN** a single `é` is compared against the expected character

#### Scenario: Paste attempt
- **WHEN** a player pastes text into the test input
- **THEN** nothing is inserted

### Requirement: Live per-character feedback
While typing, the UI SHALL show the current word and a caret. Characters typed correctly are shown in one colour and wrong characters in another. Extra characters typed past the end of a word are shown as errors. Backspace is allowed within the current word.

#### Scenario: Wrong character
- **WHEN** the player types a character that differs from the expected one
- **THEN** that character is shown as an error

### Requirement: Server-computed solo score
On submission, the client sends the typed text and its keystroke and error counts. The system SHALL compute the result itself:
- `wpm` = characters of correctly typed words, plus one space between consecutive ones, ÷ 5 ÷ 0.5 minutes.
- `raw_wpm` = all typed characters ÷ 5 ÷ 0.5 minutes.
- `accuracy` = (keystrokes − errors) ÷ keystrokes × 100. It is capped so it never exceeds the share of typed characters that match the text.

#### Scenario: Correct score
- **WHEN** a player submits typed text whose first 30 words match the issued words exactly
- **THEN** `wpm` is computed from those 30 words and their separating spaces over 0.5 minutes

#### Scenario: Inflated accuracy
- **WHEN** the reported keystrokes and errors imply 100% accuracy but some typed characters do not match the text
- **THEN** the stored accuracy is capped at the share of typed characters that match

### Requirement: Solo anti-cheat checks
The system SHALL reject a solo submission when:
- fewer than 30 seconds have passed on the server clock since `issued_at`,
- the test was already submitted,
- the computed `wpm` exceeds 250.

A rejected submission MUST NOT create a result.

#### Scenario: Submitted too early
- **WHEN** a test is submitted 20 seconds after it was issued
- **THEN** the submission is rejected and no result is stored

#### Scenario: Double submission
- **WHEN** a test that already has a result is submitted again
- **THEN** the submission is rejected

#### Scenario: Implausible speed
- **WHEN** the computed wpm is above 250
- **THEN** the submission is rejected

### Requirement: Results screen and recent tests
After submitting, the UI SHALL show the player's wpm, raw wpm and accuracy, plus a way to start a new test. The typing page SHALL list the 10 most recent results across all players. The last selected player, language and source are remembered in the browser.

#### Scenario: Restart
- **WHEN** the player clicks restart on the results screen
- **THEN** a new test is issued with the same player, language and source
