# Slack Livestream Unfurl — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When someone pastes the ping pong livestream link in Slack, Slack renders an inline video player (like YouTube) that plays the HLS stream.

**Architecture:** A Slack app subscribes to `link_shared` events. Our Laravel app responds with `chat.unfurl` containing a Block Kit `video` block that points to a new chrome-less embed page. The embed page plays the HLS stream via hls.js with score overlays.

**Tech Stack:** Laravel 12, Slack Events API, Slack Block Kit `video` block, hls.js, Alpine.js, Laravel Reverb/Echo

---

## File Structure

### Files to create

| File | Responsibility |
|------|---------------|
| `app/Integrations/Slack/Middleware/VerifySlackSignature.php` | HMAC-SHA256 request verification for all Slack webhooks |
| `app/Integrations/Slack/Services/SlackUnfurlService.php` | Calls Slack `chat.unfurl` API via HTTP client |
| `app/Integrations/Slack/Controllers/SlackEventController.php` | Handles `url_verification` and `link_shared` events |
| `app/Integrations/Slack/Providers/SlackServiceProvider.php` | Registers Slack routes and service bindings |
| `app/Integrations/Slack/routes.php` | `POST /api/slack/events` route |
| `resources/views/games/ping-pong/embed-live.blade.php` | Chrome-less HLS player for Slack iframe embedding |
| `tests/Feature/SlackSignatureTest.php` | Tests for signature verification middleware |
| `tests/Feature/SlackEventControllerTest.php` | Tests for the event webhook controller |
| `tests/Feature/EmbedLivePageTest.php` | Tests for the embed page route and headers |

### Files to modify

| File | Change |
|------|--------|
| `config/services.php` | Add `slack.signing_secret` and `slack.bot_token` keys |
| `config/app.php` | Register `SlackServiceProvider` in providers array |
| `app/Games/PingPong/routes.php` | Add `GET /games/ping-pong/embed/live` route |
| `app/Games/PingPong/Controllers/PingPongController.php` | Add `embedLive()` method |

---

### Task 1: Slack signature verification middleware

**Files:**
- Create: `app/Integrations/Slack/Middleware/VerifySlackSignature.php`
- Create: `tests/Feature/SlackSignatureTest.php`

- [ ] **Step 1: Write the failing test for valid signature**

Create `tests/Feature/SlackSignatureTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Integrations\Slack\Middleware\VerifySlackSignature;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Tests\TestCase;

class SlackSignatureTest extends TestCase
{
    private string $signingSecret = 'test_signing_secret_abc123';

    private function makeSignedRequest(string $body, ?int $timestamp = null, ?string $secret = null): Request
    {
        $timestamp = $timestamp ?? time();
        $secret = $secret ?? $this->signingSecret;
        $sigBasestring = "v0:{$timestamp}:{$body}";
        $signature = 'v0=' . hash_hmac('sha256', $sigBasestring, $secret);

        $request = Request::create('/api/slack/events', 'POST', [], [], [], [
            'HTTP_X_SLACK_REQUEST_TIMESTAMP' => (string) $timestamp,
            'HTTP_X_SLACK_SIGNATURE' => $signature,
        ], $body);
        $request->headers->set('Content-Type', 'application/json');

        return $request;
    }

    public function test_valid_signature_passes(): void
    {
        config(['services.slack.signing_secret' => $this->signingSecret]);

        $body = '{"type":"url_verification","challenge":"abc"}';
        $request = $this->makeSignedRequest($body);

        $middleware = new VerifySlackSignature();
        $response = $middleware->handle($request, fn () => new Response('ok'));

        $this->assertEquals(200, $response->getStatusCode());
        $this->assertEquals('ok', $response->getContent());
    }

    public function test_invalid_signature_returns_403(): void
    {
        config(['services.slack.signing_secret' => $this->signingSecret]);

        $body = '{"type":"url_verification","challenge":"abc"}';
        $request = $this->makeSignedRequest($body, null, 'wrong_secret');

        $middleware = new VerifySlackSignature();
        $response = $middleware->handle($request, fn () => new Response('ok'));

        $this->assertEquals(403, $response->getStatusCode());
    }

    public function test_expired_timestamp_returns_403(): void
    {
        config(['services.slack.signing_secret' => $this->signingSecret]);

        $body = '{"type":"url_verification","challenge":"abc"}';
        $request = $this->makeSignedRequest($body, time() - 600);

        $middleware = new VerifySlackSignature();
        $response = $middleware->handle($request, fn () => new Response('ok'));

        $this->assertEquals(403, $response->getStatusCode());
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `make shell` then `php artisan test --filter=SlackSignatureTest`
Expected: FAIL — class `VerifySlackSignature` not found.

- [ ] **Step 3: Implement the middleware**

Create `app/Integrations/Slack/Middleware/VerifySlackSignature.php`:

```php
<?php

