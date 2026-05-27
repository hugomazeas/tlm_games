<?php

namespace App\Games\PingPong\Services;

use App\Games\PingPong\Models\PingPongMatch;

class PracticeInsightsService
{
    public function forPlayer(int $playerId): array
    {
        $serve = ['serve_won' => 0, 'serve_lost' => 0, 'return_won' => 0, 'return_lost' => 0];
        $wing = ['fh_win' => 0, 'fh_err' => 0, 'bh_win' => 0, 'bh_err' => 0];
        $errors = ['net' => 0, 'long_wide' => 0, 'untyped' => 0];

        $matches = PingPongMatch::with('points')
            ->where('mode', '1v1')
            ->whereNotNull('ended_at')
            ->where(function ($q) use ($playerId) {
                $q->where('player_left_id', $playerId)
                  ->orWhere('player_right_id', $playerId);
            })
            ->get();

        foreach ($matches as $match) {
            $playerSide = $match->player_left_id === $playerId ? 'left' : 'right';

            foreach ($match->points as $point) {
                $point->setRelation('match', $match);
                $playerWon = $point->scoring_side === $playerSide;

                $servedByPlayer = $point->serverSide() === $playerSide;
                if ($servedByPlayer) {
                    $playerWon ? $serve['serve_won']++ : $serve['serve_lost']++;
                } else {
                    $playerWon ? $serve['return_won']++ : $serve['return_lost']++;
                }

                if ($point->decisiveSide() !== $playerSide) {
                    continue;
                }

                $isError = $point->point_cause === 'opponent_error';

                if ($point->shot_type === 'forehand') {
                    $isError ? $wing['fh_err']++ : $wing['fh_win']++;
                } elseif ($point->shot_type === 'backhand') {
                    $isError ? $wing['bh_err']++ : $wing['bh_win']++;
                }

                if ($isError) {
                    if ($point->error_type === 'net') {
                        $errors['net']++;
                    } elseif ($point->error_type === 'long_wide') {
                        $errors['long_wide']++;
                    } else {
                        $errors['untyped']++;
                    }
                }
            }
        }

        return [
            'serve' => $serve,
            'wing' => $wing,
            'errors' => $errors,
            'takeaways' => $this->takeaways($serve, $wing, $errors),
        ];
    }

    private function takeaways(array $serve, array $wing, array $errors): array
    {
        $out = [];

        $serveTotal = $serve['serve_won'] + $serve['serve_lost'];
        $returnTotal = $serve['return_won'] + $serve['return_lost'];
        if ($serveTotal >= 5 && $returnTotal >= 5) {
            $servePct = $serve['serve_won'] / $serveTotal;
            $returnPct = $serve['return_won'] / $returnTotal;
            if ($returnPct + 0.15 < $servePct) {
                $out[] = 'Your return game lags your serve — drill returns.';
            } elseif ($servePct + 0.15 < $returnPct) {
                $out[] = 'You leak points on your own serve — work on serve consistency.';
            }
        }

        if ($wing['fh_err'] + $wing['bh_err'] >= 6) {
            if ($wing['bh_err'] > $wing['fh_err'] * 1.5) {
                $out[] = 'Most of your errors come off the backhand.';
            } elseif ($wing['fh_err'] > $wing['bh_err'] * 1.5) {
                $out[] = 'Most of your errors come off the forehand.';
            }
        }

        $errTotal = $errors['net'] + $errors['long_wide'];
        if ($errTotal >= 6) {
            if ($errors['net'] > $errors['long_wide'] * 1.5) {
                $out[] = 'You dump a lot into the net — lift the ball / clear the net with more margin.';
            } elseif ($errors['long_wide'] > $errors['net'] * 1.5) {
                $out[] = 'You miss long/wide a lot — rein in the power and aim inside the lines.';
            }
        }

        return $out;
    }
}
