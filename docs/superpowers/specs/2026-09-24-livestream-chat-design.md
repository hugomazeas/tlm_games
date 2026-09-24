# Livestream rework: mirrored video, ELO panel, viewer chat

Date: 2026-09-24
Status: approved design, pending implementation plan

## Goal

Make the ping pong livestream interactive. Remote viewers on `/games/ping-pong/watch`
can chat, and players at the table see those messages on the playing screen without
having to look for them. Alongside this, the watch page gets correctly oriented
video and the same ELO projection info the playing screen already shows.

Success: a viewer posts a message on `/watch`, it flashes large in the middle of the
playing screen for 5 seconds, and it stays readable afterwards in a history column
for players who were mid-rally when it arrived.

## Scope

1. Mirror the video on `/watch` so the overlay labels match the sides players appear on.
2. Collapsible ELO panel on `/watch`, reusing the playing screen's ELO preview.
3. A single ongoing chat room (not scoped to a match):
   - viewers post from `/watch`;
   - the playing screen shows full history in a middle column and flashes each new
     message as a big overlay for 5 seconds.

Out of scope: moderation UI, polling fallback when Reverb is down, chat on
`/embed-live`, JS test tooling.

## Decisions

| Question | Decision |
|---|---|
| Who can post | Viewers pick a name from the player list; an unknown name creates a player. Saved in the browser. |
| Chat scope | One ongoing room across matches, always open. |
| Overlay | Opaque, centered, 5 seconds per message, queued, tap to dismiss. |
| History on playing screen | Third column between the two scoreboards, ¼ width, full history. |
| Transport | Store in DB, broadcast on Reverb (existing pattern). |

## 1. Data and backend

### Table `ping_pong_chat_messages`

| Column | Type |
|---|---|
| `id` | bigint pk |
| `player_id` | FK → `players.id`, cascade on delete |
| `body` | string, max 200 |
| `created_at` / `updated_at` | timestamps |

Model `App\Games\PingPong\Models\PingPongChatMessage` (`belongsTo` player) with a factory.

### Endpoints (in `app/Games/PingPong/routes.php`, under the existing `api` prefix)

- `GET api/chat/messages`: returns the last 50 messages, oldest first:
  `[{ id, body, created_at, player: { id, name } }]`.
- `POST api/chat/messages` with `{ player_id, body }`.
  - Validated by a Form Request: `player_id` must exist; `body` is required, trimmed,
    and at most 200 characters.
  - Rate limited per `player_id` to 1 message per 5 seconds. Above that it returns 429.
  - Stores the message, dispatches `ChatMessagePosted`, and returns the message payload (201).
- `POST api/chat/identify` with `{ name }`.
  - Trims the name, then looks it up case-insensitively.
  - Returns the existing player if found, otherwise creates one, using the same name
    rules as the player create form.
  - Returns `{ id, name }`.

Controller: `App\Games\PingPong\Controllers\PingPongChatController` (kept separate
from the already-large `PingPongApiController`).

### Event `ChatMessagePosted`

- Implements `ShouldBroadcastNow`, like the other ping pong events.
- Public `Channel('ping-pong.chat')`, broadcast name `chat.message-posted`.
- Payload is identical to one item of the list endpoint.

### Trust model

No login, which matches the rest of the app. There is no moderation UI; messages can
be deleted via Tinker if needed. Bodies are always rendered with `x-text`, never
`x-html`.

## 2. Watch page (`resources/views/games/ping-pong/watch.blade.php`)

### Mirror

- Add `scale-x-[-1]` to the `<video id="watchPlayer">` element only.
- Overlay labels stay as they are: `player_left` bottom-left, `player_right` bottom-right.
- `embed-live.blade.php` already mirrors but also swaps its labels. Un-swap them so
  both pages show `player_left` bottom-left over the mirrored video.

### ELO panel

- Extract the ELO JS helpers from `play.blade.php` into a shared script partial
  (`partials/elo-preview-script.blade.php`) that defines an object both Alpine
  components spread in: `loadEloPreview`, `eloPreviewFor`, `formatDelta`,
  `currentRatingFor`, `projectedEloFor`, `eloSwingFor`, `previewPlayerIdsForSide`,
  plus any name lookup the partial needs.