namespace App\Integrations\Slack\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class VerifySlackSignature
{
    public function handle(Request $request, Closure $next): Response
    {
        $timestamp = $request->header('X-Slack-Request-Timestamp');
        $signature = $request->header('X-Slack-Signature');

        if (!$timestamp || !$signature) {
            return response('Unauthorized', 403);
        }

        if (abs(time() - (int) $timestamp) > 300) {
            return response('Unauthorized', 403);
        }

        $sigBasestring = "v0:{$timestamp}:{$request->getContent()}";
        $expected = 'v0=' . hash_hmac('sha256', $sigBasestring, config('services.slack.signing_secret'));

        if (!hash_equals($expected, $signature)) {
            return response('Unauthorized', 403);
        }

        return $next($request);
    }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `php artisan test --filter=SlackSignatureTest`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/Integrations/Slack/Middleware/VerifySlackSignature.php tests/Feature/SlackSignatureTest.php
git commit -m "feat: add Slack signature verification middleware"
```

---

### Task 2: Slack unfurl service

**Files:**
- Modify: `config/services.php`
- Create: `app/Integrations/Slack/Services/SlackUnfurlService.php`

- [ ] **Step 1: Add Slack config to services.php**

In `config/services.php`, replace the existing `'slack'` key with:

```php
'slack' => [
    'signing_secret' => env('SLACK_SIGNING_SECRET'),
    'bot_token' => env('SLACK_BOT_TOKEN'),
    'notifications' => [
        'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
        'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
    ],
],
```

- [ ] **Step 2: Create the unfurl service**

Create `app/Integrations/Slack/Services/SlackUnfurlService.php`:

```php
<?php

namespace App\Integrations\Slack\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SlackUnfurlService
{
    public function unfurl(string $channel, string $messageTs, array $links): void
    {
        $unfurls = [];

        foreach ($links as $link) {
            $url = $link['url'] ?? '';

            if (!str_contains($url, '/games/ping-pong/watch')) {
                continue;
            }

            $baseUrl = rtrim(config('app.url'), '/');

            $unfurls[$url] = [
                'blocks' => [
                    [
                        'type' => 'video',
                        'title' => ['type' => 'plain_text', 'text' => 'Ping Pong Live'],
                        'video_url' => "{$baseUrl}/games/ping-pong/embed/live",
                        'thumbnail_url' => "{$baseUrl}/images/pingpong-live-thumb.png",
                        'alt_text' => 'Ping Pong Livestream',
                        'author_name' => 'Games Hub',
                    ],
                ],
            ];
        }

        if (empty($unfurls)) {
            return;
        }

        $response = Http::withToken(config('services.slack.bot_token'))
            ->post('https://slack.com/api/chat.unfurl', [
                'channel' => $channel,
                'ts' => $messageTs,
                'unfurls' => $unfurls,
            ]);

        if (!$response->json('ok')) {
            Log::warning('Slack unfurl failed', [
                'error' => $response->json('error'),
                'channel' => $channel,
            ]);
        }
    }
}
```

- [ ] **Step 3: Commit**

```bash
git add config/services.php app/Integrations/Slack/Services/SlackUnfurlService.php
git commit -m "feat: add Slack unfurl service and config"
```

---

### Task 3: Slack event controller + routes

**Files:**
- Create: `app/Integrations/Slack/Controllers/SlackEventController.php`
- Create: `app/Integrations/Slack/routes.php`
- Create: `tests/Feature/SlackEventControllerTest.php`

- [ ] **Step 1: Write failing tests for the controller**

Create `tests/Feature/SlackEventControllerTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SlackEventControllerTest extends TestCase
{
    private string $signingSecret = 'test_signing_secret_abc123';

    protected function setUp(): void
    {
        parent::setUp();
        config(['services.slack.signing_secret' => $this->signingSecret]);
        config(['services.slack.bot_token' => 'xoxb-test-token']);
    }

    private function signedPost(string $uri, array $payload): \Illuminate\Testing\TestResponse
    {
        $body = json_encode($payload);
        $timestamp = (string) time();
        $sigBasestring = "v0:{$timestamp}:{$body}";
        $signature = 'v0=' . hash_hmac('sha256', $sigBasestring, $this->signingSecret);

        return $this->call('POST', $uri, [], [], [], [
            'HTTP_X_SLACK_REQUEST_TIMESTAMP' => $timestamp,
            'HTTP_X_SLACK_SIGNATURE' => $signature,
            'CONTENT_TYPE' => 'application/json',
        ], $body);
    }

    public function test_url_verification_returns_challenge(): void
    {
        $response = $this->signedPost('/api/slack/events', [
            'type' => 'url_verification',
            'challenge' => 'test_challenge_xyz',
        ]);

        $response->assertOk();
        $response->assertJson(['challenge' => 'test_challenge_xyz']);
    }

    public function test_link_shared_event_calls_unfurl(): void
    {
        Http::fake([
            'slack.com/api/chat.unfurl' => Http::response(['ok' => true]),
        ]);

        $response = $this->signedPost('/api/slack/events', [
            'type' => 'event_callback',
            'event' => [
                'type' => 'link_shared',
                'channel' => 'C12345',
                'message_ts' => '1234567890.123456',
                'links' => [
                    ['url' => 'https://games.example.com/games/ping-pong/watch'],
                ],
            ],
        ]);

        $response->assertOk();

        Http::assertSent(function ($request) {
            return $request->url() === 'https://slack.com/api/chat.unfurl'
                && $request['channel'] === 'C12345'
                && $request['ts'] === '1234567890.123456';
        });
    }

    public function test_link_shared_with_non_matching_url_does_not_unfurl(): void
    {
        Http::fake();

        $response = $this->signedPost('/api/slack/events', [
            'type' => 'event_callback',
            'event' => [
                'type' => 'link_shared',
                'channel' => 'C12345',
                'message_ts' => '1234567890.123456',
                'links' => [
                    ['url' => 'https://games.example.com/some-other-page'],
                ],
            ],
        ]);

        $response->assertOk();
        Http::assertNothingSent();
    }

    public function test_unsigned_request_is_rejected(): void
    {
        $response = $this->postJson('/api/slack/events', [
            'type' => 'url_verification',
            'challenge' => 'test',
        ]);

        $response->assertStatus(403);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=SlackEventControllerTest`
Expected: FAIL — route `/api/slack/events` not defined.

- [ ] **Step 3: Create the controller**

Create `app/Integrations/Slack/Controllers/SlackEventController.php`:

```php
<?php

namespace App\Integrations\Slack\Controllers;

use App\Integrations\Slack\Services\SlackUnfurlService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SlackEventController
{
    public function handle(Request $request, SlackUnfurlService $unfurlService): JsonResponse
    {
        $type = $request->input('type');

        if ($type === 'url_verification') {
            return response()->json(['challenge' => $request->input('challenge')]);
        }

        if ($type === 'event_callback') {
            $event = $request->input('event', []);

            if (($event['type'] ?? '') === 'link_shared') {
                $unfurlService->unfurl(
                    $event['channel'],
                    $event['message_ts'],
                    $event['links'] ?? [],
                );
            }
        }

        return response()->json(['ok' => true]);
    }
}
```

- [ ] **Step 4: Create the routes file**

Create `app/Integrations/Slack/routes.php`:

```php
<?php

use App\Integrations\Slack\Controllers\SlackEventController;
use App\Integrations\Slack\Middleware\VerifySlackSignature;
use Illuminate\Support\Facades\Route;

Route::post('/api/slack/events', [SlackEventController::class, 'handle'])
    ->middleware(VerifySlackSignature::class);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `php artisan test --filter=SlackEventControllerTest`
Expected: 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/Integrations/Slack/Controllers/SlackEventController.php app/Integrations/Slack/routes.php tests/Feature/SlackEventControllerTest.php
git commit -m "feat: add Slack event controller and routes for link unfurl"
```

---

### Task 4: Slack service provider

**Files:**
- Create: `app/Integrations/Slack/Providers/SlackServiceProvider.php`
- Modify: `config/app.php`

- [ ] **Step 1: Create the service provider**

Create `app/Integrations/Slack/Providers/SlackServiceProvider.php`:

```php
<?php

namespace App\Integrations\Slack\Providers;

use App\Integrations\Slack\Services\SlackUnfurlService;
use Illuminate\Support\ServiceProvider;

class SlackServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SlackUnfurlService::class);
    }

