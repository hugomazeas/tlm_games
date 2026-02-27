<?php

namespace App\Games\Archery\Services\Bonuses;

class AllArrowsSameQuadrantBonus extends Bonus
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

        $arrowsWithQuadrant = array_filter($arrows, function ($arrow) {
            return $arrow['score'] !== 10;
        });

        if (count($arrowsWithQuadrant) < 2) {
            return false;
        }

        $quadrants = array_map(function ($arrow) {
            return $this->getQuadrant($arrow['x'], $arrow['y']);
        }, $arrowsWithQuadrant);

        return count(array_unique($quadrants)) === 1;
    }

    private function getQuadrant(float $x, float $y): string
    {
        if ($x >= 0 && $y >= 0) return 'NE';
        if ($x < 0 && $y >= 0) return 'NW';
        if ($x < 0 && $y < 0) return 'SW';
        return 'SE';
    }

    public function getPoints(): int { return 8; }
    public function getName(): string { return 'Single Quadrant'; }
    public function getDescription(): string { return 'All arrows in the same quadrant (center 10s excluded, no misses)'; }
}
