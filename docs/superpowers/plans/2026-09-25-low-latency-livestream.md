# Low-latency Livestream (go2rtc) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the ping pong livestream through a go2rtc sidecar (WebRTC on the office LAN, MSE over WebSocket remotely) while recordings keep working and the webcam is only open during a match.

**Architecture:** At match start the games hub creates a go2rtc stream whose `exec:` source is our existing FFmpeg capture command. The recorder FFmpeg reads that stream over RTSP with `-c copy` and writes the same HLS files as today. At match end the hub makes go2rtc exit; Docker restarts it clean, releasing the camera. If any go2rtc step fails, the recorder opens the camera directly exactly as today. Viewer pages mount go2rtc's `<video-stream>` player when the API says a live stream exists, and keep hls.js as the fallback.

**Tech Stack:** Laravel 12 / PHP 8.3, PHPUnit 11, Blade + Alpine.js + CDN scripts (no build step), go2rtc 1.9.14 (`alexxit/go2rtc:1.9.14`), FFmpeg, nginx, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-25-low-latency-livestream-design.md`

## Global Constraints

- go2rtc image pinned to `alexxit/go2rtc:1.9.14`; browser player pinned to `https://cdn.jsdelivr.net/gh/AlexxIT/go2rtc@v1.9.14/www/video-stream.js`.
- No new Composer or npm dependencies; frontend stays CDN-only.
- `GO2RTC_URL` empty ⇒ behavior identical to today (no HTTP calls to go2rtc, recorder opens `/dev/video0` directly). `.env.example` ships it empty; `phpunit.xml` forces it empty.
- go2rtc API `:1984` and RTSP `:8554` are never published to the host. Only WebRTC `8555/tcp+udp` is published, bound to `${GO2RTC_LAN_IP}` (default `192.168.1.134`).
- go2rtc config: `exec: allow_paths: [ffmpeg]`, no streams defined in the file.
- nginx proxies only `location = /live/ws` with `$args` exactly `src=pingpong`.
- Stream name is `pingpong` everywhere (config `pingpong.live.stream`, nginx, tests).
- No changes to Caddy (`/home/tlm/sites/proxy`), Cloudflare, the router, `FinalizeRecordingJob` or `ClipExtractionService`.
- Run PHP tooling inside the app container: `docker compose exec app php artisan test --compact <file>` and `docker compose exec app vendor/bin/pint --dirty --format agent`.
- Deploy container changes (Task 5) only when no match is in progress.

## Review Focus

1. **Stale viewer tab after a match.** A browser still connected to go2rtc keeps its FFmpeg (and the camera) alive after `DELETE`. So the next match's camera open must not fail: stopping a go2rtc recording must `POST /api/exit?code=0`. Pinned by `test_stopping_a_go2rtc_recording_resets_go2rtc_to_release_the_camera` (Task 3).
2. **go2rtc container down or unreachable at match start.** The match must still record through the direct path, with no exception and `live_stream` null. Pinned by `test_records_directly_when_go2rtc_is_unreachable` (Task 3).
3. **Machines without the camera override (dev laptops, CI).** There's no go2rtc container, and nginx must still start. That's why the upstream is a variable resolved at request time. Pinned by the `nginx -t` step with and without the override (Task 5) and by `test_does_not_call_go2rtc_when_it_is_not_configured` (Task 3).
4. **Mic missing or busy.** go2rtc must retry video-only before falling back to the direct path. Pinned by `test_retries_go2rtc_without_the_mic_when_the_mic_fails` (Task 3).
5. **An audio device string containing whitespace or `#`** would split or truncate the go2rtc source (`#` starts go2rtc parameters). It must yield a video-only source, not a broken one. Pinned by `test_go2rtc_source_drops_an_audio_device_it_cannot_pass_safely` (Task 3).

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `config/pingpong.php` | modify | `live` block: go2rtc URLs, stream name, timeouts |
| `.env.example` | modify | document `GO2RTC_URL`, `GO2RTC_LAN_IP` (empty/default) |
| `phpunit.xml` | modify | force `GO2RTC_URL` empty in tests |
| `app/Games/PingPong/Services/Go2rtcClient.php` | create | the only code that talks to go2rtc's HTTP API |
| `tests/Unit/Go2rtcClientTest.php` | create | client requests and failure handling |
| `database/migrations/2026_09_25_000000_add_live_stream_to_ping_pong_recordings_table.php` | create | nullable `live_stream` column |
| `app/Games/PingPong/Models/PingPongRecording.php` | modify | fillable + `live_stream_url` accessor |
| `app/Games/PingPong/Controllers/PingPongApiController.php` | modify | `live_stream_url` in `liveRecording()` |
| `tests/Feature/PingPongLiveRecordingApiTest.php` | create | API returns/omits the live URL |
| `app/Games/PingPong/Services/VideoRecordingService.php` | modify | go2rtc path, fallback chain, reset on stop/stale |
| `tests/Unit/VideoRecordingCommandTest.php` | modify | go2rtc source + recorder command |
| `tests/Feature/VideoRecordingLiveStreamTest.php` | create | orchestration with simulated processes |
| `resources/views/games/ping-pong/partials/live-video-script.blade.php` | create | `window.pingPongLiveVideo.mount()` |
| `resources/views/games/ping-pong/watch.blade.php` | modify | mount live video, fallback to HLS |
| `resources/views/games/ping-pong/embed-live.blade.php` | modify | same |
| `resources/views/games/ping-pong/play.blade.php` | modify | same for the table-side preview |
| `tests/Feature/PingPongLiveVideoPagesTest.php` | create | pages include the player wiring |
| `docker/go2rtc/go2rtc.yaml` | create | go2rtc config (no streams) |
| `docker-compose.camera.yml` | modify | go2rtc service, `games-hub-camera` network |
| `docker/nginx/default.conf` | modify | `/live/ws` proxy |
| `CLAUDE.md` | modify | short "Livestream" section |

---

### Task 1: go2rtc client and config

**Files:**
- Create: `app/Games/PingPong/Services/Go2rtcClient.php`
- Modify: `config/pingpong.php` (append a `live` block before the closing `];`)
- Modify: `.env.example` (after `RECORDING_AUDIO_DEVICE=...`, line 106)
- Modify: `phpunit.xml` (next to the other `<env>` lines, ~line 41)
- Test: `tests/Unit/Go2rtcClientTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces (used by Task 3):
  - `Go2rtcClient::isConfigured(): bool`
  - `Go2rtcClient::streamName(): string` → `'pingpong'`
  - `Go2rtcClient::rtspUrl(): string` → `'rtsp://go2rtc:8554/pingpong'`
  - `Go2rtcClient::putStream(string $source): bool` → `PUT {url}/api/streams?name=pingpong&src=<source>`, true on 2xx
  - `Go2rtcClient::reset(): void` → `POST {url}/api/exit?code=0`, never throws
  - config keys `pingpong.live.go2rtc_url`, `pingpong.live.go2rtc_rtsp_url`, `pingpong.live.stream`, `pingpong.live.timeout`, `pingpong.live.first_segment_timeout`

- [ ] **Step 1: Write the failing test**

Create `tests/Unit/Go2rtcClientTest.php`:

```php
<?php

namespace Tests\Unit;

