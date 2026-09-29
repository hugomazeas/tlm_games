<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PingPongWatchPageTest extends TestCase
{
    use RefreshDatabase;

    public function test_watch_page_offers_match_start_alerts(): void
    {
        $response = $this->get('/games/ping-pong/watch');

        $response->assertOk();
        $response->assertSee('data-match-alerts-banner', false);
        $response->assertSee('/push/match-starts/subscribe', false);
    }

    /**
     * The alerts mixin is spread into watchLive(), and a spread copies a
     * getter's value once instead of the getter, which froze the banner
     * hidden. Its visibility has to be a method so it stays reactive.
     */
    public function test_match_alerts_banner_visibility_survives_the_mixin_spread(): void
    {
        $response = $this->get('/games/ping-pong/watch');

        $response->assertOk();
        $response->assertSee('x-show="showMatchAlertsBanner()"', false);
        $response->assertDontSee('get showMatchAlertsBanner()', false);
    }

    public function test_watch_page_renders_the_chat_sidebar(): void
    {
        $response = $this->get('/games/ping-pong/watch');

        $response->assertOk();
        $response->assertSee('data-chat-sidebar', false);
        $response->assertSee('data-chat-composer', false);
        $response->assertSee('...pingPongChat()', false);
    }

    public function test_watch_page_chat_follows_the_live_match(): void
    {
        $response = $this->get('/games/ping-pong/watch');

        $response->assertOk();
        $response->assertSee('this.joinChat(this.matchId)', false);
        $response->assertSee('this.leaveChat()', false);
        $response->assertSee('Chat opens when a match starts');
    }

    public function test_watch_page_has_the_elo_toggle_and_cards(): void
    {
        $response = $this->get('/games/ping-pong/watch');

        $response->assertOk();
        $response->assertSee('data-elo-toggle', false);
        $response->assertSee('data-elo-card="left"', false);
        $response->assertSee('data-elo-card="right"', false);
        $response->assertSee('...pingPongEloPreview()', false);
    }

    public function test_watch_page_mirrors_the_video_without_swapping_labels(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertMatchesRegularExpression('/<video[^>]*id="watchPlayer"[^>]*-scale-x-100/s', $html);

        $leftCorner = strpos($html, 'absolute bottom-6 left-6');
        $rightCorner = strpos($html, 'absolute bottom-6 right-6');
        $this->assertNotFalse($leftCorner);
        $this->assertLessThan($rightCorner, strpos($html, 'match?.player_left?.name', $leftCorner));
        $this->assertGreaterThan($rightCorner, strpos($html, 'match?.player_right?.name', $leftCorner));
    }

    public function test_playing_screen_has_the_chat_column_and_flash_overlay(): void
    {
        $response = $this->get('/games/ping-pong');

        $response->assertOk();
        $response->assertSee('data-chat-column', false);
        $response->assertSee('data-chat-flash', false);
        $response->assertSee('lg:grid-cols-[3fr_2fr_3fr]', false);
    }

    public function test_chat_flash_covers_the_whole_screen_and_fits_its_text(): void
    {
        $html = $this->get('/games/ping-pong')->assertOk()->getContent();

        $this->assertMatchesRegularExpression('/data-chat-flash\s[^>]*class="!fixed inset-0/s', $html);
        $this->assertStringContainsString('data-chat-flash-body', $html);
        $this->assertStringContainsString('fitChatFlash()', $html);
        $this->assertStringNotContainsString('pph-display uppercase tracking-[0.02em] leading-tight', $html);
    }
}
