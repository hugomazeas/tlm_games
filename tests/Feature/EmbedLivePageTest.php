<?php

namespace Tests\Feature;

use Tests\TestCase;

class EmbedLivePageTest extends TestCase
{
    public function test_embed_live_page_loads(): void
    {
        $response = $this->get('/games/ping-pong/embed-live');

        $response->assertOk();
        $response->assertSee('embedLive()');
        $response->assertSee('hls.js');
    }

    public function test_embed_live_page_allows_iframing(): void
    {
        $response = $this->get('/games/ping-pong/embed-live');

        $response->assertOk();
        $response->assertHeader('X-Frame-Options', 'ALLOWALL');
        $response->assertHeader('Content-Security-Policy', 'frame-ancestors *');
    }

    public function test_embed_live_page_has_no_nav(): void
    {
        $response = $this->get('/games/ping-pong/embed-live');

        $response->assertOk();
        $response->assertDontSee('Games Hub</span>');
    }

    public function test_embed_live_page_has_og_tags(): void
    {
        $response = $this->get('/games/ping-pong/embed-live');

        $response->assertOk();
        $response->assertSee('og:title', false);
        $response->assertSee('og:image', false);
    }

    public function test_embed_live_labels_match_the_mirrored_video(): void
    {
        $html = $this->get('/games/ping-pong/embed-live')->assertOk()->getContent();

        $leftCorner = strpos($html, 'bottom:24px;left:24px');
        $rightCorner = strpos($html, 'bottom:24px;right:24px');
        $this->assertNotFalse($leftCorner);

        $this->assertLessThan($rightCorner, strpos($html, 'match?.player_left?.name', $leftCorner));
        $this->assertGreaterThan($rightCorner, strpos($html, 'match?.player_right?.name', $leftCorner));
    }
}
