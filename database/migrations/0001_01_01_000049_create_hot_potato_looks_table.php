<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Each player's hot potato look, picked in the locker: catalogue ids from
        // game-server/src/cosmetics.json. No row means the defaults.
        Schema::create('hot_potato_looks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('player_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('colour', 32);
            $table->string('skin', 32);
            $table->string('hat', 32);
            $table->string('trail', 32);
            $table->string('boom', 32);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hot_potato_looks');
    }
};
