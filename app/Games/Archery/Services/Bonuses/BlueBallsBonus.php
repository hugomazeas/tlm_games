<?php

namespace App\Games\Archery\Services\Bonuses;

class BlueBallsBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_column($arrows, 'score');

        return count(array_filter($scores, fn($score) => $score === 8)) === 4;
    }

    public function getPoints(): int { return 6; }
    public function getName(): string { return 'Blue Balls'; }
    public function getDescription(): string { return 'All 4 arrows score 8 (blue ring only)'; }
}
