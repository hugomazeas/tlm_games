# Ping Pong — Decisive-Shot Tagging

**Date:** 2026-05-27
**Status:** Approved design, pending implementation plan

## Goal

Capture richer per-point data during live ping-pong matches so players can analyze
results and know *what to practice* — without slowing down the live remote operator.
Everything is modeled around the **one decisive shot** that ended each point, which
keeps the data both cheap to capture (≤3 thumb taps) and fully attributable per player.

## Background — current state

Per-point tagging happens live via a single remote operator tapping chips
(`resources/views/games/ping-pong/remote.blade.php`). Points are stored in
`ping_pong_points` and tagged via `PATCH /api/points/{id}` (`tagPoint` in
`PingPongApiController.php:645`).

Existing columns: `scoring_side`, `point_number`, `left_score_after`,
`right_score_after`, `shot_type` (forehand/backhand), `net_edge`, `clip_requested`,
`point_cause` (`winner` = earned, `opponent_error`).

Current limitation: when `opponent_error` is picked, `shot_type` and `net_edge` are
**cleared and disabled** — so error points carry almost no detail, which is exactly
where "what to practice" data lives.

## Core model — the decisive shot

Every point has a winner and a loser. Almost every taggable event describes the single
decisive shot that ended the point, and that shot belongs to one side:

- `point_cause = winner` → decisive shot is the **scoring** side's (a winner / ace).
- `point_cause = opponent_error` → decisive shot is the **losing** side's (a miss).

**Attribution is derived, never tapped:**

- *Who hit the decisive shot* = `point_cause == winner ? scoring_side : opposite(scoring_side)`.
  So `shot_type = backhand` + `opponent_error` ⇒ "the loser's backhand erred" ⇒
  **"you make backhand errors."**
- *Whose serve the point was on* = derived from `match.first_server_id` + `point_number`
  using the existing serve-rotation logic in `PingPongMatch::updateServer()`
  (`PingPongMatch.php:160`). So `serve_point` is a single flag and we still know exactly
  whose serve won/lost the point.

## 1. Data model

Migration adds three columns to `ping_pong_points`; one existing column is repurposed.

| Column | Status | Values | Meaning |
|---|---|---|---|
| `point_cause` | exists | `winner` \| `opponent_error` \| null | whose shot was decisive |
| `shot_type` | **repurposed** | `forehand` \| `backhand` \| null | the decisive wing — now valid on **error** points too (the wing that erred), not just winners |
| `error_type` | **new** | `net` \| `long_wide` \| null | only meaningful when `point_cause = opponent_error`: ball into the net, or off the end/side |
| `serve_point` | **new** | bool (default false) | point ended on the serve or return (ace / serve winner / return miss) |
| `body_hit` | **new** | bool (default false) | ball struck the player — fun/highlight flag |
| `net_edge` | exists | bool | luck flag — now allowed on **any** point, not just winners |
| `clip_requested` | exists | bool | highlight flag |

Migration is additive and non-destructive: existing points get `error_type = null`,
`serve_point = false`, `body_hit = false`. No backfill required.

`PingPongPoint` model: add `error_type`, `serve_point`, `body_hit` to `$fillable` and
cast `serve_point`/`body_hit` as boolean.

### Derived helpers (not stored)

Add to `PingPongPoint` (or a small service) two derived accessors:

- `decisiveSide()` → `left`/`right`, per the rule above.
- `serverSide()` → which side was serving on this point, computed from the match's
  `first_server_id` and `point_number` via the same rotation math as
  `updateServer()`. Factor that math into a reusable helper so the remote, point
  storage, and analytics all agree.

## 2. Remote UX (live chips)

```
[ 🏆 Earned ]  [ ✕ Their error ]                            ← cause (1 tap)
[ ↗ Forehand ] [ ↖ Backhand ]                               ← decisive wing (BOTH causes)
[ Net ] [ Long/Wide ]                                       ← error-type row, reveals only on "error"
[ 🏓 On serve ] [ 🍀 Net edge ] [ 🙆 Body hit ] [ 🎬 Clip ]   ← flags
```

Behavior changes from the current build:

- **Wing applies to errors.** Remove the logic that disables/clears `shot_type` and
  `net_edge` when "Their error" is selected (`remote.blade.php` ~lines 838-862 and the
  `.selected`/disabled styling).
- **Error-type row** is hidden by default; it reveals (animated/enabled) when "Their
  error" is selected and is cleared when switching back to "Earned".
- **New flags** `serve_point` and `body_hit` join `net_edge`/`clip` as toggle chips.
- Keep the existing optimistic local `lastPointTags` state model; extend it with
  `error_type`, `serve_point`, `body_hit`.
- Tagging stays optional and graceful: a busy operator can tap just the cause (or
  nothing); detail chips simply stay null.

## 3. API

Extend `tagPoint` (`PingPongApiController.php:645`):

- Validation adds:
  - `error_type => 'nullable|in:net,long_wide'`
  - `serve_point => 'sometimes|boolean'`
  - `body_hit => 'sometimes|boolean'`
- Replace the "clear shot_type/net_edge on opponent_error" block with: **clear
  `error_type` when `point_cause = winner`** (error-type is meaningless on a winner).
  Do not clear `shot_type`/`net_edge` anymore.
- Apply the new fields with the same `array_key_exists` pattern.
- Return the new fields in the JSON response.

## 4. Analytics / display (full scope)

### Match-detail (`match-detail.blade.php`)

Extend the existing shot breakdown:

- Wing split now spans winners **and** errors (FH winners, BH winners, FH errors,
  BH errors).
- Error-type split: net vs. long/wide (out of all error points).
- Serve points: how many points ended on serve/return and the split of who won them.

### Player profile — "What to practice" panel (`player.blade.php`)

A new panel aggregating that player's points across matches (using derived
`decisiveSide`/`serverSide` for attribution):

- **Serve & return:** win % on the player's own serve vs. on return — tells them whether
  to drill serve or return.
- **Wing balance:** FH vs. BH — winners produced and errors committed on each wing.
  Surfaces the weak wing.
- **Error profile:** distribution of `net` vs. `long_wide` errors — net-dumper
  (too passive / bad clearance) vs. over-hitter (too aggressive / off the end).
- Small, plain-language takeaway line per section (e.g. "Most of your errors are
  backhands into the net").

Aggregation lives in a service/query method (e.g. on the existing PingPong stats
service or leaderboard provider), not inline in the Blade view, so it's testable.

## Testing

- **Migration:** rolls up and down cleanly; existing points unaffected.
- **API (`tagPoint`):** new fields validate and persist; `error_type` clears on
  `winner`; `shot_type`/`net_edge` persist on `opponent_error` (regression of old
  clearing behavior).
- **Derived attribution:** unit tests for `decisiveSide()` and `serverSide()` covering
  singles, deuce, and 2v2 rotation — must match `updateServer()` output.
- **Analytics aggregation:** given a fixture of tagged points, the player-profile
  numbers (serve win %, wing splits, error-type split) compute correctly, with correct
  per-player attribution on error points.

## Out of scope

- Placement/zone tagging, rally-length capture, multi-shot rally logging (would exceed
  live tap budget — revisit only if post-match annotation is added later).
- Archery or other game modules.
