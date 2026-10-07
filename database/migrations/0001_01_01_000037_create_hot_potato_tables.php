<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Only finished games land here: the live game runs in the hot potato
        // sidecar's memory and reports each result once it ends.
        Schema::create('hot_potato_games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('office_id')->nullable()->constrained()->nullOnDelete();
            $table->unsignedBigInteger('seed');
            $table->string('theme');
            $table->unsignedInteger('duration_seconds');
            $table->timestamp('started_at');
            $table->timestamp('ended_at');
            $table->timestamps();

            $table->index('ended_at');
        });

        Schema::create('hot_potato_game_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('hot_potato_game_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            // 1 for every survivor, then by how late you went out.
            $table->unsignedInteger('position');
            $table->boolean('survived');
            $table->unsignedInteger('eliminated_at_ms')->nullable();
            $table->unsignedInteger('hold_ms');
            $table->unsignedInteger('passes');
            $table->timestamps();

            $table->unique(['hot_potato_game_id', 'player_id']);
            $table->index('player_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hot_potato_game_players');
        Schema::dropIfExists('hot_potato_games');
    }
};
