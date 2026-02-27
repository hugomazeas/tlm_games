<?php

namespace App\Games\Archery\Services\Bonuses;

class AscendingOrderBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_map(fn($arrow) => $arrow['score'] ?? 0, $arrows);

        for ($i = 1; $i < count($scores); $i++) {
            if ($scores[$i] < $scores[$i - 1]) {
                return false;
            }
        }

        if (count(array_unique($scores)) === 1) {
            return false;
        }

        return true;
    }

    public function getPoints(): int { return 3; }
    public function getName(): string { return 'Ascending Order'; }
    public function getDescription(): string { return 'Keep keep going up!!'; }
}
