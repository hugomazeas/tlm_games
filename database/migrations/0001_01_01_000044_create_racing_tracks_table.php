<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Circuits made in the track editor; checkpoints are latitude/longitude JSON,
        // the first one the start line. The game server's map is `map`.
        Schema::create('racing_tracks', function (Blueprint $table) {
            $table->id();
            $table->string('name', 60)->unique();
            $table->string('map', 40)->default('quebec-plains');
            $table->unsignedTinyInteger('laps');
            $table->json('gates');
            $table->unsignedInteger('length')->nullable(); // metres a lap, along the streets
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('racing_tracks');
    }
};
