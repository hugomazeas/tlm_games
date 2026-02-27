<?php

namespace App\Games\Archery\Services;

class PrecisionService
{
    private const PRECISION_WEIGHTS = [
        10 => 5,
        9 => 4,
        8 => 3,
        7 => 2,
        6 => 1,
    ];

    public function calculateArrowPrecision(int $arrowScore): int
    {
        return self::PRECISION_WEIGHTS[$arrowScore] ?? 0;
    }

    public function calculatePrecision(array $scoredArrows): float
    {
        if (empty($scoredArrows)) {
            return 0.0;
        }

        $totalPrecision = 0;
        $arrowCount = count($scoredArrows);

        foreach ($scoredArrows as $arrow) {
            $score = $arrow['score'] ?? 0;
            $totalPrecision += $this->calculateArrowPrecision($score);
        }

        return round($totalPrecision / $arrowCount, 2);
    }
}
