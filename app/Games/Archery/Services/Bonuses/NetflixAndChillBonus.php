<?php

namespace App\Games\Archery\Services\Bonuses;

class NetflixAndChillBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_column($arrows, 'score');
        $scoreCounts = array_count_values($scores);

        return isset($scoreCounts[6]) && $scoreCounts[6] === 2
            && isset($scoreCounts[9]) && $scoreCounts[9] === 2;
    }

    public function getPoints(): int { return 10; }
    public function getName(): string { return 'Netflix and Chill'; }
    public function getDescription(): string { return 'Two 6s and two 9s in any order'; }
}
