<?php

namespace App\Games\Typing\Services;

/**
 * Pure scoring for typing tests: no database, no clock. Texts are compared
 * word by word on single spaces, the way the typing UI produces them.
 */
class TypingScorer
{
    /** Anything faster is rejected as implausible. */
    public const MAX_WPM = 250;

    /**
     * Characters of words typed exactly right at their position, plus the
     * space typed after each of them (monkeytype's "correct chars").
     */
    public function correctChars(string $text, string $typed): int
    {
        $expected = explode(' ', $text);
        $typedWords = explode(' ', $typed);
        $lastIndex = count($typedWords) - 1;
        $chars = 0;

        foreach ($typedWords as $i => $word) {
            if ($word === '' || ! isset($expected[$i]) || $word !== $expected[$i]) {
                continue;
            }

            $chars += mb_strlen($word) + ($i < $lastIndex ? 1 : 0);
        }

        return $chars;
    }

    /**
     * Length of the longest prefix of the text that the typed text matches.
     */
    public function prefixChars(string $text, string $typed): int
    {
        $expected = mb_str_split($text);
        $count = 0;

        foreach (mb_str_split($typed) as $i => $char) {
            if (($expected[$i] ?? null) !== $char) {
                break;
            }
            $count++;
        }

        return $count;
    }

    /**
     * The client-reported keystroke accuracy, capped so it never exceeds the
     * share of typed characters that match the text at their position.
     */
    public function accuracy(int $keystrokes, int $errors, string $text, string $typed): float
    {
        if ($keystrokes <= 0) {
            return 0.0;
        }

        $reported = max(0, min(100, ($keystrokes - $errors) / $keystrokes * 100));

        $expected = explode(' ', $text);
        $matched = 0;
        $total = 0;

        foreach (explode(' ', $typed) as $i => $word) {
            $target = mb_str_split($expected[$i] ?? '');
            foreach (mb_str_split($word) as $j => $char) {
                $total++;
                if (($target[$j] ?? null) === $char) {
                    $matched++;
                }
            }
        }

        $cap = $total > 0 ? $matched / $total * 100 : 0;

        return round(min($reported, $cap), 2);
    }

    public function wpm(int $chars, int $milliseconds): float
    {
        if ($milliseconds <= 0) {
            return 0.0;
        }

        return round($chars / 5 / ($milliseconds / 60000), 2);
    }
}
