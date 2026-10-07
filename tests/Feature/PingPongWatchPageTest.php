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

    public function test_watch_page_shows_the_viewer_count_and_who_joins(): void
    {
        $response = $this->get('/games/ping-pong/watch');

        $response->assertOk();
        $response->assertSee('...pingPongViewers()', false);
        $response->assertSee('data-viewer-count', false);
        $response->assertSee('data-viewer-join', false);
        $response->assertSee('data-viewers-list', false);
        $response->assertSee('this.joinViewers(this.matchId)', false);
        $response->assertSee('this.leaveViewers()', false);
        $response->assertSee("role: 'viewer'", false);
        $response->assertSee('/viewers/auth', false);
    }

    public function test_playing_screen_lists_viewers_without_counting_itself(): void
    {
        $response = $this->get('/games/ping-pong');

        $response->assertOk();
        $response->assertSee('...pingPongViewers()', false);
        $response->assertSee('data-viewers-list', false);
        $response->assertSee('data-viewer-join', false);
        $response->assertSee('this.joinViewers(matchId)', false);
        $response->assertSee("role: 'screen'", false);
    }

    public function test_both_screens_print_a_line_when_someone_joins_the_chat(): void
    {
        foreach (['/games/ping-pong/watch', '/games/ping-pong'] as $url) {
            $html = $this->get($url)->assertOk()->getContent();

            $this->assertStringContainsString('data-chat-join', $html, $url);
            $this->assertStringContainsString('joined the chat', $html, $url);
            $this->assertStringContainsString('this.addChatJoin(member.name)', $html, $url);
        }
    }

    public function test_the_playing_screen_counts_only_real_messages(): void
    {
        $html = $this->get('/games/ping-pong')->assertOk()->getContent();

        $this->assertStringContainsString("chatMessageCount() + ' msgs'", $html);
        $this->assertStringNotContainsString("chatMessages.length + ' msgs'", $html);
    }

    public function test_watch_page_has_a_sound_button_that_hides_once_sound_is_on(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertMatchesRegularExpression('/x-show="hasVideo && !audioOn"[^>]*@click="enableAudio\(\)"[^>]*data-audio-enable/s', $html);
        $this->assertStringContainsString('Click to turn on sound', $html);
        $this->assertStringContainsString('video.muted = !this.audioOn', $html);
        $this->assertMatchesRegularExpression('/<video[^>]*id="watchPlayer"[^>]*muted/s', $html);
    }

    /**
     * A watcher with the page open picks up a new match and its stream from the
     * websocket alone: no reload, and no timer polling the API.
     */
    public function test_watch_page_follows_new_streams_over_the_websocket_without_polling(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertStringContainsString("channel('ping-pong.live')", $html);
        $this->assertStringContainsString("listen('.match.started'", $html);
        $this->assertStringContainsString("listen('.stream.ready'", $html);
        $this->assertStringContainsString('data-live-status', $html);
        $this->assertStringNotContainsString('setInterval', $this->watchLiveScript($html));
        $this->assertStringNotContainsString('Re-checking in', $html);
    }

    /**
     * hls.startLoad() never re-requests a manifest that failed, so a dropped
     * stream must rebuild the player to reconnect.
     */
    public function test_watch_page_rebuilds_the_player_after_a_fatal_network_error(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertStringContainsString('this.retryStream()', $html);
        $this->assertStringContainsString('this.initPlayer(this.streamUrl)', $html);
        $this->assertStringNotContainsString('hls.startLoad();', $this->watchLiveScript($html));
    }

    /**
     * On a portrait phone the overlay collided with itself: the button row covered
     * the LIVE badge and the two 320px ELO cards and names overlapped. The stream
     * stacks instead, and phones get only the video, the score and the chat.
     */
    public function test_watch_page_stacks_the_stream_on_portrait_phones(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertStringContainsString('max-md:portrait:flex-col', $html);
        $this->assertMatchesRegularExpression('/id="watchPlayer"[^>]*max-md:portrait:relative[^>]*max-md:portrait:aspect-video/s', $html);
        $this->assertMatchesRegularExpression('/data-elo-card="left"[^>]*max-md:hidden/s', $html);
        $this->assertMatchesRegularExpression('/data-elo-toggle\s+class="max-md:!hidden/', $html);
        $this->assertMatchesRegularExpression('/aria-label="Scoreboard"\s+class="max-md:!hidden/', $html);
        // The two corner cards and the two score-only cards; the stacked phone copies are gone.
        $this->assertSame(4, substr_count($html, "previewPlayerIdsForSide('"));
        $this->assertMatchesRegularExpression('/data-audio-enable[^>]*whitespace-nowrap/s', $html);
    }

    /**
     * The floating camera button sits in the bottom-right corner, right where Send is.
     */
    public function test_chat_send_button_stays_clear_of_the_camera_button(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertMatchesRegularExpression('/class="[^"]*pr-16[^"]*" data-chat-composer/', $html);
    }

    /**
     * scrollChatToBottom() threw on `this.$root` after an await, so the chat never
     * followed new messages, and a GIF that loaded late pushed its own caption out
     * of view. Phones also have a short chat, so the /giphy preview has to fit it.
     */
    public function test_chat_follows_new_messages_and_gifs_fit_a_phone(): void
    {
        $html = $this->get('/games/ping-pong/watch')->assertOk()->getContent();

        $this->assertStringContainsString("(this.\$root ?? document).querySelectorAll('[data-chat-scroll]')", $html);
        $this->assertStringContainsString('loading="lazy" @load="scrollChatToBottom()"', $html);
        $this->assertMatchesRegularExpression('/currentGif\(\)\.title"[^>]*max-h-\[110px\] md:max-h-\[180px\]/s', $html);
        $this->assertStringContainsString('<div class="max-md:hidden"><div data-viewers-list', $html);
    }

    private function watchLiveScript(string $html): string
    {
        $start = strpos($html, 'function watchLive()');
        $this->assertNotFalse($start);

        return substr($html, $start, strpos($html, '</script>', $start) - $start);
    }
}
