<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The office FPS's leaderboard (its columns, and the home page card's podium). A migration
 * because deploys don't seed; GameTypeSeeder has the same row for fresh setups.
 */
return new class extends Migration
{
    public function up(): void
    {
        $gameTypeId = DB::table('game_types')->where('slug', 'office-fps')->value('id');
        if ($gameTypeId === null) {
            return;
        }

        $row = [
            'name' => 'Kills',
            'description' => 'Kills, then K/D.',
            'is_active' => true,
            'sort_order' => 0,
            'leaderboard_columns' => json_encode([
                ['key' => 'kills', 'label' => 'Kills', 'sortable' => true],
                ['key' => 'kd', 'label' => 'K/D', 'sortable' => true],
                ['key' => 'wins', 'label' => 'Wins', 'sortable' => true],
                ['key' => 'matches', 'label' => 'Matches', 'sortable' => true],
                ['key' => 'accuracy', 'label' => 'Accuracy %', 'sortable' => true],
            ]),
            'updated_at' => now(),
        ];

        $existing = DB::table('game_modes')->where('game_type_id', $gameTypeId)->where('slug', 'kills');
        if ($existing->exists()) {
            $existing->update($row);

            return;
        }

        DB::table('game_modes')->insert(['game_type_id' => $gameTypeId, 'slug' => 'kills', 'created_at' => now()] + $row);
    }

    public function down(): void
    {
        $gameTypeId = DB::table('game_types')->where('slug', 'office-fps')->value('id');
        DB::table('game_modes')->where('game_type_id', $gameTypeId)->where('slug', 'kills')->delete();
    }
};
