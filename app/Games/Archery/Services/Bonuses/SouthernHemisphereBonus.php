<?php

namespace App\Games\Archery\Services\Bonuses;

class SouthernHemisphereBonus extends Bonus
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

        foreach ($arrowsWithHemisphere as $arrow) {
            if ($arrow['y'] < 0) {
                return false;
            }
        }

        return true;
    }

    public function getPoints(): int { return 2; }
    public function getName(): string { return 'Hemisphère Sud'; }
    public function getDescription(): string { return 'All arrows in the Southern hemisphere (no misses, center 10s excluded)'; }
}
