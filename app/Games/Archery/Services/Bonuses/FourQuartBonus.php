<?php

namespace App\Games\Archery\Services\Bonuses;

class FourQuartBonus extends Bonus
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

        $quadrants = array_map(function ($arrow) {
            return $this->getQuadrant($arrow['x'], $arrow['y']);
        }, $arrows);

        return count(array_unique($quadrants)) === 4;
    }

    private function getQuadrant(float $x, float $y): string
    {
        if ($x >= 0 && $y >= 0) return 'NE';
        if ($x < 0 && $y >= 0) return 'NW';
        if ($x < 0 && $y < 0) return 'SW';
        return 'SE';
    }

    public function getPoints(): int { return 3; }
    public function getName(): string { return '4 Quart'; }
    public function getDescription(): string { return 'All 4 arrows in different quadrants (no misses, center 10s excluded)'; }
}
