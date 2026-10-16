# Hot potato: watchers and live chat

Who's watching an office's hot potato, and one chat room per office where people talk
and the game narrates itself. Stacked on cosmetics (looks show in the list and the chat).

## Watchers

- Everyone on the hot potato page of an office who isn't seated (lobby members, and
  the current game's players) is watching. Named watchers (a "You are" picked) show once
  per player however many tabs; "Just watching" tabs are counted as guests.
- The sidecar computes it from its sockets and sends `{ type: 'watchers', named, guests }`
  to the office whenever it changes (connect, disconnect, join, leave, close, start).
- Shown above the chat ("👀 Watching": avatars and names, then "+ 3 guests"), and as
  "👀 n" in the arena header.

## Chat

- One room per office, independent of sessions: always open.
- Named people post (`{ type: 'chat', body }`): trimmed, 1–200 characters, at most 5 per
  10 s per player (`SLOW_DOWN` otherwise). Guests get `PICK_A_PLAYER`. Rendered with
  `x-text` only.
- Event lines, written by the sidecar, stored as data and worded by the page (`STRINGS.chat`):
  `opened`, `joined`, `left` (people only, never AIs), `started` (mode, arena, players), `results`
  (mode, winners), `replay` (game id: "▶ Watch replay", sent when the replay is saved, as
  its own line so lines never change once written). Names are captured at the time.
  Nothing mid-game (booms, steals, pickups): tried, and it drowned the talk. A line of a
  kind the page doesn't know is hidden.
- Lines: `{ id, at, kind: 'message' | 'event', author?, body?, event? }`; `id` is the
  sidecar's own (history from Laravel gets fresh ids when loaded). Server messages:
  `chat` (one new line) and `chatHistory` (all kept lines, on connect and once history loads).

## Storage

- `hot_potato_chat_lines`: `office_id` (cascade), `player_id` (nullable, null on delete),
  `kind`, `body` (nullable, 200), `event` (json, nullable), `posted_at`. Model `HotPotatoChatLine`.
- The sidecar keeps the last 100 lines per office in memory. The first time an office is
  used after start-up it loads them from `GET /internal/hot-potato/offices/{office}/chat`
  (oldest first, authors with name, avatar and look) and merges what was said meanwhile.
- New lines queue up; every 2 s `server.ts` posts the queue to `POST /internal/hot-potato/chat`
  (`lines[]`, max 200). A failed post puts them back (the queue is capped at 1 000).
- Laravel keeps the newest 1 000 lines per office (pruned on each batch).

## Page

- Wide screens: a right-hand column beside the lobby or arena (inside the full-screen
  stage; in full screen it runs the screen's height) with Watching, then Chat (thin, quiet scrollbar) (scrolls, newest at the bottom, input under it). Narrow:
  below. Typing in the input never steers (inputs are already ignored by the key handler).
- Guests see "Pick your name above to chat" instead of the input.

## Not in scope

Moderation UI, chat in replays, Giphy.

## Testing

- Bun (`sessions.test.ts`): watchers (seated excluded, one per player, guests counted,
  updates on join/leave), chat validation, rate limit, guests refused, event lines
  for lobby/start/results/replay (none mid-game, none for AIs), history on connect, merge after
  load, the unsaved queue and requeue.
- Laravel `HotPotatoChatTest`: a batch is stored (secret, validation), pruning per office,
  history oldest first with authors and looks.
