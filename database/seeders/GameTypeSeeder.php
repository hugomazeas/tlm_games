<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use App\Models\GameMode;
use App\Models\GameType;

class GameTypeSeeder extends Seeder
{
    public function run(): void
    {
        $archery = GameType::updateOrCreate(
            ['slug' => 'archery'],
            [
                'name' => 'Archery',
                'description' => 'Track your archery scores across different distances and round types.',
                'icon' => "\xF0\x9F\x8E\xAF",
                'color' => '#ef4444',
                'is_active' => true,
                'min_players' => 1,
                'max_players' => 20,
                'leaderboard_columns' => null,
            ]
        );

        GameMode::updateOrCreate(
            ['game_type_id' => $archery->id, 'slug' => 'weekly-best'],
            [
                'name' => 'Weekly Best',
                'description' => 'Best score per player for the current week.',
                'is_active' => true,
                'sort_order' => 0,
                'leaderboard_columns' => [
                    ['key' => 'best_game', 'label' => 'Best Game', 'sortable' => true],
                    ['key' => 'avg_score', 'label' => 'Avg Score', 'sortable' => true],
                    ['key' => 'games_played', 'label' => 'Games', 'sortable' => true],
                    ['key' => 'total_score', 'label' => 'Total', 'sortable' => true],
                ],
            ]
        );

        $pingPong = GameType::updateOrCreate(
            ['slug' => 'ping-pong'],
            [
                'name' => 'Ping Pong',
                'description' => 'Record matches and track your ping pong ranking.',
                'icon' => "\xF0\x9F\x8F\x93",
                'color' => '#3b82f6',
                'is_active' => true,
                'min_players' => 2,
                'max_players' => 4,
                'leaderboard_columns' => null,
            ]
        );

        GameMode::updateOrCreate(
            ['game_type_id' => $pingPong->id, 'slug' => 'elo-ranking'],
            [
                'name' => 'ELO Ranking',
                'description' => 'Player rankings based on ELO rating system.',
                'is_active' => true,
                'sort_order' => 0,
                'leaderboard_columns' => [
                    ['key' => 'elo_rating', 'label' => 'ELO', 'sortable' => true],
                    ['key' => 'wins', 'label' => 'Wins', 'sortable' => true],
                    ['key' => 'losses', 'label' => 'Losses', 'sortable' => true],
                    ['key' => 'win_rate', 'label' => 'Win %', 'sortable' => true],
                    ['key' => 'games_played', 'label' => 'Games', 'sortable' => true],
                ],
            ]
        );
    }
}