    public function boot(): void
    {
        $this->loadRoutesFrom(__DIR__ . '/../routes.php');
    }
}
```

- [ ] **Step 2: Register the provider in config/app.php**

Add to the `providers` array in `config/app.php`:

```php
App\Integrations\Slack\Providers\SlackServiceProvider::class,
```

- [ ] **Step 3: Run all Slack tests to make sure wiring works**

Run: `php artisan test --filter=Slack`
Expected: 7 tests pass (3 signature + 4 controller).

- [ ] **Step 4: Commit**

```bash
git add app/Integrations/Slack/Providers/SlackServiceProvider.php config/app.php
git commit -m "feat: register Slack service provider"
```

---

### Task 5: Embed live page

**Files:**
- Modify: `app/Games/PingPong/routes.php`
- Modify: `app/Games/PingPong/Controllers/PingPongController.php`
- Create: `resources/views/games/ping-pong/embed-live.blade.php`
- Create: `tests/Feature/EmbedLivePageTest.php`

- [ ] **Step 1: Write failing tests for the embed page**

Create `tests/Feature/EmbedLivePageTest.php`:

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

class EmbedLivePageTest extends TestCase
{
    public function test_embed_live_page_loads(): void
    {
        $response = $this->get('/games/ping-pong/embed/live');

        $response->assertOk();
        $response->assertSee('embedLive()');
        $response->assertSee('hls.js');
    }

    public function test_embed_live_page_allows_iframing(): void
    {
        $response = $this->get('/games/ping-pong/embed/live');

        $response->assertOk();
        $response->assertHeader('X-Frame-Options', 'ALLOWALL');
        $response->assertHeader('Content-Security-Policy', 'frame-ancestors *');
    }

    public function test_embed_live_page_has_no_nav(): void
    {
        $response = $this->get('/games/ping-pong/embed/live');

        $response->assertOk();
        $response->assertDontSee('Games Hub</span>');
    }

    public function test_embed_live_page_has_og_tags(): void
    {
        $response = $this->get('/games/ping-pong/embed/live');

        $response->assertOk();
        $response->assertSee('og:title', false);
        $response->assertSee('og:image', false);
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `php artisan test --filter=EmbedLivePageTest`
Expected: FAIL — 404 on `/games/ping-pong/embed/live`.

- [ ] **Step 3: Add the route**

In `app/Games/PingPong/routes.php`, add after the existing `Route::get('/games/ping-pong/watch', ...)` line:

```php
Route::get('/games/ping-pong/embed/live', [PingPongController::class, 'embedLive']);
```

- [ ] **Step 4: Add the controller method**

In `app/Games/PingPong/Controllers/PingPongController.php`, add this method:

```php
public function embedLive()
{
    return response()
        ->view('games.ping-pong.embed-live')
        ->header('X-Frame-Options', 'ALLOWALL')
        ->header('Content-Security-Policy', 'frame-ancestors *');
}
```

- [ ] **Step 5: Create the embed Blade view**

Create `resources/views/games/ping-pong/embed-live.blade.php`:

```blade
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Ping Pong Live</title>
    <meta property="og:title" content="Ping Pong Live">
    <meta property="og:description" content="Watch the live ping pong match">
    <meta property="og:image" content="{{ url('/images/pingpong-live-thumb.png') }}">
    <meta property="og:type" content="video.other">
    <link rel="stylesheet" href="{{ asset('css/ping-pong-play.css') }}">
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #0a0a0a; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    </style>
</head>
<body>

