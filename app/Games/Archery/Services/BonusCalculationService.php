<?php

namespace App\Games\Archery\Services;

use App\Games\Archery\Services\Bonuses\Bonus;
use App\Games\Archery\Services\Bonuses\SameScoreFourTimesBonus;
use App\Games\Archery\Services\Bonuses\LastArrowTenBonus;
use App\Games\Archery\Services\Bonuses\AllArrowsSameQuadrantBonus;
use App\Games\Archery\Services\Bonuses\ConsecutiveSuiteBonus;
use App\Games\Archery\Services\Bonuses\TwoPairsBonus;
use App\Games\Archery\Services\Bonuses\AscendingOrderBonus;
use App\Games\Archery\Services\Bonuses\DescendingOrderBonus;
use App\Games\Archery\Services\Bonuses\ConsecutiveTensBonus;
use App\Games\Archery\Services\Bonuses\OuterRimBonus;
use App\Games\Archery\Services\Bonuses\InnerRimBonus;
use App\Games\Archery\Services\Bonuses\RimJobBonus;
use App\Games\Archery\Services\Bonuses\BlueBallsBonus;
use App\Games\Archery\Services\Bonuses\NetflixAndChillBonus;
use App\Games\Archery\Services\Bonuses\TheClapperBonus;
use App\Games\Archery\Services\Bonuses\TheTeaserBonus;
use App\Games\Archery\Services\Bonuses\FourQuartBonus;
use App\Games\Archery\Services\Bonuses\TargetNumbersBonus;

class BonusCalculationService
{
    private array $bonuses = [];
    private TargetNumbersBonus $targetNumbersBonus;

    public function __construct()
    {
        $this->targetNumbersBonus = new TargetNumbersBonus();

        $this->bonuses = [
            new SameScoreFourTimesBonus(),
            new LastArrowTenBonus(),
            new AllArrowsSameQuadrantBonus(),
            new ConsecutiveSuiteBonus(),
            new TwoPairsBonus(),
            new AscendingOrderBonus(),
            new DescendingOrderBonus(),
            new ConsecutiveTensBonus(),
            new OuterRimBonus(),
            new InnerRimBonus(),
            new RimJobBonus(),
            new BlueBallsBonus(),
            new NetflixAndChillBonus(),
            new TheClapperBonus(),
            new TheTeaserBonus(),
            new FourQuartBonus(),
            $this->targetNumbersBonus,
        ];
    }

    public function calculateBonuses(array $arrows, array $targetNumbers = []): array
    {
        if (!empty($targetNumbers)) {
            $this->targetNumbersBonus->setTargetNumbers($targetNumbers);
        }

        $total = 0;
        $applied = [];

        foreach ($this->bonuses as $bonus) {
            if ($bonus->check($arrows)) {
                $points = $bonus->getPoints();
                $total += $points;
                $applied[] = [
                    'name' => $bonus->getName(),
                    'description' => $bonus->getDescription(),
                    'points' => $points,
                ];
            }
        }

        return [
            'total' => $total,
            'applied' => $applied,
        ];
    }

    public function getAllBonuses(): array
    {
        return array_map(function (Bonus $bonus) {
            return [
                'name' => $bonus->getName(),
                'description' => $bonus->getDescription(),
                'points' => $bonus->getPoints(),
            ];
        }, $this->bonuses);
    }
}
