<?php

namespace Database\Seeders;

use App\Models\GameMode;
use App\Models\GameType;
use Illuminate\Database\Seeder;

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
                    ['key' => 'record', 'label' => 'W-L', 'sortable' => true, 'type' => 'record'],
                    ['key' => 'last_10', 'label' => 'Last 10', 'type' => 'last_10'],
                    ['key' => 'games_played', 'label' => 'Games', 'sortable' => true],
                ],
            ]
        );

        $putter = GameType::updateOrCreate(
            ['slug' => 'putter'],
            [
                'name' => 'Putter',
                'description' => 'Sink 5 balls, one stroke each. Track your make percentage.',
                'icon' => "\xE2\x9B\xB3",
                'color' => '#22c55e',
                'is_active' => true,
                'min_players' => 1,
                'max_players' => 1,
                'leaderboard_columns' => null,
            ]
        );

        GameMode::updateOrCreate(
            ['game_type_id' => $putter->id, 'slug' => 'career-make-percentage'],
            [
                'name' => 'Career Make %',
                'description' => 'Total makes divided by total balls across all rounds.',
                'is_active' => true,
                'sort_order' => 0,
                'leaderboard_columns' => [
                    ['key' => 'make_pct', 'label' => 'Make %', 'sortable' => true],
                    ['key' => 'total_makes', 'label' => 'Makes', 'sortable' => true],
                    ['key' => 'total_balls', 'label' => 'Balls', 'sortable' => true],
                    ['key' => 'games_played', 'label' => 'Rounds', 'sortable' => true],
                ],
            ]
        );

        $hotPotato = GameType::updateOrCreate(
            ['slug' => 'hot-potato'],
            [
                'name' => 'Hot Potato',
                'description' => 'Bump someone to pass the potato. Whoever holds it when it blows is out.',
                'icon' => "\xF0\x9F\xA5\x94",
                'color' => '#f97316',
                'is_active' => true,
                'min_players' => 3,
                'max_players' => 12,
                'leaderboard_columns' => null,
            ]
        );

        GameMode::updateOrCreate(
            ['game_type_id' => $hotPotato->id, 'slug' => 'survivals'],
            [
                'name' => 'Survivals',
                'description' => 'Games survived, then survival rate.',
                'is_active' => true,
                'sort_order' => 0,
                'leaderboard_columns' => [
                    ['key' => 'survivals', 'label' => 'Survived', 'sortable' => true],
                    ['key' => 'survival_pct', 'label' => 'Survival %', 'sortable' => true],
                    ['key' => 'games_played', 'label' => 'Games', 'sortable' => true],
                    ['key' => 'passes', 'label' => 'Passes', 'sortable' => true],
                ],
            ]
        );

        GameMode::updateOrCreate(
            ['game_type_id' => $hotPotato->id, 'slug' => 'king'],
            [
                'name' => 'King of the Potato',
                'description' => 'Crowns won, then total time holding the potato.',
                'is_active' => true,
                'sort_order' => 1,
                'leaderboard_columns' => [
                    ['key' => 'crowns', 'label' => 'Crowns', 'sortable' => true],
                    ['key' => 'held_seconds', 'label' => 'Time held (s)', 'sortable' => true],
                    ['key' => 'games_played', 'label' => 'Games', 'sortable' => true],
                    ['key' => 'steals', 'label' => 'Steals', 'sortable' => true],
                ],
            ]
        );

        GameMode::updateOrCreate(
            ['game_type_id' => $pingPong->id, 'slug' => 'doubles-elo-ranking'],
            [
                'name' => '2v2 ELO Ranking',
                'description' => 'Player rankings for doubles matches.',
                'is_active' => true,
                'sort_order' => 1,
                'leaderboard_columns' => [
                    ['key' => 'elo_rating', 'label' => 'ELO', 'sortable' => true],
                    ['key' => 'record', 'label' => 'W-L', 'sortable' => true, 'type' => 'record'],
                    ['key' => 'last_10', 'label' => 'Last 10', 'type' => 'last_10'],
                    ['key' => 'games_played', 'label' => 'Games', 'sortable' => true],
                ],
            ]
        );
    }
}