use App\Games\PingPong\Services\Go2rtcClient;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class Go2rtcClientTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'pingpong.live.go2rtc_url' => 'http://go2rtc:1984',
            'pingpong.live.go2rtc_rtsp_url' => 'rtsp://go2rtc:8554',
        ]);
    }

    /**
     * @return array<string, string>
     */
    private function queryOf(Request $request): array
    {
        parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);

        return $query;
    }

    public function test_put_stream_creates_the_match_stream(): void
    {
        Http::fake(['*' => Http::response('', 200)]);

        $this->assertTrue(app(Go2rtcClient::class)->putStream('exec:ffmpeg -i /dev/video0 -f rtsp {output}'));

        Http::assertSent(function (Request $request) {
            return $request->method() === 'PUT'
                && str_starts_with($request->url(), 'http://go2rtc:1984/api/streams?')
                && $this->queryOf($request) === [
                    'name' => 'pingpong',
                    'src' => 'exec:ffmpeg -i /dev/video0 -f rtsp {output}',
                ];
        });
    }

    public function test_put_stream_reports_a_rejected_source(): void
    {
        Http::fake(['*' => Http::response('streams: source not supported', 400)]);

        $this->assertFalse(app(Go2rtcClient::class)->putStream('exec:rm -rf /'));
    }

    public function test_put_stream_reports_an_unreachable_go2rtc(): void
    {
        Http::fake(['*' => Http::failedConnection()]);

        $this->assertFalse(app(Go2rtcClient::class)->putStream('exec:ffmpeg {output}'));
    }

    public function test_reset_asks_go2rtc_to_exit(): void
    {
        Http::fake(['*' => Http::response('', 200)]);

        app(Go2rtcClient::class)->reset();

        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && $request->url() === 'http://go2rtc:1984/api/exit?code=0');
    }

    public function test_reset_tolerates_go2rtc_dropping_the_connection(): void
    {
        // go2rtc calls os.Exit() before it answers, so the request never gets a response.
        Http::fake(['*' => Http::failedConnection()]);

        app(Go2rtcClient::class)->reset();

        $this->addToAssertionCount(1);
    }

    public function test_an_unconfigured_client_sends_nothing(): void
    {
        config(['pingpong.live.go2rtc_url' => '']);
        Http::fake();

        $client = app(Go2rtcClient::class);

        $this->assertFalse($client->isConfigured());
        $this->assertFalse($client->putStream('exec:ffmpeg {output}'));
        $client->reset();
        Http::assertNothingSent();
    }

    public function test_rtsp_url_points_at_the_match_stream(): void
    {
        $this->assertSame('rtsp://go2rtc:8554/pingpong', app(Go2rtcClient::class)->rtspUrl());
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app php artisan test --compact tests/Unit/Go2rtcClientTest.php`
Expected: FAIL with `Class "App\Games\PingPong\Services\Go2rtcClient" not found`.

- [ ] **Step 3: Add the config block**

In `config/pingpong.php`, insert before the final `];`:

```php

    /*
    |--------------------------------------------------------------------------
    | Low-latency Livestream (go2rtc)
    |--------------------------------------------------------------------------
    |
    | When GO2RTC_URL is set, the go2rtc sidecar owns the webcam during a
    | match: viewers get WebRTC/MSE from it and the recorder copies its RTSP
    | output. Empty means the recorder opens the camera itself, as before.
    |
    */

    'live' => [
        'go2rtc_url' => env('GO2RTC_URL'),
        'go2rtc_rtsp_url' => env('GO2RTC_RTSP_URL', 'rtsp://go2rtc:8554'),

        // Must match the only `src=` docker/nginx/default.conf lets through.
        'stream' => 'pingpong',

        'timeout' => (int) env('GO2RTC_TIMEOUT', 3),

        // How long the recorder may take to write its first segment through
        // go2rtc before we give up and open the camera directly.
        'first_segment_timeout' => (int) env('GO2RTC_FIRST_SEGMENT_TIMEOUT', 8),
    ],
```

In `.env.example`, after the `RECORDING_AUDIO_DEVICE=` line:

```dotenv

# go2rtc sidecar for the low-latency livestream (empty = recorder opens the camera itself)
GO2RTC_URL=
# Office LAN address go2rtc publishes WebRTC on (docker-compose.camera.yml)
GO2RTC_LAN_IP=192.168.1.134
```

In `phpunit.xml`, next to `<env name="DB_DATABASE" value=":memory:"/>`:

```xml
        <env name="GO2RTC_URL" value="" force="true"/>
```

- [ ] **Step 4: Write the client**

Create `app/Games/PingPong/Services/Go2rtcClient.php`:

```php
<?php

namespace App\Games\PingPong\Services;

use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Talks to the go2rtc sidecar that owns the webcam during a match.
 *
 * Nothing here throws: go2rtc is only the low-latency path, and the recorder
 * opens the camera itself whenever go2rtc can't be reached.
 */
class Go2rtcClient
{
    public function isConfigured(): bool
    {
        return filled(config('pingpong.live.go2rtc_url'));
    }

    public function streamName(): string
    {
        return (string) config('pingpong.live.stream');
    }

    /**
     * Where the recorder reads the camera from while go2rtc owns it.
     */
    public function rtspUrl(): string
    {
        return rtrim((string) config('pingpong.live.go2rtc_rtsp_url'), '/').'/'.$this->streamName();
    }

    /**
     * Create or replace the match stream. go2rtc only runs the source (and
     * so only opens the camera) while something is reading the stream.
     */
    public function putStream(string $source): bool
    {
        return $this->send('PUT', '/api/streams', ['name' => $this->streamName(), 'src' => $source]);
    }

    /**
     * Make go2rtc exit. Docker restarts the container clean, which drops every
     * viewer, kills the FFmpeg holding the camera and forgets the stream.
     * go2rtc exits before it answers, so a dropped connection is the normal outcome.
     */
    public function reset(): void
    {
        $this->send('POST', '/api/exit', ['code' => '0'], expectReply: false);
    }

    /**
     * @param  array<string, string>  $query
     */
    private function send(string $method, string $path, array $query, bool $expectReply = true): bool
    {
        if (! $this->isConfigured()) {
            return false;
        }

        $url = rtrim((string) config('pingpong.live.go2rtc_url'), '/').$path.'?'.http_build_query($query);

        try {
            $response = Http::timeout((int) config('pingpong.live.timeout'))->send($method, $url);
        } catch (ConnectionException $exception) {
            if ($expectReply) {
                Log::warning('go2rtc is unreachable.', ['path' => $path, 'error' => $exception->getMessage()]);
            }

            return false;
        }

        if ($response->failed()) {
            Log::warning('go2rtc returned an error.', [
                'path' => $path,
                'status' => $response->status(),
                'body' => $response->body(),
            ]);

            return false;
        }

        return true;
    }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `docker compose exec app php artisan test --compact tests/Unit/Go2rtcClientTest.php`
Expected: PASS (7 tests).

- [ ] **Step 6: Format and commit**

```bash
docker compose exec app vendor/bin/pint --dirty --format agent
git add app/Games/PingPong/Services/Go2rtcClient.php tests/Unit/Go2rtcClientTest.php config/pingpong.php .env.example phpunit.xml
git commit -m "feat(ping-pong): go2rtc client for the low-latency livestream"
```

---

### Task 2: Record which recordings stream through go2rtc

**Files:**
- Create: `database/migrations/2026_09_25_000000_add_live_stream_to_ping_pong_recordings_table.php` (via `php artisan make:migration`)
- Modify: `app/Games/PingPong/Models/PingPongRecording.php:12-21` (fillable) and after `getHlsUrlAttribute()` (~line 53)
- Modify: `app/Games/PingPong/Controllers/PingPongApiController.php:916-921` (`liveRecording()` response)
- Test: `tests/Feature/PingPongLiveRecordingApiTest.php`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - column `ping_pong_recordings.live_stream` (nullable string); Task 3 writes the stream name (`'pingpong'`) or null.
  - `PingPongRecording::$live_stream_url` → `'/live/ws?src=pingpong'` while `status === 'recording'` and `live_stream` is set, else null.
  - `GET /games/ping-pong/api/recordings/live` JSON gains `live_stream_url` (string|null); Task 4 reads it.

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/PingPongLiveRecordingApiTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PingPongLiveRecordingApiTest extends TestCase
{
    use RefreshDatabase;

    private function recording(?string $liveStream): PingPongRecording
    {
        $left = Player::create(['name' => 'Ann']);
        $right = Player::create(['name' => 'Bob']);
        $match = PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
        ]);

