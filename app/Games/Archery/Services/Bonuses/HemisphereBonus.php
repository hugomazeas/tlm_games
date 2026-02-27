<?php

namespace App\Games\Archery\Services\Bonuses;

class HemisphereBonus extends Bonus
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

        $allTop = true;
        $allBottom = true;
        $allLeft = true;
        $allRight = true;

        foreach ($arrowsWithHemisphere as $arrow) {
            if ($arrow['y'] < 0) $allTop = false;
            if ($arrow['y'] >= 0) $allBottom = false;
            if ($arrow['x'] < 0) $allRight = false;
            if ($arrow['x'] >= 0) $allLeft = false;
        }

        return $allTop || $allBottom || $allLeft || $allRight;
    }

    public function getPoints(): int { return 2; }
    public function getName(): string { return 'Hemisphère'; }
    public function getDescription(): string { return 'All arrows in the same hemisphere (no misses, center 10s excluded)'; }
}
