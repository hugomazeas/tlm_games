<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The office FPS's card on the Hub's home page. A migration rather than only the seeder,
 * because deploys run migrations, not seeders (GameTypeSeeder has the same row for fresh setups).
 */
return new class extends Migration
{
    public function up(): void
    {
        $row = [
            'name' => 'Office FPS',
            'description' => 'Jetpack troopers with blasters, all over the office. One game, always on.',
            'icon' => "\u{1F52B}",
            'color' => '#e4572e',
            'is_active' => true,
            'min_players' => 2,
            'max_players' => 12,
            'leaderboard_columns' => null,
            'updated_at' => now(),
        ];

        if (DB::table('game_types')->where('slug', 'office-fps')->exists()) {
            DB::table('game_types')->where('slug', 'office-fps')->update($row);

            return;
        }

        DB::table('game_types')->insert(['slug' => 'office-fps', 'created_at' => now()] + $row);
    }

    public function down(): void
    {
        DB::table('game_types')->where('slug', 'office-fps')->delete();
    }
};