        // No PID: getActiveRecording() only checks /proc when a PID is stored.
        return PingPongRecording::create([
            'match_id' => $match->id,
            'status' => 'recording',
            'hls_path' => 'recordings/live/'.$match->id,
            'live_stream' => $liveStream,
        ]);
    }

    public function test_live_recording_offers_the_go2rtc_stream_when_there_is_one(): void
    {
        $recording = $this->recording('pingpong');

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertOk()
            ->assertJson([
                'active' => true,
                'hls_url' => '/recordings/live/'.$recording->match_id.'/stream.m3u8',
                'live_stream_url' => '/live/ws?src=pingpong',
            ]);
    }

    public function test_live_recording_offers_only_hls_for_a_direct_recording(): void
    {
        $this->recording(null);

        $this->getJson('/games/ping-pong/api/recordings/live')
            ->assertOk()
            ->assertJsonPath('live_stream_url', null);
    }

    public function test_a_finished_recording_has_no_live_stream_url(): void
    {
        $recording = $this->recording('pingpong');
        $recording->update(['status' => 'finalizing']);

        $this->assertNull($recording->fresh()->live_stream_url);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app php artisan test --compact tests/Feature/PingPongLiveRecordingApiTest.php`
Expected: FAIL. SQLite reports the `live_stream` column doesn't exist (`table ping_pong_recordings has no column named live_stream`).

- [ ] **Step 3: Create the migration**

Run: `docker compose exec app php artisan make:migration add_live_stream_to_ping_pong_recordings_table --table=ping_pong_recordings --no-interaction`

Replace the generated file's body with:

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_recordings', function (Blueprint $table) {
            // go2rtc stream name when the match streams at low latency; null for direct recordings.
            $table->string('live_stream')->nullable()->after('hls_path');
        });
    }

    public function down(): void
    {
        Schema::table('ping_pong_recordings', function (Blueprint $table) {
            $table->dropColumn('live_stream');
        });
    }
};
```

- [ ] **Step 4: Update the model**

In `app/Games/PingPong/Models/PingPongRecording.php`, add `'live_stream',` to `$fillable` right after `'hls_path',`. Then add after `getHlsUrlAttribute()`:

```php
    public function getLiveStreamUrlAttribute(): ?string
    {
        if ($this->status !== 'recording' || ! $this->live_stream) {
            return null;
        }

        return '/live/ws?src='.$this->live_stream;
    }
```

- [ ] **Step 5: Return the URL from the API**

In `PingPongApiController::liveRecording()`, change the response array to:

```php
        return response()->json([
            'active' => true,
            'match_id' => $recording->match_id,
            'hls_url' => $recording->hls_url,
            'live_stream_url' => $recording->live_stream_url,
            'match' => $match,
        ]);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `docker compose exec app php artisan test --compact tests/Feature/PingPongLiveRecordingApiTest.php`
Expected: PASS (3 tests).

- [ ] **Step 7: Format and commit**

```bash
docker compose exec app vendor/bin/pint --dirty --format agent
git add database/migrations/*_add_live_stream_to_ping_pong_recordings_table.php app/Games/PingPong/Models/PingPongRecording.php app/Games/PingPong/Controllers/PingPongApiController.php tests/Feature/PingPongLiveRecordingApiTest.php
git commit -m "feat(ping-pong): expose the go2rtc live stream URL for active recordings"
```

---

### Task 3: Record through go2rtc, with fallback and camera release

**Files:**
- Modify: `app/Games/PingPong/Services/VideoRecordingService.php` (whole file below)
- Modify: `tests/Unit/VideoRecordingCommandTest.php` (add 4 tests)
- Test: `tests/Feature/VideoRecordingLiveStreamTest.php`

**Interfaces:**
- Consumes: `Go2rtcClient::{isConfigured, streamName, rtspUrl, putStream, reset}` (Task 1); `ping_pong_recordings.live_stream` (Task 2).
- Produces:
  - `VideoRecordingService::__construct(?Go2rtcClient $go2rtc = null)`
  - `public function buildGo2rtcSource(bool $withAudio): string`
  - `public function buildRecorderCommand(string $segmentPattern, string $m3u8Path): string`
  - unchanged `buildFfmpegCommand(string, string, bool): string`, `startRecording`, `stopRecording`, `getActiveRecording`, `cleanupOrphans`
  - protected seams for tests: `launch(string $command): int`, `isProcessRunning(int $pid): bool`, `waitForFirstSegment(string $hlsDir, int $pid): bool`, `stopProcess(int $pid, int $graceSeconds): void`, `pause(int $microseconds): void`

- [ ] **Step 1: Write the failing command tests**

Append these methods inside `tests/Unit/VideoRecordingCommandTest.php` (before the class's closing `}`):

```php
    public function test_go2rtc_source_runs_the_capture_command_and_publishes_rtsp(): void
    {
        config(['pingpong.recording_audio_device' => 'plughw:CARD=C920,DEV=0']);

        $source = (new VideoRecordingService)->buildGo2rtcSource(withAudio: true);

        $this->assertStringStartsWith('exec:ffmpeg ', $source);
        $this->assertStringContainsString('-f v4l2 -thread_queue_size 512 -video_size 1280x720 -framerate 30 -input_format mjpeg -i /dev/video0', $source);
        $this->assertStringContainsString('-f alsa -thread_queue_size 1024 -i plughw:CARD=C920,DEV=0', $source);
        $this->assertStringContainsString('-vf hflip,vflip', $source);
        $this->assertStringContainsString('-tune zerolatency', $source);
        $this->assertStringContainsString('-g 30', $source);
        $this->assertStringContainsString('-c:a aac', $source);
        $this->assertStringEndsWith('-rtsp_transport tcp -f rtsp {output}#killsignal=15#killtimeout=5', $source);
    }

    public function test_go2rtc_source_without_audio_has_no_audio_input(): void
    {
        $source = (new VideoRecordingService)->buildGo2rtcSource(withAudio: false);

        $this->assertStringNotContainsString('alsa', $source);
        $this->assertStringNotContainsString('-c:a', $source);
    }

    public function test_go2rtc_source_drops_an_audio_device_it_cannot_pass_safely(): void
    {
        // go2rtc splits exec sources on spaces and treats '#' as the start of its own parameters.
        config(['pingpong.recording_audio_device' => 'hw:0 #killsignal=9']);

        $source = (new VideoRecordingService)->buildGo2rtcSource(withAudio: true);

        $this->assertStringNotContainsString('alsa', $source);
        $this->assertSame(2, substr_count($source, '#'));
    }

    public function test_recorder_copies_the_go2rtc_stream_into_hls(): void
    {
        config(['pingpong.live.go2rtc_rtsp_url' => 'rtsp://go2rtc:8554']);

        $cmd = (new VideoRecordingService)->buildRecorderCommand('/tmp/seg%03d.ts', '/tmp/s.m3u8');

        $this->assertStringContainsString("-rtsp_transport tcp -i 'rtsp://go2rtc:8554/pingpong'", $cmd);
        $this->assertStringContainsString('-map 0 -c copy', $cmd);
        $this->assertStringContainsString("-f hls -hls_time 2 -hls_list_size 0 -hls_flags append_list -hls_segment_filename '/tmp/seg%03d.ts' '/tmp/s.m3u8'", $cmd);
        $this->assertStringNotContainsString('v4l2', $cmd);
        $this->assertStringNotContainsString('libx264', $cmd);
    }
```

- [ ] **Step 2: Write the failing orchestration tests**

Create `tests/Feature/VideoRecordingLiveStreamTest.php`:

```php
<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Services\Go2rtcClient;
use App\Games\PingPong\Services\VideoRecordingService;
use App\Jobs\FinalizeRecordingJob;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\TestCase;

class VideoRecordingLiveStreamTest extends TestCase
{
    use RefreshDatabase;

    private string $storage;

    protected function setUp(): void
    {
        parent::setUp();

        $this->storage = sys_get_temp_dir().'/pp-recording-test-'.uniqid();
        $this->app->useStoragePath($this->storage);

        config([
            'pingpong.live.go2rtc_url' => 'http://go2rtc:1984',
            'pingpong.live.go2rtc_rtsp_url' => 'rtsp://go2rtc:8554',
            'pingpong.recording_audio_device' => 'plughw:CARD=C920,DEV=0',
        ]);

        Queue::fake();
    }

    protected function tearDown(): void
    {
        File::deleteDirectory($this->storage);

        parent::tearDown();
    }

    private function match(): PingPongMatch
    {
        $left = Player::create(['name' => 'Ann']);
        $right = Player::create(['name' => 'Bob']);

        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
        ]);
    }

    /**
     * A recording service with simulated processes. Each launch gets the next
     * PID from 100; `$firstSegments` says, launch by launch, whether a
     * go2rtc-fed recorder wrote its first segment; `$deadPids` are processes
     * that exited on their own.
     *
     * @param  list<bool>  $firstSegments
     * @param  list<int>  $deadPids
     */
    private function service(array $firstSegments = [], array $deadPids = []): VideoRecordingService
    {
        return new class(app(Go2rtcClient::class), $firstSegments, $deadPids) extends VideoRecordingService
        {
            /** @var list<string> */
            public array $commands = [];

            /** @var list<int> */
            public array $stopped = [];

            private int $nextPid = 100;

            /**
             * @param  list<bool>  $firstSegments
             * @param  list<int>  $deadPids
             */
            public function __construct(Go2rtcClient $go2rtc, private array $firstSegments, private array $deadPids)
            {
                parent::__construct($go2rtc);
            }

            protected function launch(string $command): int
            {
                $this->commands[] = $command;

                return $this->nextPid++;
            }

            protected function isProcessRunning(int $pid): bool
            {
                return ! in_array($pid, $this->deadPids, true);
            }

            protected function waitForFirstSegment(string $hlsDir, int $pid): bool
            {
                return array_shift($this->firstSegments) ?? false;
            }

            protected function stopProcess(int $pid, int $graceSeconds): void
            {
                $this->stopped[] = $pid;
            }

            protected function pause(int $microseconds): void {}
        };
    }

    /**
     * @return list<string> the `src` of every stream go2rtc was asked to create
     */
    private function putSources(): array
    {
        return Http::recorded(fn (Request $request) => $request->method() === 'PUT')
            ->map(function (array $pair) {
                parse_str((string) parse_url($pair[0]->url(), PHP_URL_QUERY), $query);

                return $query['src'];
            })
            ->values()
            ->all();
    }

    private function assertReset(int $times = 1): void
    {
        $this->assertCount($times, Http::recorded(fn (Request $request) => $request->method() === 'POST'
            && $request->url() === 'http://go2rtc:1984/api/exit?code=0'));
    }

    public function test_streams_through_go2rtc_when_it_is_up(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $service = $this->service(firstSegments: [true]);

        $recording = $service->startRecording($this->match());

        $this->assertSame('recording', $recording->status);
        $this->assertSame('pingpong', $recording->live_stream);
        $this->assertSame(100, $recording->ffmpeg_pid);
        $this->assertCount(1, $service->commands);
        $this->assertStringContainsString("-i 'rtsp://go2rtc:8554/pingpong'", $service->commands[0]);
        $this->assertCount(1, $this->putSources());
        $this->assertStringContainsString('-f alsa', $this->putSources()[0]);
        $this->assertReset(0);
    }

    public function test_retries_go2rtc_without_the_mic_when_the_mic_fails(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $service = $this->service(firstSegments: [false, true]);

        $recording = $service->startRecording($this->match());

        $this->assertSame('pingpong', $recording->live_stream);
        $this->assertSame(101, $recording->ffmpeg_pid);
        $this->assertSame([100], $service->stopped);
        $sources = $this->putSources();
        $this->assertCount(2, $sources);
        $this->assertStringContainsString('-f alsa', $sources[0]);
        $this->assertStringNotContainsString('alsa', $sources[1]);
    }

    public function test_opens_the_camera_directly_when_go2rtc_cannot_produce_video(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $service = $this->service(firstSegments: [false, false]);

        $recording = $service->startRecording($this->match());

        $this->assertNull($recording->live_stream);
        $this->assertSame(102, $recording->ffmpeg_pid);
        $this->assertSame([100, 101], $service->stopped);
        $this->assertReset();
        $this->assertStringContainsString("-f v4l2", $service->commands[2]);
        $this->assertStringContainsString("-i '/dev/video0'", $service->commands[2]);
    }

    public function test_records_directly_when_go2rtc_is_unreachable(): void
    {
        Http::fake(['*' => Http::failedConnection()]);
        $service = $this->service();

        $recording = $service->startRecording($this->match());

        $this->assertSame('recording', $recording->status);
        $this->assertNull($recording->live_stream);
        $this->assertCount(1, $service->commands);
        $this->assertStringContainsString("-i '/dev/video0'", $service->commands[0]);
    }

    public function test_does_not_call_go2rtc_when_it_is_not_configured(): void
    {
        config(['pingpong.live.go2rtc_url' => '']);
        Http::fake();
        $service = $this->service();

        $match = $this->match();
        $recording = $service->startRecording($match);
        $service->stopRecording($match->fresh());

        $this->assertNull($recording->live_stream);
        $this->assertStringContainsString("-i '/dev/video0'", $service->commands[0]);
        Http::assertNothingSent();
    }

    public function test_the_direct_path_still_retries_without_the_mic(): void
    {
        config(['pingpong.live.go2rtc_url' => '']);
        Http::fake();
        $service = $this->service(deadPids: [100]);

        $recording = $service->startRecording($this->match());

        $this->assertSame(101, $recording->ffmpeg_pid);
        $this->assertStringContainsString('-f alsa', $service->commands[0]);
        $this->assertStringNotContainsString('alsa', $service->commands[1]);
    }

    public function test_stopping_a_go2rtc_recording_resets_go2rtc_to_release_the_camera(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $service = $this->service(firstSegments: [true]);
        $match = $this->match();
        $service->startRecording($match);

        $recording = $service->stopRecording($match->fresh());

        $this->assertSame('finalizing', $recording->status);
        $this->assertSame([100], $service->stopped);
        $this->assertReset();
        Queue::assertPushed(FinalizeRecordingJob::class);
    }

    public function test_a_go2rtc_recording_whose_recorder_died_is_cleared_and_go2rtc_reset(): void
    {
        Http::fake(['*' => Http::response('', 200)]);
        $match = $this->match();
        $this->service(firstSegments: [true])->startRecording($match);

        $this->assertNull($this->service(deadPids: [100])->getActiveRecording());

        $this->assertSame('failed', $match->recording()->first()->status);
        $this->assertReset();
    }

    public function test_waits_for_the_first_segment_while_the_recorder_runs(): void
    {
        config(['pingpong.live.first_segment_timeout' => 1]);
        $dir = $this->storage.'/segments';
        File::ensureDirectoryExists($dir);

        $service = new class extends VideoRecordingService
        {
            public bool $alive = true;

            public function waitsFor(string $dir): bool
            {
                return $this->waitForFirstSegment($dir, 100);
            }

            protected function isProcessRunning(int $pid): bool
            {
                return $this->alive;
            }

            protected function pause(int $microseconds): void {}
        };

        $this->assertFalse($service->waitsFor($dir), 'no segment before the timeout');

        $service->alive = false;
        $this->assertFalse($service->waitsFor($dir), 'recorder exited');

        File::put($dir.'/segment000.ts', 'x');
        $this->assertTrue($service->waitsFor($dir));
    }
}
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `docker compose exec app php artisan test --compact tests/Unit/VideoRecordingCommandTest.php tests/Feature/VideoRecordingLiveStreamTest.php`
Expected: FAIL. PHP reports `Call to undefined method ...buildGo2rtcSource()`, and fatal errors that the anonymous subclasses can't override private/undefined methods (`launch`, `waitForFirstSegment`, `stopProcess`, `pause`).

