<?php

namespace App\Games\Archery\Services\Bonuses;

class LastArrowTenBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (empty($arrows)) {
            return false;
        }

        $lastArrow = end($arrows);

        return isset($lastArrow['score']) && $lastArrow['score'] === 10;
    }

    public function getPoints(): int { return 5; }
    public function getName(): string { return 'Final 10'; }
    public function getDescription(): string { return 'Hit 10 points with the last arrow'; }
}