<div x-data="embedLive()" x-init="init()" style="width:100vw;height:100vh;display:flex;align-items:center;justify-content:center;">

    <!-- No live match -->
    <template x-if="!matchActive">
        <div style="text-align:center;color:rgba(255,255,255,0.6);">
            <div style="font-size:3rem;margin-bottom:16px;">&#127955;</div>
            <h2 style="color:#fff;font-size:1.4rem;margin-bottom:8px;">No Live Match</h2>
            <p style="font-size:0.9rem;">No match is being played right now.</p>
            <p style="font-size:0.8rem;color:rgba(255,255,255,0.3);margin-top:12px;" x-text="'Checking again in ' + countdown + 's...'"></p>
        </div>
    </template>

    <!-- Match active -->
    <template x-if="matchActive">
        <div style="position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;">
            <!-- Video player -->
            <video x-show="hasVideo" id="embedPlayer" muted autoplay playsinline
                   style="width:100%;height:100%;object-fit:contain;background:#000;position:absolute;inset:0;"></video>

            <!-- Score-only mode (no video) -->
            <template x-if="!hasVideo">
                <div style="display:flex;flex-direction:column;align-items:center;gap:24px;">
                    <div style="display:flex;align-items:center;gap:32px;">
                        <div style="text-align:center;">
                            <div style="color:#fb7185;font-size:1.6rem;font-weight:700;" x-text="match?.player_left?.name || 'Left'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_left_player2">
                                <div style="color:#fb7185;font-size:1rem;font-weight:500;opacity:0.7;" x-text="match.team_left_player2.name"></div>
                            </template>
                        </div>
                        <div style="display:flex;align-items:center;gap:12px;">
                            <span style="color:white;font-size:5rem;font-weight:800;" x-text="match?.player_left_score ?? 0"></span>
                            <span style="color:rgba(255,255,255,0.2);font-size:3rem;">-</span>
                            <span style="color:white;font-size:5rem;font-weight:800;" x-text="match?.player_right_score ?? 0"></span>
                        </div>
                        <div style="text-align:center;">
                            <div style="color:#22d3ee;font-size:1.6rem;font-weight:700;" x-text="match?.player_right?.name || 'Right'"></div>
                            <template x-if="match?.mode === '2v2' && match?.team_right_player2">
                                <div style="color:#22d3ee;font-size:1rem;font-weight:500;opacity:0.7;" x-text="match.team_right_player2.name"></div>
                            </template>
                        </div>
                    </div>
                    <div style="color:rgba(255,255,255,0.3);font-size:0.9rem;" x-text="match?.mode?.toUpperCase()"></div>
                </div>
            </template>

            <!-- Overlay: LIVE badge -->
            <div style="position:absolute;top:16px;left:16px;display:flex;align-items:center;gap:6px;background:rgba(0,0,0,0.7);padding:4px 12px;border-radius:6px;">
                <span class="pp-rec-dot"></span>
                <span style="color:white;font-size:0.9rem;font-weight:700;">LIVE</span>
            </div>

            <!-- Overlay: Corner scores (on top of video) -->
            <template x-if="hasVideo && match">
                <div>
                    <div style="position:absolute;bottom:24px;left:24px;display:flex;flex-direction:column;align-items:center;">
                        <span style="color:#fb7185;font-size:2.5rem;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,0.8);" x-text="match?.player_left?.name || 'Left'"></span>
                        <span x-show="isServingLeft()" style="color:#fbbf24;font-size:0.7rem;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.8);">SERVING</span>
                        <span style="color:white;font-size:10rem;font-weight:900;line-height:1;text-shadow:0 4px 16px rgba(0,0,0,0.8);" x-text="match?.player_left_score ?? 0"></span>
                    </div>
                    <div style="position:absolute;bottom:24px;right:24px;display:flex;flex-direction:column;align-items:center;">
                        <span style="color:#22d3ee;font-size:2.5rem;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,0.8);" x-text="match?.player_right?.name || 'Right'"></span>
                        <span x-show="isServingRight()" style="color:#fbbf24;font-size:0.7rem;font-weight:600;text-shadow:0 1px 4px rgba(0,0,0,0.8);">SERVING</span>
                        <span style="color:white;font-size:10rem;font-weight:900;line-height:1;text-shadow:0 4px 16px rgba(0,0,0,0.8);" x-text="match?.player_right_score ?? 0"></span>
                    </div>
                </div>
            </template>
        </div>
    </template>