- [ ] **Step 4: Rewrite the service**

Replace `app/Games/PingPong/Services/VideoRecordingService.php` with:

```php
<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRecording;
use App\Jobs\FinalizeRecordingJob;
use Illuminate\Support\Facades\Log;

class VideoRecordingService
{
    private string $hlsBasePath;
    private string $videoBasePath;
    private string $videoDevice;
    private string $audioDevice;
    private Go2rtcClient $go2rtc;

    public function __construct(?Go2rtcClient $go2rtc = null)
    {
        $this->hlsBasePath = storage_path('app/recordings/live');
        $this->videoBasePath = storage_path('app/public/recordings/matches');
        $this->videoDevice = '/dev/video0';
        $this->audioDevice = (string) config('pingpong.recording_audio_device');
        $this->go2rtc = $go2rtc ?? app(Go2rtcClient::class);
    }

    public function startRecording(PingPongMatch $match): PingPongRecording
    {
        $active = $this->getActiveRecording();
        if ($active) {
            throw new \RuntimeException('Another recording is already active (match #' . $active->match_id . ')');
        }

        $hlsDir = $this->hlsBasePath . '/' . $match->id;
        $this->resetHlsDir($hlsDir);

        // Remove any previous recording for this match (e.g. completed/failed)
        PingPongRecording::where('match_id', $match->id)->delete();

        $recording = PingPongRecording::create([
            'match_id' => $match->id,
            'status' => 'pending',
            'hls_path' => 'recordings/live/' . $match->id,
        ]);

        $segmentPattern = $hlsDir . '/segment%03d.ts';
        $m3u8Path = $hlsDir . '/stream.m3u8';

        $pid = $this->startThroughGo2rtc($hlsDir, $segmentPattern, $m3u8Path);
        $liveStream = $pid > 0 ? $this->go2rtc->streamName() : null;

        if ($pid <= 0) {
            $pid = $this->startDirect($segmentPattern, $m3u8Path, $match);
        }

        if ($pid <= 0) {
            $recording->update(['status' => 'failed', 'error_message' => 'Failed to start FFmpeg process']);
            throw new \RuntimeException('Failed to start FFmpeg process');
        }

        if (!$this->isProcessRunning($pid)) {
            $recording->update(['status' => 'failed', 'error_message' => 'FFmpeg process exited immediately']);
            throw new \RuntimeException('FFmpeg process exited immediately (PID: ' . $pid . ')');
        }

        $recording->update([
            'status' => 'recording',
            'ffmpeg_pid' => $pid,
            'live_stream' => $liveStream,
        ]);

        Log::info('Recording started', ['match_id' => $match->id, 'pid' => $pid, 'live_stream' => $liveStream]);

        return $recording;
    }

    public function stopRecording(PingPongMatch $match): ?PingPongRecording
    {
        $recording = $match->recording;

        if (!$recording || $recording->status !== 'recording') {
            return $recording;
        }

        // Stop FFmpeg with SIGTERM for graceful shutdown (properly releases camera)
        if ($recording->ffmpeg_pid && $this->isProcessRunning($recording->ffmpeg_pid)) {
            $this->stopProcess($recording->ffmpeg_pid, 10);
        }

        // A viewer tab left open would keep go2rtc's FFmpeg, and the camera, alive.
        if ($recording->live_stream) {
            $this->go2rtc->reset();
        }

        $recording->update(['status' => 'finalizing', 'ffmpeg_pid' => null]);

        // Dispatch finalization to a queued job (remux + compress)
        FinalizeRecordingJob::dispatch($recording->id, $match->id);

        return $recording->fresh();
    }

    /**
     * FFmpeg command go2rtc runs as the match stream's source: the same
     * capture as the direct recorder, published to go2rtc over RTSP.
     */
    public function buildGo2rtcSource(bool $withAudio): string
    {
        // go2rtc splits exec sources on spaces and reads '#' as its own parameters.
        if ($withAudio && preg_match('/[\s#]/', $this->audioDevice)) {
            Log::warning('Audio device cannot be passed to go2rtc, streaming video only', ['audio_device' => $this->audioDevice]);
            $withAudio = false;
        }

        $withAudio = $withAudio && $this->audioDevice !== '';
        $audioInput = $withAudio ? '-f alsa -thread_queue_size 1024 -i ' . $this->audioDevice . ' ' : '';
        $audioCodec = $withAudio ? '-c:a aac -b:a 96k ' : '';

        return 'exec:ffmpeg -hide_banner -f v4l2 -thread_queue_size 512 -video_size 1280x720 -framerate 30 -input_format mjpeg '
            . '-i ' . $this->videoDevice . ' ' . $audioInput
            . '-vf hflip,vflip -c:v libx264 -pix_fmt yuv420p -preset ultrafast -tune zerolatency -profile:v baseline -g 30 '
            . $audioCodec
            . '-rtsp_transport tcp -f rtsp {output}#killsignal=15#killtimeout=5';
    }

    /**
     * Recorder for the go2rtc path: copies go2rtc's already-encoded stream
     * into the same HLS files the direct recorder writes.
     */
    public function buildRecorderCommand(string $segmentPattern, string $m3u8Path): string
    {
        return sprintf(
            'nohup ffmpeg -rtsp_transport tcp -i %s -map 0 -c copy '
            . '-f hls -hls_time 2 -hls_list_size 0 -hls_flags append_list '
            . '-hls_segment_filename %s %s '
            . '> /dev/null 2>&1 & echo $!',
            escapeshellarg($this->go2rtc->rtspUrl()),
            escapeshellarg($segmentPattern),
            escapeshellarg($m3u8Path)
        );
    }

    public function buildFfmpegCommand(string $segmentPattern, string $m3u8Path, bool $withAudio): string
    {
        $audioInput = $withAudio
            ? '-f alsa -thread_queue_size 1024 -i ' . escapeshellarg($this->audioDevice) . ' '
            : '';
        $audioCodec = $withAudio ? '-c:a aac -b:a 96k ' : '';

        return sprintf(
            'nohup ffmpeg -f v4l2 -thread_queue_size 512 -video_size 1280x720 -framerate 30 -input_format mjpeg '
            . '-i %s %s-vf "hflip,vflip" -c:v libx264 -pix_fmt yuv420p -preset ultrafast -tune zerolatency -g 60 '
            . '%s-f hls -hls_time 2 -hls_list_size 0 -hls_flags append_list '
            . '-hls_segment_filename %s %s '
            . '> /dev/null 2>&1 & echo $!',
            escapeshellarg($this->videoDevice),
            $audioInput,
            $audioCodec,
            escapeshellarg($segmentPattern),
            escapeshellarg($m3u8Path)
        );
    }

    public function getActiveRecording(): ?PingPongRecording
    {
        $recording = PingPongRecording::where('status', 'recording')->first();

        if (!$recording) {
            return null;
        }

        // Check if the associated match has already ended
        $match = $recording->match;
        if ($match && $match->ended_at !== null) {
            Log::warning('Clearing stale recording for completed match', [
                'recording_id' => $recording->id,
                'match_id' => $recording->match_id,
            ]);
            $this->stopRecording($match);
            return null;
        }

        if ($recording->ffmpeg_pid && !$this->isProcessRunning($recording->ffmpeg_pid)) {
            Log::warning('Clearing stale recording with dead FFmpeg process', [
                'recording_id' => $recording->id,
                'match_id' => $recording->match_id,
                'pid' => $recording->ffmpeg_pid,
            ]);
            if ($recording->live_stream) {
                $this->go2rtc->reset();
            }
            $recording->update([
                'status' => 'failed',
                'ffmpeg_pid' => null,
                'error_message' => 'FFmpeg process died (likely container restart)',
            ]);
            $this->cleanupHlsDir($recording->match_id);
            return null;
        }

        return $recording;
    }

    public function cleanupOrphans(): array
    {
        $cleaned = ['salvaged' => 0, 'failed' => 0, 'dirs_removed' => 0];

        // Find recordings marked as "recording" with dead processes
        $stale = PingPongRecording::where('status', 'recording')->get();

        foreach ($stale as $recording) {
            if ($recording->ffmpeg_pid && $this->isProcessRunning($recording->ffmpeg_pid)) {
                continue; // Still running, not orphaned
            }

            if ($recording->live_stream) {
                $this->go2rtc->reset();
            }

            // Try to salvage by dispatching finalization job
            $recording->update(['status' => 'finalizing', 'ffmpeg_pid' => null]);
            FinalizeRecordingJob::dispatch($recording->id, $recording->match_id);
            $cleaned['salvaged']++;
        }

        // Clean up stale HLS directories with no matching active or finalizing recording
        if (is_dir($this->hlsBasePath)) {
            $dirs = glob($this->hlsBasePath . '/*', GLOB_ONLYDIR);
            foreach ($dirs as $dir) {
                $matchId = basename($dir);
                $hasActive = PingPongRecording::where('match_id', $matchId)
                    ->whereIn('status', ['recording', 'finalizing'])
                    ->exists();

                if (!$hasActive) {
                    $this->removeDirectory($dir);
                    $cleaned['dirs_removed']++;
                }
            }
        }

        return $cleaned;
    }

    /**
     * Low-latency path: go2rtc opens the camera and the recorder copies its
     * RTSP output. Returns the recorder PID, or 0 when the camera should be
     * opened directly instead.
     */
    private function startThroughGo2rtc(string $hlsDir, string $segmentPattern, string $m3u8Path): int
    {
        if (!$this->go2rtc->isConfigured()) {
            return 0;
        }

        $attempts = $this->audioDevice !== '' ? [true, false] : [false];

        foreach ($attempts as $withAudio) {
            if (!$this->go2rtc->putStream($this->buildGo2rtcSource($withAudio))) {
                break;
            }

            $pid = $this->spawnFfmpeg($this->buildRecorderCommand($segmentPattern, $m3u8Path));

            if ($pid > 0 && $this->waitForFirstSegment($hlsDir, $pid)) {
                return $pid;
            }

            Log::warning('go2rtc produced no video for the recorder', ['with_audio' => $withAudio]);

            if ($pid > 0 && $this->isProcessRunning($pid)) {
                $this->stopProcess($pid, 2);
            }
            $this->resetHlsDir($hlsDir);

            // go2rtc stops its FFmpeg once the recorder leaves; let it release the camera.
            $this->pause(1000000);
        }

        // Restart go2rtc so nothing of it still holds /dev/video0 when we open it ourselves.
        $this->go2rtc->reset();
        $this->pause(3000000);

        return 0;
    }

    /**
     * The recorder opens the camera itself, retrying without the mic when
     * the mic is missing or busy.
     */
    private function startDirect(string $segmentPattern, string $m3u8Path, PingPongMatch $match): int
    {
        $withAudio = $this->audioDevice !== '';
        $pid = $this->spawnFfmpeg($this->buildFfmpegCommand($segmentPattern, $m3u8Path, $withAudio));

        // ponytail: a missing/busy mic shouldn't cost the whole recording, so retry video-only
        if ($pid > 0 && !$this->isProcessRunning($pid) && $withAudio) {
            Log::warning('FFmpeg failed with audio, retrying video-only', ['match_id' => $match->id, 'audio_device' => $this->audioDevice]);
            $pid = $this->spawnFfmpeg($this->buildFfmpegCommand($segmentPattern, $m3u8Path, withAudio: false));
        }

        return $pid;
    }

    /**
     * Launch FFmpeg in the background and return its PID, after a short pause
     * so a process that dies on startup (bad device) is already gone.
     */
    private function spawnFfmpeg(string $command): int
    {
        $pid = $this->launch($command);

        if ($pid > 0) {
            $this->pause(500000);
        }

        return $pid;
    }

    protected function launch(string $command): int
    {
        return (int) trim((string) shell_exec($command));
    }

    /**
     * True once the recorder has opened its first segment, which only happens
     * after go2rtc has actually delivered video from the camera.
     */
    protected function waitForFirstSegment(string $hlsDir, int $pid): bool
    {
        $checks = (int) config('pingpong.live.first_segment_timeout') * 4;

        for ($check = 0; $check < $checks; $check++) {
            if (!empty(glob($hlsDir . '/*.ts'))) {
                return true;
            }

            if (!$this->isProcessRunning($pid)) {
                return false;
            }

            $this->pause(250000);
        }

        return !empty(glob($hlsDir . '/*.ts'));
    }

    /**
     * SIGTERM so FFmpeg finalises its output and releases the device, then
     * SIGKILL if it is still around after the grace period.
     */
    protected function stopProcess(int $pid, int $graceSeconds): void
    {
        posix_kill($pid, SIGTERM);

        for ($waited = 0; $waited < $graceSeconds * 2 && $this->isProcessRunning($pid); $waited++) {
            $this->pause(500000);
        }

        if ($this->isProcessRunning($pid)) {
            posix_kill($pid, SIGKILL);
            $this->pause(500000);
        }
    }

    protected function pause(int $microseconds): void
    {
        usleep($microseconds);
    }

    protected function isProcessRunning(int $pid): bool
    {
        return file_exists('/proc/' . $pid);
    }

    private function resetHlsDir(string $hlsDir): void
    {
        if (is_dir($hlsDir)) {
            $this->removeDirectory($hlsDir);
        }

        mkdir($hlsDir, 0775, true);
    }

    private function cleanupHlsDir(int $matchId): void
    {
        $hlsDir = $this->hlsBasePath . '/' . $matchId;
        if (is_dir($hlsDir)) {
            $this->removeDirectory($hlsDir);
        }
    }

    private function removeDirectory(string $dir): void
    {
        $files = glob($dir . '/*');
        foreach ($files as $file) {
            is_dir($file) ? $this->removeDirectory($file) : unlink($file);
        }
        rmdir($dir);
    }
}
```

