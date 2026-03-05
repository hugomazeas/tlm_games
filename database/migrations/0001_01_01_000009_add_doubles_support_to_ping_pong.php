<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->string('mode', 10)->default('1v1')->after('id');
            $table->foreignId('team_left_player2_id')->nullable()->after('player_left_id')->constrained('players')->nullOnDelete();
            $table->foreignId('team_right_player2_id')->nullable()->after('player_right_id')->constrained('players')->nullOnDelete();
            $table->integer('team_left_player2_elo_before')->nullable()->after('player_right_elo_after');
            $table->integer('team_left_player2_elo_after')->nullable()->after('team_left_player2_elo_before');
            $table->integer('team_right_player2_elo_before')->nullable()->after('team_left_player2_elo_after');
            $table->integer('team_right_player2_elo_after')->nullable()->after('team_right_player2_elo_before');
        });

        Schema::table('ping_pong_ratings', function (Blueprint $table) {
            $table->string('mode', 10)->default('1v1')->after('player_id');
        });

        // SQLite: recreate unique index as composite
        DB::statement('DROP INDEX IF EXISTS ping_pong_ratings_player_id_unique');
        DB::statement('CREATE UNIQUE INDEX ping_pong_ratings_player_id_mode_unique ON ping_pong_ratings (player_id, mode)');
    }

    public function down(): void
    {
        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropForeign(['team_left_player2_id']);
            $table->dropForeign(['team_right_player2_id']);
            $table->dropColumn([
                'mode',
                'team_left_player2_id',
                'team_right_player2_id',
                'team_left_player2_elo_before',
                'team_left_player2_elo_after',
                'team_right_player2_elo_before',
                'team_right_player2_elo_after',
            ]);
        });

        DB::statement('DROP INDEX IF EXISTS ping_pong_ratings_player_id_mode_unique');

        Schema::table('ping_pong_ratings', function (Blueprint $table) {
            $table->dropColumn('mode');
            $table->unique('player_id');
        });
    }
};
