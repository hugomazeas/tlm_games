<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Exceptions\GiphyUnavailableException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Searches Giphy for the livestream chat's /giphy command, keeping the API key
 * on the server and the app under the key's hourly quota. Searches are cached
 * so a repeated query costs nothing, and every GIF a search returned is
 * remembered so posting one needs no second call and can't be a GIF the
 * server never handed out.
 */
class GiphyService
{
    private const SEARCH_URL = 'https://api.giphy.com/v1/gifs/search';

    private const RESULT_LIMIT = 25;

    private const CACHE_SECONDS = 3600;

    private const BUDGET_KEY = 'giphy-api';

    /** Ratings allowed at or below each cap, mildest first. */
    private const RATINGS = ['g', 'pg', 'pg-13', 'r'];

    /**
     * @return list<array{id: string, title: string, preview_url: string, url: string, width: int, height: int}>
     *
     * @throws GiphyUnavailableException
     */
    public function search(string $query): array
    {
        $query = mb_strtolower(trim($query));
        $cacheKey = 'giphy:search:'.md5($query);

        $cached = Cache::get($cacheKey);
        if (is_array($cached)) {
            return $cached;
        }

        $key = config('services.giphy.key');
        if (! $key) {
            throw GiphyUnavailableException::notConfigured();
        }

        $hourlyLimit = (int) config('services.giphy.hourly_limit');
        if (RateLimiter::tooManyAttempts(self::BUDGET_KEY, $hourlyLimit)) {
            throw GiphyUnavailableException::limitReached(RateLimiter::availableIn(self::BUDGET_KEY));
        }
        RateLimiter::hit(self::BUDGET_KEY, 3600);

        try {
            $response = Http::timeout(5)->get(self::SEARCH_URL, [
                'api_key' => $key,
                'q' => $query,
                'limit' => self::RESULT_LIMIT,
                'rating' => config('services.giphy.rating'),
                'lang' => 'en',
            ]);
        } catch (ConnectionException) {
            throw GiphyUnavailableException::failed();
        }

        if ($response->status() === 429) {
            throw GiphyUnavailableException::limitReached(3600);
        }

        if (! $response->successful()) {
            throw GiphyUnavailableException::failed();
        }

        $gifs = collect($response->json('data', []))
            ->filter(fn ($gif) => is_array($gif) && $this->isAllowedRating($gif['rating'] ?? null))
            ->map(fn (array $gif) => $this->toChatGif($gif))
            ->filter()
            ->values()
            ->all();

        foreach ($gifs as $gif) {
            Cache::put('giphy:gif:'.$gif['id'], $gif, self::CACHE_SECONDS);
        }
        Cache::put($cacheKey, $gifs, self::CACHE_SECONDS);

        return $gifs;
    }

    /**
     * A GIF from a recent search, or null when the server never returned it
     * (or it was too long ago).
     *
     * @return array{id: string, title: string, preview_url: string, url: string, width: int, height: int}|null
     */
    public function find(string $id): ?array
    {
        $gif = Cache::get('giphy:gif:'.$id);

        return is_array($gif) ? $gif : null;
    }

    private function isAllowedRating(?string $rating): bool
    {
        $cap = array_search(config('services.giphy.rating'), self::RATINGS, true);
        $position = array_search($rating, self::RATINGS, true);

        return $cap !== false && $position !== false && $position <= $cap;
    }

    /**
     * @param  array<string, mixed>  $gif
     * @return array{id: string, title: string, preview_url: string, url: string, width: int, height: int}|null
     */
    private function toChatGif(array $gif): ?array
    {
        $preview = $gif['images']['fixed_height'] ?? null;
        $large = $gif['images']['downsized_medium'] ?? $gif['images']['original'] ?? null;

        if (! isset($gif['id'], $preview['url'], $large['url'])) {
            return null;
        }

        return [
            'id' => (string) $gif['id'],
            'title' => (string) ($gif['title'] ?? ''),
            'preview_url' => $preview['webp'] ?? $preview['url'],
            'url' => $large['url'],
            'width' => (int) ($large['width'] ?? 0),
            'height' => (int) ($large['height'] ?? 0),
        ];
    }
}