</div>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/pusher-js@8.4.0/dist/web/pusher.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/laravel-echo@1.16.1/dist/echo.iife.js"></script>
<script>
function embedLive() {
    return {
        matchActive: false,
        hasVideo: false,
        hlsInstance: null,
        match: null,
        matchId: null,
        countdown: 10,
        countdownTimer: null,
        echo: null,

        async init() {
            await this.checkForLiveMatch();
            if (!this.matchActive) {
                this.startPolling();
            }
        },

        async checkForLiveMatch() {
            try {
                const recRes = await fetch('/games/ping-pong/api/recordings/live');
                if (recRes.ok) {
                    const recData = await recRes.json();
                    if (recData.active && recData.hls_url) {
                        this.match = recData.match;
                        this.matchId = recData.match_id;
                        this.matchActive = true;
                        this.hasVideo = true;
                        this.stopPolling();
                        this.$nextTick(() => this.initPlayer(recData.hls_url));
                        this.subscribeToScores();
                        return;
                    }
                }

                const liveRes = await fetch('/games/ping-pong/api/matches/live');
                if (liveRes.ok) {
                    const matches = await liveRes.json();
                    if (matches.length > 0) {
                        this.match = matches[0];
                        this.matchId = matches[0].id;
                        this.matchActive = true;
                        this.hasVideo = false;
                        this.stopPolling();
                        this.subscribeToScores();
                        return;
                    }
                }
            } catch (e) {
                console.error('Error checking for live match:', e);
            }
        },

        startPolling() {
            this.countdown = 10;
            this.countdownTimer = setInterval(() => {
                this.countdown--;
                if (this.countdown <= 0) {
                    this.countdown = 10;
                    this.checkForLiveMatch();
                }
            }, 1000);
        },

        stopPolling() {
            if (this.countdownTimer) {
                clearInterval(this.countdownTimer);
                this.countdownTimer = null;
            }
        },

        initPlayer(hlsUrl) {
            const video = document.getElementById('embedPlayer');
            if (!video) return;

            this.destroyPlayer();

            if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                const hls = new Hls({
                    liveSyncDuration: 3,
                    liveMaxLatencyDuration: 6,
                    enableWorker: true,
                });
                this.hlsInstance = hls;
                hls.loadSource(hlsUrl);
                hls.attachMedia(video);
                hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
                hls.on(Hls.Events.ERROR, (event, data) => {
                    if (!data.fatal) return;
                    if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                        hls.startLoad();
                    } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                        hls.recoverMediaError();
                    } else {
                        this.hasVideo = false;
                        this.destroyPlayer();
                    }
                });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                video.src = hlsUrl;
                video.play().catch(() => {});
            }
        },

        destroyPlayer() {
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },

        isServingLeft() {
            if (!this.match?.current_server) return false;
            return this.match.current_server.id === this.match.player_left_id
                || this.match.current_server.id === this.match.team_left_player2_id;
        },

        isServingRight() {
            if (!this.match?.current_server) return false;
            return this.match.current_server.id === this.match.player_right_id
                || this.match.current_server.id === this.match.team_right_player2_id;
        },

        subscribeToScores() {
            if (!this.matchId) return;

            this.echo = new Echo({
                broadcaster: 'pusher',
                key: 'games-hub-key',
                wsHost: window.location.hostname,
                wsPort: window.location.port || 80,
                forceTLS: false,
                disableStats: true,
                enabledTransports: ['ws', 'wss'],
                cluster: 'mt1',
            });

            this.echo.channel('ping-pong.match.' + this.matchId)
                .listen('.match.score-updated', (e) => {
                    if (e.match) {
                        this.match = { ...this.match, ...e.match };
                        if (e.match.is_complete) {
                            setTimeout(() => {
                                this.matchActive = false;
                                this.hasVideo = false;
                                this.destroyPlayer();
                                this.startPolling();
                            }, 3000);
                        }
                    }
                });
        },
    };
}
</script>

