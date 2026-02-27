<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('game_modes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('game_type_id')->constrained()->cascadeOnDelete();
            $table->string('slug');
            $table->string('name');
            $table->text('description')->nullable();
            $table->json('leaderboard_columns')->nullable();
            $table->boolean('is_active')->default(true);
            $table->integer('sort_order')->default(0);
            $table->timestamps();

            $table->unique(['game_type_id', 'slug']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('game_modes');
    }
};
