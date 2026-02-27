<?php

namespace App\Games\Archery\Services\Bonuses;

class RimJobBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_column($arrows, 'score');

        return count(array_filter($scores, fn($score) => $score === 9)) === 4;
    }

    public function getPoints(): int { return 7; }
    public function getName(): string { return 'Rim Job'; }
    public function getDescription(): string { return 'All 4 arrows score 9'; }
}