Note what changed beyond the go2rtc path, for the reviewer:
- `stopRecording`'s kill loop moved into `stopProcess()` unchanged (10 s grace = 20 × 0.5 s).
- `spawnFfmpeg()` now takes the command string.
- `isProcessRunning()` is protected.
- The HLS dir is emptied at start (the old recording row for the match is deleted anyway).

- [ ] **Step 5: Run the tests to verify they pass**

Run: `docker compose exec app php artisan test --compact tests/Unit/VideoRecordingCommandTest.php tests/Feature/VideoRecordingLiveStreamTest.php tests/Feature/PingPongLiveRecordingApiTest.php`
Expected: PASS (6 + 9 + 3 tests).

- [ ] **Step 6: Run the rest of the ping pong suite**

Run: `docker compose exec app php artisan test --compact --filter=PingPong`
Expected: PASS. Match-start controllers call `startRecording()` inside `try/catch`, and `GO2RTC_URL` is forced empty in tests, so they behave as before.

- [ ] **Step 7: Format and commit**

```bash
docker compose exec app vendor/bin/pint --dirty --format agent
git add app/Games/PingPong/Services/VideoRecordingService.php tests/Unit/VideoRecordingCommandTest.php tests/Feature/VideoRecordingLiveStreamTest.php
git commit -m "feat(ping-pong): record through go2rtc with direct-camera fallback"
```

