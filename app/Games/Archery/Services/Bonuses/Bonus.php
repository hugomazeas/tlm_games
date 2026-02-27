<?php

namespace App\Games\Archery\Services\Bonuses;

abstract class Bonus
{
    abstract public function check(array $arrows): bool;
    abstract public function getPoints(): int;
    abstract public function getName(): string;
    abstract public function getDescription(): string;
}
