<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;

class EloService
{
    private const K = 32;
    private const DEFAULT_RATING = 1200;

    public function getOrCreateRating(int $playerId): PingPongRating
    {
        return PingPongRating::firstOrCreate(
            ['player_id' => $playerId],
            ['elo_rating' => self::DEFAULT_RATING]
        );
    }

    public function calculateChange(int $playerRating, int $opponentRating, float $score): int
    {
        $expected = 1 / (1 + pow(10, ($opponentRating - $playerRating) / 400));

        return (int) round(self::K * ($score - $expected));
    }

    public function applyMatchResult(PingPongMatch $match): array
    {
        $leftRating = $this->getOrCreateRating($match->player_left_id);
        $rightRating = $this->getOrCreateRating($match->player_right_id);

        $leftBefore = $leftRating->elo_rating;
        $rightBefore = $rightRating->elo_rating;

        $leftScore = $match->winner_id === $match->player_left_id ? 1.0 : 0.0;
        $rightScore = 1.0 - $leftScore;

        $leftChange = $this->calculateChange($leftBefore, $rightBefore, $leftScore);
        $rightChange = $this->calculateChange($rightBefore, $leftBefore, $rightScore);

        $leftRating->update(['elo_rating' => $leftBefore + $leftChange]);
        $rightRating->update(['elo_rating' => $rightBefore + $rightChange]);

        $match->update([
            'player_left_elo_before' => $leftBefore,
            'player_right_elo_before' => $rightBefore,
            'player_left_elo_after' => $leftBefore + $leftChange,
            'player_right_elo_after' => $rightBefore + $rightChange,
        ]);

        return [
            'left' => [
                'before' => $leftBefore,
                'after' => $leftBefore + $leftChange,
                'change' => $leftChange,
            ],
            'right' => [
                'before' => $rightBefore,
                'after' => $rightBefore + $rightChange,
                'change' => $rightChange,
            ],
        ];
    }
}
