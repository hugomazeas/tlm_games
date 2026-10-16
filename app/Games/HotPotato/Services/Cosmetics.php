<?php

namespace App\Games\HotPotato\Services;

/**
 * The hot potato cosmetics catalogue, read from the game server's own file
 * (game-server/src/cosmetics.json) so what Laravel accepts is exactly what the game draws.
 */
class Cosmetics
{
    public const SLOTS = ['colour', 'hat', 'trail', 'boom'];

    /** @var array<string, array<int, array{id: string, label: string, value: ?string, default?: bool}>>|null */
    private ?array $catalogue = null;

    /**
     * @return array<string, array<int, array{id: string, label: string, value: ?string, default?: bool}>>
     */
    public function catalogue(): array
    {
        return $this->catalogue ??= json_decode(
            (string) file_get_contents(base_path('game-server/src/cosmetics.json')),
            true,
            flags: JSON_THROW_ON_ERROR,
        );
    }

    /** @return array<int, string> */
    public function ids(string $slot): array
    {
        return array_column($this->catalogue()[$slot] ?? [], 'id');
    }

    /** @return array<string, string> */
    public function defaults(): array
    {
        $defaults = [];
        foreach (self::SLOTS as $slot) {
            $choices = $this->catalogue()[$slot];
            $default = collect($choices)->firstWhere('default', true) ?? $choices[0];
            $defaults[$slot] = $default['id'];
        }

        return $defaults;
    }
}
