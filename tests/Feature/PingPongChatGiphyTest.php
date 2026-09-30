<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\ChatMessagePosted;
use App\Games\PingPong\Models\PingPongMatch;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class PingPongChatGiphyTest extends TestCase
{
    use RefreshDatabase;

    private const API = '/games/ping-pong/api/chat';

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.giphy.key' => 'test-key',
            'services.giphy.rating' => 'pg',
            'services.giphy.hourly_limit' => 90,
        ]);
    }

    private function liveMatch(): PingPongMatch
    {
        $left = Player::create(['name' => fake()->unique()->name()]);
        $right = Player::create(['name' => fake()->unique()->name()]);

        return PingPongMatch::create([
            'mode' => '1v1',
            'player_left_id' => $left->id,
            'player_right_id' => $right->id,
            'first_server_id' => $left->id,
            'started_at' => now(),
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function giphyGif(string $id, string $rating = 'g'): array
    {
        return [
            'id' => $id,
            'title' => "Gif {$id}",
            'rating' => $rating,
            'images' => [
                'fixed_height' => [
                    'url' => "https://media.giphy.com/media/{$id}/200.gif",
                    'webp' => "https://media.giphy.com/media/{$id}/200.webp",
                    'width' => '266',
                    'height' => '200',
                ],
                'downsized_medium' => [
                    'url' => "https://media.giphy.com/media/{$id}/giphy.gif",
                    'width' => '490',
                    'height' => '368',
                ],
            ],
        ];
    }

    private function fakeGiphy(array $gifs): void
    {
        Http::fake([
            'api.giphy.com/*' => Http::response(['data' => $gifs, 'meta' => ['status' => 200]]),
        ]);
    }

    public function test_search_asks_giphy_with_the_query_and_rating_and_returns_trimmed_gifs(): void
    {
        $this->fakeGiphy([$this->giphyGif('abc'), $this->giphyGif('def')]);
        $ann = Player::create(['name' => 'Ann']);

        $response = $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id);

        $response->assertOk();
        $response->assertJsonCount(2);
        $response->assertJsonPath('0', [
            'id' => 'abc',
            'title' => 'Gif abc',
            'preview_url' => 'https://media.giphy.com/media/abc/200.webp',
            'url' => 'https://media.giphy.com/media/abc/giphy.gif',
            'width' => 490,
            'height' => 368,
        ]);

        Http::assertSent(fn (Request $request) => str_starts_with($request->url(), 'https://api.giphy.com/v1/gifs/search')
            && $request['api_key'] === 'test-key'
            && $request['q'] === 'cats'
            && $request['rating'] === 'pg');
    }

    public function test_search_drops_gifs_rated_above_the_cap(): void
    {
        $this->fakeGiphy([$this->giphyGif('ok', 'pg'), $this->giphyGif('spicy', 'r')]);
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)
            ->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.id', 'ok');
    }

    public function test_repeating_a_search_is_served_from_cache(): void
    {
        $this->fakeGiphy([$this->giphyGif('abc')]);
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=Cats&player_id='.$ann->id)->assertOk();
        $this->getJson(self::API.'/giphy?q=%20cats%20&player_id='.$ann->id)->assertOk()->assertJsonPath('0.id', 'abc');

        Http::assertSentCount(1);
    }

    public function test_search_without_a_key_is_unavailable(): void
    {
        config(['services.giphy.key' => null]);
        Http::fake();
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)
            ->assertServiceUnavailable()
            ->assertJsonPath('message', "GIFs aren't set up.");

        Http::assertNothingSent();
    }

    public function test_search_reports_a_giphy_failure(): void
    {
        Http::fake(['api.giphy.com/*' => Http::response([], 500)]);
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)
            ->assertStatus(502)
            ->assertJsonPath('message', 'Giphy is not answering — try again.');
    }

    public function test_search_stops_calling_giphy_once_the_hourly_limit_is_reached(): void
    {
        config(['services.giphy.hourly_limit' => 2]);
        $this->fakeGiphy([$this->giphyGif('abc')]);
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);

        $this->getJson(self::API.'/giphy?q=one&player_id='.$ann->id)->assertOk();
        $this->getJson(self::API.'/giphy?q=two&player_id='.$bob->id)->assertOk();
        $this->getJson(self::API.'/giphy?q=three&player_id='.$ann->id)
            ->assertTooManyRequests()
            ->assertJsonPath('message', fn (string $message) => str_starts_with($message, 'GIF limit reached'));

        // Searches already cached still work.
        $this->getJson(self::API.'/giphy?q=one&player_id='.$bob->id)->assertOk();

        Http::assertSentCount(2);
    }

    public function test_the_hourly_limit_resets_after_an_hour(): void
    {
        config(['services.giphy.hourly_limit' => 1]);
        $this->fakeGiphy([$this->giphyGif('abc')]);
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=one&player_id='.$ann->id)->assertOk();
        $this->getJson(self::API.'/giphy?q=two&player_id='.$ann->id)->assertTooManyRequests();

        $this->travel(61)->minutes();

        $this->getJson(self::API.'/giphy?q=two&player_id='.$ann->id)->assertOk();
    }

    public function test_one_player_can_only_search_ten_times_in_ten_minutes(): void
    {
        $this->fakeGiphy([$this->giphyGif('abc')]);
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);

        for ($i = 1; $i <= 10; $i++) {
            $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)->assertOk();
        }

        $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)->assertTooManyRequests();
        $this->getJson(self::API.'/giphy?q=cats&player_id='.$bob->id)->assertOk();
    }

    public function test_search_validates_the_query_and_player(): void
    {
        Http::fake();
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?player_id='.$ann->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('q');

        $this->getJson(self::API.'/giphy?q='.str_repeat('a', 101).'&player_id='.$ann->id)
            ->assertUnprocessable()
            ->assertJsonValidationErrors('q');

        $this->getJson(self::API.'/giphy?q=cats&player_id=999')
            ->assertUnprocessable()
            ->assertJsonValidationErrors('player_id');

        Http::assertNothingSent();
    }

    public function test_posting_a_searched_gif_stores_and_broadcasts_it_without_calling_giphy_again(): void
    {
        Event::fake([ChatMessagePosted::class]);
        $this->fakeGiphy([$this->giphyGif('abc')]);
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)->assertOk();

        $response = $this->postJson(self::API.'/messages', [
            'match_id' => $match->id,
            'player_id' => $ann->id,
            'body' => 'cats',
            'gif_id' => 'abc',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('body', 'cats');
        $response->assertJsonPath('gif.url', 'https://media.giphy.com/media/abc/giphy.gif');
        $response->assertJsonPath('gif.preview_url', 'https://media.giphy.com/media/abc/200.webp');
        $response->assertJsonPath('gif.width', 490);
        $response->assertJsonPath('gif.height', 368);

        $this->getJson(self::API.'/messages?match_id='.$match->id)
            ->assertJsonPath('0.gif.url', 'https://media.giphy.com/media/abc/giphy.gif');

        Event::assertDispatched(
            ChatMessagePosted::class,
            fn (ChatMessagePosted $event) => $event->message['gif']['url'] === 'https://media.giphy.com/media/abc/giphy.gif',
        );

        Http::assertSentCount(1);
    }

    public function test_posting_a_gif_the_server_never_returned_is_rejected(): void
    {
        Event::fake([ChatMessagePosted::class]);
        Http::fake();
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $this->postJson(self::API.'/messages', [
            'match_id' => $match->id,
            'player_id' => $ann->id,
            'body' => 'cats',
            'gif_id' => 'made-up',
        ])->assertUnprocessable()->assertJsonValidationErrors('gif_id');

        $this->assertDatabaseCount('ping_pong_chat_messages', 0);
        Event::assertNotDispatched(ChatMessagePosted::class);
        Http::assertNothingSent();
    }

    public function test_a_text_message_has_no_gif(): void
    {
        Event::fake([ChatMessagePosted::class]);
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $this->postJson(self::API.'/messages', ['match_id' => $match->id, 'player_id' => $ann->id, 'body' => 'Hi'])
            ->assertCreated()
            ->assertJsonPath('gif', null);
    }

    public function test_the_chat_cooldown_also_covers_gifs(): void
    {
        Event::fake([ChatMessagePosted::class]);
        $this->fakeGiphy([$this->giphyGif('abc')]);
        $match = $this->liveMatch();
        $ann = Player::create(['name' => 'Ann']);

        $this->getJson(self::API.'/giphy?q=cats&player_id='.$ann->id)->assertOk();

        $this->postJson(self::API.'/messages', ['match_id' => $match->id, 'player_id' => $ann->id, 'body' => 'Hi'])->assertCreated();
        $this->postJson(self::API.'/messages', ['match_id' => $match->id, 'player_id' => $ann->id, 'body' => 'cats', 'gif_id' => 'abc'])
            ->assertTooManyRequests();
    }
}
