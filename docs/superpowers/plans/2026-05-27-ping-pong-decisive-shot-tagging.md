# Ping Pong Decisive-Shot Tagging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture richer per-point ping-pong data (decisive wing on errors, error type, serve points, body hits) via the live remote and surface it as "what to practice" analytics on match-detail and player profiles.

**Architecture:** Everything models the single decisive shot of each point. `point_cause` says whose shot was decisive; attribution (which player, whose serve) is *derived* from existing match data, never tapped. New data lives in three additive columns on `ping_pong_points`. A new `PracticeInsightsService` aggregates points per player for the profile panel.

**Tech Stack:** Laravel 12 / PHP 8.3, SQLite, Blade + Alpine.js (CDN, no build step), PHPUnit (in-memory sqlite).

**Spec:** `docs/superpowers/specs/2026-05-27-ping-pong-decisive-shot-tagging-design.md`

**Conventions for this plan:**
- Run the full suite: `make test`
- Run one test class: `docker compose exec app php artisan test --filter=ClassName`
- The container must be up (`make up`) before running tests or migrations.

---

## File Structure

- **Create** `database/migrations/0001_01_01_000024_add_decisive_shot_tags_to_ping_pong_points.php` — adds `error_type`, `serve_point`, `body_hit`.
- **Modify** `app/Games/PingPong/Models/PingPongPoint.php` — fillable/casts + `decisiveSide()` and `serverSide()` derived accessors.
- **Modify** `app/Games/PingPong/Controllers/PingPongApiController.php` — extend `tagPoint` validation/logic (line 645) and add `practiceInsights` endpoint.
- **Create** `app/Games/PingPong/Services/PracticeInsightsService.php` — per-player point aggregation.
- **Modify** `app/Games/PingPong/routes.php` — register the practice-insights route.
- **Modify** `resources/views/games/ping-pong/remote.blade.php` — new chips + reversed error/wing behavior.
- **Modify** `resources/views/games/ping-pong/match-detail.blade.php` — extend `shotBreakdown`/rows.
- **Modify** `resources/views/games/ping-pong/player.blade.php` — "What to practice" panel.
- **Create** `tests/Unit/PingPongPointAttributionTest.php` — pure tests for `decisiveSide`/`serverSide`.
- **Create** `tests/Feature/TagPointTest.php` — API behavior.
- **Create** `tests/Feature/PracticeInsightsTest.php` — aggregation behavior.

---

## Task 1: Migration — new point columns

**Files:**
- Create: `database/migrations/0001_01_01_000024_add_decisive_shot_tags_to_ping_pong_points.php`

- [ ] **Step 1: Write the migration**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->string('error_type', 10)->nullable()->after('point_cause');
            $table->boolean('serve_point')->default(false)->after('error_type');
            $table->boolean('body_hit')->default(false)->after('serve_point');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_points', function (Blueprint $table) {
            $table->dropColumn(['error_type', 'serve_point', 'body_hit']);
        });
    }
};
```

- [ ] **Step 2: Run the migration**

Run: `docker compose exec app php artisan migrate`
Expected: migration `...000024_add_decisive_shot_tags_to_ping_pong_points` runs `DONE`.

- [ ] **Step 3: Verify rollback works, then re-migrate**

Run: `docker compose exec app php artisan migrate:rollback --step=1 && docker compose exec app php artisan migrate`
Expected: rolls back then re-applies with no errors.

- [ ] **Step 4: Commit**

```bash
git add database/migrations/0001_01_01_000024_add_decisive_shot_tags_to_ping_pong_points.php
git commit -m "Add error_type, serve_point, body_hit to ping_pong_points"
```

---

## Task 2: Model — fillable, casts, derived accessors (TDD)

**Files:**
- Modify: `app/Games/PingPong/Models/PingPongPoint.php`
- Test: `tests/Unit/PingPongPointAttributionTest.php`

`decisiveSide()`: the side that hit the point-ending shot. `winner` cause → scoring side; `opponent_error` → the other side.

`serverSide()`: which side served this point, derived from the match's `first_server_id` and the score *before* this point. Singles logic only (insights are scoped to 1v1); mirrors `PingPongMatch::updateServer()`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Unit;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use Tests\TestCase;

class PingPongPointAttributionTest extends TestCase
{
    private function point(array $attrs, array $matchAttrs = []): PingPongPoint
    {
        $match = new PingPongMatch(array_merge([
            'mode' => '1v1',
            'player_left_id' => 1,
            'player_right_id' => 2,
            'first_server_id' => 1,
        ], $matchAttrs));
        // first_server_id is guarded against mass-assignment edge cases in some setups; set directly too.
        $match->player_left_id = $matchAttrs['player_left_id'] ?? 1;
        $match->player_right_id = $matchAttrs['player_right_id'] ?? 2;
        $match->first_server_id = $matchAttrs['first_server_id'] ?? 1;

        $point = new PingPongPoint($attrs);
        $point->scoring_side = $attrs['scoring_side'];
        $point->point_number = $attrs['point_number'];
        $point->left_score_after = $attrs['left_score_after'];
        $point->right_score_after = $attrs['right_score_after'];
        $point->point_cause = $attrs['point_cause'] ?? null;
        $point->setRelation('match', $match);
        return $point;
    }

    public function test_decisive_side_is_scoring_side_on_winner(): void
    {
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 1, 'left_score_after' => 1, 'right_score_after' => 0, 'point_cause' => 'winner']);
        $this->assertSame('left', $p->decisiveSide());
    }

    public function test_decisive_side_is_opposite_on_opponent_error(): void
    {
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 1, 'left_score_after' => 1, 'right_score_after' => 0, 'point_cause' => 'opponent_error']);
        $this->assertSame('right', $p->decisiveSide());
    }

    public function test_server_side_first_two_points_belong_to_first_server(): void
    {
        // first_server_id = 1 = left. Points 1 and 2 (totals before = 0,1) are left's serve.
        $p1 = $this->point(['scoring_side' => 'left', 'point_number' => 1, 'left_score_after' => 1, 'right_score_after' => 0]);
        $p2 = $this->point(['scoring_side' => 'right', 'point_number' => 2, 'left_score_after' => 1, 'right_score_after' => 1]);
        $this->assertSame('left', $p1->serverSide());
        $this->assertSame('left', $p2->serverSide());
    }

    public function test_server_side_switches_every_two_points(): void
    {
        // total before = 2 -> right's serve.
        $p3 = $this->point(['scoring_side' => 'left', 'point_number' => 3, 'left_score_after' => 2, 'right_score_after' => 1]);
        $this->assertSame('right', $p3->serverSide());
    }

    public function test_server_side_alternates_every_point_in_deuce(): void
    {
        // before this point left=10, right=10 -> deuce, total=20, interval=1 -> index 0 -> first server (left)
        $p = $this->point(['scoring_side' => 'left', 'point_number' => 21, 'left_score_after' => 11, 'right_score_after' => 10]);
        $this->assertSame('left', $p->serverSide());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app php artisan test --filter=PingPongPointAttributionTest`
