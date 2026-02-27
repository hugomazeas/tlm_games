<?php

namespace App\Games\Archery\Services\Bonuses;

class TargetNumbersBonus extends Bonus
{
    private array $targetNumbers = [];
    private int $matchCount = 0;

    public function setTargetNumbers(array $targetNumbers): void
    {
        $this->targetNumbers = $targetNumbers;
    }

    public function check(array $arrows): bool
    {
        if (empty($this->targetNumbers)) {
            return false;
        }

        $this->matchCount = 0;
        $arrowScores = array_column($arrows, 'score');

        for ($i = 0; $i < count($arrowScores); $i++) {
            if (isset($this->targetNumbers[$i]) && $arrowScores[$i] === $this->targetNumbers[$i]) {
                $this->matchCount++;
            }
        }

        return $this->matchCount > 0;
    }

    public function getPoints(): int
    {
        if ($this->matchCount === 4) {
            return 15;
        }
        return $this->matchCount * 3;
    }

    public function getName(): string { return 'Target Numbers'; }

    public function getDescription(): string
    {
        if ($this->matchCount === 4) {
            return "Hit all 4 target numbers! (12 + 3 bonus)";
        } elseif ($this->matchCount > 0) {
            return "Hit {$this->matchCount} target number(s)";
        }
        return 'Hit the target numbers for 3 pts each (+3 bonus for all 4)';
    }
}
