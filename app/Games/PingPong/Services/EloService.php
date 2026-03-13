<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongRatingChange;

class EloService
{
    private const K = 32;
    private const DEFAULT_RATING = 1200;

    public function getOrCreateRating(int $playerId, string $mode = '1v1'): PingPongRating
    {
        return PingPongRating::firstOrCreate(
            ['player_id' => $playerId, 'mode' => $mode],
            ['elo_rating' => self::DEFAULT_RATING]
        );
    }

    public function getEloFromHistory(int $playerId, string $mode = '1v1'): int
    {
        $sum = PingPongRatingChange::where('player_id', $playerId)
            ->where('mode', $mode)
            ->sum('rating_change');

        return self::DEFAULT_RATING + (int) $sum;
    }

    public function calculateChange(int $playerRating, int $opponentRating, float $score): int
    {
        $expected = 1 / (1 + pow(10, ($opponentRating - $playerRating) / 400));

        return (int) round(self::K * ($score - $expected));
    }

    public function applyMatchResult(PingPongMatch $match): array
    {
        if ($match->isDoubles()) {
            return $this->applyDoublesResult($match);
        }

        return $this->applySinglesResult($match);
    }

    private function applySinglesResult(PingPongMatch $match): array
    {
        $leftRating = $this->getOrCreateRating($match->player_left_id);
        $rightRating = $this->getOrCreateRating($match->player_right_id);

        $leftBefore = $leftRating->elo_rating;
        $rightBefore = $rightRating->elo_rating;

        $leftScore = $match->winner_id === $match->player_left_id ? 1.0 : 0.0;
        $rightScore = 1.0 - $leftScore;

        $leftChange = $this->calculateChange($leftBefore, $rightBefore, $leftScore);
        $rightChange = $this->calculateChange($rightBefore, $leftBefore, $rightScore);

        PingPongRatingChange::create([
            'player_id' => $match->player_left_id,
            'match_id' => $match->id,
            'mode' => '1v1',
            'rating_change' => $leftChange,
        ]);
        PingPongRatingChange::create([
            'player_id' => $match->player_right_id,
            'match_id' => $match->id,
            'mode' => '1v1',
            'rating_change' => $rightChange,
        ]);

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

    private function applyDoublesResult(PingPongMatch $match): array
    {
        $mode = '2v2';

        $leftP1Rating = $this->getOrCreateRating($match->player_left_id, $mode);
        $leftP2Rating = $this->getOrCreateRating($match->team_left_player2_id, $mode);
        $rightP1Rating = $this->getOrCreateRating($match->player_right_id, $mode);
        $rightP2Rating = $this->getOrCreateRating($match->team_right_player2_id, $mode);

        $leftP1Before = $leftP1Rating->elo_rating;
        $leftP2Before = $leftP2Rating->elo_rating;
        $rightP1Before = $rightP1Rating->elo_rating;
        $rightP2Before = $rightP2Rating->elo_rating;

        $teamLeftAvg = (int) round(($leftP1Before + $leftP2Before) / 2);
        $teamRightAvg = (int) round(($rightP1Before + $rightP2Before) / 2);

        // Determine if left team won (winner_id matches either left team player)
        $leftWon = $match->winner_id === $match->player_left_id;
        $leftScore = $leftWon ? 1.0 : 0.0;
        $rightScore = 1.0 - $leftScore;

        // Same change for both teammates, based on team averages
        $leftChange = $this->calculateChange($teamLeftAvg, $teamRightAvg, $leftScore);
        $rightChange = $this->calculateChange($teamRightAvg, $teamLeftAvg, $rightScore);

        PingPongRatingChange::create([
            'player_id' => $match->player_left_id,
            'match_id' => $match->id,
            'mode' => $mode,
            'rating_change' => $leftChange,
        ]);
        PingPongRatingChange::create([
            'player_id' => $match->team_left_player2_id,
            'match_id' => $match->id,
            'mode' => $mode,
            'rating_change' => $leftChange,
        ]);
        PingPongRatingChange::create([
            'player_id' => $match->player_right_id,
            'match_id' => $match->id,
            'mode' => $mode,
            'rating_change' => $rightChange,
        ]);
        PingPongRatingChange::create([
            'player_id' => $match->team_right_player2_id,
            'match_id' => $match->id,
            'mode' => $mode,
            'rating_change' => $rightChange,
        ]);

        $leftP1Rating->update(['elo_rating' => $leftP1Before + $leftChange]);
        $leftP2Rating->update(['elo_rating' => $leftP2Before + $leftChange]);
        $rightP1Rating->update(['elo_rating' => $rightP1Before + $rightChange]);
        $rightP2Rating->update(['elo_rating' => $rightP2Before + $rightChange]);

        $match->update([
            'player_left_elo_before' => $leftP1Before,
            'player_left_elo_after' => $leftP1Before + $leftChange,
            'team_left_player2_elo_before' => $leftP2Before,
            'team_left_player2_elo_after' => $leftP2Before + $leftChange,
            'player_right_elo_before' => $rightP1Before,
            'player_right_elo_after' => $rightP1Before + $rightChange,
            'team_right_player2_elo_before' => $rightP2Before,
            'team_right_player2_elo_after' => $rightP2Before + $rightChange,
        ]);

        return [
            'left' => [
                'team_avg_before' => $teamLeftAvg,
                'team_avg_after' => $teamLeftAvg + $leftChange,
                'change' => $leftChange,
                'player1' => ['before' => $leftP1Before, 'after' => $leftP1Before + $leftChange],
                'player2' => ['before' => $leftP2Before, 'after' => $leftP2Before + $leftChange],
            ],
            'right' => [
                'team_avg_before' => $teamRightAvg,
                'team_avg_after' => $teamRightAvg + $rightChange,
                'change' => $rightChange,
                'player1' => ['before' => $rightP1Before, 'after' => $rightP1Before + $rightChange],
                'player2' => ['before' => $rightP2Before, 'after' => $rightP2Before + $rightChange],
            ],
        ];
    }
}
