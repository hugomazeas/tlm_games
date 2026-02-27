<?php

namespace App\Games\Archery\Services\Bonuses;

class SameScoreFourTimesBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_column($arrows, 'score');
        $scoreCounts = array_count_values($scores);

        return in_array(4, $scoreCounts);
    }

    public function getPoints(): int { return 3; }
    public function getName(): string { return 'All Same Score'; }
    public function getDescription(): string { return 'Hit the same score 4 times in one game'; }
}