Expected: FAIL — `Call to undefined method ...::decisiveSide()`.

- [ ] **Step 3: Implement model changes**

In `app/Games/PingPong/Models/PingPongPoint.php`, add the new fields to `$fillable` and `casts()`, and add the two methods.

Update `$fillable` to include `'error_type'`, `'serve_point'`, `'body_hit'`:

```php
    protected $fillable = [
        'match_id',
        'scoring_side',
        'point_number',
        'left_score_after',
        'right_score_after',
        'shot_type',
        'net_edge',
        'clip_requested',
        'point_cause',
        'error_type',
        'serve_point',
        'body_hit',
    ];
```

Add casts inside `casts()`:

```php
            'net_edge' => 'boolean',
            'clip_requested' => 'boolean',
            'serve_point' => 'boolean',
            'body_hit' => 'boolean',
            'created_at' => 'datetime',
```

Add these methods after `match()`:

```php
    /** Side that hit the point-ending shot. */
    public function decisiveSide(): string
    {
        $opposite = $this->scoring_side === 'left' ? 'right' : 'left';
        return $this->point_cause === 'opponent_error' ? $opposite : $this->scoring_side;
    }

    /** Side that served this point (singles), derived from the match's first server. */
    public function serverSide(): string
    {
        $match = $this->match;
        $beforeLeft = $this->left_score_after - ($this->scoring_side === 'left' ? 1 : 0);
        $beforeRight = $this->right_score_after - ($this->scoring_side === 'right' ? 1 : 0);

        $firstServerIsLeft = ($match->first_server_id ?? $match->player_left_id) === $match->player_left_id;
        $inDeuce = $beforeLeft >= 10 && $beforeRight >= 10;
        $interval = $inDeuce ? 1 : 2;
        $serverIndex = intdiv($beforeLeft + $beforeRight, $interval) % 2;

        if ($serverIndex === 0) {
            return $firstServerIsLeft ? 'left' : 'right';
        }
        return $firstServerIsLeft ? 'right' : 'left';
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose exec app php artisan test --filter=PingPongPointAttributionTest`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Games/PingPong/Models/PingPongPoint.php tests/Unit/PingPongPointAttributionTest.php
git commit -m "Add decisive-shot tag fields and derived attribution to PingPongPoint"
```

---

## Task 3: API — extend tagPoint (TDD)

**Files:**
- Modify: `app/Games/PingPong/Controllers/PingPongApiController.php:645-687`
- Test: `tests/Feature/TagPointTest.php`

Behavior: accept `error_type`/`serve_point`/`body_hit`; **stop clearing** `shot_type`/`net_edge` on `opponent_error`; instead clear `error_type` when `point_cause = winner`.

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TagPointTest extends TestCase
{
    use RefreshDatabase;

    private function makePoint(array $pointAttrs = []): PingPongPoint
    {
        $left = Player::create(['name' => 'Left']);
        $right = Player::create(['name' => 'Right']);
        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
            'player_left_score' => 1,
            'player_right_score' => 0,
            'started_at' => now(),
        ]);
        return PingPongPoint::create(array_merge([
            'match_id' => $match->id,
            'scoring_side' => 'left',
            'point_number' => 1,
            'left_score_after' => 1,
            'right_score_after' => 0,
        ], $pointAttrs));
    }

    public function test_tags_error_type_serve_point_and_body_hit(): void
    {
        $point = $this->makePoint();

        $res = $this->patchJson("/games/ping-pong/api/points/{$point->id}", [
            'point_cause' => 'opponent_error',
            'shot_type' => 'backhand',
            'error_type' => 'net',
            'serve_point' => true,
            'body_hit' => true,
        ]);

        $res->assertOk()
            ->assertJson([
                'point_cause' => 'opponent_error',
                'shot_type' => 'backhand',
                'error_type' => 'net',
                'serve_point' => true,
                'body_hit' => true,
            ]);
    }

    public function test_wing_is_kept_on_opponent_error(): void
    {
        $point = $this->makePoint(['shot_type' => 'forehand', 'net_edge' => true]);

        $res = $this->patchJson("/games/ping-pong/api/points/{$point->id}", [
            'point_cause' => 'opponent_error',
        ]);

        $res->assertOk()->assertJson(['shot_type' => 'forehand', 'net_edge' => true]);
    }

    public function test_error_type_is_cleared_when_cause_is_winner(): void
    {
        $point = $this->makePoint(['error_type' => 'net']);

        $res = $this->patchJson("/games/ping-pong/api/points/{$point->id}", [
            'point_cause' => 'winner',
        ]);

        $res->assertOk()->assertJson(['point_cause' => 'winner', 'error_type' => null]);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app php artisan test --filter=TagPointTest`