---

### Task 4: Low-latency player on watch, embed and play pages

**Files:**
- Create: `resources/views/games/ping-pong/partials/live-video-script.blade.php`
- Modify: `resources/views/games/ping-pong/watch.blade.php` (script includes ~line 171; data ~line 186; `checkForLiveMatch` line 384; `initPlayer` lines 469-505; `destroyPlayer` lines 507-512)
- Modify: `resources/views/games/ping-pong/embed-live.blade.php` (script include line 83; data line 91; line 147; `initPlayer` lines 227-263; `destroyPlayer` lines 265-270)
- Modify: `resources/views/games/ping-pong/play.blade.php` (preview `x-show` line 381; script include line 565; data line 628; call at line 1271; `initLivePlayer` / `destroyLivePlayer` lines 1501-1525)
- Test: `tests/Feature/PingPongLiveVideoPagesTest.php`

**Interfaces:**
- Consumes: `live_stream_url` from `GET /games/ping-pong/api/recordings/live` (Task 2).
- Produces: `window.pingPongLiveVideo.mount(videoEl: HTMLVideoElement, wsUrl: string, onUnavailable: () => void): { destroy(): void }`

- [ ] **Step 1: Write the failing test**

Create `tests/Feature/PingPongLiveVideoPagesTest.php`:

```php
<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PingPongLiveVideoPagesTest extends TestCase
{
    use RefreshDatabase;

    private const PLAYER = 'https://cdn.jsdelivr.net/gh/AlexxIT/go2rtc@v1.9.14/www/video-stream.js';

    public function test_watch_page_mounts_the_live_stream_before_hls(): void
    {
        $this->get('/games/ping-pong/watch')
            ->assertOk()
            ->assertSee(self::PLAYER, false)
            ->assertSee('window.pingPongLiveVideo = {', false)
            ->assertSee('this.initPlayer(recData.hls_url, recData.live_stream_url)', false)
            ->assertSee('window.pingPongLiveVideo.mount(video, liveUrl', false);
    }

    public function test_embed_page_mounts_the_live_stream_before_hls(): void
    {
        $this->get('/games/ping-pong/embed-live')
            ->assertOk()
            ->assertSee(self::PLAYER, false)
            ->assertSee('this.initPlayer(recData.hls_url, recData.live_stream_url)', false)
            ->assertSee('window.pingPongLiveVideo.mount(video, liveUrl', false);
    }

    public function test_playing_screen_preview_uses_the_live_stream(): void
    {
        $this->get('/games/ping-pong')
            ->assertOk()
            ->assertSee(self::PLAYER, false)
            ->assertSee('x-show="hlsInstance || liveVideo"', false)
            ->assertSee('this.startLivePreview(this.match.id)', false)
            ->assertSee('window.pingPongLiveVideo.mount(video, liveUrl', false);
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `docker compose exec app php artisan test --compact tests/Feature/PingPongLiveVideoPagesTest.php`
Expected: FAIL: `Failed asserting that ... contains "https://cdn.jsdelivr.net/gh/AlexxIT/go2rtc@v1.9.14/www/video-stream.js"`.

- [ ] **Step 3: Create the shared player partial**

Create `resources/views/games/ping-pong/partials/live-video-script.blade.php`:

```blade
{{-- Low-latency live video from the go2rtc sidecar: WebRTC on the office LAN, MSE over the WebSocket elsewhere. --}}
<script type="module" src="https://cdn.jsdelivr.net/gh/AlexxIT/go2rtc@v1.9.14/www/video-stream.js"></script>
<script>
window.pingPongLiveVideo = {
    /**
     * Show go2rtc's <video-stream> in place of `videoEl` (same classes and
     * inline style, so mirroring and fit carry over). Calls `onUnavailable`
     * if the player script hasn't loaded after 5 s, so the page can use HLS.
     */
    mount(videoEl, wsUrl, onUnavailable) {
        let stream = null;
        let destroyed = false;

        const giveUp = setTimeout(() => {
            if (destroyed || stream) return;
            destroyed = true;
            onUnavailable();
        }, 5000);

        customElements.whenDefined('video-stream').then(() => {
            if (destroyed) return;
            clearTimeout(giveUp);

            const objectFit = getComputedStyle(videoEl).objectFit;
            stream = document.createElement('video-stream');
            stream.mode = 'webrtc,mse';
            stream.media = 'video';
            stream.className = videoEl.className;
            stream.style.cssText = videoEl.style.cssText;
            stream.style.display = 'block';
            stream.dataset.liveVideo = '';

            videoEl.hidden = true;
            videoEl.after(stream);

            stream.video.muted = true;
            stream.video.controls = false;
            stream.video.style.objectFit = objectFit;
            stream.src = wsUrl;
        });

        return {
            destroy() {
                destroyed = true;
                clearTimeout(giveUp);
                if (stream) stream.remove();
                stream = null;
                videoEl.hidden = false;
            },
        };
    },
};
</script>
```

- [ ] **Step 4: Wire the watch page**

In `watch.blade.php`:

1. After `<script src="https://cdn.jsdelivr.net/npm/hls.js@1.5.17/dist/hls.min.js"></script>`, add:
```blade
@include('games.ping-pong.partials.live-video-script')
```
2. In the data object, after `hlsInstance: null,` add:
```js
        liveVideo: null,
