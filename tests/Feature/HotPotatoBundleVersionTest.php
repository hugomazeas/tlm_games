<?php

namespace Tests\Feature;

use App\Games\HotPotato\Services\BundleVersion;
use App\Games\HotPotato\Models\HotPotatoGame;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

/**
 * The sidecar's bundles load with a version in their URL, so a deploy is never hidden by
 * a cache (Cloudflare gives .js a 4-hour browser TTL), which left tabs reloading in a loop.
 */
class HotPotatoBundleVersionTest extends TestCase
{
    use RefreshDatabase;

    public function test_the_version_changes_when_a_source_changes_and_only_then(): void
    {
        $root = sys_get_temp_dir().'/bundle-version-'.uniqid();
        mkdir($root.'/client', 0777, true);
        file_put_contents($root.'/client/main.ts', 'one');
        touch($root.'/client/main.ts', 1_000_000);

        $before = (new BundleVersion($root))->current();
        $this->assertSame($before, (new BundleVersion($root))->current());

        touch($root.'/client/main.ts', 2_000_000);
        $this->assertNotSame($before, (new BundleVersion($root))->current());

        // A new file counts too, even an old one.
        $edited = (new BundleVersion($root))->current();
        file_put_contents($root.'/client/extra.ts', 'two');
        touch($root.'/client/extra.ts', 1_000);
        $this->assertNotSame($edited, (new BundleVersion($root))->current());
    }

    public function test_the_pages_load_the_bundles_with_the_version(): void
    {
        $version = app(BundleVersion::class)->current();
        Storage::fake('local');
        $game = HotPotatoGame::create(['seed' => 1, 'theme' => 'gym', 'duration_seconds' => 60, 'started_at' => now(), 'ended_at' => now()]);
        $game->players()->create(['player_id' => Player::create(['name' => 'Ana'])->id, 'position' => 1, 'survived' => true, 'hold_ms' => 0, 'passes' => 0]);
        Storage::disk('local')->put('hot-potato/replays/'.$game->id.'.json.gz', gzencode('{}'));
        $game->update(['replay_path' => 'hot-potato/replays/'.$game->id.'.json.gz']);

        $this->get('/games/hot-potato')
            ->assertOk()
            ->assertSee('/games/hot-potato/live/client.js?v='.$version, false)
            ->assertSee('data-stale-notice', false);
        $this->get("/games/hot-potato/replays/{$game->id}")
            ->assertOk()
            ->assertSee('/games/hot-potato/live/replay.js?v='.$version, false);
    }
}
