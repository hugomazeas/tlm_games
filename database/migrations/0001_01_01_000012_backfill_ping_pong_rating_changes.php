<?php

use App\Games\PingPong\Models\PingPongMatch;
use App\Games\PingPong\Models\PingPongRatingChange;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        $matches = PingPongMatch::whereNotNull('ended_at')->orderBy('ended_at')->orderBy('id')->get();

        foreach ($matches as $match) {
            if ($match->mode === '1v1') {
                $leftChange = $match->player_left_elo_after !== null && $match->player_left_elo_before !== null
                    ? $match->player_left_elo_after - $match->player_left_elo_before
                    : 0;
                $rightChange = $match->player_right_elo_after !== null && $match->player_right_elo_before !== null
                    ? $match->player_right_elo_after - $match->player_right_elo_before
                    : 0;

                if ($leftChange !== 0 || $rightChange !== 0) {
                    PingPongRatingChange::upsert(
                        [
                            [
                                'player_id' => $match->player_left_id,
                                'match_id' => $match->id,
                                'mode' => '1v1',
                                'rating_change' => $leftChange,
                                'created_at' => $match->ended_at ?? $match->created_at,
                                'updated_at' => now(),
                            ],
                            [
                                'player_id' => $match->player_right_id,
                                'match_id' => $match->id,
                                'mode' => '1v1',
                                'rating_change' => $rightChange,
                                'created_at' => $match->ended_at ?? $match->created_at,
                                'updated_at' => now(),
                            ],
                        ],
                        ['player_id', 'match_id'],
                        ['rating_change', 'updated_at']
                    );
                }
            } else {
                $leftChange = $match->player_left_elo_after !== null && $match->player_left_elo_before !== null
                    ? $match->player_left_elo_after - $match->player_left_elo_before
                    : 0;
                $rightChange = $match->player_right_elo_after !== null && $match->player_right_elo_before !== null
                    ? $match->player_right_elo_after - $match->player_right_elo_before
                    : 0;
                $leftP2Change = $match->team_left_player2_elo_after !== null && $match->team_left_player2_elo_before !== null
                    ? $match->team_left_player2_elo_after - $match->team_left_player2_elo_before
                    : 0;
                $rightP2Change = $match->team_right_player2_elo_after !== null && $match->team_right_player2_elo_before !== null
                    ? $match->team_right_player2_elo_after - $match->team_right_player2_elo_before
                    : 0;

                if ($leftChange !== 0 || $rightChange !== 0 || $leftP2Change !== 0 || $rightP2Change !== 0) {
                    $rows = [];
                    if ($match->player_left_id) {
                        $rows[] = [
                            'player_id' => $match->player_left_id,
                            'match_id' => $match->id,
                            'mode' => '2v2',
                            'rating_change' => $leftChange,
                            'created_at' => $match->ended_at ?? $match->created_at,
                            'updated_at' => now(),
                        ];
                    }
                    if ($match->team_left_player2_id) {
                        $rows[] = [
                            'player_id' => $match->team_left_player2_id,
                            'match_id' => $match->id,
                            'mode' => '2v2',
                            'rating_change' => $leftP2Change,
                            'created_at' => $match->ended_at ?? $match->created_at,
                            'updated_at' => now(),
                        ];
                    }
                    if ($match->player_right_id) {
                        $rows[] = [
                            'player_id' => $match->player_right_id,
                            'match_id' => $match->id,
                            'mode' => '2v2',
                            'rating_change' => $rightChange,
                            'created_at' => $match->ended_at ?? $match->created_at,
                            'updated_at' => now(),
                        ];
                    }
                    if ($match->team_right_player2_id) {
                        $rows[] = [
                            'player_id' => $match->team_right_player2_id,
                            'match_id' => $match->id,
                            'mode' => '2v2',
                            'rating_change' => $rightP2Change,
                            'created_at' => $match->ended_at ?? $match->created_at,
                            'updated_at' => now(),
                        ];
                    }
                    if (!empty($rows)) {
                        PingPongRatingChange::upsert($rows, ['player_id', 'match_id'], ['rating_change', 'updated_at']);
                    }
                }
            }
        }
    }

    public function down(): void
    {
        DB::table('ping_pong_rating_changes')->truncate();
    }
};
