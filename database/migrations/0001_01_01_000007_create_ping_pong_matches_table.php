<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_matches', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_left_id')->constrained('players')->cascadeOnDelete();
            $table->foreignId('player_right_id')->constrained('players')->cascadeOnDelete();
            $table->unsignedSmallInteger('player_left_score')->default(0);
            $table->unsignedSmallInteger('player_right_score')->default(0);
            $table->foreignId('winner_id')->nullable()->constrained('players')->nullOnDelete();
            $table->foreignId('current_server_id')->nullable()->constrained('players')->nullOnDelete();
            $table->unsignedSmallInteger('serve_count')->default(0);
            $table->integer('player_left_elo_before')->nullable();
            $table->integer('player_right_elo_before')->nullable();
            $table->integer('player_left_elo_after')->nullable();
            $table->integer('player_right_elo_after')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();

            $table->index('ended_at');
            $table->index(['player_left_id', 'ended_at']);
            $table->index(['player_right_id', 'ended_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_matches');
    }
};