Expected: FAIL — `error_type`/`serve_point` not in response; wing test fails because old code clears it.

- [ ] **Step 3: Implement the controller change**

Replace the body of `tagPoint` from the `$validated = $request->validate([...])` block through the response (lines 654-686). New validation:

```php
        $validated = $request->validate([
            'shot_type' => 'nullable|in:forehand,backhand',
            'net_edge' => 'sometimes|boolean',
            'clip_requested' => 'sometimes|boolean',
            'point_cause' => 'nullable|in:winner,opponent_error',
            'error_type' => 'nullable|in:net,long_wide',
            'serve_point' => 'sometimes|boolean',
            'body_hit' => 'sometimes|boolean',
        ]);

        if (array_key_exists('shot_type', $validated)) {
            $point->shot_type = $validated['shot_type'];
        }
        if (array_key_exists('net_edge', $validated)) {
            $point->net_edge = (bool) $validated['net_edge'];
        }
        if (array_key_exists('clip_requested', $validated)) {
            $point->clip_requested = (bool) $validated['clip_requested'];
        }
        if (array_key_exists('error_type', $validated)) {
            $point->error_type = $validated['error_type'];
        }
        if (array_key_exists('serve_point', $validated)) {
            $point->serve_point = (bool) $validated['serve_point'];
        }
        if (array_key_exists('body_hit', $validated)) {
            $point->body_hit = (bool) $validated['body_hit'];
        }
        if (array_key_exists('point_cause', $validated)) {
            $point->point_cause = $validated['point_cause'];
            // error_type only applies to error points; clear it on a winner.
            if ($point->point_cause === 'winner') {
                $point->error_type = null;
            }
        }

        $point->save();

        return response()->json([
            'id' => $point->id,
            'shot_type' => $point->shot_type,
            'net_edge' => $point->net_edge,
            'clip_requested' => $point->clip_requested,
            'point_cause' => $point->point_cause,
            'error_type' => $point->error_type,
            'serve_point' => $point->serve_point,
            'body_hit' => $point->body_hit,
        ]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `docker compose exec app php artisan test --filter=TagPointTest`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/Games/PingPong/Controllers/PingPongApiController.php tests/Feature/TagPointTest.php
git commit -m "Extend tagPoint with error_type/serve_point/body_hit; keep wing on errors"
```

---

## Task 4: Remote UX — new chips and reversed behavior

**Files:**
- Modify: `resources/views/games/ping-pong/remote.blade.php`

No JS test harness exists; this task is verified manually in the browser. Keep the existing optimistic `lastPointTags` model and `handleTagChip` flow; extend them.

- [ ] **Step 1: Add the chip markup**

Find the tag chip block (around lines 600-622). Keep the cause row and the Forehand/Backhand row. Replace the remaining chips so the layout becomes:

```html
                <!-- Cause row (existing) -->
                <button class="tag-chip tag-cause-earned" data-tag="cause" data-value="winner" id="tagCauseEarned">
                    <span class="tag-chip-icon">🏆</span>Earned
                </button>
                <button class="tag-chip tag-cause-error" data-tag="cause" data-value="opponent_error" id="tagCauseError">
                    <span class="tag-chip-icon">✕</span>Their error
                </button>

                <!-- Wing row (now applies to BOTH causes) -->
                <div class="tag-row">
                    <button class="tag-chip" data-tag="shot" data-value="forehand" id="tagForehand">
                        <span class="tag-chip-icon">↗</span>Forehand
                    </button>
                    <button class="tag-chip" data-tag="shot" data-value="backhand" id="tagBackhand">
                        <span class="tag-chip-icon">↖</span>Backhand
                    </button>
                </div>

                <!-- Error-type row: only visible when "Their error" is selected -->
                <div class="tag-row" id="errorTypeRow" style="display:none;">
                    <button class="tag-chip" data-tag="error" data-value="net" id="tagErrNet">
                        <span class="tag-chip-icon">🥅</span>Net
                    </button>
                    <button class="tag-chip" data-tag="error" data-value="long_wide" id="tagErrLong">
                        <span class="tag-chip-icon">➡</span>Long/Wide
                    </button>
                </div>

                <!-- Flags row -->
                <div class="tag-row">
                    <button class="tag-chip" data-tag="serve" id="tagServe">
                        <span class="tag-chip-icon">🏓</span>On serve
                    </button>
                    <button class="tag-chip" data-tag="net" id="tagNet">
                        <span class="tag-chip-icon">🍀</span>Net edge
                    </button>
                    <button class="tag-chip" data-tag="body" id="tagBody">
                        <span class="tag-chip-icon">🙆</span>Body hit
                    </button>
                    <button class="tag-chip tag-clip" data-tag="clip" id="tagClip">
                        <span class="tag-chip-icon">🎬</span>Clip this
                    </button>
                </div>
```

(If the existing chips are not already wrapped in `.tag-row` containers, keep whatever container structure the file already uses — match the surrounding markup; the important part is the new `errorTypeRow`, `tagServe`, `tagBody`, and the two error chips.)

- [ ] **Step 2: Extend the JS state and element refs**

Find `let lastPointTags = { shot_type: null, net_edge: false, clip_requested: false, point_cause: null };` (≈line 687) and both reset sites (≈line 776). Replace each occurrence with:

```js
        let lastPointTags = { shot_type: null, net_edge: false, clip_requested: false, point_cause: null, error_type: null, serve_point: false, body_hit: false };
```

Add element refs next to the existing `tagChipForehand`/`tagChipBackhand` lookups (≈line 756):

```js
        const tagChipErrNet = document.getElementById('tagErrNet');
        const tagChipErrLong = document.getElementById('tagErrLong');
        const tagChipServe = document.getElementById('tagServe');
        const tagChipBody = document.getElementById('tagBody');
        const errorTypeRow = document.getElementById('errorTypeRow');
```

- [ ] **Step 3: Update the payload, reset, and handler logic**

In the PATCH payload object (≈line 803) add the new fields:

```js
                shot_type: lastPointTags.shot_type,
                net_edge: lastPointTags.net_edge,
                clip_requested: lastPointTags.clip_requested,
                point_cause: lastPointTags.point_cause,
                error_type: lastPointTags.error_type,
                serve_point: lastPointTags.serve_point,
                body_hit: lastPointTags.body_hit,
```

In the reset/clear-selection helper (the function that does `tagChipForehand.classList.remove('selected')` ≈line 765), also clear the new chips and hide the error row:

```js
            tagChipForehand.classList.remove('selected');
            tagChipBackhand.classList.remove('selected');
            tagChipErrNet.classList.remove('selected');
            tagChipErrLong.classList.remove('selected');
            tagChipServe.classList.remove('selected');
            tagChipBody.classList.remove('selected');
            errorTypeRow.style.display = 'none';
```

In `handleTagChip`, **remove** the block that clears/disables `shot_type` and `net_edge` when `opponent_error` is chosen (≈lines 838-842 and the guard at ≈849 that ignores shot/net while in error mode). Replace the cause handling so it toggles the error-type row instead:

```js
            if (tag === 'cause') {
                if (lastPointTags.point_cause === value) {
                    lastPointTags.point_cause = null;
                    tagChipCauseEarned.classList.remove('selected');
                    tagChipCauseError.classList.remove('selected');
                    errorTypeRow.style.display = 'none';
                    lastPointTags.error_type = null;
                    tagChipErrNet.classList.remove('selected');
                    tagChipErrLong.classList.remove('selected');
                } else {
                    lastPointTags.point_cause = value;
                    tagChipCauseEarned.classList.toggle('selected', value === 'winner');
                    tagChipCauseError.classList.toggle('selected', value === 'opponent_error');
                    if (value === 'opponent_error') {
                        errorTypeRow.style.display = '';
                    } else {
                        errorTypeRow.style.display = 'none';
                        lastPointTags.error_type = null;
                        tagChipErrNet.classList.remove('selected');
                        tagChipErrLong.classList.remove('selected');
                    }
                }
            } else if (tag === 'shot') {
                if (lastPointTags.shot_type === value) {
                    lastPointTags.shot_type = null;
                    (value === 'forehand' ? tagChipForehand : tagChipBackhand).classList.remove('selected');
                } else {
                    lastPointTags.shot_type = value;
                    tagChipForehand.classList.toggle('selected', value === 'forehand');
                    tagChipBackhand.classList.toggle('selected', value === 'backhand');
                }
            } else if (tag === 'error') {
                if (lastPointTags.error_type === value) {
                    lastPointTags.error_type = null;
                    (value === 'net' ? tagChipErrNet : tagChipErrLong).classList.remove('selected');
                } else {
                    lastPointTags.error_type = value;
                    tagChipErrNet.classList.toggle('selected', value === 'net');
                    tagChipErrLong.classList.toggle('selected', value === 'long_wide');
                }
            } else if (tag === 'serve') {
                lastPointTags.serve_point = !lastPointTags.serve_point;
                tagChipServe.classList.toggle('selected', lastPointTags.serve_point);
            } else if (tag === 'body') {
                lastPointTags.body_hit = !lastPointTags.body_hit;
                tagChipBody.classList.toggle('selected', lastPointTags.body_hit);
            } else if (tag === 'net') {
                lastPointTags.net_edge = !lastPointTags.net_edge;
                tagChipNet.classList.toggle('selected', lastPointTags.net_edge);
            }
```

