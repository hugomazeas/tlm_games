<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRating;
use App\Games\PingPong\Models\PingPongRatingChange;

class EloService
{
    private const K = 32;
    private const DEFAULT_RATING = 1200;
    private const STREAK_BONUS_THRESHOLD = 3;
    private const STREAK_BONUS_CAP = 5;
    private const STREAK_BREAKER_CAP = 25;

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

    /**
     * Count consecutive wins for a player (most recent first), excluding
     * the match currently being processed so the caller can add 1.
     */
    public function getCurrentWinStreak(int $playerId, string $mode, ?int $excludeMatchId = null): int
    {
        $query = PingPongMatch::whereNotNull('ended_at')
            ->where('mode', $mode)
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId)
                  ->orWhere('team_left_player2_id', $playerId)
                  ->orWhere('team_right_player2_id', $playerId);
            })
            ->orderBy('ended_at', 'desc');

        if ($excludeMatchId) {
            $query->where('id', '!=', $excludeMatchId);
        }

        $matches = $query->get();

        $streak = 0;
        foreach ($matches as $match) {
            $won = $mode === '1v1'
                ? $match->winner_id === $playerId
                : (($match->winner_id === $match->player_left_id && in_array($playerId, [$match->player_left_id, $match->team_left_player2_id], true))
                    || ($match->winner_id === $match->player_right_id && in_array($playerId, [$match->player_right_id, $match->team_right_player2_id], true)));
            if ($won) {
                $streak++;
            } else {
                break;
            }
        }

        return $streak;
    }

    /**
     * Bonus ELO for being on a win streak. Returns 0 if streak < threshold.
     */
    public function calculateStreakBonus(int $streakLength): int
    {
        if ($streakLength < self::STREAK_BONUS_THRESHOLD) {
            return 0;
        }

        return min($streakLength, self::STREAK_BONUS_CAP);
    }

    private function applyStreakBonus(int $playerId, string $mode, PingPongMatch $match): int
    {
        $priorStreak = $this->getCurrentWinStreak($playerId, $mode, $match->id);
        $streakLength = $priorStreak + 1;
        $bonus = $this->calculateStreakBonus($streakLength);

        if ($bonus > 0) {
            PingPongRatingChange::create([
                'player_id' => $playerId,
                'match_id' => $match->id,
                'mode' => $mode,
                'type' => 'streak_bonus',
                'rating_change' => $bonus,
            ]);

            $rating = $this->getOrCreateRating($playerId, $mode);
            $rating->update(['elo_rating' => $rating->elo_rating + $bonus]);
        }

        return $bonus;
    }

    public function calculateStreakBreakerBonus(int $opponentStreakLength): int
    {
        if ($opponentStreakLength < self::STREAK_BONUS_THRESHOLD) {
            return 0;
        }

        return min($opponentStreakLength + 2, self::STREAK_BREAKER_CAP);
    }

    /**
     * Award the winner bonus ELO for breaking the loser's win streak.
     * The loser's streak is checked *before* the current match (excluded).
     */
    private function applyStreakBreakerBonus(int $winnerId, int $loserId, string $mode, PingPongMatch $match): int
    {
        $loserStreak = $this->getCurrentWinStreak($loserId, $mode, $match->id);
        $bonus = $this->calculateStreakBreakerBonus($loserStreak);

        if ($bonus > 0) {
            PingPongRatingChange::create([
                'player_id' => $winnerId,
                'match_id' => $match->id,
                'mode' => $mode,
                'type' => 'streak_breaker_bonus',
                'rating_change' => $bonus,
            ]);

            $rating = $this->getOrCreateRating($winnerId, $mode);
            $rating->update(['elo_rating' => $rating->elo_rating + $bonus]);
        }

        return $bonus;
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

        $leftBonus = 0;
        $rightBonus = 0;
        $leftBreakerBonus = 0;
        $rightBreakerBonus = 0;
        $winnerId = $match->winner_id;

        if ($winnerId === $match->player_left_id) {
            $leftBonus = $this->applyStreakBonus($match->player_left_id, '1v1', $match);
            $leftBreakerBonus = $this->applyStreakBreakerBonus($match->player_left_id, $match->player_right_id, '1v1', $match);
            $totalLeftExtra = $leftBonus + $leftBreakerBonus;
            if ($totalLeftExtra > 0) {
                $match->update(['player_left_elo_after' => $match->player_left_elo_after + $totalLeftExtra]);
            }
        } else {
            $rightBonus = $this->applyStreakBonus($match->player_right_id, '1v1', $match);
            $rightBreakerBonus = $this->applyStreakBreakerBonus($match->player_right_id, $match->player_left_id, '1v1', $match);
            $totalRightExtra = $rightBonus + $rightBreakerBonus;
            if ($totalRightExtra > 0) {
                $match->update(['player_right_elo_after' => $match->player_right_elo_after + $totalRightExtra]);
            }
        }

        return [
            'left' => [
                'before' => $leftBefore,
                'after' => $leftBefore + $leftChange + $leftBonus + $leftBreakerBonus,
                'change' => $leftChange,
                'streak_bonus' => $leftBonus,
                'streak_breaker_bonus' => $leftBreakerBonus,
            ],
            'right' => [
                'before' => $rightBefore,
                'after' => $rightBefore + $rightChange + $rightBonus + $rightBreakerBonus,
                'change' => $rightChange,
                'streak_bonus' => $rightBonus,
                'streak_breaker_bonus' => $rightBreakerBonus,
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

        $leftP1Bonus = 0;
        $leftP2Bonus = 0;
        $rightP1Bonus = 0;
        $rightP2Bonus = 0;
        $leftP1BreakerBonus = 0;
        $leftP2BreakerBonus = 0;
        $rightP1BreakerBonus = 0;
        $rightP2BreakerBonus = 0;

        if ($leftWon) {
            $leftP1Bonus = $this->applyStreakBonus($match->player_left_id, $mode, $match);
            $leftP2Bonus = $this->applyStreakBonus($match->team_left_player2_id, $mode, $match);

            $rightP1Streak = $this->getCurrentWinStreak($match->player_right_id, $mode, $match->id);
            $rightP2Streak = $this->getCurrentWinStreak($match->team_right_player2_id, $mode, $match->id);
            $maxLoserStreak = max($rightP1Streak, $rightP2Streak);
            $breakerBonus = $this->calculateStreakBreakerBonus($maxLoserStreak);

            if ($breakerBonus > 0) {
                $leftP1BreakerBonus = $breakerBonus;
                $leftP2BreakerBonus = $breakerBonus;
                PingPongRatingChange::create([
                    'player_id' => $match->player_left_id,
                    'match_id' => $match->id,
                    'mode' => $mode,
                    'type' => 'streak_breaker_bonus',
                    'rating_change' => $breakerBonus,
                ]);
                PingPongRatingChange::create([
                    'player_id' => $match->team_left_player2_id,
                    'match_id' => $match->id,
                    'mode' => $mode,
                    'type' => 'streak_breaker_bonus',
                    'rating_change' => $breakerBonus,
                ]);
                $this->getOrCreateRating($match->player_left_id, $mode)->increment('elo_rating', $breakerBonus);
                $this->getOrCreateRating($match->team_left_player2_id, $mode)->increment('elo_rating', $breakerBonus);
            }

            $leftP1Total = $leftP1Bonus + $leftP1BreakerBonus;
            $leftP2Total = $leftP2Bonus + $leftP2BreakerBonus;
            if ($leftP1Total > 0) {
                $match->update(['player_left_elo_after' => $match->player_left_elo_after + $leftP1Total]);
            }
            if ($leftP2Total > 0) {
                $match->update(['team_left_player2_elo_after' => $match->team_left_player2_elo_after + $leftP2Total]);
            }
        } else {
            $rightP1Bonus = $this->applyStreakBonus($match->player_right_id, $mode, $match);
            $rightP2Bonus = $this->applyStreakBonus($match->team_right_player2_id, $mode, $match);

            $leftP1Streak = $this->getCurrentWinStreak($match->player_left_id, $mode, $match->id);
            $leftP2Streak = $this->getCurrentWinStreak($match->team_left_player2_id, $mode, $match->id);
            $maxLoserStreak = max($leftP1Streak, $leftP2Streak);
            $breakerBonus = $this->calculateStreakBreakerBonus($maxLoserStreak);

            if ($breakerBonus > 0) {
                $rightP1BreakerBonus = $breakerBonus;
                $rightP2BreakerBonus = $breakerBonus;
                PingPongRatingChange::create([
                    'player_id' => $match->player_right_id,
                    'match_id' => $match->id,
                    'mode' => $mode,
                    'type' => 'streak_breaker_bonus',
                    'rating_change' => $breakerBonus,
                ]);
                PingPongRatingChange::create([
                    'player_id' => $match->team_right_player2_id,
                    'match_id' => $match->id,
                    'mode' => $mode,
                    'type' => 'streak_breaker_bonus',
                    'rating_change' => $breakerBonus,
                ]);
                $this->getOrCreateRating($match->player_right_id, $mode)->increment('elo_rating', $breakerBonus);
                $this->getOrCreateRating($match->team_right_player2_id, $mode)->increment('elo_rating', $breakerBonus);
            }

            $rightP1Total = $rightP1Bonus + $rightP1BreakerBonus;
            $rightP2Total = $rightP2Bonus + $rightP2BreakerBonus;
            if ($rightP1Total > 0) {
                $match->update(['player_right_elo_after' => $match->player_right_elo_after + $rightP1Total]);
            }
            if ($rightP2Total > 0) {
                $match->update(['team_right_player2_elo_after' => $match->team_right_player2_elo_after + $rightP2Total]);
            }
        }

        $leftAvgBonus = (int) round(($leftP1Bonus + $leftP2Bonus) / 2);
        $rightAvgBonus = (int) round(($rightP1Bonus + $rightP2Bonus) / 2);
        $leftAvgBreakerBonus = (int) round(($leftP1BreakerBonus + $leftP2BreakerBonus) / 2);
        $rightAvgBreakerBonus = (int) round(($rightP1BreakerBonus + $rightP2BreakerBonus) / 2);

        return [
            'left' => [
                'team_avg_before' => $teamLeftAvg,
                'team_avg_after' => $teamLeftAvg + $leftChange + $leftAvgBonus + $leftAvgBreakerBonus,
                'change' => $leftChange,
                'streak_bonus' => $leftAvgBonus,
                'streak_breaker_bonus' => $leftAvgBreakerBonus,
                'player1' => [
                    'before' => $leftP1Before,
                    'after' => $leftP1Before + $leftChange + $leftP1Bonus + $leftP1BreakerBonus,
                    'streak_bonus' => $leftP1Bonus,
                    'streak_breaker_bonus' => $leftP1BreakerBonus,
                ],
                'player2' => [
                    'before' => $leftP2Before,
                    'after' => $leftP2Before + $leftChange + $leftP2Bonus + $leftP2BreakerBonus,
                    'streak_bonus' => $leftP2Bonus,
                    'streak_breaker_bonus' => $leftP2BreakerBonus,
                ],
            ],
            'right' => [
                'team_avg_before' => $teamRightAvg,
                'team_avg_after' => $teamRightAvg + $rightChange + $rightAvgBonus + $rightAvgBreakerBonus,
                'change' => $rightChange,
                'streak_bonus' => $rightAvgBonus,
                'streak_breaker_bonus' => $rightAvgBreakerBonus,
                'player1' => [
                    'before' => $rightP1Before,
                    'after' => $rightP1Before + $rightChange + $rightP1Bonus + $rightP1BreakerBonus,
                    'streak_bonus' => $rightP1Bonus,
                    'streak_breaker_bonus' => $rightP1BreakerBonus,
                ],
                'player2' => [
                    'before' => $rightP2Before,
                    'after' => $rightP2Before + $rightChange + $rightP2Bonus + $rightP2BreakerBonus,
                    'streak_bonus' => $rightP2Bonus,
                    'streak_breaker_bonus' => $rightP2BreakerBonus,
                ],
            ],
        ];
    }
}
