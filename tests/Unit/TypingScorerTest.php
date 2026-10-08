<?php

namespace Tests\Unit;

use App\Games\Typing\Services\TypingScorer;
use PHPUnit\Framework\TestCase;

class TypingScorerTest extends TestCase
{
    private TypingScorer $scorer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->scorer = new TypingScorer;
    }

    public function test_correct_chars_counts_matching_words_and_the_spaces_after_them(): void
    {
        // "the quick " = 3 + 1 + 5 + 1; "bro" is unfinished and doesn't count.
        $this->assertSame(10, $this->scorer->correctChars('the quick brown fox', 'the quick bro'));
    }

    public function test_correct_chars_skips_a_wrong_word_but_keeps_counting_after_it(): void
    {
        // "the " + "brown " ; "quack" is wrong.
        $this->assertSame(10, $this->scorer->correctChars('the quick brown fox', 'the quack brown '));
    }

    public function test_correct_chars_rejects_extra_and_missing_letters(): void
    {
        $this->assertSame(0, $this->scorer->correctChars('the quick', 'thee quic'));
    }

    public function test_correct_chars_counts_accented_characters_once(): void
    {
        // "déjà " is 5 characters, not 7 bytes.
        $this->assertSame(5, $this->scorer->correctChars('déjà été', 'déjà ét'));
    }

    public function test_correct_chars_for_empty_input(): void
    {
        $this->assertSame(0, $this->scorer->correctChars('the quick', ''));
    }

    public function test_prefix_chars_stops_at_first_mismatch(): void
    {
        $this->assertSame(6, $this->scorer->prefixChars('le cœur est là', 'le cœuX est là'));
        $this->assertSame(0, $this->scorer->prefixChars('abc', ''));
        $this->assertSame(3, $this->scorer->prefixChars('abc', 'abcdef'));
    }

    public function test_accuracy_uses_reported_keystrokes_when_text_matches(): void
    {
        // 100 keystrokes, 4 errors (since corrected): 96%.
        $this->assertSame(96.0, $this->scorer->accuracy(100, 4, 'the quick', 'the quick'));
    }

    public function test_accuracy_is_capped_by_the_typed_text(): void
    {
        // Claims 0 errors, but 1 of 8 typed letters is wrong: capped at 87.5%.
        $this->assertSame(87.5, $this->scorer->accuracy(9, 0, 'the quick', 'the quack'));
    }

    public function test_accuracy_without_keystrokes_is_zero(): void
    {
        $this->assertSame(0.0, $this->scorer->accuracy(0, 0, 'the quick', ''));
    }

    public function test_wpm(): void
    {
        $this->assertSame(60.0, $this->scorer->wpm(150, 30000));
        $this->assertSame(0.0, $this->scorer->wpm(150, 0));
    }
}