Keep the existing `clip` handling as-is. Then add touch handlers next to the existing ones (≈line 871):

```js
        addTouchHandler(tagChipErrNet, () => handleTagChip('error', 'net'));
        addTouchHandler(tagChipErrLong, () => handleTagChip('error', 'long_wide'));
        addTouchHandler(tagChipServe, () => handleTagChip('serve'));
        addTouchHandler(tagChipBody, () => handleTagChip('body'));
```

- [ ] **Step 4: Verify the page renders and chips behave**

Run: `docker compose exec app php artisan test --filter=TagPointTest` (sanity — API still green).
Then manually: open `http://localhost:8080` → start a ping-pong match → open the remote. Confirm:
- "Their error" reveals the Net / Long·Wide row; "Earned" hides it.
- Forehand/Backhand are tappable in both Earned and Their-error modes (no longer disabled).
- On serve / Net edge / Body hit / Clip toggle independently.
- Tagging a point then checking the match-detail (or network tab) shows the values persisted.

- [ ] **Step 5: Commit**

```bash
git add resources/views/games/ping-pong/remote.blade.php
git commit -m "Remote: wing on errors, error-type row, serve/body-hit chips"
```

---

## Task 5: Match-detail — extend shot breakdown

**Files:**
- Modify: `resources/views/games/ping-pong/match-detail.blade.php:1051-1075`

The match JSON already includes the new columns (served via `$match->points()->get()->toArray()`), so only the Alpine computeds change. Verified manually (no JS harness).

- [ ] **Step 1: Update `hasShotTags`**

Replace (≈line 1050):

```js
        hasShotTags() {
            const points = this.match?.points || [];
            return points.some(p => p.shot_type || p.net_edge || p.point_cause || p.error_type || p.serve_point || p.body_hit);
        },
```

- [ ] **Step 2: Update `shotBreakdown`**

Replace (≈line 1055):

```js
        shotBreakdown(side) {
            const points = (this.match?.points || []).filter(p => p.scoring_side === side);
            const fhWin = points.filter(p => p.shot_type === 'forehand' && p.point_cause !== 'opponent_error').length;
            const bhWin = points.filter(p => p.shot_type === 'backhand' && p.point_cause !== 'opponent_error').length;
            const opponent_error = points.filter(p => p.point_cause === 'opponent_error').length;
            const errNet = points.filter(p => p.point_cause === 'opponent_error' && p.error_type === 'net').length;
            const errLong = points.filter(p => p.point_cause === 'opponent_error' && p.error_type === 'long_wide').length;
            const serve = points.filter(p => p.serve_point).length;
            const net = points.filter(p => p.net_edge).length;
            const untagged = points.filter(p => !p.shot_type && !p.net_edge && !p.point_cause && !p.serve_point && !p.body_hit).length;
            return { total: points.length, fhWin, bhWin, opponent_error, errNet, errLong, serve, net, untagged };
        },
```

- [ ] **Step 3: Update `shotBreakdownRows`**

Replace (≈line 1066):

```js
        shotBreakdownRows(side) {
            const b = this.shotBreakdown(side);
            const denom = Math.max(1, b.total);
            return [
                { key: 'fhWin',          label: 'Forehand winner', count: b.fhWin,          pct: (b.fhWin          / denom) * 100 },
                { key: 'bhWin',          label: 'Backhand winner', count: b.bhWin,          pct: (b.bhWin          / denom) * 100 },
                { key: 'opponent_error', label: 'Their error',     count: b.opponent_error, pct: (b.opponent_error / denom) * 100 },
                { key: 'errNet',         label: '— into net',      count: b.errNet,         pct: (b.errNet         / denom) * 100 },
                { key: 'errLong',        label: '— long/wide',     count: b.errLong,        pct: (b.errLong        / denom) * 100 },
                { key: 'serve',          label: 'On serve/return', count: b.serve,          pct: (b.serve          / denom) * 100 },
                { key: 'net',            label: 'Net edge',        count: b.net,            pct: (b.net            / denom) * 100 },
                { key: 'untagged',       label: 'Untagged',        count: b.untagged,       pct: (b.untagged       / denom) * 100 },
            ];
        },
```

