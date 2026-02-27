<?php

namespace App\Games\Archery\Services\Bonuses;

class TheTeaserBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_column($arrows, 'score');

        $nineCount = count(array_filter($scores, fn($score) => $score === 9));
        $tenCount = count(array_filter($scores, fn($score) => $score === 10));

        return $nineCount === 3 && $tenCount === 0;
    }

    public function getPoints(): int { return 5; }
    public function getName(): string { return 'The Teaser'; }
    public function getDescription(): string { return 'Three 9s and no 10s'; }
}
