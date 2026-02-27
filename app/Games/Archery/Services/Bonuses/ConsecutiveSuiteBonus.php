<?php

namespace App\Games\Archery\Services\Bonuses;

class ConsecutiveSuiteBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_map(fn($arrow) => $arrow['score'] ?? 0, $arrows);

        sort($scores);

        $validSuites = [
            [6, 7, 8, 9],
            [7, 8, 9, 10]
        ];

        return in_array($scores, $validSuites);
    }

    public function getPoints(): int { return 5; }
    public function getName(): string { return 'Suite'; }
    public function getDescription(): string { return 'Four consecutive scores (6-7-8-9 or 7-8-9-10)'; }
}