- [ ] **Step 4: Verify in the browser**

Open a match-detail page for a match with tagged points (`http://localhost:8080` → game → a finished match). Confirm the breakdown now shows Forehand/Backhand winners, Their error with into-net / long-wide sub-rows, On serve/return, Net edge, Untagged — and bar percentages render.

- [ ] **Step 5: Commit**

```bash
git add resources/views/games/ping-pong/match-detail.blade.php
git commit -m "Match-detail: richer shot breakdown (winners/errors/serve)"
```

---

## Task 6: PracticeInsightsService + API endpoint (TDD)

**Files:**
- Create: `app/Games/PingPong/Services/PracticeInsightsService.php`
- Modify: `app/Games/PingPong/Controllers/PingPongApiController.php` (add `practiceInsights` method)
- Modify: `app/Games/PingPong/routes.php`
- Test: `tests/Feature/PracticeInsightsTest.php`

Scope: completed **1v1** matches only. For each point, use `decisiveSide()` and `serverSide()` to attribute to the target player's side.

Output shape:
```
[
  'serve' => ['serve_won' => int, 'serve_lost' => int, 'return_won' => int, 'return_lost' => int],
  'wing'  => ['fh_win' => int, 'fh_err' => int, 'bh_win' => int, 'bh_err' => int],
  'errors'=> ['net' => int, 'long_wide' => int, 'untyped' => int],
  'takeaways' => [string, ...],
]
```

- [ ] **Step 1: Write the failing test**

```php
<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongPoint;
use App\Games\PingPong\Services\PracticeInsightsService;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PracticeInsightsTest extends TestCase
{
    use RefreshDatabase;

    public function test_aggregates_serve_wing_and_errors_for_player(): void
    {
        $left = Player::create(['name' => 'Hero']);   // target player, left side, first server
        $right = Player::create(['name' => 'Foe']);
        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
            'player_left_score' => 2,
            'player_right_score' => 1,
            'started_at' => now(),
            'ended_at' => now(),
            'winner_id' => $left->id,
        ]);

        // Point 1 (left serves): Hero wins with a forehand on serve.
        PingPongPoint::create(['match_id' => $match->id, 'scoring_side' => 'left', 'point_number' => 1,
            'left_score_after' => 1, 'right_score_after' => 0,
            'point_cause' => 'winner', 'shot_type' => 'forehand', 'serve_point' => true]);
        // Point 2 (left serves): Foe wins because Hero erred backhand into the net (return-of-serve context = Hero serving, so Hero loses own serve).
        PingPongPoint::create(['match_id' => $match->id, 'scoring_side' => 'right', 'point_number' => 2,
            'left_score_after' => 1, 'right_score_after' => 1,
            'point_cause' => 'opponent_error', 'shot_type' => 'backhand', 'error_type' => 'net']);
        // Point 3 (right serves): Hero wins, opponent error long/wide -> on Hero's return.
        PingPongPoint::create(['match_id' => $match->id, 'scoring_side' => 'left', 'point_number' => 3,
            'left_score_after' => 2, 'right_score_after' => 1,
            'point_cause' => 'opponent_error', 'shot_type' => 'forehand', 'serve_point' => true, 'error_type' => 'long_wide']);

        $insights = app(PracticeInsightsService::class)->forPlayer($left->id);

        // Serve points where Hero served: point 1 (won), point 2 (lost). Return: point 3 (won).
        $this->assertSame(1, $insights['serve']['serve_won']);
        $this->assertSame(1, $insights['serve']['serve_lost']);
        $this->assertSame(1, $insights['serve']['return_won']);
        $this->assertSame(0, $insights['serve']['return_lost']);

        // Wing for Hero's decisive shots: P1 fh winner; P2 Hero's bh error; P3 decisive side is right (Foe erred) -> not Hero.
        $this->assertSame(1, $insights['wing']['fh_win']);
        $this->assertSame(1, $insights['wing']['bh_err']);
        $this->assertSame(0, $insights['wing']['fh_err']);
        $this->assertSame(0, $insights['wing']['bh_win']);

        // Errors by Hero: P2 net. (P3 error is Foe's, not Hero's.)
        $this->assertSame(1, $insights['errors']['net']);
        $this->assertSame(0, $insights['errors']['long_wide']);

        $this->assertIsArray($insights['takeaways']);
    }

    public function test_returns_zeroed_structure_for_player_with_no_points(): void
    {
        $p = Player::create(['name' => 'Empty']);
        $insights = app(PracticeInsightsService::class)->forPlayer($p->id);
        $this->assertSame(0, $insights['serve']['serve_won']);
        $this->assertSame(0, $insights['wing']['fh_win']);
        $this->assertSame(0, $insights['errors']['net']);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app php artisan test --filter=PracticeInsightsTest`
