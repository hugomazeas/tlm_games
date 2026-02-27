<?php

namespace App\Games\Archery\Services\Bonuses;

class TheClapperBonus extends Bonus
{
    public function check(array $arrows): bool
    {
        if (count($arrows) !== 4) {
            return false;
        }

        $scores = array_column($arrows, 'score');

        $isPalindrome = $scores[0] === $scores[3] && $scores[1] === $scores[2];
        $allSame = count(array_unique($scores)) === 1;

        return $isPalindrome && !$allSame;
    }

    public function getPoints(): int { return 5; }
    public function getName(): string { return 'Palindrome'; }
    public function getDescription(): string { return 'Scores form a palindrome pattern (e.g., 7-9-9-7, 8-10-10-8)'; }
}