</body>
</html>
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `php artisan test --filter=EmbedLivePageTest`
Expected: 4 tests pass.

- [ ] **Step 7: Commit**

```bash
git add app/Games/PingPong/routes.php app/Games/PingPong/Controllers/PingPongController.php resources/views/games/ping-pong/embed-live.blade.php tests/Feature/EmbedLivePageTest.php
git commit -m "feat: add chrome-less embed page for Slack iframe playback"
```

---

### Task 6: Static thumbnail

**Files:**
- Create: `public/images/pingpong-live-thumb.png`

- [ ] **Step 1: Generate a placeholder thumbnail**

Create a simple 1280x720 dark image. If `convert` (ImageMagick) is available:

```bash
convert -size 1280x720 xc:'#0a0a0a' \
  -fill white -pointsize 72 -gravity center -annotate +0-60 'PING PONG' \
  -fill '#ef4444' -pointsize 36 -gravity center -annotate +0+40 'LIVE' \
  public/images/pingpong-live-thumb.png
```

If not available, create any 1280x720 PNG placeholder — it can be replaced later with a designed version.

- [ ] **Step 2: Commit**

```bash
git add public/images/pingpong-live-thumb.png
git commit -m "feat: add static thumbnail for Slack unfurl card"
```

---

### Task 7: Manual end-to-end verification

