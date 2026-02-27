<?php

namespace App\Games\Archery\Services\Bonuses;

class OuterRimBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_map(fn($arrow) => $arrow['score'] ?? 0, $arrows);

        foreach ($scores as $score) {
            if ($score !== 6) {
                return false;
            }
        }

        return true;
    }

    public function getPoints(): int { return 12; }
    public function getName(): string { return 'Outer Rim'; }
    public function getDescription(): string { return 'Far away from the galaxy - All four arrows score 6 points'; }
}