- On `/watch`, render `partials/elo-preview.blade.php` above each corner score
  (left card bottom-left, right card bottom-right).
- An "ELO" chip in the top-right cluster toggles both cards. The state is saved in
  `localStorage` (`ping_pong_watch_elo_open`), and the cards start open.
- Fetch the preview when a match becomes active on the page, and clear it when the
  match ends. It is hidden when no match is live.

### Chat sidebar

- A right sidebar about 340px wide. The video area shrinks to make room.
- It collapses to a slim tab with an unread count badge.
- It is visible whether or not a match is live.
- Identity:
  - A text input with autocomplete from the player list.
  - Choosing a name or submitting a new one calls `identify`.
  - The result `{id, name}` is stored in `localStorage` as `ping_pong_chat_player`.
  - After that the sidebar shows "Chatting as **Name** · change".
- Message list: last 50, auto-scrolls to the newest message at the bottom.
- Composer:
  - The input is limited to 200 characters, and Enter sends.
  - A 429 response shows "Slow down — wait a few seconds".
  - A 422 on `player_id` clears the stored identity and shows the picker again.
- On load it fetches `GET api/chat/messages`, then subscribes to `ping-pong.chat` using
  the page's existing Echo instance and appends incoming messages. It de-duplicates by
  `id`, so the sender's own message isn't doubled.

### Embed-live

No chat or ELO. It only gets the label un-swap.

## 3. Playing screen (`resources/views/games/ping-pong/play.blade.php`, `screen === 'playing'`)

This applies to both the live play mode and the read-only `/matches/{id}/scoreboard` route.

### Layout

- `grid grid-cols-2` becomes `lg:grid-cols-[3fr_2fr_3fr]`: left score | chat | right score.
- The win-probability bar, video preview and per-side ELO cards are unchanged.
- Below `lg`, the chat column stacks under the scoreboards as a short strip.

### Chat column (read-only)

- Full history (last 50, newest at the bottom, auto-scrolling), in the existing dark
  editorial styling.
- There is no composer. A footer hint reads "Chat at /watch".

### Flash overlay

- Each live `chat.message-posted` event is pushed onto a queue.
- The overlay shows one message at a time:
  - a centered card on a dimmed backdrop showing the sender's name and the body;
  - body font scales from about 4rem for short messages to about 2.5rem for long ones;
  - it stays for 5 seconds, then fades, then the next queued message plays;
  - tapping the card dismisses it early.
- History loaded on open never flashes.
- Score input (keyboard, remote, buttons) keeps working while the overlay is up.

### Subscription

Join `ping-pong.chat` via `ensureEcho()` when entering the playing screen, and leave it
on exit.

## 4. Testing

Feature tests (PHPUnit):

- `tests/Feature/PingPongChatTest.php`
  - The list returns the last 50, oldest first, with the player name.
  - Posting stores the message and broadcasts `ChatMessagePosted` (`Event::fake`).
  - Validation fails for an empty body, a body over 200 characters, and an unknown `player_id`.
  - A second post by the same player within 5 seconds returns 429; a different player isn't blocked.
  - Identify: an existing name with different case or extra whitespace returns the same
    player and creates no new row; a new name creates a player; an empty or overlong
    name is rejected.
  - Deleting a player deletes their messages.
- `tests/Feature/PingPongWatchPageTest.php`: the page renders the chat sidebar, the ELO
  toggle, and the mirrored video class.
- `tests/Feature/EmbedLivePageTest.php`: labels are un-swapped (`player_left` rendered
  in the bottom-left slot).
- Existing `PingPongEloPreviewTest` must keep passing after the helper extraction.

Manual check with Playwright against the running app:

- Post from `/watch`.
- The overlay flashes on the playing screen, and several messages play one after another.
- History appears in the middle column.
- The ELO toggle persists across reloads.
- The mirrored video matches the labels.

## 5. Edge cases

- Deleted player: their messages go with them (cascade delete). A stale browser
  identity gets a 422, which clears it and re-prompts.
- Reverb down: posting still works over HTTP, but live updates stop until reload. There
  is no polling fallback.
- Players created through chat have no matches. Verify during implementation that they
  don't appear on leaderboards or in matchmaking pools in a harmful way; exclude them
  there if they do.
- XSS: `x-text` everywhere for user content.
