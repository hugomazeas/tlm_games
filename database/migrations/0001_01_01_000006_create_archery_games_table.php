<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('archery_games', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->json('arrow_data');
            $table->json('target_numbers')->nullable();
            $table->integer('base_score');
            $table->integer('bonus_score')->default(0);
            $table->integer('total_score');
            $table->timestamps();

            $table->index('created_at');
            $table->index(['player_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('archery_games');
    }
};