Expected: FAIL — class `PracticeInsightsService` not found.

- [ ] **Step 3: Implement the service**

Create `app/Games/PingPong/Services/PracticeInsightsService.php`:

```php
<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;

class PracticeInsightsService
{
    public function forPlayer(int $playerId): array
    {
        $serve = ['serve_won' => 0, 'serve_lost' => 0, 'return_won' => 0, 'return_lost' => 0];
        $wing = ['fh_win' => 0, 'fh_err' => 0, 'bh_win' => 0, 'bh_err' => 0];
        $errors = ['net' => 0, 'long_wide' => 0, 'untyped' => 0];

        $matches = PingPongMatch::with('points')
            ->where('mode', '1v1')
            ->whereNotNull('ended_at')
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId);
            })
            ->get();

        foreach ($matches as $match) {
            $playerSide = $match->player_left_id === $playerId ? 'left' : 'right';

            foreach ($match->points as $point) {
                $point->setRelation('match', $match);
                $playerWon = $point->scoring_side === $playerSide;

                // Serve / return split.
                if ($point->serve_point) {
                    $servedByPlayer = $point->serverSide() === $playerSide;
                    if ($servedByPlayer) {
                        $playerWon ? $serve['serve_won']++ : $serve['serve_lost']++;
                    } else {
                        $playerWon ? $serve['return_won']++ : $serve['return_lost']++;
                    }
                }

                // Only attribute wing/error to the player when they hit the decisive shot.
                if ($point->decisiveSide() !== $playerSide) {
                    continue;
                }

                $isError = $point->point_cause === 'opponent_error';

                if ($point->shot_type === 'forehand') {
                    $isError ? $wing['fh_err']++ : $wing['fh_win']++;
                } elseif ($point->shot_type === 'backhand') {
                    $isError ? $wing['bh_err']++ : $wing['bh_win']++;
                }

                if ($isError) {
                    if ($point->error_type === 'net') {
                        $errors['net']++;
                    } elseif ($point->error_type === 'long_wide') {
                        $errors['long_wide']++;
                    } else {
                        $errors['untyped']++;
                    }
                }
            }
        }

        return [
            'serve' => $serve,
            'wing' => $wing,
            'errors' => $errors,
            'takeaways' => $this->takeaways($serve, $wing, $errors),
        ];
    }

    private function takeaways(array $serve, array $wing, array $errors): array
    {
        $out = [];

        $serveTotal = $serve['serve_won'] + $serve['serve_lost'];
        $returnTotal = $serve['return_won'] + $serve['return_lost'];
        if ($serveTotal >= 5 && $returnTotal >= 5) {
            $servePct = $serve['serve_won'] / $serveTotal;
            $returnPct = $serve['return_won'] / $returnTotal;
            if ($returnPct + 0.15 < $servePct) {
                $out[] = 'Your return game lags your serve — drill returns.';
            } elseif ($servePct + 0.15 < $returnPct) {
                $out[] = 'You leak points on your own serve — work on serve consistency.';
            }
        }

        if ($wing['fh_err'] + $wing['bh_err'] >= 6) {
            if ($wing['bh_err'] > $wing['fh_err'] * 1.5) {
                $out[] = 'Most of your errors come off the backhand.';
            } elseif ($wing['fh_err'] > $wing['bh_err'] * 1.5) {
                $out[] = 'Most of your errors come off the forehand.';
            }
        }

        $errTotal = $errors['net'] + $errors['long_wide'];
        if ($errTotal >= 6) {
            if ($errors['net'] > $errors['long_wide'] * 1.5) {
                $out[] = 'You dump a lot into the net — lift the ball / clear the net with more margin.';
            } elseif ($errors['long_wide'] > $errors['net'] * 1.5) {
                $out[] = 'You miss long/wide a lot — rein in the power and aim inside the lines.';
            }
        }

        return $out;
    }
}
```

- [ ] **Step 4: Add the controller endpoint**

In `PingPongApiController.php`, add a `use App\Games\PingPong\Services\PracticeInsightsService;` import at the top with the other `use` statements, then add this method (place it near `playerStatsApi`):

```php
    public function practiceInsights(int $id, PracticeInsightsService $service): JsonResponse
    {
        Player::findOrFail($id);
        return response()->json($service->forPlayer($id));
    }
```

- [ ] **Step 5: Register the route**

In `app/Games/PingPong/routes.php`, after the existing `players/{id}/stats` route (line 22), add:

