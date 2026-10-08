<?php

namespace App\Games\Typing\Services;

use InvalidArgumentException;

/**
 * Word lists and public-domain quotes, one PHP file per language under
 * Content/. Text is normalized to characters a regular keyboard types.
 */
class TypingContent
{
    public const LANGUAGES = ['fr', 'en'];

    public const SOURCES = ['words', 'quote'];

    /** @var array<string, array{words: list<string>, quotes: list<array{text: string, source: string}>}> */
    private array $loaded = [];

    /**
     * At least $minWords words: random words, or whole quotes chained in a
     * random order (a single quote when $minWords is 1).
     *
     * @return array{text: string, attribution: ?string}
     */
    public function text(string $language, string $source, int $minWords): array
    {
        if ($source === 'words') {
            return ['text' => implode(' ', $this->words($language, $minWords)), 'attribution' => null];
        }

        $picked = [];
        $count = 0;
        foreach (collect($this->load($language)['quotes'])->shuffle() as $quote) {
            $picked[] = $quote;
            $count += count(explode(' ', self::normalize($quote['text'])));
            if ($count >= $minWords) {
                break;
            }
        }

        return [
            'text' => self::normalize(implode(' ', array_column($picked, 'text'))),
            'attribution' => implode(' · ', array_unique(array_column($picked, 'source'))),
        ];
    }

    /**
     * @return list<string>
     */
    public function words(string $language, int $count): array
    {
        $list = $this->load($language)['words'];

        return array_map(fn () => $list[array_rand($list)], range(1, $count));
    }

    /**
     * @return array{words: list<string>, quotes: list<array{text: string, source: string}>}
     */
    public function load(string $language): array
    {
        if (! in_array($language, self::LANGUAGES, true)) {
            throw new InvalidArgumentException("Unknown typing language [{$language}].");
        }

        return $this->loaded[$language] ??= require __DIR__."/../Content/{$language}.php";
    }

    public static function normalize(string $text): string
    {
        $text = strtr($text, [
            "\u{2019}" => "'", "\u{2018}" => "'", "\u{201C}" => '"', "\u{201D}" => '"',
            "\u{00AB}" => '"', "\u{00BB}" => '"', "\u{2014}" => '-', "\u{2013}" => '-',
            "\u{2026}" => '...', "\u{0153}" => 'oe', "\u{0152}" => 'Oe', "\u{00A0}" => ' ',
        ]);

        return trim(preg_replace('/\s+/u', ' ', $text));
    }
}