This task cannot be TDD'd — it requires Slack infrastructure.

- [ ] **Step 1: Add env vars**

Add to `.env`:

```
SLACK_SIGNING_SECRET=your_signing_secret_here
SLACK_BOT_TOKEN=xoxb-your-bot-token-here
```

- [ ] **Step 2: Run all tests**

Run: `php artisan test`
Expected: All tests pass including the 11 new Slack/embed tests.

- [ ] **Step 3: Verify embed page in browser**

Open `https://<your-domain>/games/ping-pong/embed/live` in the browser. Verify:
- No nav bar or app chrome visible
- Shows "No Live Match" when no match active
- If a match is active: video plays, scores overlay, LIVE badge visible

- [ ] **Step 4: Verify Slack unfurl**

1. Create the Slack app (see spec for setup steps)
2. Install to workspace (get admin approval)
3. Paste `https://<your-domain>/games/ping-pong/watch` in a Slack channel
4. Verify: Slack shows an inline video block with the thumbnail; clicking plays the embed page in an iframe

- [ ] **Step 5: Commit .env.example update**

Add the two new env vars (without values) to `.env.example` so others know about them:

```bash
# Add to .env.example:
# SLACK_SIGNING_SECRET=
# SLACK_BOT_TOKEN=
git add .env.example
git commit -m "docs: add Slack env vars to .env.example"
```
