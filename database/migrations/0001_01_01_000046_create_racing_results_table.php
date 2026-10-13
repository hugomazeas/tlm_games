<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // One row per Hub player per race, posted by the game server when a race ends.
        // Guests race but aren't recorded. `time_ms` is null for a racer who didn't finish.
        Schema::create('racing_results', function (Blueprint $table) {
            $table->id();
            $table->foreignId('racing_track_id')->constrained()->cascadeOnDelete();
            $table->foreignId('player_id')->constrained()->cascadeOnDelete();
            $table->string('race_id', 40);
            $table->unsignedTinyInteger('position');
            $table->unsignedTinyInteger('racers');
            $table->unsignedInteger('time_ms')->nullable();
            $table->unsignedInteger('best_lap_ms')->nullable();
            $table->timestamps();

            $table->unique(['race_id', 'player_id']);
            $table->index(['racing_track_id', 'time_ms']);
            $table->index(['racing_track_id', 'best_lap_ms']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('racing_results');
    }
};
