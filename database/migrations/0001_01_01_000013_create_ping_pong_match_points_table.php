<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_match_points', function (Blueprint $table) {
            $table->id();
            $table->foreignId('match_id')->constrained('ping_pong_matches')->cascadeOnDelete();
            $table->unsignedSmallInteger('sequence')->comment('Point number within the match (1-based)');
            $table->enum('scoring_side', ['left', 'right']);
            $table->unsignedSmallInteger('player_left_score')->comment('Running score after this point');
            $table->unsignedSmallInteger('player_right_score')->comment('Running score after this point');
            $table->foreignId('server_id')->nullable()->constrained('players')->nullOnDelete();
            $table->timestamp('scored_at');

            $table->unique(['match_id', 'sequence']);
            $table->index(['match_id', 'scored_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_match_points');
    }
};
