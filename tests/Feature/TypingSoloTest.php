<?php

namespace Tests\Feature;

use App\Games\Typing\Models\TypingTest;
use App\Games\Typing\Services\TypingContent;
use App\Models\Player;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TypingSoloTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withoutMiddleware(ValidateCsrfToken::class);
    }

    public function test_page_renders(): void
    {
        Player::create(['name' => 'Alice']);

        $this->get('/games/typing')->assertOk()->assertSee('Alice');
    }

    public function test_issuing_french_words_uses_only_the_french_list(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $response = $this->postJson('/games/typing/tests', ['player_id' => $player->id, 'language' => 'fr', 'source' => 'words'])
            ->assertOk();

        $words = explode(' ', $response->json('text'));
        $this->assertCount(150, $words);
        $this->assertEmpty(array_diff($words, (new TypingContent)->load('fr')['words']));

        $test = TypingTest::find($response->json('id'));
        $this->assertNull($test->submitted_at);
        $this->assertNotNull($test->issued_at);
    }

    public function test_issuing_english_quotes_chains_whole_quotes_past_thirty_seconds_of_typing(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $response = $this->postJson('/games/typing/tests', ['player_id' => $player->id, 'language' => 'en', 'source' => 'quote'])
            ->assertOk();

        $text = $response->json('text');
        $this->assertGreaterThanOrEqual(150, count(explode(' ', $text)));

        $quotes = array_map(fn ($quote) => TypingContent::normalize($quote['text']), (new TypingContent)->load('en')['quotes']);
        foreach ($quotes as $quote) {
            $text = str_replace($quote, '', $text);
        }
        $this->assertSame('', trim($text), 'The text is made only of whole quotes.');
        $this->assertNotEmpty($response->json('attribution'));
    }

    public function test_issuing_rejects_bad_language_source_or_player(): void
    {
        $player = Player::create(['name' => 'Alice']);

        $this->postJson('/games/typing/tests', ['player_id' => $player->id, 'language' => 'de', 'source' => 'words'])
            ->assertJsonValidationErrors('language');
        $this->postJson('/games/typing/tests', ['player_id' => $player->id, 'language' => 'fr', 'source' => 'poem'])
            ->assertJsonValidationErrors('source');
        $this->postJson('/games/typing/tests', ['player_id' => 999, 'language' => 'fr', 'source' => 'words'])
            ->assertJsonValidationErrors('player_id');
    }

    public function test_submission_is_scored_by_the_server(): void
    {
        $test = $this->pendingTest('the quick brown fox jumps over the lazy dog');
        $this->travel(31)->seconds();

        // "the quick brown " = 16 chars over 0.5 min => 6.4 wpm. "fax" is wrong.
        $this->postJson("/games/typing/tests/{$test->id}/submit", ['typed' => 'the quick brown fax', 'keystrokes' => 20, 'errors' => 0])
            ->assertOk()
            ->assertJson(['wpm' => 6.4, 'raw_wpm' => 7.6]);

        $test->refresh();
        $this->assertNotNull($test->submitted_at);
        $this->assertSame(30000, $test->duration_ms);
        // Claimed 100%, but 15 of 16 typed letters match: capped at 93.75.
        $this->assertSame(93.75, $test->accuracy);
    }

    public function test_submission_before_thirty_seconds_is_rejected(): void
    {
        $test = $this->pendingTest('the quick brown fox');
        $this->travel(20)->seconds();

        $this->postJson("/games/typing/tests/{$test->id}/submit", ['typed' => 'the quick', 'keystrokes' => 9, 'errors' => 0])
            ->assertStatus(422);

        $this->assertNull($test->fresh()->submitted_at);
    }

    public function test_double_submission_is_rejected(): void
    {
        $test = $this->pendingTest('the quick brown fox');
        $this->travel(31)->seconds();

        $payload = ['typed' => 'the quick', 'keystrokes' => 9, 'errors' => 0];
        $this->postJson("/games/typing/tests/{$test->id}/submit", $payload)->assertOk();
        $this->postJson("/games/typing/tests/{$test->id}/submit", $payload)->assertStatus(409);
    }

    public function test_implausible_speed_is_rejected(): void
    {
        $text = implode(' ', array_fill(0, 300, 'the'));
        $test = $this->pendingTest($text);
        $this->travel(31)->seconds();

        // 1200 chars in 30s = 480 wpm.
        $this->postJson("/games/typing/tests/{$test->id}/submit", ['typed' => $text, 'keystrokes' => 1199, 'errors' => 0])
            ->assertStatus(422);

        $this->assertNull($test->fresh()->submitted_at);
    }

    public function test_issuing_a_new_test_marks_the_abandoned_one_as_restarted(): void
    {
        $test = $this->pendingTest('the quick brown fox');

        $this->postJson('/games/typing/tests', [
            'player_id' => $test->player_id, 'language' => 'en', 'source' => 'words', 'restarted_test_id' => $test->id,
        ])->assertOk();

        $this->assertNotNull($test->fresh()->restarted_at);
    }

    public function test_only_a_pending_test_of_the_same_player_can_be_marked_restarted(): void
    {
        $other = $this->pendingTest('the quick brown fox');
        $submitted = $this->pendingTest('the quick brown fox');
        $submitted->update(['submitted_at' => now(), 'wpm' => 50, 'accuracy' => 90]);
        $bob = Player::create(['name' => 'Bob']);

        foreach ([$other, $submitted] as $test) {
            $playerId = $test->is($other) ? $bob->id : $test->player_id;
            $this->postJson('/games/typing/tests', [
                'player_id' => $playerId, 'language' => 'en', 'source' => 'words', 'restarted_test_id' => $test->id,
            ])->assertOk();
        }

        $this->assertNull($other->fresh()->restarted_at);
        $this->assertNull($submitted->fresh()->restarted_at);
    }

    private function pendingTest(string $text): TypingTest
    {
        return TypingTest::create([
            'player_id' => Player::firstOrCreate(['name' => 'Alice'])->id,
            'language' => 'en',
            'source' => 'words',
            'text' => $text,
            'issued_at' => now(),
        ]);
    }
}
