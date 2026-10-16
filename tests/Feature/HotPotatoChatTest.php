<?php

namespace Tests\Feature;

use App\Games\HotPotato\Models\HotPotatoChatLine;
use App\Games\HotPotato\Models\HotPotatoLook;
use App\Models\Office;
use App\Models\Player;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The hot potato chat as the game server saves and reloads it.
 */
class HotPotatoChatTest extends TestCase
{
    use RefreshDatabase;

    private const SECRET = 'test-secret';

    protected function setUp(): void
    {
        parent::setUp();
        config(['games.hot_potato.internal_secret' => self::SECRET]);
    }

    public function test_the_game_server_saves_messages_and_events(): void
    {
        $office = Office::create(['name' => 'Québec']);
        $alice = Player::create(['name' => 'Alice']);

        $this->postJson('/internal/hot-potato/chat', ['lines' => [
            ['office_id' => $office->id, 'player_id' => $alice->id, 'kind' => 'message', 'body' => 'gg', 'event' => null, 'at' => '2026-10-16T15:00:00.123Z'],
            ['office_id' => $office->id, 'player_id' => null, 'kind' => 'event', 'body' => null, 'event' => ['type' => 'boom', 'mode' => 'survival', 'name' => 'Bob'], 'at' => '2026-10-16T15:00:01.000Z'],
        ]], $this->internal())->assertCreated()->assertJson(['stored' => 2]);

        [$message, $event] = HotPotatoChatLine::orderBy('id')->get();
        $this->assertSame('gg', $message->body);
        $this->assertSame($alice->id, $message->player_id);
        $this->assertSame(123, (int) $message->posted_at->format('v'));
        $this->assertSame(['type' => 'boom', 'mode' => 'survival', 'name' => 'Bob'], $event->event);
    }

    public function test_saving_needs_the_secret_and_well_formed_lines(): void
    {
        $office = Office::create(['name' => 'Québec']);

        $this->postJson('/internal/hot-potato/chat', ['lines' => [$this->line($office)]], ['X-Internal-Secret' => 'nope'])
            ->assertForbidden();
        $this->postJson('/internal/hot-potato/chat', ['lines' => [[...$this->line($office), 'body' => null]]], $this->internal())
            ->assertUnprocessable();
        $this->postJson('/internal/hot-potato/chat', ['lines' => [[...$this->line($office), 'body' => str_repeat('x', 201)]]], $this->internal())
            ->assertUnprocessable();
        $this->postJson('/internal/hot-potato/chat', ['lines' => [[...$this->line($office), 'kind' => 'event', 'body' => null]]], $this->internal())
            ->assertUnprocessable();

        $this->assertDatabaseCount('hot_potato_chat_lines', 0);
    }

    public function test_a_line_from_a_player_deleted_since_is_kept_without_its_author(): void
    {
        $office = Office::create(['name' => 'Québec']);

        $this->postJson('/internal/hot-potato/chat', ['lines' => [[...$this->line($office), 'player_id' => 999]]], $this->internal())
            ->assertCreated();

        $this->assertNull(HotPotatoChatLine::sole()->player_id);
    }

    public function test_each_office_keeps_its_newest_lines_only(): void
    {
        $quebec = Office::create(['name' => 'Québec']);
        $montreal = Office::create(['name' => 'Montréal']);
        $this->postJson('/internal/hot-potato/chat', ['lines' => [$this->line($montreal)]], $this->internal());
        foreach (range(1, HotPotatoChatLine::KEEP_PER_OFFICE) as $i) {
            HotPotatoChatLine::create(['office_id' => $quebec->id, 'kind' => 'message', 'body' => "old {$i}", 'posted_at' => now()]);
        }

        $this->postJson('/internal/hot-potato/chat', ['lines' => [$this->line($quebec, 'newest')]], $this->internal())->assertCreated();

        $this->assertSame(HotPotatoChatLine::KEEP_PER_OFFICE, HotPotatoChatLine::where('office_id', $quebec->id)->count());
        $this->assertDatabaseMissing('hot_potato_chat_lines', ['body' => 'old 1']);
        $this->assertDatabaseHas('hot_potato_chat_lines', ['body' => 'newest']);
        $this->assertSame(1, HotPotatoChatLine::where('office_id', $montreal->id)->count());
    }

    public function test_history_is_the_last_lines_oldest_first_with_authors_as_they_are_now(): void
    {
        $office = Office::create(['name' => 'Québec']);
        $alice = Player::create(['name' => 'Alice']);
        HotPotatoLook::create(['player_id' => $alice->id, 'colour' => 'grape', 'skin' => 'pumpkin', 'hat' => 'top', 'trail' => 'fire', 'boom' => 'confetti']);
        foreach (range(1, HotPotatoChatLine::HISTORY + 5) as $i) {
            HotPotatoChatLine::create(['office_id' => $office->id, 'kind' => 'event', 'event' => ['type' => 'joined', 'name' => "P{$i}"], 'posted_at' => now()]);
        }
        HotPotatoChatLine::create(['office_id' => $office->id, 'player_id' => $alice->id, 'kind' => 'message', 'body' => 'last', 'posted_at' => '2026-10-16 15:00:00.250']);

        $history = $this->getJson("/internal/hot-potato/offices/{$office->id}/chat", $this->internal())
            ->assertOk()
            ->json();

        $this->assertCount(HotPotatoChatLine::HISTORY, $history);
        $this->assertSame('P7', $history[0]['event']['name']);
        $this->assertSame([
            'kind' => 'message',
            'at' => '2026-10-16T15:00:00.250Z',
            'body' => 'last',
            'event' => null,
            'author' => [
                'id' => $alice->id,
                'name' => 'Alice',
                'avatar_url' => null,
                'look' => ['colour' => 'grape', 'skin' => 'pumpkin', 'hat' => 'top', 'trail' => 'fire', 'boom' => 'confetti'],
            ],
        ], $history[HotPotatoChatLine::HISTORY - 1]);
    }

    public function test_the_page_has_the_watchers_list_and_the_chat(): void
    {
        $this->get('/games/hot-potato')
            ->assertOk()
            ->assertSee('data-watchers', false)
            ->assertSee('data-chat-form', false)
            ->assertSee('x-text="line.body"', false)
            // Bodies are text, never HTML.
            ->assertDontSee('x-html', false);
    }

    private function internal(): array
    {
        return ['X-Internal-Secret' => self::SECRET];
    }

    /** @return array<string, mixed> */
    private function line(Office $office, string $body = 'hi'): array
    {
        return ['office_id' => $office->id, 'player_id' => null, 'kind' => 'message', 'body' => $body, 'event' => null, 'at' => '2026-10-16T15:00:00Z'];
    }
}
