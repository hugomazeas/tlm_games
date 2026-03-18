<?php

namespace App\Games\PingPong\Events;

use App\Games\PingPong\Models\PingPongMatch;
use Illuminate\Broadcasting\Channel;
use Illuminate\Contracts\Broadcasting\ShouldBroadcastNow;

class MatchScoreUpdated implements ShouldBroadcastNow
{
    public array $match;

    public function __construct(PingPongMatch $match)
    {
        $match->load(['playerLeft', 'playerRight', 'currentServer', 'winner', 'teamLeftPlayer2', 'teamRightPlayer2']);

        $data = $match->toArray();
        $data['duration'] = $match->duration;
        $data['duration_formatted'] = $match->duration_formatted;
        $data['is_complete'] = $match->is_complete;

        if ($match->is_complete && $match->player_left_elo_before !== null) {
            if ($match->isDoubles()) {
                $leftChange = $match->player_left_elo_after - $match->player_left_elo_before;
                $rightChange = $match->player_right_elo_after - $match->player_right_elo_before;
                $teamLeftAvg = (int) round(($match->player_left_elo_before + $match->team_left_player2_elo_before) / 2);
                $teamRightAvg = (int) round(($match->player_right_elo_before + $match->team_right_player2_elo_before) / 2);

                $data['elo_changes'] = [
                    'left' => [
                        'team_avg_before' => $teamLeftAvg,
                        'team_avg_after' => $teamLeftAvg + $leftChange,
                        'change' => $leftChange,
                        'player1' => ['before' => $match->player_left_elo_before, 'after' => $match->player_left_elo_after],
                        'player2' => ['before' => $match->team_left_player2_elo_before, 'after' => $match->team_left_player2_elo_after],
                    ],
                    'right' => [
                        'team_avg_before' => $teamRightAvg,
                        'team_avg_after' => $teamRightAvg + $rightChange,
                        'change' => $rightChange,
                        'player1' => ['before' => $match->player_right_elo_before, 'after' => $match->player_right_elo_after],
                        'player2' => ['before' => $match->team_right_player2_elo_before, 'after' => $match->team_right_player2_elo_after],
                    ],
                ];
            } else {
                $data['elo_changes'] = [
                    'left' => [
                        'before' => $match->player_left_elo_before,
                        'after' => $match->player_left_elo_after,
                        'change' => $match->player_left_elo_after - $match->player_left_elo_before,
                    ],
                    'right' => [
                        'before' => $match->player_right_elo_before,
                        'after' => $match->player_right_elo_after,
                        'change' => $match->player_right_elo_after - $match->player_right_elo_before,
                    ],
                ];
            }
        }

        if ($match->is_complete) {
            $data['points'] = $match->points()->get()->toArray();
        }

        $this->match = $data;
    }

    public function broadcastOn(): array
    {
        return [new Channel('ping-pong.match.' . $this->match['id'])];
    }

    public function broadcastAs(): string
    {
        return 'match.score-updated';
    }
}
