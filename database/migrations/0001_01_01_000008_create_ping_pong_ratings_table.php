<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ping_pong_ratings', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->unique()->constrained('players')->cascadeOnDelete();
            $table->integer('elo_rating')->default(1200);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ping_pong_ratings');
    }
};