```php
Route::get('/games/ping-pong/api/players/{id}/practice-insights', [PingPongApiController::class, 'practiceInsights']);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose exec app php artisan test --filter=PracticeInsightsTest`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add app/Games/PingPong/Services/PracticeInsightsService.php app/Games/PingPong/Controllers/PingPongApiController.php app/Games/PingPong/routes.php tests/Feature/PracticeInsightsTest.php
git commit -m "Add PracticeInsightsService and practice-insights endpoint"
```

---

## Task 7: Player profile — "What to practice" panel

**Files:**
- Modify: `resources/views/games/ping-pong/player.blade.php`

The page uses Alpine `playerStats()` with `init()`. Add a fetch for the new endpoint and a render section. Verified manually.

- [ ] **Step 1: Fetch insights in the Alpine component**

Find the `playerStats()` Alpine data object and its `init()`. Add an `insights` property to the returned state (next to `stats`), e.g. `insights: null,`. In `init()` (or wherever `stats` is fetched), add a fetch:

```js
            fetch(`/games/ping-pong/api/players/{{ $player->id }}/practice-insights`)
                .then(r => r.json())
                .then(d => { this.insights = d; })
                .catch(() => { this.insights = null; });
```

(Match the existing fetch style in the file — if it uses `await`, use `this.insights = await (await fetch(...)).json();` inside the async `init()` instead.)

- [ ] **Step 2: Add the panel markup**

Inside the `.pps` container, after an existing `.section` block, add:

```html
    <template x-if="insights">
    <div class="section">
        <h2>What to practice</h2>

        <div class="practice-grid" style="display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(200px,1fr));">
            <div class="practice-card">
                <h3 style="font-size:0.85rem; opacity:0.7; margin-bottom:0.4rem;">Serve vs. Return</h3>
                <div>Serve points won: <strong x-text="insights.serve.serve_won"></strong> / <span x-text="insights.serve.serve_won + insights.serve.serve_lost"></span></div>
                <div>Return points won: <strong x-text="insights.serve.return_won"></strong> / <span x-text="insights.serve.return_won + insights.serve.return_lost"></span></div>
            </div>

            <div class="practice-card">
                <h3 style="font-size:0.85rem; opacity:0.7; margin-bottom:0.4rem;">Wing balance</h3>
                <div>Forehand: <strong x-text="insights.wing.fh_win"></strong> winners / <strong x-text="insights.wing.fh_err"></strong> errors</div>
                <div>Backhand: <strong x-text="insights.wing.bh_win"></strong> winners / <strong x-text="insights.wing.bh_err"></strong> errors</div>
            </div>

            <div class="practice-card">
                <h3 style="font-size:0.85rem; opacity:0.7; margin-bottom:0.4rem;">Error profile</h3>
                <div>Into net: <strong x-text="insights.errors.net"></strong></div>
                <div>Long/Wide: <strong x-text="insights.errors.long_wide"></strong></div>
            </div>
        </div>

        <template x-if="insights.takeaways && insights.takeaways.length">
            <ul style="margin-top:1rem; padding-left:1.2rem; list-style:disc;">
                <template x-for="t in insights.takeaways" :key="t">
                    <li x-text="t" style="margin:0.2rem 0;"></li>
                </template>
            </ul>
        </template>
    </div>
    </template>
```

(Use a `.practice-card` style consistent with the file's existing cards; reuse an existing card class if one fits rather than inline styles.)

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:8080/games/ping-pong/players/{id}` for a player with tagged 1v1 points. Confirm the "What to practice" panel renders serve/return counts, wing balance, error profile, and any takeaway bullets. Confirm a player with no tagged points still loads (zeroed numbers, no JS error in console).

- [ ] **Step 4: Commit**

```bash
git add resources/views/games/ping-pong/player.blade.php
git commit -m "Player profile: What to practice panel"
```

---

## Task 8: Full suite + spec coverage check

- [ ] **Step 1: Run the full test suite**

Run: `make test`
Expected: all tests pass, including `PingPongPointAttributionTest`, `TagPointTest`, `PracticeInsightsTest`, and the pre-existing `EmbedLivePageTest`.

- [ ] **Step 2: Manual end-to-end sanity**

With `make up` running: start a 1v1 match, tag several points using every chip (earned/error, both wings, both error types, serve, net edge, body hit, clip), finish the match, then check the match-detail breakdown and the player's "What to practice" panel reflect the tags.

- [ ] **Step 3: Final commit if any view tweaks were made during manual verification**

```bash
git add -A
git commit -m "Polish decisive-shot tagging after manual verification"
```

---

## Self-Review notes

- **Spec coverage:** data model (Task 1–2), repurposed `shot_type` on errors (Task 2 derived + Task 3 keeps it + Task 4 UI), `error_type`/`serve_point`/`body_hit` (Tasks 1,3,4), derived attribution incl. serve rotation (Task 2), API change incl. clearing `error_type` on winner (Task 3), remote UX incl. reversed disable behavior + error-type reveal (Task 4), match-detail breakdown (Task 5), player-profile "what to practice" with serve/return, wing, error profile, plain-language takeaways (Tasks 6–7). All spec sections map to tasks.
- **Scope note:** Practice-insights and `serverSide()` are intentionally scoped to **1v1** (per spec analytics focus); doubles per-individual attribution is out of scope.
- **Type consistency:** service output keys (`serve`/`wing`/`errors`/`takeaways` and their sub-keys) are identical across Task 6 implementation, its test, and the Task 7 view. `decisiveSide()`/`serverSide()` names match across Tasks 2 and 6.
