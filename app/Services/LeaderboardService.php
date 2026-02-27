<?php

namespace App\Services;

use App\Contracts\LeaderboardProviderInterface;
use Illuminate\Support\Collection;

class LeaderboardService
{
    /** @var array<string, LeaderboardProviderInterface> */
    protected array $providers = [];

    /**
     * Register a leaderboard provider for a game type + mode.
     */
    public function register(LeaderboardProviderInterface $provider): void
    {
        $key = $provider->getGameTypeSlug() . ':' . $provider->getGameModeSlug();
        $this->providers[$key] = $provider;
    }

    /**
     * Get a provider by game type and mode slug.
     */
    public function getProvider(string $gameTypeSlug, string $modeSlug): ?LeaderboardProviderInterface
    {
        return $this->providers[$gameTypeSlug . ':' . $modeSlug] ?? null;
    }

    /**
     * Get all providers for a game type.
     *
     * @return array<string, LeaderboardProviderInterface>
     */
    public function getProvidersForGameType(string $gameTypeSlug): array
    {
        $result = [];
        foreach ($this->providers as $key => $provider) {
            if ($provider->getGameTypeSlug() === $gameTypeSlug) {
                $result[$provider->getGameModeSlug()] = $provider;
            }
        }
        return $result;
    }

    /**
     * Check if a provider exists for the given composite key.
     */
    public function hasProvider(string $gameTypeSlug, string $modeSlug): bool
    {
        return isset($this->providers[$gameTypeSlug . ':' . $modeSlug]);
    }

    /**
     * Get leaderboard data for a game type + mode.
     */
    public function getLeaderboard(string $gameTypeSlug, string $modeSlug): Collection
    {
        $provider = $this->getProvider($gameTypeSlug, $modeSlug);

        return $provider ? $provider->getLeaderboard() : collect();
    }

    /**
     * Get all registered provider keys.
     *
     * @return array<string>
     */
    public function getRegisteredKeys(): array
    {
        return array_keys($this->providers);
    }
}
