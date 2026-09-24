<?php

namespace Tests\Feature;

use App\Games\PingPong\Events\ChatMessagePosted;
use App\Games\PingPong\Models\PingPongChatMessage;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

class PingPongChatTest extends TestCase
{
    use RefreshDatabase;

    private const API = '/games/ping-pong/api/chat';

    public function test_messages_returns_the_last_fifty_oldest_first_with_player(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $start = Carbon::parse('2026-09-24 10:00:00');

        for ($i = 1; $i <= 55; $i++) {
            PingPongChatMessage::create([
                'player_id' => $ann->id,
                'body' => "Message {$i}",
                'created_at' => $start->copy()->addSeconds($i),
            ]);
        }

        $response = $this->getJson(self::API.'/messages');

        $response->assertOk();
        $response->assertJsonCount(50);
        $response->assertJsonPath('0.body', 'Message 6');
        $response->assertJsonPath('49.body', 'Message 55');
        $response->assertJsonPath('0.player.name', 'Ann');
        $response->assertJsonStructure([['id', 'body', 'created_at', 'player' => ['id', 'name']]]);
    }

    public function test_posting_stores_and_broadcasts_the_message(): void
    {
        Event::fake([ChatMessagePosted::class]);
        $ann = Player::create(['name' => 'Ann']);

        $response = $this->postJson(self::API.'/messages', [
            'player_id' => $ann->id,
            'body' => '  Nice smash!  ',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('body', 'Nice smash!');
        $response->assertJsonPath('player.name', 'Ann');
        $this->assertDatabaseHas('ping_pong_chat_messages', ['player_id' => $ann->id, 'body' => 'Nice smash!']);

        Event::assertDispatched(
            ChatMessagePosted::class,
            fn (ChatMessagePosted $event) => $event->message['body'] === 'Nice smash!'
                && $event->message['player']['name'] === 'Ann',
        );
    }

    public function test_chat_message_broadcasts_on_the_chat_channel(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        $message = PingPongChatMessage::create(['player_id' => $ann->id, 'body' => 'Hi']);

        $event = new ChatMessagePosted($message);

        $this->assertSame('ping-pong.chat', $event->broadcastOn()[0]->name);
        $this->assertSame('chat.message-posted', $event->broadcastAs());
    }

    public function test_posting_rejects_an_empty_body(): void
    {
        $ann = Player::create(['name' => 'Ann']);

        $this->postJson(self::API.'/messages', ['player_id' => $ann->id, 'body' => '   '])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('body');
    }

    public function test_posting_rejects_a_body_over_two_hundred_characters(): void
    {
        $ann = Player::create(['name' => 'Ann']);

        $this->postJson(self::API.'/messages', ['player_id' => $ann->id, 'body' => str_repeat('a', 201)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('body');
    }

    public function test_posting_rejects_an_unknown_player(): void
    {
        $this->postJson(self::API.'/messages', ['player_id' => 999, 'body' => 'Hello'])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('player_id');
    }

    public function test_posting_twice_within_five_seconds_is_throttled_per_player(): void
    {
        Event::fake([ChatMessagePosted::class]);
        $ann = Player::create(['name' => 'Ann']);
        $bob = Player::create(['name' => 'Bob']);

        $this->postJson(self::API.'/messages', ['player_id' => $ann->id, 'body' => 'One'])->assertCreated();
        $this->postJson(self::API.'/messages', ['player_id' => $ann->id, 'body' => 'Two'])->assertTooManyRequests();
        $this->postJson(self::API.'/messages', ['player_id' => $bob->id, 'body' => 'Mine'])->assertCreated();

        $this->assertDatabaseCount('ping_pong_chat_messages', 2);
    }

    public function test_posting_is_allowed_again_after_the_cooldown(): void
    {
        Event::fake([ChatMessagePosted::class]);
        $ann = Player::create(['name' => 'Ann']);

        $this->postJson(self::API.'/messages', ['player_id' => $ann->id, 'body' => 'One'])->assertCreated();

        $this->travel(6)->seconds();

        $this->postJson(self::API.'/messages', ['player_id' => $ann->id, 'body' => 'Two'])->assertCreated();
    }

    public function test_identify_returns_existing_player_case_insensitively(): void
    {
        $ann = Player::create(['name' => 'Ann Smith']);

        $response = $this->postJson(self::API.'/identify', ['name' => '  ann smith ']);

        $response->assertOk();
        $response->assertJsonPath('id', $ann->id);
        $response->assertJsonPath('name', 'Ann Smith');
        $this->assertDatabaseCount('players', 1);
    }

    public function test_identify_creates_a_new_player_for_an_unknown_name(): void
    {
        $response = $this->postJson(self::API.'/identify', ['name' => ' Carol ']);

        $response->assertCreated();
        $response->assertJsonPath('name', 'Carol');
        $this->assertDatabaseHas('players', ['name' => 'Carol']);
    }

    public function test_identify_rejects_empty_and_overlong_names(): void
    {
        $this->postJson(self::API.'/identify', ['name' => '  '])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        $this->postJson(self::API.'/identify', ['name' => str_repeat('a', 256)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('name');

        $this->assertDatabaseCount('players', 0);
    }

    public function test_deleting_a_player_deletes_their_messages(): void
    {
        $ann = Player::create(['name' => 'Ann']);
        PingPongChatMessage::create(['player_id' => $ann->id, 'body' => 'Bye']);

        $ann->delete();

        $this->assertDatabaseCount('ping_pong_chat_messages', 0);
    }
}
