<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Single-elimination singles tournaments. Every bracket slot is a row in
     * ping_pong_tournament_matches; it gets a real ping_pong_matches row once
     * it is played. Matches carrying a tournament_id are kept out of ELO and
     * the official stats.
     */
    public function up(): void
    {
        Schema::create('ping_pong_tournaments', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('status', 20)->default('in_progress');
            $table->foreignId('winner_id')->nullable()->constrained('players')->nullOnDelete();
            $table->timestamps();
        });

        Schema::table('ping_pong_matches', function (Blueprint $table) {
            // Cascade, not null: an orphaned tournament match would leak into official stats.
            $table->foreignId('tournament_id')->nullable()->after('mode')->constrained('ping_pong_tournaments')->cascadeOnDelete();
        });

        Schema::create('ping_pong_tournament_matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('tournament_id')->constrained('ping_pong_tournaments')->cascadeOnDelete();
            $table->unsignedSmallInteger('round');
            $table->unsignedSmallInteger('position');
            // Null means "to be decided" (or a bye, in round 1).
            $table->foreignId('player_left_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('player_right_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('winner_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('match_id')->nullable()->constrained('ping_pong_matches')->nullOnDelete();
            $table->timestamps();

            $table->unique(['tournament_id', 'round', 'position']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_tournament_matches');

        Schema::table('ping_pong_matches', function (Blueprint $table) {
            $table->dropConstrainedForeignId('tournament_id');
        });

        Schema::dropIfExists('ping_pong_tournaments');
    }
};
