<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRatingChange;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class MatchScoreUpdated implements ShouldBroadcastNow
{
    public array $match;

    public function __construct(PingPongMatch $match)
    {
        $match->load(['playerLeft', 'playerRight', 'currentServer', 'winner', 'teamLeftPlayer2', 'teamRightPlayer2', 'recording']);

        $data = $match->toArray();
        $data['duration'] = $match->duration;
        $data['duration_formatted'] = $match->duration_formatted;
        $data['is_complete'] = $match->is_complete;

        if ($match->is_complete && $match->player_left_elo_before !== null) {
            $streakBonuses = PingPongRatingChange::where('match_id', $match->id)
                ->where('type', 'streak_bonus')
                ->pluck('rating_change', 'player_id');

            if ($match->isDoubles()) {
                $leftP1Bonus = $streakBonuses[$match->player_left_id] ?? 0;
                $leftP2Bonus = $streakBonuses[$match->team_left_player2_id] ?? 0;
                $rightP1Bonus = $streakBonuses[$match->player_right_id] ?? 0;
                $rightP2Bonus = $streakBonuses[$match->team_right_player2_id] ?? 0;

                $leftEloChange = $match->player_left_elo_after - $match->player_left_elo_before - $leftP1Bonus;
                $rightEloChange = $match->player_right_elo_after - $match->player_right_elo_before - $rightP1Bonus;

                $teamLeftAvg = (int) round(($match->player_left_elo_before + $match->team_left_player2_elo_before) / 2);
                $teamRightAvg = (int) round(($match->player_right_elo_before + $match->team_right_player2_elo_before) / 2);

                $leftAvgBonus = (int) round(($leftP1Bonus + $leftP2Bonus) / 2);
                $rightAvgBonus = (int) round(($rightP1Bonus + $rightP2Bonus) / 2);

                $data['elo_changes'] = [
                    'left' => [
                        'team_avg_before' => $teamLeftAvg,
                        'team_avg_after' => $teamLeftAvg + $leftEloChange + $leftAvgBonus,
                        'change' => $leftEloChange,
                        'streak_bonus' => $leftAvgBonus,
                        'player1' => ['before' => $match->player_left_elo_before, 'after' => $match->player_left_elo_after, 'streak_bonus' => $leftP1Bonus],
                        'player2' => ['before' => $match->team_left_player2_elo_before, 'after' => $match->team_left_player2_elo_after, 'streak_bonus' => $leftP2Bonus],
                    ],
                    'right' => [
                        'team_avg_before' => $teamRightAvg,
                        'team_avg_after' => $teamRightAvg + $rightEloChange + $rightAvgBonus,
                        'change' => $rightEloChange,
                        'streak_bonus' => $rightAvgBonus,
                        'player1' => ['before' => $match->player_right_elo_before, 'after' => $match->player_right_elo_after, 'streak_bonus' => $rightP1Bonus],
                        'player2' => ['before' => $match->team_right_player2_elo_before, 'after' => $match->team_right_player2_elo_after, 'streak_bonus' => $rightP2Bonus],
                    ],
                ];
            } else {
                $leftBonus = $streakBonuses[$match->player_left_id] ?? 0;
                $rightBonus = $streakBonuses[$match->player_right_id] ?? 0;

                $data['elo_changes'] = [
                    'left' => [
                        'before' => $match->player_left_elo_before,
                        'after' => $match->player_left_elo_after,
                        'change' => $match->player_left_elo_after - $match->player_left_elo_before - $leftBonus,
                        'streak_bonus' => $leftBonus,
                    ],
                    'right' => [
                        'before' => $match->player_right_elo_before,
                        'after' => $match->player_right_elo_after,
                        'change' => $match->player_right_elo_after - $match->player_right_elo_before - $rightBonus,
                        'streak_bonus' => $rightBonus,
                    ],
                ];
            }
        }

        if ($match->is_complete) {
            $data['points'] = $match->points()->get()->toArray();
        }

        if ($match->recording) {
            $data['recording'] = [
                'status' => $match->recording->status,
                'video_url' => $match->recording->video_url,
                'hls_url' => $match->recording->hls_url,
            ];
        }

        $this->match = $data;
    }

    public function broadcastOn(): array
    {
        return [
            new Channel('ping-pong.match.' . $this->match['id']),
            new Channel('ping-pong.live'),
        ];
    }

    public function broadcastAs(): string
    {
        return 'match.score-updated';
    }
}
