<?php

namespace App\Games\Archery\Services\Bonuses;

class HemisphereEastWestBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        foreach ($arrows as $arrow) {
            if (!isset($arrow['score']) || $arrow['score'] === 0) {
                return false;
            }
        }

        $arrowsWithHemisphere = array_filter($arrows, function ($arrow) {
            return $arrow['score'] !== 10;
        });

        if (count($arrowsWithHemisphere) < 2) {
            return false;
        }

        $allEast = true;
        $allWest = true;

        foreach ($arrowsWithHemisphere as $arrow) {
            if ($arrow['x'] < 0) $allEast = false;
            if ($arrow['x'] >= 0) $allWest = false;
        }

        return $allEast || $allWest;
    }

    public function getPoints(): int { return 2; }
    public function getName(): string { return 'Hemisphère E/W'; }
    public function getDescription(): string { return 'All arrows in the same hemisphere - East or West (no misses, center 10s excluded)'; }
}
