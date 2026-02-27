<?php

namespace App\Games\Archery\Services\Bonuses;

class ConsecutiveTensBonus extends Bonus
{
    private int $streakLength = 0;

    public function check(array $arrows): bool
    {
        if (count($arrows) < 2) {
            $this->streakLength = 0;
            return false;
        }

        $scores = array_map(fn($arrow) => $arrow['score'] ?? 0, $arrows);

        $maxStreak = 0;
        $currentStreak = 0;

        foreach ($scores as $score) {
            if ($score === 10) {
                $currentStreak++;
                $maxStreak = max($maxStreak, $currentStreak);
            } else {
                $currentStreak = 0;
            }
        }

        $this->streakLength = $maxStreak;

        return $maxStreak >= 2;
    }

    public function getPoints(): int
    {
        return match($this->streakLength) {
            2 => 3,
            3 => 7,
            4 => 10,
            default => 0,
        };
    }

    public function getName(): string { return 'Consecutive 10s'; }
    public function getDescription(): string { return 'On fire! Multiple 10s in a row!'; }
}
