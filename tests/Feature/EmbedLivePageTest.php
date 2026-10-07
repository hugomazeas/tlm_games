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

    /**
     * An open embed picks up a new match and its stream from the websocket
     * alone: no reload, and no timer polling the API.
     */
    public function test_embed_live_follows_new_streams_over_the_websocket_without_polling(): void
    {
        $html = $this->get('/games/ping-pong/embed-live')->assertOk()->getContent();

        $this->assertStringContainsString("channel('ping-pong.live')", $html);
        $this->assertStringContainsString("listen('.match.started'", $html);
        $this->assertStringContainsString("listen('.stream.ready'", $html);
        $this->assertStringContainsString('data-live-status', $html);
        $this->assertStringNotContainsString('setInterval', $html);
        $this->assertStringNotContainsString('Checking again in', $html);
    }

    /**
     * hls.startLoad() never re-requests a manifest that failed, so a dropped
     * stream must rebuild the player to reconnect.
     */
    public function test_embed_live_rebuilds_the_player_after_a_fatal_network_error(): void
    {
        $html = $this->get('/games/ping-pong/embed-live')->assertOk()->getContent();

        $this->assertStringContainsString('this.retryStream()', $html);
        $this->assertStringContainsString('this.initPlayer(this.streamUrl)', $html);
        $this->assertStringNotContainsString('hls.startLoad();', $html);
    }

    /**
     * Each match used to open a fresh websocket connection without closing the last one.
     */
    public function test_embed_live_reuses_one_websocket_connection(): void
    {
        $html = $this->get('/games/ping-pong/embed-live')->assertOk()->getContent();

        $this->assertSame(1, substr_count($html, 'new Echo('));
        $this->assertStringContainsString('if (this.echo) return;', $html);
        $this->assertStringContainsString('this.echo.leave(this.matchChannel)', $html);
    }
}