```
3. In `checkForLiveMatch()`, change `this.$nextTick(() => this.initPlayer(recData.hls_url));` to:
```js
                        this.$nextTick(() => this.initPlayer(recData.hls_url, recData.live_stream_url));
```
4. Replace the opening of `initPlayer(hlsUrl) {` through `this.destroyPlayer();` with:
```js
        initPlayer(hlsUrl, liveUrl = null) {
            const video = document.getElementById('watchPlayer');
            if (!video) return;

            this.destroyPlayer();

            if (liveUrl && window.pingPongLiveVideo) {
                this.liveVideo = window.pingPongLiveVideo.mount(video, liveUrl, () => {
                    this.liveVideo = null;
                    this.initPlayer(hlsUrl);
                });
                return;
            }
```
(the existing `if (typeof Hls !== 'undefined' ...` block stays as it is below this)
5. Replace `destroyPlayer()` with:
```js
        destroyPlayer() {
            if (this.liveVideo) {
                this.liveVideo.destroy();
                this.liveVideo = null;
            }
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },
```

- [ ] **Step 5: Wire the embed page**

In `embed-live.blade.php`, apply the same five edits:

1. `@include('games.ping-pong.partials.live-video-script')` after the hls.js `<script>` (line 83).
2. `liveVideo: null,` after `hlsInstance: null,` (line 91).
3. Line 147 becomes `this.$nextTick(() => this.initPlayer(recData.hls_url, recData.live_stream_url));`
4. `initPlayer` opening:
```js
        initPlayer(hlsUrl, liveUrl = null) {
            const video = document.getElementById('embedPlayer');
            if (!video) return;

            this.destroyPlayer();

            if (liveUrl && window.pingPongLiveVideo) {
                this.liveVideo = window.pingPongLiveVideo.mount(video, liveUrl, () => {
                    this.liveVideo = null;
                    this.initPlayer(hlsUrl);
                });
                return;
            }
```
5. `destroyPlayer()`:
```js
        destroyPlayer() {
            if (this.liveVideo) {
                this.liveVideo.destroy();
                this.liveVideo = null;
            }
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },
```

The embed `<video>` sits inside a `transform:scaleX(-1)` wrapper, so the `<video-stream>` inserted beside it is mirrored the same way.

- [ ] **Step 6: Wire the playing screen**

In `play.blade.php`:

1. Line 381: `<div x-show="hlsInstance" class="flex justify-center mb-1">` becomes:
```blade
            <div x-show="hlsInstance || liveVideo" class="flex justify-center mb-1">
```
2. After the hls.js `<script>` (line 565): `@include('games.ping-pong.partials.live-video-script')`
3. After `hlsInstance: null,` (line 628): `liveVideo: null,`
4. Line 1271, `this.initLivePlayer('/recordings/live/' + this.match.id + '/stream.m3u8');`, becomes:
```js
                this.startLivePreview(this.match.id);
```
5. Replace `initLivePlayer(hlsUrl) { ... }` and `destroyLivePlayer() { ... }` with:
```js
        async startLivePreview(matchId) {
            let liveUrl = null;
            try {
                const res = await fetch(`${this.API}/recordings/live`);
                if (res.ok) {
                    const rec = await res.json();
                    if (rec.active && rec.match_id === matchId) liveUrl = rec.live_stream_url;
                }
            } catch (e) {
                // The HLS preview works without it.
            }
            this.initLivePlayer('/recordings/live/' + matchId + '/stream.m3u8', liveUrl);
        },

        initLivePlayer(hlsUrl, liveUrl = null) {
            this.$nextTick(() => {
                const video = document.getElementById('livePlayer');
                if (!video) return;
                if (liveUrl && window.pingPongLiveVideo) {
                    this.liveVideo = window.pingPongLiveVideo.mount(video, liveUrl, () => {
                        this.liveVideo = null;
                        this.initLivePlayer(hlsUrl);
                    });
                    return;
                }
                if (typeof Hls !== 'undefined' && Hls.isSupported()) {
                    this.hlsInstance = new Hls({
                        liveSyncDuration: 3,
                        liveMaxLatencyDuration: 6,
                        enableWorker: true,
                    });
                    this.hlsInstance.loadSource(hlsUrl);
                    this.hlsInstance.attachMedia(video);
                    this.hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => video.play());
                } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                    video.src = hlsUrl;
                    video.play();
                }
            });
        },

        destroyLivePlayer() {
            if (this.liveVideo) {
                this.liveVideo.destroy();
                this.liveVideo = null;
            }
            if (this.hlsInstance) {
                this.hlsInstance.destroy();
                this.hlsInstance = null;
            }
        },
```

- [ ] **Step 7: Run the page tests**

Run: `docker compose exec app php artisan test --compact tests/Feature/PingPongLiveVideoPagesTest.php tests/Feature/PingPongWatchPageTest.php tests/Feature/EmbedLivePageTest.php`
Expected: PASS. The existing mirroring and label tests must stay green.

- [ ] **Step 8: Commit**

```bash
git add resources/views/games/ping-pong/partials/live-video-script.blade.php resources/views/games/ping-pong/watch.blade.php resources/views/games/ping-pong/embed-live.blade.php resources/views/games/ping-pong/play.blade.php tests/Feature/PingPongLiveVideoPagesTest.php
git commit -m "feat(ping-pong): low-latency go2rtc player with HLS fallback"
```

---

### Task 5: go2rtc container and the `/live/ws` proxy

**Files:**
- Create: `docker/go2rtc/go2rtc.yaml`
- Modify: `docker-compose.camera.yml`
- Modify: `docker/nginx/default.conf` (new `location` after the `/recordings/live/` block, line 38)

**Interfaces:**
- Consumes: stream name `pingpong`; `GO2RTC_LAN_IP` from `.env`.
- Produces: host `go2rtc` on network `games-hub-camera` with API `:1984` and RTSP `:8554` (unpublished); `${GO2RTC_LAN_IP}:8555` tcp+udp; `GET /live/ws?src=pingpong` on the app.

- [ ] **Step 1: Write the go2rtc config**

Create `docker/go2rtc/go2rtc.yaml`:

```yaml
# go2rtc sidecar for the ping pong livestream.
# Spec: docs/superpowers/specs/2026-09-25-low-latency-livestream-design.md
#
# No streams here on purpose: the games hub creates `pingpong` at match start
# (PUT /api/streams) and makes go2rtc exit at match end, so between matches
# nothing can open the camera. go2rtc runs from a copy of this file because
# the streams API rewrites its config file.

api:
  listen: ":1984"     # games-hub-camera network only; never published

rtsp:
  listen: ":8554"     # the recorder in the app container reads from here

webrtc:
  listen: ":8555"     # published on the office LAN address only
  candidates:
    - ${GO2RTC_LAN_IP}:8555

exec:
  allow_paths: [ffmpeg]

log:
  level: info
```

- [ ] **Step 2: Add the service to the camera override**

Replace `docker-compose.camera.yml` with:

```yaml
services:
  app:
    devices:
      # Kept for the direct fallback when go2rtc can't open the camera.
      - "/dev/video0:/dev/video0"
      - "/dev/snd:/dev/snd"
    group_add:
      - "video"
      - "audio"
      - "44"
    networks:
      - proxy
      - camera

  go2rtc:
    image: alexxit/go2rtc:1.9.14
    container_name: games-hub-go2rtc
    # The hub makes go2rtc exit after every match to release the camera; this brings it back clean.
    restart: unless-stopped
    networks:
      - camera
    devices:
      - "/dev/video0:/dev/video0"
      - "/dev/snd:/dev/snd"
    environment:
      - GO2RTC_LAN_IP=${GO2RTC_LAN_IP:-192.168.1.134}
    volumes:
      - ./docker/go2rtc/go2rtc.yaml:/etc/go2rtc/go2rtc.yaml:ro
    # A fresh copy each start: streams added through the API never survive a restart.
    command: ["sh", "-c", "cp /etc/go2rtc/go2rtc.yaml /tmp/go2rtc.yaml && exec go2rtc -config /tmp/go2rtc.yaml"]
    ports:
      - "${GO2RTC_LAN_IP:-192.168.1.134}:8555:8555/tcp"
      - "${GO2RTC_LAN_IP:-192.168.1.134}:8555:8555/udp"

networks:
  camera:
    name: games-hub-camera
    driver: bridge
```

- [ ] **Step 3: Add the nginx proxy**

In `docker/nginx/default.conf`, after the closing `}` of `location /recordings/live/`, add:

```nginx

    # Low-latency live video: go2rtc's player WebSocket (MSE, plus WebRTC
    # signalling). Only the match stream gets through; the rest of the go2rtc
    # API can run commands and must never be reachable from outside.
    location = /live/ws {
        if ($args != "src=pingpong") {
            return 403;
        }

        # Resolve at request time, so nginx still starts on machines without
        # the camera override (and so without a go2rtc container).
        resolver 127.0.0.11 valid=10s ipv6=off;
        set $go2rtc_upstream http://go2rtc:1984;
        proxy_pass $go2rtc_upstream/api/ws?src=pingpong;

        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        # go2rtc compares the Origin with the Host it sees.
        proxy_set_header Host $host;
        proxy_buffering off;
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
    }
```

- [ ] **Step 4: Validate the compose file**

Run: `docker compose -f docker-compose.yml -f docker-compose.camera.yml config --quiet && echo OK`
Expected: `OK`.

- [ ] **Step 5: Deploy between matches**

Check nothing is recording (expect an empty result):
Run: `docker compose exec app php artisan tinker --execute 'echo App\Games\PingPong\Models\PingPongRecording::where("status","recording")->count();'`
Expected: `0`. If not `0`, wait for the match to end.

Then:
```bash
make build && make up
docker compose exec app php artisan migrate --force
```
Expected: `games-hub`, `games-hub-worker` and `games-hub-go2rtc` running (`make status`). `GO2RTC_URL` is still empty in `.env`, so the app behaves as before.

- [ ] **Step 6: Check the container**

Run each and compare:

| Command | Expected |
|---|---|
| `docker exec games-hub nginx -t` | `syntax is ok` / `test is successful` |
| `docker exec games-hub-go2rtc ffmpeg -hide_banner -devices 2>&1 \| grep -E ' (v4l2\|alsa) '` | both `alsa` and `v4l2` listed. **If `alsa` is missing, stop and tell the user**: the go2rtc path would only ever stream video-only. |
| `docker exec games-hub-go2rtc arecord -L 2>/dev/null \| grep -c C920 \|\| docker exec games-hub-go2rtc ls /dev/snd` | the C920 card or `/dev/snd` entries are visible |
| `docker exec games-hub curl -s http://go2rtc:1984/api/streams` | `{}` (no streams) |
| `docker port games-hub-go2rtc` | only `8555/tcp` and `8555/udp` on `192.168.1.134` |
| `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8081/live/ws?src=other'` | `403` |
| `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8081/live/ws?src=pingpong&x=1'` | `403` |
| `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8081/live/ws?src=pingpong'` | not `403`, not `502` (go2rtc answers the non-WebSocket request) |
| `curl -s -o /dev/null -w '%{http_code}\n' 'http://localhost:8081/live/api/streams'` | `404` (only `/live/ws` is proxied) |

Also check nginx without the override starts, which covers dev laptops (Review Focus 3):
Run: `docker run --rm -v "$PWD/docker/nginx/default.conf:/etc/nginx/conf.d/default.conf:ro" nginx:alpine nginx -t`
Expected: `test is successful`. This container has no `go2rtc` host, which proves the lookup waits until a request arrives.

- [ ] **Step 7: Commit**

```bash
git add docker/go2rtc/go2rtc.yaml docker-compose.camera.yml docker/nginx/default.conf
git commit -m "feat(ping-pong): go2rtc sidecar and /live/ws proxy for the livestream"
```

---

### Task 6: Switch it on and verify with the real camera

**Files:**
- Modify: `.env` (not committed): `GO2RTC_URL=http://go2rtc:1984`
- Modify: `CLAUDE.md` (new section after "## Hourly Ping Pong Matchmaking")

**Interfaces:**
- Consumes: everything above.
- Produces: a verified, documented feature.

- [ ] **Step 1: Turn it on (between matches)**

Set `GO2RTC_URL=http://go2rtc:1984` in `.env`. Config isn't cached (`bootstrap/cache` has no `config.php`), so nothing else is needed. Confirm:
Run: `docker compose exec app php artisan config:show pingpong.live`
Expected: `go2rtc_url` → `http://go2rtc:1984`.

- [ ] **Step 2: Start a test match and check the path taken**

Start a match from the playing screen. Then:

| Check | Expected |
|---|---|
| Match start felt normal (≤ ~3 s longer than before) | yes |
| `docker compose exec app php artisan tinker --execute 'echo App\Games\PingPong\Models\PingPongRecording::latest("id")->first()->live_stream;'` | `pingpong` |
| `docker compose exec app curl -s http://go2rtc:1984/api/streams` | a `pingpong` entry with a producer and at least one consumer |
| `ls storage/app/recordings/live/<match id>/` | `segment000.ts`, `segment001.ts`, … growing every ~2 s |

- [ ] **Step 3: Check both viewer paths and the delay**

- Office laptop, `https://games.tlmhub.space/games/ping-pong/watch`. In the devtools console, `document.querySelector('video-stream').pc?.connectionState` should be `"connected"` (WebRTC).
- Phone on mobile data (not office Wi-Fi), same URL. The video plays, and `document.querySelector('video-stream')` exists (MSE). If you can't reach the console, it's enough that the video plays and noticeably leads the table-side TV that's still on HLS.
- Delay: hold a phone showing a running stopwatch in front of the camera and photograph it next to the screen. **Office: under 1 s. Remote: about 1–2 s.**
- The video is mirrored as before on `/watch` and `/embed-live`, and the corner labels still match the sides.

- [ ] **Step 4: End the match and check the camera is released**

End the match with a `/watch` tab **still open** (Review Focus 1). Then:

| Check | Expected |
|---|---|
| `docker ps --filter name=games-hub-go2rtc --format '{{.Status}}'` | `Up N seconds` (it just restarted) |
| `docker exec games-hub-go2rtc curl -s localhost:1984/api/streams` | `{}` |
| Webcam LED | off |
| After the finalize job: recording `status` | `completed` |
| `docker exec games-hub ffprobe -v error -show_entries stream=codec_type,duration -of compact /var/www/storage/app/public/recordings/matches/<match id>.mp4` | a video stream and an audio stream, with duration ≈ the match length |
| Clips flagged during the match | extracted as usual |

- [ ] **Step 5: Check the fallbacks**

1. `docker stop games-hub-go2rtc`, start a match. The recording works, `live_stream` is null, and `/watch` plays HLS. End the match, then `docker start games-hub-go2rtc`.
2. Unplug the webcam mic, or set `RECORDING_AUDIO_DEVICE=plughw:CARD=Nope,DEV=0` in `.env`, then start a match. `live_stream` is `pingpong`, and the recording has video and no audio. Restore the setting afterwards.
3. Kill switch: set `GO2RTC_URL=` (empty), start a match. It records directly, `live_stream` is null, and `/watch` plays HLS. Set it back.

- [ ] **Step 6: Document it**

In `CLAUDE.md`, add after the "Hourly Ping Pong Matchmaking" section:

```markdown
## Livestream (go2rtc)

`/watch`, `/embed-live` and the playing-screen preview get sub-second video from
the `games-hub-go2rtc` sidecar (`docker-compose.camera.yml`): WebRTC on the office
LAN (`${GO2RTC_LAN_IP}:8555`), MSE over `/live/ws` everywhere else. hls.js on the
recorder's HLS files is the fallback.

The hub controls the camera: match start creates go2rtc's `pingpong` stream and the
recorder copies it over RTSP; match end calls go2rtc's `/api/exit`, and Docker restarts
it clean, so nothing holds `/dev/video0` between matches. If go2rtc fails, the recorder
opens the camera itself as before. `live_stream` on the recording says which path a
match used.

Kill switch: `GO2RTC_URL=` (empty) in `.env`. go2rtc's API and RTSP are only on the
`games-hub-camera` network, and nginx proxies nothing but `/live/ws?src=pingpong`.
Keep it that way: the API can run commands.
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document the go2rtc livestream"
```
