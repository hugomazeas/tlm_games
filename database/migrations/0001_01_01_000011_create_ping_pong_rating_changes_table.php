<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_rating_changes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained('players')->cascadeOnDelete();
            $table->foreignId('match_id')->constrained('ping_pong_matches')->cascadeOnDelete();
            $table->string('mode', 10)->default('1v1');
            $table->integer('rating_change');
            $table->timestamps();

            $table->unique(['player_id', 'match_id']);
            $table->index(['player_id', 'mode', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_rating_changes');
    }
};
