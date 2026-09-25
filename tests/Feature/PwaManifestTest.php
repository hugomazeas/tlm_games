<?php

namespace Tests\Feature;

use App\Games\PingPong\Models\PingPongLobby;
use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

class PwaManifestTest extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function manifest(): array
    {
        return json_decode(file_get_contents(public_path('manifest.webmanifest')), true, flags: JSON_THROW_ON_ERROR);
    }

    /**
     * @return array<string, array{int}>
     */
    public static function requiredIconSizes(): array
    {
        return [
            '192px' => [192],
            '512px' => [512],
        ];
    }

    /**
     * Chrome on Android refuses to offer installation unless the manifest has
     * a PNG icon of at least 144px whose purpose includes "any". A manifest
     * with only maskable icons silently fails that check.
     */
    #[DataProvider('requiredIconSizes')]
    public function test_manifest_has_an_installable_any_purpose_icon(int $size): void
    {
        $icons = collect($this->manifest()['icons'])->filter(function (array $icon) use ($size): bool {
            $purposes = explode(' ', $icon['purpose'] ?? 'any');

            return in_array('any', $purposes, true) && $icon['sizes'] === "{$size}x{$size}";
        });

        $this->assertNotEmpty($icons, "No {$size}px icon with purpose \"any\"");

        foreach ($icons as $icon) {
            $this->assertFileExists(public_path(ltrim($icon['src'], '/')));
            $this->assertSame($size, getimagesize(public_path(ltrim($icon['src'], '/')))[0]);
        }
    }

    public function test_manifest_keeps_maskable_icons_for_adaptive_launchers(): void
    {
        $maskable = collect($this->manifest()['icons'])
            ->filter(fn (array $icon): bool => in_array('maskable', explode(' ', $icon['purpose'] ?? ''), true));

        $this->assertNotEmpty($maskable);
    }

    public function test_manifest_declares_a_standalone_app(): void
    {
        $manifest = $this->manifest();

        $this->assertSame('/', $manifest['id']);
        $this->assertSame('/', $manifest['start_url']);
        $this->assertSame('standalone', $manifest['display']);
    }

    /**
     * @return array<string, array{\Closure(): string}>
     */
    public static function fullPageViews(): array
    {
        return [
            'dashboard' => [fn (): string => '/'],
            'lobby join page (QR code landing)' => [function (): string {
                PingPongLobby::create([
                    'code' => 'AB12',
                    'mode' => '1v1',
                    'host_token' => str_repeat('h', 64),
                    'status' => 'waiting',
                    'expires_at' => Carbon::now()->addMinutes(50),
                ]);

                return '/games/ping-pong/lobby/AB12';
            }],
            'phone remote' => [function (): string {
                $ann = Player::create(['name' => 'Ann']);
                $bob = Player::create(['name' => 'Bob']);
                $match = PingPongMatch::create([
                    'mode' => '1v1',
                    'player_left_id' => $ann->id,
                    'player_right_id' => $bob->id,
                    'first_server_id' => $ann->id,
                    'player_left_score' => 0,
                    'player_right_score' => 0,
                    'started_at' => Carbon::now(),
                ]);

                return "/games/ping-pong/remote/{$match->id}/left";
            }],
        ];
    }

    /**
     * iOS takes the home-screen icon from the page "Add to Home Screen" is
     * tapped on. A page without the tags gets a blank or screenshot icon.
     */
    #[DataProvider('fullPageViews')]
    public function test_every_full_page_carries_the_install_icons(\Closure $makeUrl): void
    {
        $this->get($makeUrl())
            ->assertOk()
            ->assertSee('rel="apple-touch-icon" sizes="180x180"', false)
            ->assertSee('rel="manifest"', false)
            ->assertSee('name="apple-mobile-web-app-capable"', false);
    }

    /**
     * The service worker caches the QR decoder by version. If the scanner is
     * bumped to a new version without the worker, the cache silently stops
     * matching and the slow first open comes back.
     */
    public function test_service_worker_caches_the_decoder_version_the_scanner_loads(): void
    {
        $scanner = file_get_contents(resource_path('views/components/camera-fab.blade.php'));
        $worker = file_get_contents(public_path('sw.js'));

        preg_match_all('/barcode-detector@([\d.]+)/', $scanner, $matches);
        $versions = array_unique($matches[1]);

        $this->assertCount(1, $versions, 'The scanner loads more than one decoder version');
        $this->assertStringContainsString('barcode-detector@'.str_replace('.', '\\.', $versions[0]), $worker);
    }
}
